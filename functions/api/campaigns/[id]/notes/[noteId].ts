import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, badRequest, notFound, type Env,
} from '../../../../_lib/auth'

// Per-note edit/delete — the note's AUTHOR or the campaign's DM only (per-row
// ownership, recomputed server-side; precedent: campaigns/[id]/characters/[charId]).
//   PUT    — update body and/or visibility
//   DELETE — soft-delete (tombstone)

const MAX_NOTE_BYTES = 32_000

async function loadNote(env: Env, campaignId: string, noteId: string) {
  return env.DB
    .prepare('SELECT id, author_email FROM campaign_notes WHERE id = ? AND campaign_id = ? AND deleted = 0')
    .bind(noteId, campaignId)
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
  const noteId = String(params.noteId)

  const note = await loadNote(env, campaignId, noteId)
  if (!note) return notFound('Note not found')
  if (!(await canEdit(env, campaignId, note.author_email, email))) {
    return forbidden('Only the note author or the DM can edit a note')
  }

  let body: unknown
  try { body = await request.json() } catch { return badRequest('Invalid JSON') }
  const b = body as { body?: unknown; visibility?: unknown }

  const sets: string[] = []
  const binds: unknown[] = []
  if (b.body !== undefined) {
    const text = typeof b.body === 'string' ? b.body.trim() : ''
    if (!text) return badRequest('Empty note')
    if (text.length > MAX_NOTE_BYTES) return badRequest('Note too long')
    sets.push('body = ?')
    binds.push(text)
  }
  if (b.visibility !== undefined) {
    if (b.visibility !== 'public' && b.visibility !== 'hidden') return badRequest('Invalid visibility')
    sets.push('visibility = ?')
    binds.push(b.visibility)
  }
  if (sets.length === 0) return badRequest('Nothing to update')

  const now = Date.now()
  await env.DB
    .prepare(`UPDATE campaign_notes SET ${sets.join(', ')}, updated_at = ? WHERE id = ? AND campaign_id = ?`)
    .bind(...binds, now, noteId, campaignId)
    .run()
  return json({ ok: true, updatedAt: now })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const campaignId = String(params.id)
  const noteId = String(params.noteId)

  const note = await loadNote(env, campaignId, noteId)
  if (!note) return notFound('Note not found')
  if (!(await canEdit(env, campaignId, note.author_email, email))) {
    return forbidden('Only the note author or the DM can delete a note')
  }

  await env.DB
    .prepare('UPDATE campaign_notes SET deleted = 1, updated_at = ? WHERE id = ? AND campaign_id = ?')
    .bind(Date.now(), noteId, campaignId)
    .run()
  return json({ ok: true })
}
