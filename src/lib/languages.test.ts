import { describe, expect, it } from 'vitest'
import { INITIAL_DRAFT, draftToNewCharacter, characterToDraft } from './characterSetup'
import { defaultCharacter, normalizeNewCharacter } from '../types/character'
import { deriveCharacterStats } from './characterStats'
import type { SetupData } from './data'
import type { Race } from '../types/data'

const dwarf = {
  slug: 'dwarf', name: 'Dwarf', base: { languages: ['Common', 'Dwarvish'],
    speed: 25, ability_score_increases: {}, asi_choices: [], senses: {}, traits: [] }, subraces: [],
} as unknown as Race
const elf = { ...dwarf, slug: 'elf', name: 'Elf', base: { ...dwarf.base, languages: ['Common'] } }
const setup = { races: { dwarf, elf }, classes: {}, backgrounds: {}, subclasses: {} } as unknown as SetupData
const full = (data = defaultCharacter('Test')) => ({ ...data, id: 'test', createdAt: 1, updatedAt: 1 })

describe('language choices and racial grants (BUG-109)', () => {
  it('stores only explicit choices at creation', () => {
    const character = draftToNewCharacter({ ...INITIAL_DRAFT, raceSlug: 'dwarf', languageProficiencies: ['Draconic'] }, setup)
    expect(character.languages).toEqual(['Draconic'])
    expect(character.legacyLanguages).toEqual([])
    expect(deriveCharacterStats(full(character), { race: dwarf }).raceGrantedLanguages).toContain('Dwarvish')
  })
  it('race-edit round trips do not keep former racial grants', () => {
    const created = draftToNewCharacter({ ...INITIAL_DRAFT, raceSlug: 'dwarf' }, setup)
    const draft = characterToDraft(full(created), {})
    const edited = draftToNewCharacter({ ...draft, raceSlug: 'elf' }, setup)
    expect(edited.languages).not.toContain('Dwarvish')
    expect(deriveCharacterStats(full(edited), { race: elf }).raceGrantedLanguages).not.toContain('Dwarvish')
  })
  it('keeps a separately learned overlapping language after source disable', () => {
    const character = full({ ...defaultCharacter('Test'), languages: ['Dwarvish'] })
    character.ledgerOverrides.disabled = ['lang:race:Dwarvish']
    const derived = deriveCharacterStats(character, { race: dwarf })
    expect(derived.raceGrantedLanguages).not.toContain('Dwarvish')
    expect(character.languages).toContain('Dwarvish')
  })
  it('preserves old unclassified languages for explicit source review', () => {
    const legacy = { ...defaultCharacter('Legacy'), languages: ['Common', 'Dwarvish', 'Draconic'] }
    delete (legacy as Partial<typeof legacy>).legacyLanguages
    const normalized = normalizeNewCharacter(legacy)
    expect(normalized.languages).toEqual([])
    expect(normalized.legacyLanguages).toEqual(['Common', 'Dwarvish', 'Draconic'])
    expect(normalizeNewCharacter(normalized)).toEqual(normalized)
  })
  it('round trips unresolved legacy choices through edit without treating them as learned', () => {
    const character = full({ ...defaultCharacter('Old'), languages: ['Orc'], legacyLanguages: ['Dwarvish'] })
    const draft = characterToDraft(character, {})
    const edited = draftToNewCharacter({ ...draft, raceSlug: 'elf' }, setup)
    expect(edited.languages).toEqual(['Orc'])
    expect(edited.legacyLanguages).toEqual(['Dwarvish'])
  })
})
