import { getEmail, isCampaignDm, json, unauthorized, forbidden, type Env } from '../../../_lib/auth'

interface MemberRow {
  email: string
  role: string
}

// GET /api/campaigns/:id/members — DM-only roster (email + role). Players don't
// see each other, so only the DM can list members (e.g. to remove one).
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)
  if (!(await isCampaignDm(env, id, email))) return forbidden('Not the DM of this campaign')

  const { results } = await env.DB
    .prepare('SELECT email, role FROM campaign_members WHERE campaign_id = ? ORDER BY role DESC, email')
    .bind(id)
    .all<MemberRow>()

  return json({ members: results ?? [] })
}
