import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, type Env,
} from '../../../_lib/auth'

// GET /api/campaigns/:id/roster — the party roster every member may see: the
// OTHER players (never the caller, never the DM) and, for each, their characters'
// name + a class label. This is deliberately a thin projection — it never returns
// a full character sheet, so a player can see who's in the party without being
// able to read anyone else's stats. Opening a full sheet is DM-only and goes
// through GET /api/campaigns/:id/characters instead.
//
// Class disguise is applied HERE, server-side, so a disguised real class never
// leaves the server for a player who isn't allowed to see it. The DM always sees
// the real class; the owner never appears in their own roster (their characters
// live under "My Characters"), so for a player viewer the disguise always applies
// when set.

interface MemberRow { email: string; username: string | null }
interface CharRow { id: string; owner_email: string; data: string }

function titleCase(slug: string): string {
  return slug.split('-').map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : '')).join(' ')
}

function totalLevel(data: Record<string, unknown>): number {
  const classes = Array.isArray(data.classes) ? data.classes : []
  if (classes.length) {
    return classes.reduce((sum: number, c) => sum + (Number((c as { level?: unknown }).level) || 0), 0)
  }
  return Number(data.level) || 1
}

function realClassLabel(data: Record<string, unknown>): string {
  const classes = Array.isArray(data.classes) ? data.classes : []
  if (classes.length) {
    return classes
      .map(c => {
        const e = c as { classSlug?: unknown; level?: unknown }
        return `${titleCase(String(e.classSlug ?? ''))} ${Number(e.level) || 1}`
      })
      .join(' / ')
  }
  if (typeof data.class === 'string' && data.class) {
    return `${titleCase(data.class)} ${Number(data.level) || 1}`
  }
  return `Level ${Number(data.level) || 1}`
}

function disguisedClassLabel(data: Record<string, unknown>): string {
  const decoy = typeof data.disguiseAs === 'string' ? data.disguiseAs.trim() : ''
  const lvl = totalLevel(data)
  return decoy ? `${titleCase(decoy)} ${lvl}` : `Level ${lvl}`
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const caller = await getEmail(request, env)
  if (!caller) return unauthorized()

  const id = String(params.id)
  if (!(await isCampaignMember(env, id, caller))) return forbidden('Not a member of this campaign')

  const viewerIsDm = await isCampaignDm(env, id, caller)

  // The party spine: other players (role 'player' excludes the DM; != caller
  // excludes the viewer). Listing members — not just characters — means a player
  // who hasn't added a character yet still shows up.
  const membersRes = await env.DB
    .prepare(`SELECT m.email, u.username FROM campaign_members m LEFT JOIN users u ON u.email = m.email
              WHERE m.campaign_id = ? AND m.role = 'player' AND m.email != ? ORDER BY m.email`)
    .bind(id, caller)
    .all<MemberRow>()
  const members = membersRes.results ?? []

  const charsRes = await env.DB
    .prepare(`SELECT id, owner_email, data FROM characters WHERE campaign_id = ? AND deleted = 0 AND owner_email != ? ORDER BY id`)
    .bind(id, caller)
    .all<CharRow>()

  const byOwner = new Map<string, Array<{ id: string; name: string; classLabel: string }>>()
  for (const row of charsRes.results ?? []) {
    let data: Record<string, unknown>
    try { data = JSON.parse(row.data) as Record<string, unknown> } catch { continue }
    const disguised = !viewerIsDm && Boolean(data.disguiseClass)
    const list = byOwner.get(row.owner_email) ?? []
    list.push({
      id: row.id,
      name: typeof data.name === 'string' && data.name ? data.name : 'Unnamed',
      classLabel: disguised ? disguisedClassLabel(data) : realClassLabel(data),
    })
    byOwner.set(row.owner_email, list)
  }

  const roster = members.map(m => ({
    email: m.email,
    username: m.username ?? null,
    characters: byOwner.get(m.email) ?? [],
  }))

  return json({ roster })
}
