import { describe, it, expect } from 'vitest'
import { INITIAL_DRAFT, draftToNewCharacter, characterToDraft } from './characterSetup'
import { defaultCharacter } from '../types/character'
import type { SetupData } from './data'
import type { Character } from '../types/character'
import type { SpellData } from '../types/data'

// Minimal SetupData — draftToNewCharacter null-guards missing race/class/background,
// so the spell-mapping path runs fine with empty catalogs.
const EMPTY_DATA = { races: {}, classes: {}, subclasses: {}, backgrounds: {}, classFeatures: {} } as unknown as SetupData

// Minimal spell catalog: only `level` is read when splitting cantrips vs leveled.
const SPELLS = {
  'fire-bolt': { level: 0 },
  'magic-missile': { level: 1 },
  'shield': { level: 1 },
  'mage-armor': { level: 1 },
} as unknown as Record<string, SpellData>

describe('prepared-spell selection vs preparation (round-trip)', () => {
  it('draftToNewCharacter marks only preparedSlugs as prepared; cantrips never', () => {
    const draft = {
      ...INITIAL_DRAFT,
      name: 'Wiz',
      cantripSlugs: ['fire-bolt'],
      spellSlugs: ['magic-missile', 'shield', 'mage-armor'],
      preparedSlugs: ['magic-missile', 'shield'],
    }
    const nc = draftToNewCharacter(draft, EMPTY_DATA)
    const prepared = (slug: string) => nc.spells.find(s => s.slug === slug)?.prepared
    expect(prepared('fire-bolt')).toBe(false)
    expect(prepared('magic-missile')).toBe(true)
    expect(prepared('shield')).toBe(true)
    expect(prepared('mage-armor')).toBe(false)
    // Selection is uncapped — all four spells are present regardless of prep count.
    expect(nc.spells).toHaveLength(4)
  })

  it('characterToDraft extracts preparedSlugs from prepared leveled spells', () => {
    const character: Character = {
      ...defaultCharacter('Wiz'),
      id: 'x', createdAt: 0, updatedAt: 0,
      spells: [
        { slug: 'fire-bolt', prepared: true },       // cantrip → never a prepared leveled spell
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

  it('survives the full character → draft → character round-trip', () => {
    const character: Character = {
      ...defaultCharacter('Wiz'),
      id: 'x', createdAt: 0, updatedAt: 0,
      spells: [
        { slug: 'fire-bolt', prepared: false },
        { slug: 'magic-missile', prepared: true },
        { slug: 'mage-armor', prepared: false },
      ],
    }
    const draft = characterToDraft(character, SPELLS)
    const nc = draftToNewCharacter(draft, EMPTY_DATA)
    const prepared = (slug: string) => nc.spells.find(s => s.slug === slug)?.prepared
    expect(prepared('magic-missile')).toBe(true)
    expect(prepared('mage-armor')).toBe(false)
    expect(prepared('fire-bolt')).toBe(false)
  })
})
