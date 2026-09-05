import { describe, expect, it } from 'vitest'
import { buildLevelUpSpells } from './levelUpSpells'
import type { ClassData } from '../types/data'

function caster(slug: string, kind: 'prepared' | 'known' | 'pact'): ClassData {
  return {
    slug, spellcasting: { ability: 'wisdom', description: '' },
    levels: { '2': { features: [], class_specific: kind === 'pact'
      ? { 'Spell Slots': '2', 'Slot Level': '1', 'Spells Known': '3' }
      : { '1st': '3', ...(kind === 'known' ? { 'Spells Known': '5' } : {}) } } },
  } as unknown as ClassData
}

describe('level-up spell preparation (BUG-108)', () => {
  it.each(['cleric', 'druid', 'paladin', 'artificer'])('prepares %s leveled selections', slug => {
    expect(buildLevelUpSpells(caster(slug, 'prepared'), 2, ['guidance'], ['bless']))
      .toEqual([{ slug: 'guidance', prepared: false }, { slug: 'bless', prepared: true }])
  })
  it('adds Wizard spellbook entries unprepared', () => {
    expect(buildLevelUpSpells(caster('wizard', 'prepared'), 2, [], ['shield']))
      .toEqual([{ slug: 'shield', prepared: false }])
  })
  it.each([['bard', 'known'], ['warlock', 'pact']] as const)('does not prepare %s spells', (slug, kind) => {
    expect(buildLevelUpSpells(caster(slug, kind), 2, [], ['spell']))
      .toEqual([{ slug: 'spell', prepared: false }])
  })
})
