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

  it('permits omitted optional structured fields for legacy exports', () => {
    const c = validBlob()
    delete c.conditions
    delete c.ledgerOverrides
    expect(validateCharacter(c)).toEqual({ ok: true })
  })

  it('permits omitted custom-content fields from exports before homebrew support', () => {
    const c = validBlob()
    expect(validateCharacter(c)).toEqual({ ok: true })
  })

  it('accepts complete custom spell, tool, and ledger rows emitted by their dialogs', () => {
    const c = validBlob()
    c.customSpells = [{
      name: 'Custom Bolt', slug: 'custom:bolt', level: 1, school: 'evocation',
      casting_time: '1 action', range: '120 feet',
      components: { verbal: true, somatic: true, material: false, material_text: null },
      duration: 'Instantaneous', concentration: false, ritual: false,
      description: 'A bolt.', at_higher_levels: null, classes: ['wizard'],
    }]
    c.customTools = [{ name: 'Custom Kit', category: 'tool', tool_category: 'Other', cost: null, weight: null }]
    c.ledgerOverrides = {
      disabled: [], overrides: { speed: 5 },
      custom: { speed: [{ id: 'speed:custom', label: 'Blessing', amount: 5 }] },
      customAdvDis: [{ id: 'roll:custom', label: 'Blessing', target: 'save', mode: 'adv', ability: 'wis' }],
      customGrants: [{ id: 'language:custom', label: 'Blessing', target: 'language', value: 'Elvish' }],
    }
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

  it.each([
    [null, 'null class entry'],
    [{ classSlug: 'fighter', subclassSlug: null, level: 0 }, 'zero class level'],
    [{ classSlug: 1, subclassSlug: null, level: 1 }, 'non-string class slug'],
    [{ classSlug: 'fighter', subclassSlug: 1, level: 1 }, 'invalid subclass'],
  ])('rejects a %s', (classes) => {
    const c = validBlob()
    c.classes = [classes]
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('rejects a present non-array classes field even with a legacy class fallback', () => {
    const c = validBlob()
    c.classes = { classSlug: 'fighter', subclassSlug: null, level: 3 }
    c.class = 'fighter'
    expect(validateCharacter(c).ok).toBe(false)
  })

  it.each([
    ['conditions', { active: 'poisoned', exhaustion: 0 }],
    ['ledgerOverrides', { disabled: 'not-an-array', overrides: {}, custom: {} }],
  ])('rejects a malformed present %s structure', (field, value) => {
    const c = validBlob()
    c[field] = value
    expect(validateCharacter(c).ok).toBe(false)
  })

  it.each([
    { disabled: [], overrides: {}, custom: { speed: [null] } },
    { disabled: [], overrides: {}, custom: {}, customAdvDis: [null] },
    { disabled: [], overrides: {}, custom: {}, customGrants: [null] },
    { disabled: [], overrides: { speed: 'five' }, custom: {} },
  ])('rejects malformed ledger rows', ledgerOverrides => {
    const c = validBlob()
    c.ledgerOverrides = ledgerOverrides
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('equipment that is not an array', () => {
    const c = validBlob()
    c.equipment = {}
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('equipment containing null, which would crash active-item derivation', () => {
    const c = validBlob()
    c.equipment = [null]
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a custom item with a null effect before it reaches derivation', () => {
    const c = validBlob()
    c.customItems = [{
      category: 'wondrous_item', name: 'Unsafe charm', rarity: 'Common', attunement: false,
      effects: [null],
    }]
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a custom feat with a null effect before it reaches derivation', () => {
    const c = validBlob()
    c.customFeats = [{ name: 'Unsafe feat', slug: 'custom:unsafe', effects: [null] }]
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a custom feat missing prerequisites before feat-detail rendering reads it', () => {
    const c = validBlob()
    c.customFeats = [{ name: 'Unsafe feat', slug: 'custom:unsafe', description: 'Incomplete.' }]
    c.feats = ['custom:unsafe']
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a custom race missing its base derived-state fields', () => {
    const c = validBlob()
    c.customRaces = [{ slug: 'boom', name: 'Boom', description: '', base: { languages: [], senses: {} }, subraces: [] }]
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a custom spell missing the fields SpellBlock consumes', () => {
    const c = validBlob()
    c.customSpells = [{ slug: 'custom:bad' }]
    expect(validateCharacter(c).ok).toBe(false)
  })

  it('a custom tool missing the catalog fields the picker consumes', () => {
    const c = validBlob()
    c.customTools = [{ category: 'tool' }]
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


describe('language field validation', () => {
  it.each(['Elvish', null, {}, [null], [3]].map(languages => ({ languages })))('rejects malformed learned languages: $languages', ({ languages }) => {
    expect(validateCharacter({ ...validBlob(), languages }).ok).toBe(false)
  })
  it.each([[], ['Elvish']].map(languages => ({ languages })))('accepts learned language lists: $languages', ({ languages }) => {
    expect(validateCharacter({ ...validBlob(), languages }).ok).toBe(true)
  })
})
