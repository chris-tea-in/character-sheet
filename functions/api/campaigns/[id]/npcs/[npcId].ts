import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, badRequest, notFound, type Env,
} from '../../../../_lib/auth'

// Per-NPC edit/delete — author-or-DM (recomputed server-side).
//   PUT    — update name, description, and/or locationId (null = unpin)
//   DELETE — soft-delete

const MAX_NPC_NAME = 120
const MAX_NPC_DESC = 8_000

async function loadNpc(env: Env, campaignId: string, npcId: string) {
  return env.DB
    .prepare('SELECT id, author_email FROM campaign_npcs WHERE id = ? AND campaign_id = ? AND deleted = 0')
    .bind(npcId, campaignId)
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
  const npcId = String(params.npcId)

  const npc = await loadNpc(env, campaignId, npcId)
  if (!npc) return notFound('NPC not found')
  if (!(await canEdit(env, campaignId, npc.author_email, email))) {
    return forbidden('Only the NPC author or the DM can edit it')
  }

  let body: unknown
  try { body = await request.json() } catch { return badRequest('Invalid JSON') }
  const b = body as { name?: unknown; description?: unknown; locationId?: unknown }

  const sets: string[] = []
  const binds: unknown[] = []
  if (b.name !== undefined) {
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name || name.length > MAX_NPC_NAME) return badRequest('Invalid name')
    sets.push('name = ?')
    binds.push(name)
  }
  if (b.description !== undefined) {
    const description = typeof b.description === 'string' ? b.description.trim() : ''
    if (description.length > MAX_NPC_DESC) return badRequest('Description too long')
    sets.push('description = ?')
    binds.push(description)
  }
  if (b.locationId !== undefined) {
    const locationId = typeof b.locationId === 'string' && b.locationId ? b.locationId : null
    if (locationId) {
      const loc = await env.DB
        .prepare('SELECT 1 AS ok FROM campaign_locations WHERE id = ? AND campaign_id = ? AND deleted = 0')
        .bind(locationId, campaignId).first<{ ok: number }>()
      if (!loc) return badRequest('Unknown location')
    }
    sets.push('location_id = ?')
    binds.push(locationId)
  }
  if (sets.length === 0) return badRequest('Nothing to update')

  const now = Date.now()
  await env.DB
    .prepare(`UPDATE campaign_npcs SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND campaign_id = ?`)
    .bind(...binds, now, npcId, campaignId)
    .run()
  return json({ ok: true, updatedAt: now })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const campaignId = String(params.id)
  const npcId = String(params.npcId)

  const npc = await loadNpc(env, campaignId, npcId)
  if (!npc) return notFound('NPC not found')
  if (!(await canEdit(env, campaignId, npc.author_email, email))) {
    return forbidden('Only the NPC author or the DM can delete it')
  }

  await env.DB
    .prepare('UPDATE campaign_npcs SET deleted = 1, updated_at = ? WHERE id = ? AND campaign_id = ?')
    .bind(Date.now(), npcId, campaignId)
    .run()
  return json({ ok: true })
}
