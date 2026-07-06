import { describe, it, expect } from 'vitest'
import { normalizeCastingTime, ACTION_ECONOMY_ORDER } from './actionEconomy'

describe('normalizeCastingTime', () => {
  it('buckets the standard forms case-insensitively', () => {
    expect(normalizeCastingTime('1 Action')).toBe('action')
    expect(normalizeCastingTime('1 action')).toBe('action')
    expect(normalizeCastingTime('1 Bonus Action')).toBe('bonus_action')
    expect(normalizeCastingTime('1 bonus action')).toBe('bonus_action')
  })

  it('matches reactions by prefix — data always carries a trigger clause', () => {
    expect(normalizeCastingTime('1 Reaction, which you take when you see a creature within 60 feet of you casting a spell')).toBe('reaction')
    expect(normalizeCastingTime('1 reaction, which you take when you are hit by an attack')).toBe('reaction')
  })

  it('handles the "1 action or 8 hours" ritual-style variant as an action', () => {
    expect(normalizeCastingTime('1 action or 8 hours')).toBe('action')
  })

  it('long casting times land in other', () => {
    for (const ct of ['1 minute', '10 minutes', '1 hour', '8 hours', '12 hours', '24 hours']) {
      expect(normalizeCastingTime(ct)).toBe('other')
    }
  })

  it('missing/empty input is other, not a crash', () => {
    expect(normalizeCastingTime(undefined)).toBe('other')
    expect(normalizeCastingTime(null)).toBe('other')
    expect(normalizeCastingTime('')).toBe('other')
  })

  it('does not confuse "1 bonus action" with the "1 action" prefix (word boundary)', () => {
    expect(normalizeCastingTime('1 actions worth')).toBe('other')
  })

  it('sort order runs Action → Bonus Action → Reaction → Other', () => {
    expect(ACTION_ECONOMY_ORDER.action).toBeLessThan(ACTION_ECONOMY_ORDER.bonus_action)
    expect(ACTION_ECONOMY_ORDER.bonus_action).toBeLessThan(ACTION_ECONOMY_ORDER.reaction)
    expect(ACTION_ECONOMY_ORDER.reaction).toBeLessThan(ACTION_ECONOMY_ORDER.other)
  })
})
