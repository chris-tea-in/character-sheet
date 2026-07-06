import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, badRequest, type Env,
} from '../../../_lib/auth'
import {
  validateCompanionData, MAX_COMPANION_BYTES, type CompanionData,
} from '../../../../shared/companionValidation'

// Campaign companions — full custom stat blocks (familiars, mounts, sidekicks).
//   GET  — any member: rows assigned to a character they own, plus everything they
//          authored (incl. DM-pool rows); the DM sees all. Visibility is enforced
//          IN SQL — a pool row never leaves the server for a non-author player.
//   POST — any member: create. A player must assign it to a character they own in
//          this campaign; only the DM may create unassigned (pool) or assign to
//          any campaign character.
// Authority is recomputed from the verified Access email on every request; `data`
// is shape-guarded before storage so a malformed blob can't be persisted and later
// crash a member's sheet.

const MAX_COMPANIONS_PER_CAMPAIGN = 100

interface CompanionRow {
  id: string
  assigned_character_id: string | null
  data: string
  created_by: string
  created_by_username: string | null
  created_at: number
  updated_at: number
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignMember(env, id, email))) return forbidden('Not a member of this campaign')
  const viewerIsDm = await isCampaignDm(env, id, email)

  // Visible when: viewer is DM, OR the assigned character is the viewer's own (the
  // join fails for pool/orphaned rows, so those stay DM+author-only), OR the viewer
  // authored the row (authors keep sight of pooled/reassigned creations).
  const { results } = await env.DB
    .prepare(`SELECT co.id, co.assigned_character_id, co.data, co.created_by,
                     u.username AS created_by_username, co.created_at, co.updated_at
              FROM campaign_companions co
              LEFT JOIN characters c
                ON c.id = co.assigned_character_id AND c.campaign_id = co.campaign_id AND c.deleted = 0
              LEFT JOIN users u ON u.email = co.created_by
              WHERE co.campaign_id = ? AND co.deleted = 0
                AND (? = 1 OR c.owner_email = ? OR co.created_by = ?)
              ORDER BY co.created_at`)
    .bind(id, viewerIsDm ? 1 : 0, email, email)
    .all<CompanionRow>()

  // Parse defensively — one corrupt row must not blank the whole list.
  const companions: Array<{
    id: string; assignedCharacterId: string | null; data: unknown
    createdBy: string; createdByUsername: string | null; createdAt: number; updatedAt: number
  }> = []
  for (const r of results ?? []) {
    let data: unknown
    try { data = JSON.parse(r.data) } catch { continue }
    companions.push({
      id: r.id, assignedCharacterId: r.assigned_character_id, data,
      createdBy: r.created_by, createdByUsername: r.created_by_username,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })
  }
  return json({ companions })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignMember(env, id, email))) return forbidden('Not a member of this campaign')

  let body: unknown
  try { body = await request.json() } catch { return badRequest('Invalid JSON') }
  const b = body as { assignedCharacterId?: unknown; data?: unknown }

  const valid = validateCompanionData(b.data)
  if (!valid.ok) return badRequest(`Invalid companion: ${valid.reason}`)
  const data = b.data as CompanionData
  if (JSON.stringify(data).length > MAX_COMPANION_BYTES) return badRequest('Companion too large')

  const assignedId = b.assignedCharacterId ?? null
  if (assignedId !== null && typeof assignedId !== 'string') return badRequest('Invalid assignment')
  const viewerIsDm = await isCampaignDm(env, id, email)
  if (assignedId === null) {
    if (!viewerIsDm) return forbidden('Only the DM can leave a companion unassigned')
  } else {
    const target = await env.DB
      .prepare('SELECT owner_email FROM characters WHERE id = ? AND campaign_id = ? AND deleted = 0')
      .bind(assignedId, id)
      .first<{ owner_email: string }>()
    if (!target) return badRequest('Unknown character')
    if (!viewerIsDm && target.owner_email.toLowerCase() !== email.toLowerCase()) {
      return forbidden('You can only assign companions to your own characters')
    }
  }

  // Cap the herd so one campaign can't bloat every member's payload.
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM campaign_companions WHERE campaign_id = ? AND deleted = 0')
    .bind(id)
    .first<{ n: number }>()
  if ((countRow?.n ?? 0) >= MAX_COMPANIONS_PER_CAMPAIGN) return badRequest('Campaign companion limit reached')

  const companionId = crypto.randomUUID()
  const now = Date.now()
  await env.DB
    .prepare(`INSERT INTO campaign_companions
                (id, campaign_id, assigned_character_id, data, created_by, created_at, updated_at, deleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0)`)
    .bind(companionId, id, assignedId, JSON.stringify(data), email, now, now)
    .run()

  return json({
    id: companionId, assignedCharacterId: assignedId, data,
    createdBy: email, createdByUsername: null, createdAt: now, updatedAt: now,
  })
}
