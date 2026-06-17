import type { NewCharacter } from '../types/character'

// Thin same-origin fetch wrapper around the cloud-storage API. Identity is
// solved by Cloudflare Access (the Access cookie rides along on same-origin
// requests; the Function reads the verified email from the injected JWT), so
// these calls send no credentials of their own.

export interface Me {
  email: string
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
): Promise<SyncResult<unknown>> {
  return request(`/api/characters/${encodeURIComponent(payload.id)}`, {
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

export function rotateCode(id: string): Promise<SyncResult<{ inviteCode: string }>> {
  return request<{ inviteCode: string }>(`/api/campaigns/${encodeURIComponent(id)}/code`, { method: 'POST' })
}

export function removeMember(id: string, email: string): Promise<SyncResult<unknown>> {
  return request(`/api/campaigns/${encodeURIComponent(id)}/members/${encodeURIComponent(email)}`, { method: 'DELETE' })
}
