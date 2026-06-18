import { getEmail, isCampaignDm, json, unauthorized, forbidden, type Env } from '../../../_lib/auth'

interface MemberRow {
  email: string
  role: string
  username: string | null
}

// GET /api/campaigns/:id/members — DM-only roster (email + role). Players don't
// see each other, so only the DM can list members (e.g. to remove one).
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)
  if (!(await isCampaignDm(env, id, email))) return forbidden('Not the DM of this campaign')

  // LEFT JOIN users for each member's display name (null until they onboard).
  const { results } = await env.DB
    .prepare(`SELECT m.email, m.role, u.username
              FROM campaign_members m LEFT JOIN users u ON u.email = m.email
              WHERE m.campaign_id = ? ORDER BY m.role DESC, m.email`)
    .bind(id)
    .all<MemberRow>()

  const members = (results ?? []).map(m => ({ email: m.email, role: m.role, username: m.username ?? null }))
  return json({ members })
}
