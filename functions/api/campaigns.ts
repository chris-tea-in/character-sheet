import { getEmail, json, unauthorized, randomInviteCode, type Env } from '../_lib/auth'

interface CampaignRow {
  id: string
  name: string
  dm_email: string
  invite_code: string
  role: string
}

// GET /api/campaigns → the campaigns the caller is a member of. The invite code
// is only returned to the DM (players never need it and shouldn't re-share it).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const { results } = await env.DB
    .prepare(`
      SELECT c.id, c.name, c.dm_email, c.invite_code, m.role
      FROM campaign_members m
      JOIN campaigns c ON c.id = m.campaign_id
      WHERE m.email = ? AND c.deleted = 0
      ORDER BY c.created_at DESC
    `)
    .bind(email)
    .all<CampaignRow>()

  const campaigns = (results ?? []).map(r => ({
    id: r.id,
    name: r.name,
    role: r.role,
    dmEmail: r.dm_email,
    inviteCode: r.role === 'dm' ? r.invite_code : undefined,
  }))

  return json({ campaigns })
}

// POST /api/campaigns { name } → create a campaign owned by the caller (DM), with
// a random invite code, and enroll the caller as its DM member.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  let body: { name?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return json({ error: 'Campaign name is required' }, 400)

  const id = crypto.randomUUID()
  const now = Date.now()

  // invite_code is UNIQUE — retry a few times on the astronomically unlikely clash.
  let inviteCode = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    inviteCode = randomInviteCode()
    try {
      await env.DB
        .prepare('INSERT INTO campaigns (id, name, dm_email, invite_code, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)')
        .bind(id, name, email, inviteCode, now, now)
        .run()
      break
    } catch (err) {
      if (attempt === 4) throw err
    }
  }

  await env.DB
    .prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, email, role, joined_at) VALUES (?, ?, ?, ?)')
    .bind(id, email, 'dm', now)
    .run()

  return json({ id, name, role: 'dm', dmEmail: email, inviteCode })
}
