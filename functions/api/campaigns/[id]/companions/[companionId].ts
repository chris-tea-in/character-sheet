import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, badRequest, notFound, type Env,
} from '../../../../_lib/auth'
import {
  validateCompanionData, MAX_COMPANION_BYTES, type CompanionData,
} from '../../../../../shared/companionValidation'

// Per-companion edit/reassign/delete.
//   PUT    — full co-edit of the stat block by DM / author / owner of the assigned
//            character; reassignment: DM anywhere (incl. back to the pool), a player
//            only between their own characters.
//   DELETE — author or DM only (soft delete).
// Membership is checked FIRST (kicked-author hardening — authorship or assignment
// alone never survives losing membership). Every row read/write is scoped to the
// campaign id so a companion id alone can't reach another campaign.

interface Row {
  id: string
  assigned_character_id: string | null
  created_by: string
}

async function loadCompanion(env: Env, campaignId: string, companionId: string) {
  return env.DB
    .prepare(`SELECT id, assigned_character_id, created_by
              FROM campaign_companions WHERE id = ? AND campaign_id = ? AND deleted = 0`)
    .bind(companionId, campaignId)
    .first<Row>()
}

async function ownsCharacter(env: Env, campaignId: string, characterId: string, email: string): Promise<boolean> {
  const row = await env.DB
    .prepare('SELECT 1 AS ok FROM characters WHERE id = ? AND campaign_id = ? AND owner_email = ? AND deleted = 0')
    .bind(characterId, campaignId, email)
    .first<{ ok: number }>()
  return !!row
}

// Full co-edit: membership first, then author, DM, or owner of the assigned character.
async function canEdit(env: Env, campaignId: string, row: Row, email: string): Promise<boolean> {
  if (!(await isCampaignMember(env, campaignId, email))) return false
  if (row.created_by.toLowerCase() === email.toLowerCase()) return true
  if (await isCampaignDm(env, campaignId, email)) return true
  if (row.assigned_character_id) return ownsCharacter(env, campaignId, row.assigned_character_id, email)
  return false
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const campaignId = String(params.id)
  const companionId = String(params.companionId)

  const row = await loadCompanion(env, campaignId, companionId)
  if (!row) return notFound('Companion not found')
  if (!(await canEdit(env, campaignId, row, email))) {
    return forbidden('Only the DM, the author, or the assigned player can edit a companion')
  }

  let body: unknown
  try { body = await request.json() } catch { return badRequest('Invalid JSON') }
  const b = body as { data?: unknown; assignedCharacterId?: unknown }

  const sets: string[] = []
  const binds: unknown[] = []
  if (b.data !== undefined) {
    const valid = validateCompanionData(b.data)
    if (!valid.ok) return badRequest(`Invalid companion: ${valid.reason}`)
    if (JSON.stringify(b.data).length > MAX_COMPANION_BYTES) return badRequest('Companion too large')
    sets.push('data = ?')
    binds.push(JSON.stringify(b.data as CompanionData))
  }
  if (b.assignedCharacterId !== undefined) {
    const target = b.assignedCharacterId
    if (target !== null && typeof target !== 'string') return badRequest('Invalid assignment')
    const viewerIsDm = await isCampaignDm(env, campaignId, email)
    if (viewerIsDm) {
      if (target !== null) {
        const exists = await env.DB
          .prepare('SELECT 1 AS ok FROM characters WHERE id = ? AND campaign_id = ? AND deleted = 0')
          .bind(target, campaignId)
          .first<{ ok: number }>()
        if (!exists) return badRequest('Unknown character')
      }
    } else {
      // A player may only move a companion between their OWN characters: the current
      // assignment must be theirs (blocks yanking back one the DM moved elsewhere)
      // and the target must be theirs (pool moves are DM-only).
      if (target === null) return forbidden('Only the DM can move a companion to the pool')
      if (!row.assigned_character_id
        || !(await ownsCharacter(env, campaignId, row.assigned_character_id, email))) {
        return forbidden('Only the DM can reassign this companion')
      }
      if (!(await ownsCharacter(env, campaignId, target, email))) {
        return forbidden('You can only move companions between your own characters')
      }
    }
    sets.push('assigned_character_id = ?')
    binds.push(target)
  }
  if (sets.length === 0) return badRequest('Nothing to update')

  const now = Date.now()
  await env.DB
    .prepare(`UPDATE campaign_companions SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND campaign_id = ?`)
    .bind(...binds, now, companionId, campaignId)
    .run()
  return json({ ok: true, updatedAt: now })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const campaignId = String(params.id)
  const companionId = String(params.companionId)

  const row = await loadCompanion(env, campaignId, companionId)
  if (!row) return notFound('Companion not found')

  // Delete is NARROWER than edit: author or DM only (the assigned player can adjust
  // the block, not destroy the DM's or another author's creation). Membership first.
  const isAuthor = row.created_by.toLowerCase() === email.toLowerCase()
  const allowed = (await isCampaignMember(env, campaignId, email))
    && (isAuthor || (await isCampaignDm(env, campaignId, email)))
  if (!allowed) return forbidden('Only the author or the DM can delete a companion')

  await env.DB
    .prepare('UPDATE campaign_companions SET deleted = 1, updated_at = ? WHERE id = ? AND campaign_id = ?')
    .bind(Date.now(), companionId, campaignId)
    .run()
  return json({ ok: true })
}
