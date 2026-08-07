import { describe, expect, it } from 'vitest'
import { getEmail, type Env } from './auth'

const developmentEnv = {
  DB: {} as D1Database,
  DEV_EMAIL: 'developer@example.com',
  TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
  POLICY_AUD: 'test-audience',
} satisfies Env

describe('getEmail local-development bypass', () => {
  it('rejects DEV_EMAIL on a deployed host', async () => {
    const request = new Request('https://app.example/api/me', {
      headers: { 'x-dev-email': 'attacker@example.com' },
    })

    await expect(getEmail(request, developmentEnv)).resolves.toBeNull()
  })

  it('permits DEV_EMAIL on localhost for Pages local development', async () => {
    const request = new Request('http://localhost:8788/api/me', {
      headers: { 'x-dev-email': 'developer@example.com' },
    })

    await expect(getEmail(request, developmentEnv)).resolves.toBe('developer@example.com')
  })
})
