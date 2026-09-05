import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, type Env,
} from '../../_lib/auth'
import { validateCharacter } from '../../../shared/characterValidation'

// Ordering is server-authoritative: the stored updated_at (the last-write-wins key
// the whole sync reconcile turns on) is derived from OUR clock, not trusted from
// the client. We still accept the client's updatedAt but cap how far it may run
// ahead of us, so a skewed or hostile client can't pin its version forever with a
// far-future timestamp. A sane client clock is within the window and passes
// through unchanged (no behavior change for normal use). The client mirrors the
// echoed value back into BOTH its local updated_at and its reconcile base, so the
// "base == local.updatedAt after a sync" invariant holds even when we clamp.
const MAX_CLOCK_SKEW_MS = 5 * 60_000
const clampToServerClock = (t: number): number => Math.min(t, Date.now() + MAX_CLOCK_SKEW_MS)
const MAX_WRITE_ATTEMPTS = 4
const isSafeRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

interface CharacterRow {
  owner_email: string
  data: string
  updated_at: number
  campaign_id: string | null
  deleted: number
}

// A successful mutation must always move the reconciliation key forward. The
// client timestamp is still useful when it is ahead, but can never leave an
// acknowledged edit equal to the snapshot it replaced.
function nextRevision(previous: number, requested: number): number | null {
  if (!isSafeRevision(previous) || previous >= Number.MAX_SAFE_INTEGER) return null
  const revision = Math.max(previous + 1, clampToServerClock(requested))
  return Number.isSafeInteger(revision) ? revision : null
}

// PUT /api/characters/:id — field-scoped merge upsert.
//
//   Body: { createdAt?, updatedAt, patch } where `patch` is a partial set of
//   changed top-level character fields (the whole character for a new row).
//
//   • Authority is recomputed server-side from the stored row, never trusted from
//     the client: an existing row may be written by its owner OR by the DM of the
//     campaign the row belongs to. A brand-new row is owned by the caller.
//   • Merge, don't replace: the patch's keys shallow-assign over the stored JSON,
//     so concurrent edits to *different* top-level fields both survive. Every
//     write compare-and-swaps the snapshot it read; a lost race reloads, then
//     reauthorizes and revalidates the newly merged document.
//   • Owner setting campaignId must be a member of that campaign (else 403); the
//     derived campaign_id column is updated to match.
//   • A DM (non-owner) editing a player's character may change stats but never
//     ownership or membership — campaignId is stripped from a non-owner patch and
//     the column/owner are left untouched.
export const onRequestPut: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Malformed character payload' }, 400)
  }

  const { createdAt, updatedAt, patch } = body as {
    createdAt?: unknown; updatedAt?: unknown; patch?: unknown
  }
  if (!isSafeRevision(updatedAt)
    || (createdAt !== undefined && !isSafeRevision(createdAt))
    || typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return json({ error: 'Malformed character payload' }, 400)
  }
  const incomingPatch = { ...(patch as Record<string, unknown>) }

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const existing = await env.DB
      .prepare('SELECT owner_email, data, updated_at, campaign_id, deleted FROM characters WHERE id = ?')
      .bind(id)
      .first<CharacterRow>()

    if (existing) {
      // Do this on every attempt: a retry can observe a different campaign row
      // and therefore a different editor or owner authority boundary.
      const incoming = { ...incomingPatch }
      const isOwner = existing.owner_email === email
      const isDmEditor = !isOwner && !!existing.campaign_id
        && await isCampaignDm(env, existing.campaign_id, email)
      if (!isOwner && !isDmEditor) return forbidden()

      // A DM edits stats, never ownership/membership.
      if (!isOwner) delete incoming.campaignId

      // Owner moving the character into a campaign must be a member of it.
      let campaignCol = existing.campaign_id
      const assigningCampaign = isOwner && Object.prototype.hasOwnProperty.call(incoming, 'campaignId')
      if (assigningCampaign) {
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

      const newUpdatedAt = nextRevision(existing.updated_at, updatedAt)
      if (newUpdatedAt === null) return json({ error: 'Stored character revision is not incrementable' }, 409)

      // The WHERE clause is both the optimistic lock and the final authority
      // check. `data = ?` deliberately compares the raw snapshot so an edit to a
      // different JSON key cannot be overwritten. `IS ?` handles a null campaign.
      const changed = await env.DB
        .prepare(`UPDATE characters
                  SET data = ?, updated_at = ?, deleted = 0, campaign_id = ?
                  WHERE id = ? AND owner_email = ? AND data = ? AND updated_at = ?
                    AND deleted = ? AND campaign_id IS ?
                    AND (owner_email = ? OR EXISTS (
                      SELECT 1 FROM campaigns
                      WHERE id = characters.campaign_id AND dm_email = ? AND deleted = 0
                    ))
                    AND (? = 0 OR EXISTS (
                      SELECT 1 FROM campaign_members WHERE campaign_id = ? AND email = ?
                    ))`)
        .bind(
          JSON.stringify(merged), newUpdatedAt, campaignCol,
          id, existing.owner_email, existing.data, existing.updated_at,
          existing.deleted, existing.campaign_id,
          email, email,
          assigningCampaign && campaignCol !== null ? 1 : 0, campaignCol ?? '', email,
        )
        .run()

      if (changed.meta.changes === 1) {
        // Return the authoritative updated_at so the client can set its sync base
        // to exactly what the server stored.
        return json({ ok: true, updatedAt: newUpdatedAt })
      }
      continue
    }

    // New row: the patch is the full character; the caller is the owner. An
    // INSERT collision is not permission to replace someone else's row: loop so
    // the next iteration reads and reauthorizes its actual owner.
    const valid = validateCharacter(incomingPatch)
    if (!valid.ok) return json({ error: `Rejected invalid character: ${valid.reason}` }, 400)

    const stamp = clampToServerClock(updatedAt)
    const created = createdAt === undefined ? stamp : clampToServerClock(createdAt)
    let campaignCol: string | null = null
    const cid = incomingPatch.campaignId
    if (typeof cid === 'string' && cid) {
      if (!(await isCampaignMember(env, cid, email))) return forbidden('Not a member of that campaign')
      campaignCol = cid
    }

    const inserted = await env.DB
      .prepare(`INSERT INTO characters (id, owner_email, data, created_at, updated_at, deleted, campaign_id)
                SELECT ?, ?, ?, ?, ?, 0, ?
                WHERE ? = 0 OR EXISTS (
                  SELECT 1 FROM campaign_members WHERE campaign_id = ? AND email = ?
                )
                ON CONFLICT(id) DO NOTHING`)
      .bind(id, email, JSON.stringify(incomingPatch), created, stamp, campaignCol,
        campaignCol === null ? 0 : 1, campaignCol ?? '', email)
      .run()

    if (inserted.meta.changes === 1) return json({ ok: true, updatedAt: stamp })
  }

  return json({ error: 'Character changed repeatedly; retry the sync' }, 409)
}

// DELETE /api/characters/:id — owner-only soft delete (tombstone). A hard delete
// would let an un-synced device re-push the character; deleted=1 + a fresh
// updated_at lets LWW carry the deletion to every device. A DM never deletes a
// player's character — removing it from a campaign is a separate action.
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const id = String(params.id)

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const existing = await env.DB
      .prepare('SELECT owner_email, data, updated_at, campaign_id, deleted FROM characters WHERE id = ?')
      .bind(id)
      .first<CharacterRow>()

    if (!existing) return json({ ok: true }) // already absent — no tombstone exists to advance
    if (existing.owner_email !== email) return forbidden()

    const updatedAt = nextRevision(existing.updated_at, Date.now())
    if (updatedAt === null) return json({ error: 'Stored character revision is not incrementable' }, 409)
    const changed = await env.DB
      .prepare(`UPDATE characters SET deleted = 1, updated_at = ?
                WHERE id = ? AND owner_email = ? AND data = ? AND updated_at = ?
                  AND campaign_id IS ? AND deleted = ?`)
      .bind(updatedAt, id, existing.owner_email, existing.data, existing.updated_at,
        existing.campaign_id, existing.deleted)
      .run()

    if (changed.meta.changes === 1) return json({ ok: true, updatedAt })
  }

  return json({ error: 'Character changed repeatedly; retry the sync' }, 409)
}
