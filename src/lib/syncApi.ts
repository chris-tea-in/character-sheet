import type { NewCharacter } from '../types/character'
import type { WeaponItem, ArmorItem, WondrousItem } from '../types/data'

// Thin same-origin fetch wrapper around the cloud-storage API. Identity is
// solved by Cloudflare Access (the Access cookie rides along on same-origin
// requests; the Function reads the verified email from the injected JWT), so
// these calls send no credentials of their own.

export interface Me {
  email: string
  username: string | null  // null until the user picks one (onboarding)
}

/** A synced row for the caller's own characters (includes tombstones). */
export interface SyncedCharacter {
  id: string
  createdAt: number
  updatedAt: number
  deleted: boolean
  data: NewCharacter
}

/** A character within a campaign, tagged with its owner (DM sees all; a player sees only their own). */
export interface CampaignCharacter {
  id: string
  ownerEmail: string
  ownerUsername: string | null  // owner's display name, null until they onboard
  createdAt: number
  updatedAt: number
  data: NewCharacter
}

export interface Campaign {
  id: string
  name: string
  role: 'dm' | 'player'
  dmEmail: string
  inviteCode?: string  // only present for the DM
}

export interface CampaignMember {
  email: string
  role: 'dm' | 'player'
  username: string | null  // display name, null until they onboard
}

/** A thin, list-only view of another player's character (no full sheet). The class
 *  label is computed server-side and already honors that player's disguise. */
export interface RosterCharacter {
  id: string
  name: string
  classLabel: string
}

/** One other player in the campaign and their characters (party roster). */
export interface RosterMember {
  email: string
  username: string | null  // display name, null until they onboard
  characters: RosterCharacter[]
}

// Every response is classified into exactly one of: good read, auth expired, or
// bad/offline. Callers never merge anything but a good read, so a truncated,
// non-JSON, or error response can never be misread as data (and absence can
// never be misread as a delete — deletes travel only as explicit tombstones).
export type SyncResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'auth-expired' | 'offline' }

const TIMEOUT_MS = 10_000

async function request<T>(input: string, init?: RequestInit): Promise<SyncResult<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    // redirect:'manual' so an expired Access session (which answers with a
    // cross-origin 302 to the login page) surfaces as an opaqueredirect we can
    // detect, rather than a fetch that silently fails CORS.
    res = await fetch(input, { ...init, redirect: 'manual', signal: controller.signal })
  } catch {
    clearTimeout(timer)
    return { ok: false, reason: 'offline' }
  }
  clearTimeout(timer)

  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'auth-expired' }
  }
  if (!res.ok) return { ok: false, reason: 'offline' }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return { ok: false, reason: 'offline' }

  try {
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

export function getMe(): Promise<SyncResult<Me>> {
  return request<Me>('/api/me')
}

// setUsername needs to tell apart 400 (invalid) and 409 (taken) so the dialog can
// show the reason inline — the generic request() collapses both into 'offline'.
// So it has its own fetch, mirroring request()'s redirect/timeout handling.
export type SetUsernameResult =
  | { ok: true; data: Me }
  | { ok: false; reason: 'taken' | 'invalid' | 'auth-expired' | 'offline'; message?: string }

async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: unknown }
    return typeof body?.error === 'string' ? body.error : undefined
  } catch {
    return undefined
  }
}

export async function setUsername(username: string): Promise<SetUsernameResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch('/api/me', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
      redirect: 'manual',
      signal: controller.signal,
    })
  } catch {
    clearTimeout(timer)
    return { ok: false, reason: 'offline' }
  }
  clearTimeout(timer)

  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) {
    return { ok: false, reason: 'auth-expired' }
  }
  if (res.status === 409) return { ok: false, reason: 'taken', message: await readErrorMessage(res) }
  if (res.status === 400) return { ok: false, reason: 'invalid', message: await readErrorMessage(res) }
  if (!res.ok) return { ok: false, reason: 'offline' }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return { ok: false, reason: 'offline' }
  try {
    return { ok: true, data: (await res.json()) as Me }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

export async function pullCharacters(): Promise<SyncResult<SyncedCharacter[]>> {
  const res = await request<{ characters: SyncedCharacter[] }>('/api/characters')
  return res.ok ? { ok: true, data: res.data.characters } : res
}

// Field-scoped push: `patch` carries only the changed top-level fields (the whole
// character for a new row). The server shallow-merges it into the stored JSON, so
// concurrent edits to different fields both survive (see functions/api/characters/[id].ts).
export function pushCharacter(
  payload: { id: string; createdAt: number; updatedAt: number; patch: Partial<NewCharacter> },
  keepalive = false,
): Promise<SyncResult<{ updatedAt?: number }>> {
  // The server echoes the authoritative updated_at it stored (max(stored, ours))
  // so the client can set its reconcile base to exactly that.
  return request<{ updatedAt?: number }>(`/api/characters/${encodeURIComponent(payload.id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
      patch: payload.patch,
    }),
    // keepalive lets the push survive a page-unload flush. The browser caps
    // keepalive bodies at 64 KB; an oversized push simply rejects → it stays
    // queued and retries on the next online/visible event.
    keepalive,
  })
}

export function deleteRemoteCharacter(id: string, keepalive = false): Promise<SyncResult<unknown>> {
  return request(`/api/characters/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive })
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<SyncResult<Campaign[]>> {
  const res = await request<{ campaigns: Campaign[] }>('/api/campaigns')
  return res.ok ? { ok: true, data: res.data.campaigns } : res
}

export function createCampaign(name: string): Promise<SyncResult<Campaign>> {
  return request<Campaign>('/api/campaigns', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function joinCampaign(code: string): Promise<SyncResult<{ id: string; name: string }>> {
  return request<{ id: string; name: string }>('/api/campaigns/join', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
  })
}

export function deleteCampaign(id: string): Promise<SyncResult<unknown>> {
  return request(`/api/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function campaignCharacters(id: string): Promise<SyncResult<CampaignCharacter[]>> {
  const res = await request<{ characters: CampaignCharacter[] }>(`/api/campaigns/${encodeURIComponent(id)}/characters`)
  return res.ok ? { ok: true, data: res.data.characters } : res
}

export async function campaignMembers(id: string): Promise<SyncResult<CampaignMember[]>> {
  const res = await request<{ members: CampaignMember[] }>(`/api/campaigns/${encodeURIComponent(id)}/members`)
  return res.ok ? { ok: true, data: res.data.members } : res
}

// The party roster any member may see: other players + their characters as a
// thin name/class projection (no full sheets). Class labels already honor each
// player's disguise (the DM sees real classes).
export async function campaignRoster(id: string): Promise<SyncResult<RosterMember[]>> {
  const res = await request<{ roster: RosterMember[] }>(`/api/campaigns/${encodeURIComponent(id)}/roster`)
  return res.ok ? { ok: true, data: res.data.roster } : res
}

export function rotateCode(id: string): Promise<SyncResult<{ inviteCode: string }>> {
  return request<{ inviteCode: string }>(`/api/campaigns/${encodeURIComponent(id)}/code`, { method: 'POST' })
}

export function removeMember(id: string, email: string): Promise<SyncResult<unknown>> {
  return request(`/api/campaigns/${encodeURIComponent(id)}/members/${encodeURIComponent(email)}`, { method: 'DELETE' })
}

// DM-only: remove one player's character from the campaign (clears its membership;
// the character itself is kept by its owner). Players remove their own characters
// locally instead, by setting campaignId to null via the character store.
export function removeCampaignCharacter(campaignId: string, charId: string): Promise<SyncResult<unknown>> {
  return request(
    `/api/campaigns/${encodeURIComponent(campaignId)}/characters/${encodeURIComponent(charId)}`,
    { method: 'DELETE' },
  )
}

// ── DM-created shared homebrew items (#12, campaign-scoped) ─────────────────────

export interface CampaignItem {
  id: string
  category: 'weapon' | 'armor' | 'shield' | 'wondrous_item'
  data: WeaponItem | ArmorItem | WondrousItem
  createdBy: string
  updatedAt: number
}

/** Any member: the campaign's shared item catalog (merged into the member's own catalog client-side). */
export async function campaignItems(id: string): Promise<SyncResult<CampaignItem[]>> {
  const res = await request<{ items: CampaignItem[] }>(`/api/campaigns/${encodeURIComponent(id)}/items`)
  return res.ok ? { ok: true, data: res.data.items } : res
}

/** DM only: add a catalog-shaped item to the campaign. */
export function createCampaignItem(
  id: string,
  category: CampaignItem['category'],
  data: CampaignItem['data'],
): Promise<SyncResult<CampaignItem>> {
  return request<CampaignItem>(`/api/campaigns/${encodeURIComponent(id)}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ category, data }),
  })
}

/** DM only: soft-delete a campaign item. */
export function deleteCampaignItem(id: string, itemId: string): Promise<SyncResult<unknown>> {
  return request(
    `/api/campaigns/${encodeURIComponent(id)}/items?itemId=${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  )
}
