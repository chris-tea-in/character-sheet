import { getEmail, unauthorized, type Env } from '../_lib/auth'

/**
 * Keep a reconnect return target inside this app. This handler is itself under
 * `/api/`, which the service worker always sends to the network, so it gives
 * Cloudflare Access an un-cached path to renew or request a session.
 */
export function sanitizeReturnTo(raw: string | null, requestUrl: string): string {
  if (!raw || raw.includes('\\')) return '/'

  const origin = new URL(requestUrl).origin
  try {
    const target = new URL(raw, origin)
    if (target.origin !== origin || /^\/(?:api|cdn-cgi)(?:\/|$)/.test(target.pathname)) return '/'
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/'
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const email = await getEmail(request, env)
  if (!email) return unauthorized()

  const requestUrl = new URL(request.url)
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get('returnTo'), request.url)
  return new Response(null, {
    status: 302,
    headers: {
      location: returnTo,
      'cache-control': 'no-store',
    },
  })
}
