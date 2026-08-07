import { describe, expect, it } from 'vitest'
import { forbidden, unauthorized } from './auth'

describe('auth HTTP semantics', () => {
  it('uses 401 for a missing or invalid identity', () => {
    expect(unauthorized().status).toBe(401)
  })

  it('keeps 403 for an authenticated caller without permission', () => {
    expect(forbidden().status).toBe(403)
  })
})
