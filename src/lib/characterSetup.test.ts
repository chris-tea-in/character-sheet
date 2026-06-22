import { describe, it, expect } from 'vitest'
import { INITIAL_DRAFT, draftToNewCharacter, characterToDraft } from './characterSetup'
import { defaultCharacter } from '../types/character'
import type { SetupData } from './data'
import type { Character } from '../types/character'
import type { ClassData, SpellData } from '../types/data'

// A level-5 prepared caster: 1st/2nd/3rd-level slots, no "Spells Known" key (so
// getSpellcastingInfo classifies it 'prepared'). Only the fields draftToNewCharacter
// touches need to be real; the rest is cast away.
function preparedClass(slug: string, name: string): ClassData {
  const lvl = (cs: Record<string, string>) => ({ proficiency_bonus: 3, features: [], class_specific: cs })
  return {
    slug, name, hit_die: 'd6',
    spellcasting: { ability: 'intelligence', description: '' },
    levels: {
      '1': lvl({}), '2': lvl({}), '3': lvl({}), '4': lvl({}),
      '5': lvl({ '1st': '4', '2nd': '3', '3rd': '2', 'Cantrips Known': '4' }),
    },
  } as unknown as ClassData
}

const dataWith = (slug: string, name: string): SetupData =>
  ({ races: {}, subclasses: {}, backgrounds: {}, classFeatures: {}, classes: { [slug]: preparedClass(slug, name) } }) as unknown as SetupData

// characterToDraft only needs `level` to split cantrips vs leveled.
const SPELLS = {
  'fire-bolt': { level: 0 },
  'magic-missile': { level: 1 },
  'shield': { level: 1 },
  'mage-armor': { level: 1 },
} as unknown as Record<string, SpellData>

describe('prepared-spell model by caster type', () => {
  it('Wizard (spellbook): only preparedSlugs are prepared; selection is the full list', () => {
    const draft = {
      ...INITIAL_DRAFT,
      name: 'Wiz', classSlug: 'wizard', level: 5,
      cantripSlugs: ['fire-bolt'],
      spellSlugs: ['magic-missile', 'shield', 'mage-armor'],
      preparedSlugs: ['magic-missile', 'shield'],
    }
    const nc = draftToNewCharacter(draft, dataWith('wizard', 'Wizard'))
    const prepared = (slug: string) => nc.spells.find(s => s.slug === slug)?.prepared
    expect(prepared('fire-bolt')).toBe(false)         // cantrip
    expect(prepared('magic-missile')).toBe(true)
    expect(prepared('shield')).toBe(true)
    expect(prepared('mage-armor')).toBe(false)        // in spellbook but not prepared
    expect(nc.spells).toHaveLength(4)                 // selection is uncapped
  })

  it('Cleric (single-model): every selected spell is prepared, regardless of preparedSlugs', () => {
    const draft = {
      ...INITIAL_DRAFT,
      name: 'Cleric', classSlug: 'cleric', level: 5,
      cantripSlugs: ['fire-bolt'],
      spellSlugs: ['magic-missile', 'shield', 'mage-armor'],
      preparedSlugs: [],   // single-model casters don't track a subset
    }
    const nc = draftToNewCharacter(draft, dataWith('cleric', 'Cleric'))
    const prepared = (slug: string) => nc.spells.find(s => s.slug === slug)?.prepared
    expect(prepared('fire-bolt')).toBe(false)         // cantrip
    expect(prepared('magic-missile')).toBe(true)
    expect(prepared('shield')).toBe(true)
    expect(prepared('mage-armor')).toBe(true)         // the whole list is prepared
  })

  it('characterToDraft extracts preparedSlugs from prepared leveled spells', () => {
    const character: Character = {
      ...defaultCharacter('Wiz'),
      id: 'x', createdAt: 0, updatedAt: 0,
      spells: [
        { slug: 'fire-bolt', prepared: true },        // cantrip → not a prepared leveled spell
        { slug: 'magic-missile', prepared: true },
        { slug: 'shield', prepared: true },
        { slug: 'mage-armor', prepared: false },
      ],
    }
    const draft = characterToDraft(character, SPELLS)
    expect(draft.cantripSlugs).toEqual(['fire-bolt'])
    expect(draft.spellSlugs).toEqual(['magic-missile', 'shield', 'mage-armor'])
    expect(draft.preparedSlugs).toEqual(['magic-missile', 'shield'])
  })

  it('Wizard survives the full character → draft → character round-trip', () => {
    const character: Character = {
      ...defaultCharacter('Wiz'),
      id: 'x', createdAt: 0, updatedAt: 0,
      class: 'wizard',
      classes: [{ classSlug: 'wizard', subclassSlug: null, level: 5 }],
      level: 5,
      spells: [
        { slug: 'fire-bolt', prepared: false },
        { slug: 'magic-missile', prepared: true },
        { slug: 'mage-armor', prepared: false },
      ],
    }
    const draft = characterToDraft(character, SPELLS)
    const nc = draftToNewCharacter(draft, dataWith('wizard', 'Wizard'))
    const prepared = (slug: string) => nc.spells.find(s => s.slug === slug)?.prepared
    expect(prepared('magic-missile')).toBe(true)
    expect(prepared('mage-armor')).toBe(false)
    expect(prepared('fire-bolt')).toBe(false)
  })
})
