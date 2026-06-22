import {
  getEmail, isCampaignDm, isCampaignMember,
  json, unauthorized, forbidden, badRequest, type Env,
} from '../../../_lib/auth'

// DM-created shared homebrew items for a campaign (#12). Campaign-scoped:
//   GET    — any member: the active item list (merged into their catalog client-side)
//   POST   — DM only: create an item
//   DELETE — DM only: soft-delete an item (?itemId=…)
// Authority is recomputed from the verified Access email on every request; the
// client never asserts its own role. `data` is shape-guarded before storage so a
// malformed blob can't be persisted and later crash a member's deriver.

interface ItemRow {
  id: string
  category: string
  data: string
  created_by: string
  updated_at: number
}

const ALLOWED_CATEGORIES = new Set(['weapon', 'armor', 'shield', 'wondrous_item'])
const MAX_ITEMS_PER_CAMPAIGN = 200
const MAX_DATA_BYTES = 8_000   // one item's JSON; ample for a catalog-shaped def
const MAX_NAME_LEN = 120

// Validate the untrusted POST body into a storable {category, data}. Keeps only a
// well-formed catalog def with a non-empty name; rejects anything else.
function validateItemBody(body: unknown): { category: string; data: Record<string, unknown> } | null {
  if (!body || typeof body !== 'object') return null
  const { category, data } = body as { category?: unknown; data?: unknown }
  if (typeof category !== 'string' || !ALLOWED_CATEGORIES.has(category)) return null
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  if (typeof d.name !== 'string' || d.name.trim() === '' || d.name.length > MAX_NAME_LEN) return null
  if (d.category !== category) return null
  const serialized = JSON.stringify(d)
  if (serialized.length > MAX_DATA_BYTES) return null
  return { category, data: d }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignMember(env, id, email))) return forbidden('Not a member of this campaign')

  const { results } = await env.DB
    .prepare(`SELECT id, category, data, created_by, updated_at
              FROM campaign_items WHERE campaign_id = ? AND deleted = 0 ORDER BY created_at`)
    .bind(id)
    .all<ItemRow>()

  // Parse defensively — one corrupt row must not blank the whole list.
  const items: Array<{ id: string; category: string; data: unknown; createdBy: string; updatedAt: number }> = []
  for (const r of results ?? []) {
    let data: unknown
    try { data = JSON.parse(r.data) } catch { continue }
    items.push({ id: r.id, category: r.category, data, createdBy: r.created_by, updatedAt: r.updated_at })
  }
  return json({ items })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignDm(env, id, email))) return forbidden('Only the DM can add campaign items')

  let body: unknown
  try { body = await request.json() } catch { return badRequest('Invalid JSON') }
  const valid = validateItemBody(body)
  if (!valid) return badRequest('Invalid item')

  // Cap the catalog size so one DM can't bloat every member's payload.
  const countRow = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM campaign_items WHERE campaign_id = ? AND deleted = 0')
    .bind(id)
    .first<{ n: number }>()
  if ((countRow?.n ?? 0) >= MAX_ITEMS_PER_CAMPAIGN) return badRequest('Campaign item limit reached')

  const itemId = crypto.randomUUID()
  const now = Date.now()
  await env.DB
    .prepare(`INSERT INTO campaign_items (id, campaign_id, category, data, created_by, created_at, updated_at, deleted)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0)`)
    .bind(itemId, id, valid.category, JSON.stringify(valid.data), email, now, now)
    .run()

  return json({ id: itemId, category: valid.category, data: valid.data, createdBy: email, updatedAt: now })
}

export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const id = String(params.id)
  if (!(await isCampaignDm(env, id, email))) return forbidden('Only the DM can remove campaign items')

  const itemId = new URL(request.url).searchParams.get('itemId')
  if (!itemId) return badRequest('Missing itemId')

  // Scope the delete to this campaign so an item id alone can't reach another's.
  await env.DB
    .prepare('UPDATE campaign_items SET deleted = 1, updated_at = ? WHERE id = ? AND campaign_id = ?')
    .bind(Date.now(), itemId, id)
    .run()

  return json({ ok: true })
}
