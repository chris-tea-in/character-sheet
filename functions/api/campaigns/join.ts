import { getEmail, json, unauthorized, notFound, type Env } from '../../_lib/auth'

// POST /api/campaigns/join { code } → join the campaign with that invite code as a
// player. Idempotent: re-joining is a no-op (the DM keeps the 'dm' role). The
// static `join` segment wins over the dynamic `[id]` route.
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  let body: { code?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) return json({ error: 'Invite code is required' }, 400)

  const campaign = await env.DB
    .prepare('SELECT id, name, dm_email FROM campaigns WHERE invite_code = ? AND deleted = 0')
    .bind(code)
    .first<{ id: string; name: string; dm_email: string }>()

  if (!campaign) return notFound('No campaign matches that code')

  // INSERT OR IGNORE keeps an existing membership (and the DM's 'dm' role) intact.
  await env.DB
    .prepare('INSERT OR IGNORE INTO campaign_members (campaign_id, email, role, joined_at) VALUES (?, ?, ?, ?)')
    .bind(campaign.id, email, 'player', Date.now())
    .run()

  return json({ id: campaign.id, name: campaign.name })
}
