import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, type Env,
} from '../../../_lib/auth'

interface CampaignCharRow {
  id: string
  owner_email: string
  owner_username: string | null
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

  // LEFT JOIN users so each row carries its owner's display name (null until
  // they've onboarded); the client falls back to the email when it's null.
  let rows: CampaignCharRow[]
  if (dm) {
    const { results } = await env.DB
      .prepare(`SELECT c.id, c.owner_email, u.username AS owner_username, c.data, c.created_at, c.updated_at
                FROM characters c LEFT JOIN users u ON u.email = c.owner_email
                WHERE c.campaign_id = ? AND c.deleted = 0 ORDER BY c.owner_email`)
      .bind(id)
      .all<CampaignCharRow>()
    rows = results ?? []
  } else if (await isCampaignMember(env, id, email)) {
    const { results } = await env.DB
      .prepare(`SELECT c.id, c.owner_email, u.username AS owner_username, c.data, c.created_at, c.updated_at
                FROM characters c LEFT JOIN users u ON u.email = c.owner_email
                WHERE c.campaign_id = ? AND c.owner_email = ? AND c.deleted = 0`)
      .bind(id, email)
      .all<CampaignCharRow>()
    rows = results ?? []
  } else {
    return forbidden('Not a member of this campaign')
  }

  // Parse each row defensively: one corrupt blob must not throw the whole
  // campaign response and blank the DM's whole party view. A skipped row just
  // doesn't appear until it's fixed.
  const characters: Array<{
    id: string; ownerEmail: string; ownerUsername: string | null
    createdAt: number; updatedAt: number; data: unknown
  }> = []
  for (const r of rows) {
    let data: unknown
    try {
      data = JSON.parse(r.data)
    } catch {
      console.warn(`Skipping unparseable campaign character row ${r.id}`)
      continue
    }
    characters.push({
      id: r.id,
      ownerEmail: r.owner_email,
      ownerUsername: r.owner_username ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      data,
    })
  }

  return json({ characters })
}
