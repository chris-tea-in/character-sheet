import { getEmail, isCampaignDm, json, unauthorized, forbidden, type Env } from '../../_lib/auth'

// DELETE /api/campaigns/:id — DM-only. Marks the campaign deleted and drops its
// members. Characters are never removed from anyone's list; we only clear the
// derived campaign_id column so the (now defunct) campaign query returns nothing.
// Each player's local character keeps its stale campaignId harmlessly — the
// campaign simply stops appearing in their Campaigns tab.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)
  if (!(await isCampaignDm(env, id, email))) return forbidden('Not the DM of this campaign')

  const now = Date.now()
  await env.DB.prepare('UPDATE campaigns SET deleted = 1, updated_at = ? WHERE id = ?').bind(now, id).run()
  await env.DB.prepare('DELETE FROM campaign_members WHERE campaign_id = ?').bind(id).run()
  await env.DB.prepare('UPDATE characters SET campaign_id = NULL WHERE campaign_id = ?').bind(id).run()

  return json({ ok: true })
}
