import {
  getEmail, isCampaignDm,
  json, unauthorized, forbidden, type Env,
} from '../../../../_lib/auth'

// DELETE /api/campaigns/:id/characters/:charId — the DM removes one player's
// character from the campaign. This is NOT a delete: the character is kept and
// stays in its owner's own Characters list; only its campaign membership is
// cleared.
//
// Unlike member-removal (which clears just the derived campaign_id column and
// tolerates a harmless stale id on the owner's device), a single-character
// removal also clears data.campaignId and bumps updated_at. The owner is still a
// member here, so a stale id would otherwise pass the membership check and silently
// re-join the campaign the next time their device pushes a full snapshot. Bumping
// updated_at lets the cleared value win by last-write-wins and reach every device.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const campaignId = String(params.id)
  const charId = String(params.charId)

  if (!(await isCampaignDm(env, campaignId, email))) {
    return forbidden('Only the DM can remove a character from the campaign')
  }

  // Scope the clear to a character actually in THIS campaign, so a DM of one
  // campaign can't touch a character in another. json_set updates only the
  // campaignId key, leaving concurrent edits to other fields intact. A no-match
  // (already removed, or never in this campaign) is a harmless no-op.
  await env.DB
    .prepare(
      `UPDATE characters
       SET data = json_set(data, '$.campaignId', null),
           campaign_id = NULL,
           updated_at = ?
       WHERE id = ? AND campaign_id = ?`,
    )
    .bind(Date.now(), charId, campaignId)
    .run()

  return json({ ok: true })
}
