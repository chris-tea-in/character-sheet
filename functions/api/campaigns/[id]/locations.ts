import {
  getEmail, isCampaignMember,
  json, unauthorized, forbidden, badRequest, type Env,
} from '../../../_lib/auth'

// Campaign locations (Phase F). Any member may list and create; edits/deletes are
// author-or-DM in locations/[locId].ts. Locations are always campaign-public —
// per-viewer secrecy belongs to notes (which can be hidden), not the place itself.

export const MAX_LOCATION_NAME = 120
export const MAX_LOCATION_DESC = 8_000
const MAX_LOCATIONS_PER_CAMPAIGN = 200

interface LocationRow {
  id: string
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

  const { results } = await env.DB
    .prepare(`SELECT l.id, l.name, l.description, l.author_email, u.username AS author_username,
                     l.created_at, l.updated_at
              FROM campaign_locations l LEFT JOIN users u ON u.email = l.author_email
              WHERE l.campaign_id = ? AND l.deleted = 0 ORDER BY l.name COLLATE NOCASE`)
    .bind(id)
    .all<LocationRow>()

  return json({
    locations: (results ?? []).map(r => ({
      id: r.id, name: r.name, description: r.description,
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
  const b = body as { name?: unknown; description?: unknown }
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name || name.length > MAX_LOCATION_NAME) return badRequest('Invalid name')
  const description = typeof b.description === 'string' ? b.description.trim() : ''
  if (description.length > MAX_LOCATION_DESC) return badRequest('Description too long')

  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM campaign_locations WHERE campaign_id = ? AND deleted = 0')
    .bind(id).first<{ n: number }>()
  if ((countRow?.n ?? 0) >= MAX_LOCATIONS_PER_CAMPAIGN) return badRequest('Campaign location limit reached')

  const locId = crypto.randomUUID()
  const now = Date.now()
  await env.DB
    .prepare(`INSERT INTO campaign_locations
                (id, campaign_id, name, description, author_email, created_at, updated_at, deleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0)`)
    .bind(locId, id, name, description, email, now, now)
    .run()

  return json({ id: locId, name, description, authorEmail: email, authorUsername: null, createdAt: now, updatedAt: now })
}
