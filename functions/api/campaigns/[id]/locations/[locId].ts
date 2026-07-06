import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, badRequest, notFound, type Env,
} from '../../../../_lib/auth'

// Per-location edit/delete — author-or-DM (recomputed server-side).
//   PUT    — update name and/or description
//   DELETE — soft-delete; the location's notes and NPC links keep their rows
//            (tombstoned subjects simply stop resolving).

const MAX_LOCATION_NAME = 120
const MAX_LOCATION_DESC = 8_000

async function loadLocation(env: Env, campaignId: string, locId: string) {
  return env.DB
    .prepare('SELECT id, author_email FROM campaign_locations WHERE id = ? AND campaign_id = ? AND deleted = 0')
    .bind(locId, campaignId)
    .first<{ id: string; author_email: string }>()
}

// Authorship alone is NOT enough — the author must still be a member, or a
// kicked player could keep vandalizing/deleting their old rows forever.
async function canEdit(env: Env, campaignId: string, authorEmail: string, email: string): Promise<boolean> {
  if (!(await isCampaignMember(env, campaignId, email))) return false
  if (authorEmail.toLowerCase() === email.toLowerCase()) return true
  return isCampaignDm(env, campaignId, email)
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const campaignId = String(params.id)
  const locId = String(params.locId)

  const loc = await loadLocation(env, campaignId, locId)
  if (!loc) return notFound('Location not found')
  if (!(await canEdit(env, campaignId, loc.author_email, email))) {
    return forbidden('Only the location author or the DM can edit it')
  }

  let body: unknown
  try { body = await request.json() } catch { return badRequest('Invalid JSON') }
  const b = body as { name?: unknown; description?: unknown }

  const sets: string[] = []
  const binds: unknown[] = []
  if (b.name !== undefined) {
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name || name.length > MAX_LOCATION_NAME) return badRequest('Invalid name')
    sets.push('name = ?')
    binds.push(name)
  }
  if (b.description !== undefined) {
    const description = typeof b.description === 'string' ? b.description.trim() : ''
    if (description.length > MAX_LOCATION_DESC) return badRequest('Description too long')
    sets.push('description = ?')
    binds.push(description)
  }
  if (sets.length === 0) return badRequest('Nothing to update')

  const now = Date.now()
  await env.DB
    .prepare(`UPDATE campaign_locations SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND campaign_id = ?`)
    .bind(...binds, now, locId, campaignId)
    .run()
  return json({ ok: true, updatedAt: now })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const campaignId = String(params.id)
  const locId = String(params.locId)

  const loc = await loadLocation(env, campaignId, locId)
  if (!loc) return notFound('Location not found')
  if (!(await canEdit(env, campaignId, loc.author_email, email))) {
    return forbidden('Only the location author or the DM can delete it')
  }

  await env.DB
    .prepare('UPDATE campaign_locations SET deleted = 1, updated_at = ? WHERE id = ? AND campaign_id = ?')
    .bind(Date.now(), locId, campaignId)
    .run()
  return json({ ok: true })
}
