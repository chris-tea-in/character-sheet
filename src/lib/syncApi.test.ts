import { afterEach, describe, expect, it, vi } from 'vitest'
import { campaignItems, getMe, setAuthExpiredHandler } from './syncApi'

describe('cloud API response classification', () => {
  afterEach(() => {
    setAuthExpiredHandler(null)
    vi.unstubAllGlobals()
  })

  it.each([
    { response: { type: 'opaqueredirect', status: 0, ok: false, headers: new Headers() } as Response, expected: 'auth-expired' },
    { response: new Response(null, { status: 401 }), expected: 'auth-expired' },
    { response: new Response(null, { status: 403 }), expected: 'forbidden' },
    { response: new Response(null, { status: 500 }), expected: 'offline' },
  ] as const)('classifies $expected responses', async ({ response, expected }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(getMe()).resolves.toEqual({ ok: false, reason: expected })
  })

  it('notifies the registered handler only when the Access session expired', async () => {
    const onExpired = vi.fn()
    setAuthExpiredHandler(onExpired)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })))

    await getMe()

    expect(onExpired).toHaveBeenCalledOnce()
  })

  it('does not treat forbidden access or a network failure as session expiry', async () => {
    const onExpired = vi.fn()
    setAuthExpiredHandler(onExpired)
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockRejectedValueOnce(new TypeError('network unavailable'))
    vi.stubGlobal('fetch', fetch)

    await getMe()
    await getMe()

    expect(onExpired).not.toHaveBeenCalled()
  })

  it('marks API calls as XMLHttpRequests so Access returns an auth status', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetch)

    await getMe()

    expect(new Headers(fetch.mock.calls[0][1].headers).get('x-requested-with')).toBe('XMLHttpRequest')
  })

  it('drops malformed shared campaign items returned by the API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 'bad', category: 'wondrous_item', data: { category: 'wondrous_item', name: 'Bad', effects: [null] }, createdBy: 'dm@example.com', updatedAt: 1 }],
    }), { headers: { 'content-type': 'application/json' } })))

    await expect(campaignItems('campaign')).resolves.toEqual({ ok: true, data: [] })
  })
})
