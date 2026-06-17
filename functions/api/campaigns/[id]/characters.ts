import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, type Env,
} from '../../../_lib/auth'

interface CampaignCharRow {
  id: string
  owner_email: string
  data: string
  created_at: number
  updated_at: number
}

// GET /api/campaigns/:id/characters — membership-scoped.
//   • DM            → every member's character in this campaign.
//   • player member → only their own.
//   • non-member    → 403.
// Authority is recomputed from the verified email; players can never see each
// other's sheets.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)
  const dm = await isCampaignDm(env, id, email)

  let rows: CampaignCharRow[]
  if (dm) {
    const { results } = await env.DB
      .prepare('SELECT id, owner_email, data, created_at, updated_at FROM characters WHERE campaign_id = ? AND deleted = 0 ORDER BY owner_email')
      .bind(id)
      .all<CampaignCharRow>()
    rows = results ?? []
  } else if (await isCampaignMember(env, id, email)) {
    const { results } = await env.DB
      .prepare('SELECT id, owner_email, data, created_at, updated_at FROM characters WHERE campaign_id = ? AND owner_email = ? AND deleted = 0')
      .bind(id, email)
      .all<CampaignCharRow>()
    rows = results ?? []
  } else {
    return forbidden('Not a member of this campaign')
  }

  const characters = rows.map(r => ({
    id: r.id,
    ownerEmail: r.owner_email,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    data: JSON.parse(r.data),
  }))

  return json({ characters })
}
