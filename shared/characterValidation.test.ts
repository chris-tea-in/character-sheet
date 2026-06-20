import { describe, it, expect } from 'vitest'
import { validateCharacter } from './characterValidation'

// A minimal blob carrying exactly the REQUIRED fields and nothing else — the
// floor of what the validator must accept.
function validBlob(): Record<string, unknown> {
  return {
    name: 'Aria',
    level: 3,
    maxHp: 24,
    abilities: { str: 10, dex: 14, con: 12, int: 8, wis: 13, cha: 16 },
    classes: [{ classSlug: 'bard', subclassSlug: null, level: 3 }],
    equipment: [],
    spells: [{ slug: 'vicious-mockery', prepared: true }],
  }
}

describe('validateCharacter — accepts', () => {
  it('a full valid blob', () => {
    expect(validateCharacter(validBlob())).toEqual({ ok: true })
  })

  it('a blob missing only optional/additive fields (notes, flaws, campaignId)', () => {
    const c = validBlob()
    // none of these are present — must still pass
    expect(validateCharacter(c)).toEqual({ ok: true })
  })

  it('a legacy record with a `class` string and no classes[] array', () => {
    const c = validBlob()
    delete c.classes
    c.class = 'wizard'
    expect(validateCharacter(c)).toEqual({ ok: true })
  })

  it('an empty classes[] array (structurally valid, e.g. level-1 with no class yet)', () => {
    const c = validBlob()
    c.classes = []
    expect(validateCharacter(c)).toEqual({ ok: true })
  })

  it('an empty spells array', () => {
    const c = validBlob()
    c.spells = []
    expect(validateCharacter(c)).toEqual({ ok: true })
  })

  it('maxHp of 0', () => {
    const c = validBlob()
    c.maxHp = 0
    expect(validateCharacter(c)).toEqual({ ok: true })
  })
})

describe('validateCharacter — rejects', () => {
  it('a non-object', () => {
    expect(validateCharacter(null).ok).toBe(false)
    expect(validateCharacter('a string').ok).toBe(false)
    expect(validateCharacter(42).ok).toBe(false)
    expect(validateCharacter([]).ok).toBe(false)
  })

  it('a missing name', () => {
    const c = validBlob()
    delete c.name
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a missing abilities object', () => {
    const c = validBlob()
    delete c.abilities
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('an abilities object missing one score', () => {
    const c = validBlob()
    c.abilities = { str: 10, dex: 14, con: 12, int: 8, wis: 13 } // no cha
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a non-numeric ability score', () => {
    const c = validBlob()
    c.abilities = { str: 10, dex: 14, con: 12, int: 8, wis: 13, cha: '16' }
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('level < 1', () => {
    const c = validBlob()
    c.level = 0
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a negative maxHp', () => {
    const c = validBlob()
    c.maxHp = -5
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('neither classes[] nor a legacy class string', () => {
    const c = validBlob()
    delete c.classes
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('equipment that is not an array', () => {
    const c = validBlob()
    c.equipment = {}
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('spells that is not an array', () => {
    const c = validBlob()
    delete c.spells
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a spell entry without a string slug', () => {
    const c = validBlob()
    c.spells = [{ slug: 'fireball', prepared: false }, { prepared: true }]
    expect(validateCharacter(c).ok).toBe(false)
  })
})
