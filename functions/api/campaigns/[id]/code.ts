import { getEmail, isCampaignDm, json, unauthorized, forbidden, randomInviteCode, type Env } from '../../../_lib/auth'

// POST /api/campaigns/:id/code — DM-only. Rotates the invite code, invalidating
// any previously-shared link. Returns the new code.
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)
  if (!(await isCampaignDm(env, id, email))) return forbidden('Not the DM of this campaign')

  let inviteCode = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    inviteCode = randomInviteCode()
    try {
      await env.DB
        .prepare('UPDATE campaigns SET invite_code = ?, updated_at = ? WHERE id = ?')
        .bind(inviteCode, Date.now(), id)
        .run()
      break
    } catch (err) {
      if (attempt === 4) throw err
    }
  }

  return json({ inviteCode })
}
