import { getEmail, json, unauthorized, type Env } from '../_lib/auth'

// GET /api/me → { email }. Confirms the signed-in identity; campaign roles are
// computed per-campaign (see /api/campaigns), not a global flag.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()
  return json({ email })
}
