import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, badRequest, type Env,
} from '../../../_lib/auth'

// Campaign notes (Phase F). Campaign-scoped, subject-addressed:
//   GET  ?subjectKind=&subjectId= — any member: the notes THIS viewer may see.
//        Visibility is enforced IN SQL: public, or authored by the viewer, or
//        viewer is the DM — a hidden body never leaves the server otherwise.
//   POST — any member: create a note (public or hidden) on a subject.
// Author attribution rides along via LEFT JOIN users (username display layer).
// Per-note edit/delete (author-or-DM) lives in notes/[noteId].ts.

export const NOTE_SUBJECT_KINDS = new Set(['campaign', 'character', 'location', 'npc'])
export const MAX_NOTE_BYTES = 32_000
const MAX_NOTES_PER_CAMPAIGN = 2000

interface NoteRow {
  id: string
  subject_kind: string
  subject_id: string | null
  author_email: string
  author_username: string | null
  visibility: string
  body: string
  created_at: number
  updated_at: number
}

function toNote(r: NoteRow) {
  return {
    id: r.id,
    subjectKind: r.subject_kind,
    subjectId: r.subject_id,
    authorEmail: r.author_email,
    authorUsername: r.author_username,
    visibility: r.visibility,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Does the subject row actually exist in THIS campaign? Prevents notes pinned to
 * foreign/imaginary subjects (a cross-campaign id must not be addressable). */
async function subjectExists(env: Env, campaignId: string, kind: string, subjectId: string | null): Promise<boolean> {
  if (kind === 'campaign') return subjectId === null
  if (!subjectId) return false
  if (kind === 'character') {
    const row = await env.DB
      .prepare('SELECT 1 AS ok FROM characters WHERE id = ? AND campaign_id = ? AND deleted = 0')
      .bind(subjectId, campaignId).first<{ ok: number }>()
    return !!row
  }
  const table = kind === 'location' ? 'campaign_locations' : 'campaign_npcs'
  const row = await env.DB
    .prepare(`SELECT 1 AS ok FROM ${table} WHERE id = ? AND campaign_id = ? AND deleted = 0`)
    .bind(subjectId, campaignId).first<{ ok: number }>()
  return !!row
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignMember(env, id, email))) return forbidden('Not a member of this campaign')

  const url = new URL(request.url)
  const subjectKind = url.searchParams.get('subjectKind') ?? 'campaign'
  const subjectId = url.searchParams.get('subjectId')
  if (!NOTE_SUBJECT_KINDS.has(subjectKind)) return badRequest('Invalid subjectKind')

  const viewerIsDm = await isCampaignDm(env, id, email)

  // Privacy lives in this WHERE clause — do not move it client-side.
  const { results } = await env.DB
    .prepare(`SELECT n.id, n.subject_kind, n.subject_id, n.author_email, u.username AS author_username,
                     n.visibility, n.body, n.created_at, n.updated_at
              FROM campaign_notes n LEFT JOIN users u ON u.email = n.author_email
              WHERE n.campaign_id = ? AND n.deleted = 0
                AND n.subject_kind = ?
                AND ((? IS NULL AND n.subject_id IS NULL) OR n.subject_id = ?)
                AND (n.visibility = 'public' OR n.author_email = ? OR ? = 1)
              ORDER BY n.created_at`)
    .bind(id, subjectKind, subjectId, subjectId, email, viewerIsDm ? 1 : 0)
    .all<NoteRow>()

  return json({ notes: (results ?? []).map(toNote) })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignMember(env, id, email))) return forbidden('Not a member of this campaign')

  let body: unknown
  try { body = await request.json() } catch { return badRequest('Invalid JSON') }
  const b = body as { subjectKind?: unknown; subjectId?: unknown; visibility?: unknown; body?: unknown }

  const subjectKind = typeof b.subjectKind === 'string' ? b.subjectKind : 'campaign'
  if (!NOTE_SUBJECT_KINDS.has(subjectKind)) return badRequest('Invalid subjectKind')
  const subjectId = subjectKind === 'campaign'
    ? null
    : (typeof b.subjectId === 'string' && b.subjectId ? b.subjectId : null)
  if (subjectKind !== 'campaign' && !subjectId) return badRequest('Missing subjectId')
  const visibility = b.visibility === 'hidden' ? 'hidden' : 'public'
  const text = typeof b.body === 'string' ? b.body.trim() : ''
  if (!text) return badRequest('Empty note')
  if (text.length > MAX_NOTE_BYTES) return badRequest('Note too long')

  if (!(await subjectExists(env, id, subjectKind, subjectId))) return badRequest('Unknown subject')

  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM campaign_notes WHERE campaign_id = ? AND deleted = 0')
    .bind(id).first<{ n: number }>()
  if ((countRow?.n ?? 0) >= MAX_NOTES_PER_CAMPAIGN) return badRequest('Campaign note limit reached')

  const noteId = crypto.randomUUID()
  const now = Date.now()
  await env.DB
    .prepare(`INSERT INTO campaign_notes
                (id, campaign_id, subject_kind, subject_id, author_email, visibility, body, created_at, updated_at, deleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
    .bind(noteId, id, subjectKind, subjectId, email, visibility, text, now, now)
    .run()

  return json({
    id: noteId, subjectKind, subjectId, authorEmail: email, authorUsername: null,
    visibility, body: text, createdAt: now, updatedAt: now,
  })
}
