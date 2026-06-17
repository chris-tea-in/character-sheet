// Shared helpers for the cloud-storage Pages Functions. This file lives under
// functions/_lib/ and exports no onRequest handler, so it is never routed — it
// is imported by the route modules in functions/api/.
import { jwtVerify, createRemoteJWKSet } from 'jose'

export interface Env {
  DB: D1Database
  TEAM_DOMAIN: string
  POLICY_AUD: string
  // LOCAL-ONLY auth bypass for `wrangler pages dev` (no Access in front of
  // localhost). Never set in committed vars or the dashboard. See CLOUD_SYNC.md.
  DEV_EMAIL?: string
}

// createRemoteJWKSet caches keys internally; keep the set across invocations in
// the same isolate so we don't rebuild it per request. Keyed by team domain so
// a config change can't serve a stale fetcher.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null
let cachedJwksDomain: string | null = null

function jwks(teamDomain: string) {
  if (!cachedJwks || cachedJwksDomain !== teamDomain) {
    cachedJwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`))
    cachedJwksDomain = teamDomain
  }
  return cachedJwks
}

/**
 * Resolve the verified caller email from the Cloudflare Access JWT, or null if
 * absent/invalid. Identity is derived from the signed header Cloudflare injects;
 * the client never sends its own email.
 */
export async function getEmail(request: Request, env: Env): Promise<string | null> {
  const token = request.headers.get('cf-access-jwt-assertion')

  if (!token) {
    // No JWT means the request did not pass through Access. In production behind
    // Access this never happens (Access always injects the header), so this whole
    // branch only ever takes effect under `wrangler pages dev`.
    if (!env.DEV_EMAIL) return null
    // Local multi-identity testing: an explicit `x-dev-email` header overrides the
    // default DEV_EMAIL so a single `wrangler pages dev` can be exercised as
    // several users (the campaign privacy gate). Gated on DEV_EMAIL being set, so
    // it is inert in production — there the JWT is always present and DEV_EMAIL is
    // never configured, so this line is unreachable.
    const override = request.headers.get('x-dev-email')
    return (override || env.DEV_EMAIL).trim().toLowerCase()
  }

  if (!env.TEAM_DOMAIN || !env.POLICY_AUD) return null

  try {
    const { payload } = await jwtVerify(token, jwks(env.TEAM_DOMAIN), {
      issuer: env.TEAM_DOMAIN,
      audience: env.POLICY_AUD,
    })
    return typeof payload.email === 'string' ? payload.email.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Is `email` the DM of campaign `campaignId`? Recomputed from the stored row on
 * every request — campaign authority is never trusted from the client. Returns
 * false for a deleted or non-existent campaign.
 */
export async function isCampaignDm(env: Env, campaignId: string, email: string): Promise<boolean> {
  const row = await env.DB
    .prepare('SELECT dm_email FROM campaigns WHERE id = ? AND deleted = 0')
    .bind(campaignId)
    .first<{ dm_email: string }>()
  return !!row && row.dm_email.toLowerCase() === email.toLowerCase()
}

/** Is `email` a member (DM or player) of campaign `campaignId`? */
export async function isCampaignMember(env: Env, campaignId: string, email: string): Promise<boolean> {
  const row = await env.DB
    .prepare('SELECT 1 AS ok FROM campaign_members WHERE campaign_id = ? AND email = ?')
    .bind(campaignId, email.toLowerCase())
    .first<{ ok: number }>()
  return !!row
}

/** A short, human-shareable invite code (no ambiguous I/L/O/0/1). */
export function randomInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const b of bytes) code += alphabet[b % alphabet.length]
  return code
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export const unauthorized = () => json({ error: 'Unauthorized' }, 403)
export const forbidden = (error = 'Forbidden') => json({ error }, 403)
export const notFound = (error = 'Not found') => json({ error }, 404)
