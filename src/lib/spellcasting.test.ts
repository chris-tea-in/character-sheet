import { describe, it, expect } from 'vitest'
import { getSpellsKnownIncrease } from './spellcasting'
import type { ClassData } from '../types/data'

// A minimal "known" caster (Bard-shaped). getSpellcastingInfo classifies it 'known'
// because the level entry carries a "Spells Known" key. Counts mirror the real Bard
// table at the levels the BUG-94 repro hinges on: L1 = {4 spells, 2 cantrips},
// L5 = {8 spells, 3 cantrips}. Only the fields the spellcasting helpers read are real.
function knownCaster(slug: string): ClassData {
  const lvl = (cs: Record<string, string>) => ({ proficiency_bonus: 2, features: [], class_specific: cs })
  return {
    slug, name: slug, hit_die: 'd8',
    levels: {
      '1': lvl({ '1st': '2', 'Cantrips Known': '2', 'Spells Known': '4' }),
      '5': lvl({ '1st': '4', '2nd': '3', '3rd': '2', 'Cantrips Known': '3', 'Spells Known': '8' }),
    },
  } as unknown as ClassData
}

// BUG-94: when multiclassing INTO a new caster, the class isn't in character.classes yet,
// so LevelUpDialog must treat its OLD level as 0 — not the character's total level. These
// tests pin the numeric contract that the fix depends on: the old-level argument is what
// decides between "grant the level-1 spells" and "grant nothing".
describe('getSpellsKnownIncrease — multiclass-into-new-caster old level (BUG-94)', () => {
  const bard = knownCaster('bard')

  it('old level 0 (class not yet in classes[]) grants the full level-1 spells + cantrips', () => {
    // Fighter 5 adds Bard: the correct behaviour after the fix.
    expect(getSpellsKnownIncrease(bard, 0, 1)).toEqual({ spells: 4, cantrips: 2 })
  })

  it('old level = character TOTAL (the buggy fallback) zeroes the grant', () => {
    // The pre-fix path passed character.level (5) as the old level → max(0, 4−8)=0 spells,
    // max(0, 2−3)=0 cantrips → the picker never rendered and Bard 1 got nothing.
    expect(getSpellsKnownIncrease(bard, 5, 1)).toEqual({ spells: 0, cantrips: 0 })
  })

  it('an EXISTING class still uses its own current level (leveling Bard 1 → 2 is a normal delta)', () => {
    // Regression guard: the fix must not change single-class level-ups, where the class
    // IS in classes[] and its real current level is the correct old level.
    const knownAt2 = getSpellsKnownIncrease(bard, 1, 5) // 1 → 5: 8−4 spells, 3−2 cantrips
    expect(knownAt2).toEqual({ spells: 4, cantrips: 1 })
  })
})
