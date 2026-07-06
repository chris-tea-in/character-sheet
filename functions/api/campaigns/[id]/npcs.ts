import {
  getEmail, isCampaignMember,
  json, unauthorized, forbidden, badRequest, type Env,
} from '../../../_lib/auth'

// Campaign NPCs (Phase F) — lightweight entries (name + description, optionally
// pinned to a location), deliberately NOT full character sheets (user decision).
// Any member may list and create; edits/deletes are author-or-DM in npcs/[npcId].ts.
//   GET  ?locationId= — optional filter to one location's NPCs

export const MAX_NPC_NAME = 120
export const MAX_NPC_DESC = 8_000
const MAX_NPCS_PER_CAMPAIGN = 500

interface NpcRow {
  id: string
  location_id: string | null
  name: string
  description: string
  author_email: string
  author_username: string | null
  created_at: number
  updated_at: number
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignMember(env, id, email))) return forbidden('Not a member of this campaign')

  const locationId = new URL(request.url).searchParams.get('locationId')
  const { results } = await env.DB
    .prepare(`SELECT n.id, n.location_id, n.name, n.description, n.author_email,
                     u.username AS author_username, n.created_at, n.updated_at
              FROM campaign_npcs n LEFT JOIN users u ON u.email = n.author_email
              WHERE n.campaign_id = ? AND n.deleted = 0
                AND (? IS NULL OR n.location_id = ?)
              ORDER BY n.name COLLATE NOCASE`)
    .bind(id, locationId, locationId)
    .all<NpcRow>()

  return json({
    npcs: (results ?? []).map(r => ({
      id: r.id, locationId: r.location_id, name: r.name, description: r.description,
      authorEmail: r.author_email, authorUsername: r.author_username,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignMember(env, id, email))) return forbidden('Not a member of this campaign')

  let body: unknown
  try { body = await request.json() } catch { return badRequest('Invalid JSON') }
  const b = body as { name?: unknown; description?: unknown; locationId?: unknown }
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > MAX_NPC_NAME) return badRequest('Invalid name')
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  if (description.length > MAX_NPC_DESC) return badRequest('Description too long')
  const locationId = typeof b.locationId === 'string' && b.locationId ? b.locationId : null

  // A pinned location must be a live location of THIS campaign.
  if (locationId) {
    const loc = await env.DB
      .prepare('SELECT 1 AS ok FROM campaign_locations WHERE id = ? AND campaign_id = ? AND deleted = 0')
      .bind(locationId, id).first<{ ok: number }>()
    if (!loc) return badRequest('Unknown location')
  }

  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM campaign_npcs WHERE campaign_id = ? AND deleted = 0')
    .bind(id).first<{ n: number }>()
  if ((countRow?.n ?? 0) >= MAX_NPCS_PER_CAMPAIGN) return badRequest('Campaign NPC limit reached')

  const npcId = crypto.randomUUID()
  const now = Date.now()
  await env.DB
    .prepare(`INSERT INTO campaign_npcs
                (id, campaign_id, location_id, name, description, author_email, created_at, updated_at, deleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`)
    .bind(npcId, id, locationId, name, description, email, now, now)
    .run()

  return json({ id: npcId, locationId, name, description, authorEmail: email, authorUsername: null, createdAt: now, updatedAt: now })
}
