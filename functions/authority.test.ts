import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import { Miniflare } from 'miniflare'
import { defaultCharacter } from '../src/types/character'
import type { Env } from './_lib/auth'
import { onRequestPut as putChar, onRequestDelete as delChar } from './api/characters/[id]'
import { onRequestGet as listChars } from './api/characters'
import { onRequestGet as campaignChars } from './api/campaigns/[id]/characters'
import { onRequestPut as putMe } from './api/me'
import { onRequestGet as listNotes, onRequestPost as postNote } from './api/campaigns/[id]/notes'
import { onRequestPut as putNote, onRequestDelete as delNote } from './api/campaigns/[id]/notes/[noteId]'
import { onRequestPost as postLocation } from './api/campaigns/[id]/locations'
import { onRequestPost as postNpc } from './api/campaigns/[id]/npcs'

// Backend authority tests. The handlers run against a REAL local D1 (Miniflare,
// in-process, zero Cloudflare/free-tier usage), so the WHERE-scoping, json_set,
// ON CONFLICT, and tombstone SQL are all genuinely exercised — not mocked.
//
// Identity: in production it comes from the verified Access JWT. Here we drive the
// DEV_EMAIL bypass (env.DEV_EMAIL set + an `x-dev-email` header per request) so we
// can act as different users WITHOUT minting signed tokens — the JWT-crypto path
// is auth.ts's concern; THIS suite is about what each verified identity is allowed
// to do, which is the security-critical part.

let mf: Miniflare
let env: Env

/** Split schema.sql into runnable statements (drop comment lines, split on `;`). */
function statements(sql: string): string[] {
  return sql
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
}

beforeAll(async () => {
  mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response(null) } };',
    d1Databases: { DB: ':memory:' },
    compatibilityDate: '2026-06-16',
  })
  const DB = await mf.getD1Database('DB')
  env = {
    DB,
    DEV_EMAIL: 'seed@example.com',          // enables the x-dev-email override path
    TEAM_DOMAIN: 'https://test.cloudflareaccess.com',
    POLICY_AUD: 'test-aud',
  } as unknown as Env

  const sql = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
  for (const stmt of statements(sql)) {
    // ALTER ADD COLUMN has no IF NOT EXISTS; ignore a duplicate on re-apply.
    try { await DB.prepare(stmt).run() } catch (e) {
      if (!/duplicate column/i.test(String(e))) throw e
    }
  }
})

afterAll(async () => { await mf.dispose() })

beforeEach(async () => {
  // Every table any suite writes to — a missing entry here leaks rows across
  // tests and silently rots count/visibility assertions.
  for (const t of ['characters', 'campaigns', 'campaign_members', 'users',
    'campaign_items', 'campaign_notes', 'campaign_locations', 'campaign_npcs']) {
    await env.DB.prepare(`DELETE FROM ${t}`).run()
  }
})

function request(method: string, opts: { body?: unknown; email?: string; url?: string } = {}): Request {
  const headers: Record<string, string> = {}
  if (opts.email) headers['x-dev-email'] = opts.email
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  // `url` matters for handlers that read query params (notes subject filters).
  return new Request(opts.url ?? 'https://app.example/api', {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ctx(req: Request, params: Record<string, string> = {}): any {
  return { request: req, env, params }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function seedCampaign(id: string, dm: string, players: string[]) {
  await env.DB.prepare(
    'INSERT INTO campaigns (id,name,dm_email,invite_code,created_at,updated_at,deleted) VALUES (?,?,?,?,1,1,0)',
  ).bind(id, 'Camp', dm, 'CODE-' + id).run()
  await env.DB.prepare(
    'INSERT INTO campaign_members (campaign_id,email,role,joined_at) VALUES (?,?,?,1)',
  ).bind(id, dm, 'dm').run()
  for (const p of players) {
    await env.DB.prepare(
      'INSERT INTO campaign_members (campaign_id,email,role,joined_at) VALUES (?,?,?,1)',
    ).bind(id, p, 'player').run()
  }
}

const newBody = (name: string, updatedAt = 1, extra: Record<string, unknown> = {}) =>
  ({ updatedAt, patch: { ...defaultCharacter(name), ...extra } })

describe('PUT /api/characters/:id — ownership & creation', () => {
  it('creates a character and scopes list reads to the owner', async () => {
    const res = await putChar(ctx(request('PUT', { body: newBody('Aragorn'), email: 'owner@a.com' }), { id: 'c1' }))
    expect(res.status).toBe(200)

    const ownerList = await listChars(ctx(request('GET', { email: 'owner@a.com' })))
    expect(((await ownerList.json()) as any).characters.map((c: any) => c.id)).toContain('c1')

    const otherList = await listChars(ctx(request('GET', { email: 'intruder@a.com' })))
    expect(((await otherList.json()) as any).characters).toHaveLength(0)
  })

  it('rejects a PUT from a non-owner who is not the DM, leaving data unchanged', async () => {
    await putChar(ctx(request('PUT', { body: newBody('Mine'), email: 'owner@a.com' }), { id: 'c2' }))
    const res = await putChar(ctx(request('PUT', { body: { updatedAt: 2, patch: { name: 'Hacked' } }, email: 'intruder@a.com' }), { id: 'c2' }))
    expect(res.status).toBe(403)
    const row = await env.DB.prepare('SELECT data FROM characters WHERE id=?').bind('c2').first<any>()
    expect(JSON.parse(row.data).name).toBe('Mine')
  })

  it('rejects a patch that would make the merged character invalid', async () => {
    await putChar(ctx(request('PUT', { body: newBody('Valid'), email: 'owner@a.com' }), { id: 'c4' }))
    const res = await putChar(ctx(request('PUT', { body: { updatedAt: 2, patch: { level: 0 } }, email: 'owner@a.com' }), { id: 'c4' }))
    expect(res.status).toBe(400)
    const row = await env.DB.prepare('SELECT data FROM characters WHERE id=?').bind('c4').first<any>()
    expect(JSON.parse(row.data).level).toBe(1) // original kept
  })

  it('clamps a far-future client updatedAt to server time (anti clock-skew pinning)', async () => {
    const future = Date.now() + 1000 * 60 * 60 * 24 * 365 // +1 year
    const res = await putChar(ctx(request('PUT', { body: { updatedAt: future, patch: defaultCharacter('Timebomb') }, email: 'owner@a.com' }), { id: 'tb' }))
    expect(res.status).toBe(200)
    const echoed = ((await res.json()) as any).updatedAt
    expect(echoed).toBeLessThan(future) // not allowed to pin a far-future version
    const row = await env.DB.prepare('SELECT updated_at FROM characters WHERE id=?').bind('tb').first<any>()
    expect(row.updated_at).toBeLessThan(future)
    expect(row.updated_at).toBe(echoed)
  })

  it('passes a sane client updatedAt through unchanged', async () => {
    const sane = Date.now()
    const res = await putChar(ctx(request('PUT', { body: { updatedAt: sane, patch: defaultCharacter('Normal') }, email: 'owner@a.com' }), { id: 'norm' }))
    expect(((await res.json()) as any).updatedAt).toBe(sane)
  })

  it('field-scoped merge: a patch of one field preserves the others', async () => {
    await putChar(ctx(request('PUT', { body: newBody('Hero', 1, { alignment: 'lawful-good' }), email: 'owner@a.com' }), { id: 'c3' }))
    await putChar(ctx(request('PUT', { body: { updatedAt: 2, patch: { name: 'Renamed' } }, email: 'owner@a.com' }), { id: 'c3' }))
    const row = await env.DB.prepare('SELECT data FROM characters WHERE id=?').bind('c3').first<any>()
    const data = JSON.parse(row.data)
    expect(data.name).toBe('Renamed')          // changed field
    expect(data.alignment).toBe('lawful-good')  // untouched field survives
  })
})

describe('PUT /api/characters/:id — DM authority', () => {
  it('lets the DM edit a member’s stats but strips ownership/campaign changes', async () => {
    await seedCampaign('camp1', 'dm@a.com', ['player@a.com'])
    await putChar(ctx(request('PUT', { body: newBody('PC', 1, { campaignId: 'camp1' }), email: 'player@a.com' }), { id: 'pc1' }))

    const res = await putChar(ctx(request('PUT', { body: { updatedAt: 2, patch: { name: 'DM Renamed', campaignId: null } }, email: 'dm@a.com' }), { id: 'pc1' }))
    expect(res.status).toBe(200)

    const row = await env.DB.prepare('SELECT data, campaign_id FROM characters WHERE id=?').bind('pc1').first<any>()
    expect(JSON.parse(row.data).name).toBe('DM Renamed') // stat edit applied
    expect(row.campaign_id).toBe('camp1')                // campaignId strip → membership untouched
  })

  it('rejects an owner moving a character into a campaign they are not a member of', async () => {
    await seedCampaign('camp9', 'dm@a.com', [])
    const res = await putChar(ctx(request('PUT', { body: newBody('Sneaky', 1, { campaignId: 'camp9' }), email: 'outsider@a.com' }), { id: 'sneak' }))
    expect(res.status).toBe(403)
  })
})

describe('DELETE /api/characters/:id — owner-only tombstone', () => {
  it('tombstones on owner delete and rejects a non-owner delete', async () => {
    await putChar(ctx(request('PUT', { body: newBody('Doomed'), email: 'owner@a.com' }), { id: 'c5' }))

    const bad = await delChar(ctx(request('DELETE', { email: 'intruder@a.com' }), { id: 'c5' }))
    expect(bad.status).toBe(403)

    const ok = await delChar(ctx(request('DELETE', { email: 'owner@a.com' }), { id: 'c5' }))
    expect(ok.status).toBe(200)

    const row = await env.DB.prepare('SELECT deleted FROM characters WHERE id=?').bind('c5').first<any>()
    expect(row.deleted).toBe(1) // soft delete, not a hard removal
  })
})

describe('GET /api/campaigns/:id/characters — visibility', () => {
  it('DM sees all members’ sheets, a player sees only their own, a non-member is forbidden', async () => {
    await seedCampaign('camp2', 'dm@a.com', ['p1@a.com', 'p2@a.com'])
    await putChar(ctx(request('PUT', { body: newBody('P1C', 1, { campaignId: 'camp2' }), email: 'p1@a.com' }), { id: 'p1c' }))
    await putChar(ctx(request('PUT', { body: newBody('P2C', 1, { campaignId: 'camp2' }), email: 'p2@a.com' }), { id: 'p2c' }))

    const dmRes = await campaignChars(ctx(request('GET', { email: 'dm@a.com' }), { id: 'camp2' }))
    expect(((await dmRes.json()) as any).characters).toHaveLength(2)

    const p1Res = await campaignChars(ctx(request('GET', { email: 'p1@a.com' }), { id: 'camp2' }))
    const p1Chars = ((await p1Res.json()) as any).characters
    expect(p1Chars).toHaveLength(1)
    expect(p1Chars[0].id).toBe('p1c')

    const outRes = await campaignChars(ctx(request('GET', { email: 'outsider@a.com' }), { id: 'camp2' }))
    expect(outRes.status).toBe(403)
  })
})

// ── Campaign notes / locations / NPCs (Phase F) ─────────────────────────────────

const notesUrl = (subjectKind = 'campaign', subjectId?: string) => {
  const p = new URLSearchParams({ subjectKind })
  if (subjectId) p.set('subjectId', subjectId)
  return `https://app.example/api/notes?${p}`
}

async function addNote(camp: string, email: string, body: Record<string, unknown>) {
  return postNote(ctx(request('POST', { body, email }), { id: camp }))
}

describe('campaign notes — hidden-note privacy is enforced in SQL', () => {
  it('a player cannot read another player’s hidden note; the DM can, with authorship', async () => {
    await seedCampaign('cn1', 'dm@a.com', ['p1@a.com', 'p2@a.com'])
    await addNote('cn1', 'p1@a.com', { subjectKind: 'campaign', visibility: 'public', body: 'The tavern is safe.' })
    await addNote('cn1', 'p1@a.com', { subjectKind: 'campaign', visibility: 'hidden', body: 'I stole the idol.' })

    const asP2 = await listNotes(ctx(request('GET', { email: 'p2@a.com', url: notesUrl() }), { id: 'cn1' }))
    const p2Notes = ((await asP2.json()) as any).notes
    expect(p2Notes).toHaveLength(1)
    expect(p2Notes[0].body).toBe('The tavern is safe.')

    const asP1 = await listNotes(ctx(request('GET', { email: 'p1@a.com', url: notesUrl() }), { id: 'cn1' }))
    expect(((await asP1.json()) as any).notes).toHaveLength(2)

    const asDm = await listNotes(ctx(request('GET', { email: 'dm@a.com', url: notesUrl() }), { id: 'cn1' }))
    const dmNotes = ((await asDm.json()) as any).notes
    expect(dmNotes).toHaveLength(2)
    const hidden = dmNotes.find((n: any) => n.visibility === 'hidden')
    expect(hidden.authorEmail).toBe('p1@a.com')
  })

  it('non-members are forbidden from reading or writing notes', async () => {
    await seedCampaign('cn2', 'dm@a.com', ['p1@a.com'])
    const read = await listNotes(ctx(request('GET', { email: 'outsider@a.com', url: notesUrl() }), { id: 'cn2' }))
    expect(read.status).toBe(403)
    const write = await addNote('cn2', 'outsider@a.com', { subjectKind: 'campaign', visibility: 'public', body: 'hi' })
    expect(write.status).toBe(403)
  })

  it('hidden notes on location and character subjects stay hidden from other players', async () => {
    await seedCampaign('cn3', 'dm@a.com', ['p1@a.com', 'p2@a.com'])

    // Location subject
    const locRes = await postLocation(ctx(request('POST', { body: { name: 'Waterdeep' }, email: 'p1@a.com' }), { id: 'cn3' }))
    const locId = ((await locRes.json()) as any).id
    await addNote('cn3', 'p1@a.com', { subjectKind: 'location', subjectId: locId, visibility: 'hidden', body: 'Secret door in the sewer.' })
    const locAsP2 = await listNotes(ctx(request('GET', { email: 'p2@a.com', url: notesUrl('location', locId) }), { id: 'cn3' }))
    expect(((await locAsP2.json()) as any).notes).toHaveLength(0)
    const locAsDm = await listNotes(ctx(request('GET', { email: 'dm@a.com', url: notesUrl('location', locId) }), { id: 'cn3' }))
    expect(((await locAsDm.json()) as any).notes).toHaveLength(1)

    // Character subject (character must belong to this campaign)
    await putChar(ctx(request('PUT', { body: newBody('PC', 1, { campaignId: 'cn3' }), email: 'p1@a.com' }), { id: 'cnpc1' }))
    await addNote('cn3', 'p1@a.com', { subjectKind: 'character', subjectId: 'cnpc1', visibility: 'hidden', body: 'He is secretly a lich.' })
    const chAsP2 = await listNotes(ctx(request('GET', { email: 'p2@a.com', url: notesUrl('character', 'cnpc1') }), { id: 'cn3' }))
    expect(((await chAsP2.json()) as any).notes).toHaveLength(0)
    const chAsDm = await listNotes(ctx(request('GET', { email: 'dm@a.com', url: notesUrl('character', 'cnpc1') }), { id: 'cn3' }))
    expect(((await chAsDm.json()) as any).notes).toHaveLength(1)
  })

  it('rejects notes on unknown/foreign subjects', async () => {
    await seedCampaign('cn4', 'dm@a.com', ['p1@a.com'])
    const res = await addNote('cn4', 'p1@a.com', { subjectKind: 'location', subjectId: 'nope', visibility: 'public', body: 'orphan' })
    expect(res.status).toBe(400)
  })
})

describe('campaign notes — author-or-DM edit rights', () => {
  it('author and DM can edit/delete; another player cannot', async () => {
    await seedCampaign('cn5', 'dm@a.com', ['p1@a.com', 'p2@a.com'])
    const created = await addNote('cn5', 'p1@a.com', { subjectKind: 'campaign', visibility: 'public', body: 'v1' })
    const noteId = ((await created.json()) as any).id

    const p2Edit = await putNote(ctx(request('PUT', { body: { body: 'vandalized' }, email: 'p2@a.com' }), { id: 'cn5', noteId }))
    expect(p2Edit.status).toBe(403)

    const p1Edit = await putNote(ctx(request('PUT', { body: { body: 'v2' }, email: 'p1@a.com' }), { id: 'cn5', noteId }))
    expect(p1Edit.status).toBe(200)

    const dmEdit = await putNote(ctx(request('PUT', { body: { visibility: 'hidden' }, email: 'dm@a.com' }), { id: 'cn5', noteId }))
    expect(dmEdit.status).toBe(200)

    const row = await env.DB.prepare('SELECT body, visibility FROM campaign_notes WHERE id=?').bind(noteId).first<any>()
    expect(row.body).toBe('v2')
    expect(row.visibility).toBe('hidden')

    const p2Del = await delNote(ctx(request('DELETE', { email: 'p2@a.com' }), { id: 'cn5', noteId }))
    expect(p2Del.status).toBe(403)
    const dmDel = await delNote(ctx(request('DELETE', { email: 'dm@a.com' }), { id: 'cn5', noteId }))
    expect(dmDel.status).toBe(200)
    const tomb = await env.DB.prepare('SELECT deleted FROM campaign_notes WHERE id=?').bind(noteId).first<any>()
    expect(tomb.deleted).toBe(1)
  })
})

describe('campaign notes — a kicked author loses their edit rights', () => {
  it('author removed from the campaign can no longer edit, delete, or read', async () => {
    await seedCampaign('cn8', 'dm@a.com', ['p1@a.com'])
    const created = await addNote('cn8', 'p1@a.com', { subjectKind: 'campaign', visibility: 'public', body: 'I was here.' })
    const noteId = ((await created.json()) as any).id

    // DM kicks p1 — authorship alone must not survive membership.
    await env.DB.prepare('DELETE FROM campaign_members WHERE campaign_id = ? AND email = ?')
      .bind('cn8', 'p1@a.com').run()

    const edit = await putNote(ctx(request('PUT', { body: { body: 'vandalized after kick' }, email: 'p1@a.com' }), { id: 'cn8', noteId }))
    expect(edit.status).toBe(403)
    const del = await delNote(ctx(request('DELETE', { email: 'p1@a.com' }), { id: 'cn8', noteId }))
    expect(del.status).toBe(403)
    const read = await listNotes(ctx(request('GET', { email: 'p1@a.com', url: notesUrl() }), { id: 'cn8' }))
    expect(read.status).toBe(403)

    const row = await env.DB.prepare('SELECT body, deleted FROM campaign_notes WHERE id=?').bind(noteId).first<any>()
    expect(row.body).toBe('I was here.')  // untouched
    expect(row.deleted).toBe(0)

    // The DM (still a member) retains full authority over the orphaned note.
    const dmDel = await delNote(ctx(request('DELETE', { email: 'dm@a.com' }), { id: 'cn8', noteId }))
    expect(dmDel.status).toBe(200)
  })
})

describe('campaign notes / locations / NPCs — input caps', () => {
  it('rejects an oversized note body and an empty one', async () => {
    await seedCampaign('cn6', 'dm@a.com', ['p1@a.com'])
    const big = await addNote('cn6', 'p1@a.com', { subjectKind: 'campaign', visibility: 'public', body: 'x'.repeat(33_000) })
    expect(big.status).toBe(400)
    const empty = await addNote('cn6', 'p1@a.com', { subjectKind: 'campaign', visibility: 'public', body: '   ' })
    expect(empty.status).toBe(400)
  })

  it('rejects invalid location/NPC names and NPCs pinned to unknown locations', async () => {
    await seedCampaign('cn7', 'dm@a.com', ['p1@a.com'])
    const noName = await postLocation(ctx(request('POST', { body: { name: '  ' }, email: 'p1@a.com' }), { id: 'cn7' }))
    expect(noName.status).toBe(400)
    const longName = await postLocation(ctx(request('POST', { body: { name: 'x'.repeat(200) }, email: 'p1@a.com' }), { id: 'cn7' }))
    expect(longName.status).toBe(400)
    const badPin = await postNpc(ctx(request('POST', { body: { name: 'Bob', locationId: 'nowhere' }, email: 'p1@a.com' }), { id: 'cn7' }))
    expect(badPin.status).toBe(400)
  })
})

describe('PUT /api/me — username uniqueness', () => {
  it('is unique case-insensitively, but a user may re-save their own name', async () => {
    const a = await putMe(ctx(request('PUT', { body: { username: 'Gandalf' }, email: 'a@a.com' })))
    expect(a.status).toBe(200)

    const b = await putMe(ctx(request('PUT', { body: { username: 'gandalf' }, email: 'b@a.com' })))
    expect(b.status).toBe(409)

    const again = await putMe(ctx(request('PUT', { body: { username: 'GANDALF' }, email: 'a@a.com' })))
    expect(again.status).toBe(200)
  })

  it('rejects an invalid username', async () => {
    const res = await putMe(ctx(request('PUT', { body: { username: '   ' }, email: 'a@a.com' })))
    expect(res.status).toBe(400)
  })
})
