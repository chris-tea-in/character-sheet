import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, type Env,
} from '../../_lib/auth'
import { validateCharacter } from '../../../shared/characterValidation'

// PUT /api/characters/:id — field-scoped merge upsert.
//
//   Body: { createdAt?, updatedAt, patch } where `patch` is a partial set of
//   changed top-level character fields (the whole character for a new row).
//
//   • Authority is recomputed server-side from the stored row, never trusted from
//     the client: an existing row may be written by its owner OR by the DM of the
//     campaign the row belongs to. A brand-new row is owned by the caller.
//   • Merge, don't replace: the patch's keys shallow-assign over the stored JSON,
//     so concurrent edits to *different* top-level fields both survive. updated_at
//     advances to max(stored, incoming).
//   • Owner setting campaignId must be a member of that campaign (else 403); the
//     derived campaign_id column is updated to match.
//   • A DM (non-owner) editing a player's character may change stats but never
//     ownership or membership — campaignId is stripped from a non-owner patch and
//     the column/owner are left untouched.
export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)

  let body: { createdAt?: unknown; updatedAt?: unknown; patch?: unknown }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { createdAt, updatedAt, patch } = body
  if (typeof updatedAt !== 'number' || typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return json({ error: 'Malformed character payload' }, 400)
  }
  const incoming = { ...(patch as Record<string, unknown>) }

  const existing = await env.DB
    .prepare('SELECT owner_email, data, updated_at, campaign_id FROM characters WHERE id = ?')
    .bind(id)
    .first<{ owner_email: string; data: string; updated_at: number; campaign_id: string | null }>()

  if (existing) {
    const isOwner = existing.owner_email === email
    const isDmEditor = !isOwner && !!existing.campaign_id
      && await isCampaignDm(env, existing.campaign_id, email)
    if (!isOwner && !isDmEditor) return forbidden()

    // A DM edits stats, never ownership/membership.
    if (!isOwner) delete incoming.campaignId

    // Owner moving the character into a campaign must be a member of it.
    let campaignCol = existing.campaign_id
    if (isOwner && Object.prototype.hasOwnProperty.call(incoming, 'campaignId')) {
      const cid = incoming.campaignId
      if (cid === null) {
        campaignCol = null
      } else if (typeof cid === 'string' && cid) {
        if (!(await isCampaignMember(env, cid, email))) return forbidden('Not a member of that campaign')
        campaignCol = cid
      } else {
        return json({ error: 'Invalid campaignId' }, 400)
      }
    }

    let stored: Record<string, unknown>
    try {
      stored = JSON.parse(existing.data) as Record<string, unknown>
    } catch {
      // The row already in D1 is corrupt JSON — we can't field-merge onto it.
      // Reject rather than overwrite it with a partial patch; the client keeps
      // its good local copy and retries.
      return json({ error: 'Stored character data is unparseable' }, 400)
    }
    const merged = { ...stored, ...incoming }

    // Reject a structurally-corrupt MERGED result before it lands in D1. Validate
    // the merge, never the raw patch — a field-scoped patch is legitimately partial.
    const valid = validateCharacter(merged)
    if (!valid.ok) return json({ error: `Rejected invalid character: ${valid.reason}` }, 400)

    const newUpdatedAt = Math.max(existing.updated_at, updatedAt)

    await env.DB
      .prepare('UPDATE characters SET data = ?, updated_at = ?, deleted = 0, campaign_id = ? WHERE id = ?')
      .bind(JSON.stringify(merged), newUpdatedAt, campaignCol, id)
      .run()

    // Return the authoritative updated_at so the client can set its sync base to
    // exactly what we stored (max(stored, incoming)), not just what it sent.
    return json({ ok: true, updatedAt: newUpdatedAt })
  } else {
    // New row: the patch is the full character; the caller is the owner.
    // Validate the full incoming blob before the first insert.
    const valid = validateCharacter(incoming)
    if (!valid.ok) return json({ error: `Rejected invalid character: ${valid.reason}` }, 400)

    const created = typeof createdAt === 'number' ? createdAt : updatedAt
    let campaignCol: string | null = null
    const cid = incoming.campaignId
    if (typeof cid === 'string' && cid) {
      if (!(await isCampaignMember(env, cid, email))) return forbidden('Not a member of that campaign')
      campaignCol = cid
    }
    await env.DB
      .prepare('INSERT INTO characters (id, owner_email, data, created_at, updated_at, deleted, campaign_id) VALUES (?, ?, ?, ?, ?, 0, ?)')
      .bind(id, email, JSON.stringify(incoming), created, updatedAt, campaignCol)
      .run()

    return json({ ok: true, updatedAt })
  }
}

// DELETE /api/characters/:id — owner-only soft delete (tombstone). A hard delete
// would let an un-synced device re-push the character; deleted=1 + a fresh
// updated_at lets LWW carry the deletion to every device. A DM never deletes a
// player's character — removing it from a campaign is a separate action.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)

  const existing = await env.DB
    .prepare('SELECT owner_email FROM characters WHERE id = ?')
    .bind(id)
    .first<{ owner_email: string }>()

  if (!existing) return json({ ok: true }) // already absent — nothing to tombstone
  if (existing.owner_email !== email) return forbidden()

  await env.DB
    .prepare('UPDATE characters SET deleted = 1, updated_at = ? WHERE id = ?')
    .bind(Date.now(), id)
    .run()

  return json({ ok: true })
}
