import {
  getEmail, getUsername, validateUsername,
  json, unauthorized, badRequest, conflict, type Env,
} from '../_lib/auth'

// GET /api/me → { email, username }. Confirms the signed-in identity and the
// display name (null until the user onboards); campaign roles are computed
// per-campaign (see /api/campaigns), not a global flag. A null username is what
// drives the onboarding gate on the client.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  const username = await getUsername(env, email)
  return json({ email, username })
}

// PUT /api/me → set/change the caller's username. Body: { username }.
//   400 invalid name · 409 taken by someone else.
// Email (from the JWT) is the immutable key; username is upserted against it.
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('Invalid request body')
  }

  const validated = validateUsername((body as { username?: unknown })?.username)
  if (!validated.ok) return badRequest(validated.error)
  const username = validated.value

  // Case-insensitive uniqueness, excluding the caller's own row (so re-saving
  // your own name, or changing only its casing, isn't a conflict).
  const clash = await env.DB
    .prepare('SELECT email FROM users WHERE username = ? COLLATE NOCASE AND email <> ?')
    .bind(username, email)
    .first<{ email: string }>()
  if (clash) return conflict('That username is taken')

  const now = Date.now()
  try {
    await env.DB
      .prepare(
        `INSERT INTO users (email, username, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET username = excluded.username, updated_at = excluded.updated_at`,
      )
      .bind(email, username, now, now)
      .run()
  } catch (err) {
    // The unique-name index is the backstop for a race between the check above
    // and this write; surface it as the same "taken" result, not a 500.
    if (err instanceof Error && /UNIQUE/i.test(err.message)) return conflict('That username is taken')
    throw err
  }

  return json({ email, username })
}
