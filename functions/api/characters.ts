import { getEmail, json, unauthorized, type Env } from '../_lib/auth'

interface CharacterRow {
  id: string
  data: string
  created_at: number
  updated_at: number
  deleted: number
}

// GET /api/characters → the caller's own rows (including tombstones) so the
// client merge can propagate deletions. Owner-scoped: a player never sees
// another player's rows here.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const { results } = await env.DB
    .prepare('SELECT id, data, created_at, updated_at, deleted FROM characters WHERE owner_email = ?')
    .bind(email)
    .all<CharacterRow>()

  const characters = (results ?? []).map(r => ({
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deleted: Boolean(r.deleted),
    data: JSON.parse(r.data),
  }))

  return json({ characters })
}
