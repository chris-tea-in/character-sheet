import { describe, expect, it } from 'vitest'
import { onRequestGet, sanitizeReturnTo } from './reconnect'

const requestUrl = 'https://sheet.example.test/api/reconnect'

describe('sanitizeReturnTo', () => {
  it.each([
    ['/character/abc?tab=spells#slots', '/character/abc?tab=spells#slots'],
    [null, '/'],
    ['', '/'],
    ['https://evil.example/steal', '/'],
    ['//evil.example/steal', '/'],
    ['\\\\evil.example\\steal', '/'],
    ['/api/characters', '/'],
    ['/cdn-cgi/access/authorized?code=example', '/'],
  ])('maps %s to %s', (raw, expected) => {
    expect(sanitizeReturnTo(raw, requestUrl)).toBe(expected)
  })
})

describe('GET /api/reconnect', () => {
  it('returns 401 when identity cannot be verified', async () => {
    const response = await onRequestGet({
      request: new Request(`${requestUrl}?returnTo=%2Fcharacter%2Fabc`),
      env: {},
    } as never)

    expect(response.status).toBe(401)
  })

  it('redirects a verified local identity to the same-origin return route without caching', async () => {
    const response = await onRequestGet({
      request: new Request(`${requestUrl}?returnTo=%2Fcharacter%2Fabc%3Ftab%3Dspells%23slots`),
      env: { DEV_EMAIL: 'friend@example.test' },
    } as never)

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/character/abc?tab=spells#slots')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
