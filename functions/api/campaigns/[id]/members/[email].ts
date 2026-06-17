import { getEmail, isCampaignDm, json, unauthorized, forbidden, type Env } from '../../../../_lib/auth'

// DELETE /api/campaigns/:id/members/:email — remove a member. Allowed when the
// caller is the campaign DM (removing someone) OR is removing themselves
// (self-leave). The DM cannot be removed here — deleting the campaign is the way
// to wind it down. Removing a member also clears the derived campaign_id on that
// member's characters so they drop out of the DM's view (their local copies keep
// a harmless stale id and stay in their own Characters list).
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const caller = await getEmail(request, env)
  if (!caller) return unauthorized()

  const id = String(params.id)
  const target = decodeURIComponent(String(params.email)).trim().toLowerCase()

  const campaign = await env.DB
    .prepare('SELECT dm_email FROM campaigns WHERE id = ? AND deleted = 0')
    .bind(id)
    .first<{ dm_email: string }>()
  if (!campaign) return json({ ok: true }) // already gone — nothing to remove

  const dmEmail = campaign.dm_email.toLowerCase()
  if (target === dmEmail) {
    return json({ error: 'The DM cannot leave; delete the campaign instead.' }, 400)
  }

  const isDm = await isCampaignDm(env, id, caller)
  const isSelf = caller.toLowerCase() === target
  if (!isDm && !isSelf) return forbidden()

  await env.DB
    .prepare('DELETE FROM campaign_members WHERE campaign_id = ? AND email = ?')
    .bind(id, target)
    .run()
  await env.DB
    .prepare('UPDATE characters SET campaign_id = NULL WHERE campaign_id = ? AND owner_email = ?')
    .bind(id, target)
    .run()

  return json({ ok: true })
}
