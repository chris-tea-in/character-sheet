import { describe, it, expect } from 'vitest'
import {
  owningClassLevel, knownCount, resourceCount, applicableGroups, levelUpFeatureChoices,
  meetsFeatureOptionPrereqs, allSelectedOptionSlugs, resolveResourceMax, earnedAbilities,
} from './classFeatures'
import { computeFeatureWeaponBonus, type FeatureWeaponEffect } from './characterStats'
import { defaultCharacter } from '../types/character'
import type { Abilities, Character, ClassEntry } from '../types/character'
import type { FeatureChoiceGroup, ClassFeatureData, FeatureOption, WeaponItem, ClassAbility } from '../types/data'

function makeCharacter(classes: ClassEntry[]): Character {
  return { ...defaultCharacter('Test'), id: 'c1', createdAt: 0, updatedAt: 0, classes }
}

const fightingStyle: FeatureChoiceGroup = {
  key: 'fighter:fighting-style',
  label: 'Fighting Style',
  source: { classSlug: 'fighter' },
  known: [{ level: 1, count: 1 }],
  options: [{ slug: 'defense', name: 'Defense', description: 'x' }],
}

const maneuvers: FeatureChoiceGroup = {
  key: 'fighter:battle-master:maneuvers',
  label: 'Maneuvers',
  source: { classSlug: 'fighter', subclassSlug: 'battle-master' },
  known: [
    { level: 3, count: 3 },
    { level: 7, count: 5 },
    { level: 10, count: 7 },
    { level: 15, count: 9 },
  ],
  resource: { name: 'Superiority Dice', die: 'd8', by: [{ level: 3, n: 4 }, { level: 7, n: 5 }, { level: 15, n: 6 }] },
  options: Array.from({ length: 16 }, (_, i) => ({ slug: `m${i}`, name: `M${i}`, description: 'x' })),
}

const catalog: ClassFeatureData = {
  [fightingStyle.key]: fightingStyle,
  [maneuvers.key]: maneuvers,
}

describe('owningClassLevel — counts scale with the owning class level, not total (INV-2)', () => {
  it('reads the fighter level in a multiclass, not the sum', () => {
    const ch = makeCharacter([
      { classSlug: 'fighter', subclassSlug: 'battle-master', level: 7 },
      { classSlug: 'wizard', subclassSlug: null, level: 1 },
    ])
    expect(owningClassLevel(ch, maneuvers)).toBe(7)
  })

  it('is 0 when the character lacks the class', () => {
    const ch = makeCharacter([{ classSlug: 'wizard', subclassSlug: null, level: 8 }])
    expect(owningClassLevel(ch, maneuvers)).toBe(0)
  })

  it('is 0 when the class is present but the required subclass is not', () => {
    const ch = makeCharacter([{ classSlug: 'fighter', subclassSlug: 'champion', level: 10 }])
    expect(owningClassLevel(ch, maneuvers)).toBe(0)
    expect(owningClassLevel(ch, fightingStyle)).toBe(10) // class-level group still applies
  })
})

describe('knownCount', () => {
  it('returns the cumulative count for the reached level', () => {
    expect(knownCount(maneuvers, 3)).toBe(3)
    expect(knownCount(maneuvers, 6)).toBe(3)
    expect(knownCount(maneuvers, 7)).toBe(5)
    expect(knownCount(maneuvers, 20)).toBe(9)
  })
  it('returns 0 below the unlock level', () => {
    expect(knownCount(maneuvers, 2)).toBe(0)
  })
})

describe('resourceCount', () => {
  it('scales superiority dice with level', () => {
    expect(resourceCount(maneuvers, 3)).toBe(4)
    expect(resourceCount(maneuvers, 7)).toBe(5)
    expect(resourceCount(maneuvers, 15)).toBe(6)
  })
  it('is 0 for a group without a resource', () => {
    expect(resourceCount(fightingStyle, 5)).toBe(0)
  })
})

describe('applicableGroups', () => {
  it('a Fighter 7 / Wizard 1 Battle Master gets fighting style (1) and maneuvers (5)', () => {
    const ch = makeCharacter([
      { classSlug: 'fighter', subclassSlug: 'battle-master', level: 7 },
      { classSlug: 'wizard', subclassSlug: null, level: 1 },
    ])
    const groups = applicableGroups(ch, catalog)
    const byKey = Object.fromEntries(groups.map(g => [g.group.key, g.known]))
    expect(byKey['fighter:fighting-style']).toBe(1)
    expect(byKey['fighter:battle-master:maneuvers']).toBe(5)
  })

  it('a level-2 Fighter has fighting style but no maneuvers yet', () => {
    const ch = makeCharacter([{ classSlug: 'fighter', subclassSlug: null, level: 2 }])
    const keys = applicableGroups(ch, catalog).map(g => g.group.key)
    expect(keys).toContain('fighter:fighting-style')
    expect(keys).not.toContain('fighter:battle-master:maneuvers')
  })
})

describe('levelUpFeatureChoices — only new picks gained this level', () => {
  const fullCatalog: ClassFeatureData = catalog

  it('fighter 1→2: nothing new (fighting style was at 1)', () => {
    expect(levelUpFeatureChoices(fullCatalog, 'fighter', null, 1, 2)).toEqual([])
  })

  it('multiclassing into fighter (old 0 → 1): fighting style, delta 1', () => {
    const r = levelUpFeatureChoices(fullCatalog, 'fighter', null, 0, 1)
    expect(r).toHaveLength(1)
    expect(r[0].group.key).toBe('fighter:fighting-style')
    expect(r[0].delta).toBe(1)
  })

  it('battle master 6→7: +2 maneuvers', () => {
    const r = levelUpFeatureChoices(fullCatalog, 'fighter', 'battle-master', 6, 7)
    const man = r.find(x => x.group.key === 'fighter:battle-master:maneuvers')
    expect(man?.delta).toBe(2)
  })

  it('fighter without battle-master subclass gets no maneuver prompt at 7', () => {
    const r = levelUpFeatureChoices(fullCatalog, 'fighter', 'champion', 6, 7)
    expect(r.find(x => x.group.key === 'fighter:battle-master:maneuvers')).toBeUndefined()
  })
})

describe('meetsFeatureOptionPrereqs (soft gate)', () => {
  const ctx = (over: Partial<{ classLevel: number; selectedOptionSlugs: Set<string>; knownSpellSlugs: Set<string> }> = {}) => ({
    classLevel: 5,
    selectedOptionSlugs: new Set<string>(),
    knownSpellSlugs: new Set<string>(),
    ...over,
  })
  const opt = (prerequisites: string[]): FeatureOption => ({ slug: 'x', name: 'X', description: '', prerequisites })

  it('no prerequisites → met', () => {
    expect(meetsFeatureOptionPrereqs(opt([]), ctx())).toBe(true)
  })
  it('level prereq honours owning class level', () => {
    expect(meetsFeatureOptionPrereqs(opt(['9th level']), ctx({ classLevel: 8 }))).toBe(false)
    expect(meetsFeatureOptionPrereqs(opt(['9th level']), ctx({ classLevel: 9 }))).toBe(true)
  })
  it('pact-boon prereq checks chosen option slugs', () => {
    expect(meetsFeatureOptionPrereqs(opt(['Pact of the Tome feature']), ctx())).toBe(false)
    expect(meetsFeatureOptionPrereqs(opt(['Pact of the Tome feature']), ctx({ selectedOptionSlugs: new Set(['pact-of-the-tome']) }))).toBe(true)
  })
  it('cantrip prereq checks known spells', () => {
    expect(meetsFeatureOptionPrereqs(opt(['eldritch blast cantrip']), ctx())).toBe(false)
    expect(meetsFeatureOptionPrereqs(opt(['eldritch blast cantrip']), ctx({ knownSpellSlugs: new Set(['eldritch-blast']) }))).toBe(true)
  })
  it('unrecognised prereq does not block', () => {
    expect(meetsFeatureOptionPrereqs(opt(['some homebrew thing']), ctx())).toBe(true)
  })
  it('all prerequisites must be met (multi)', () => {
    const o = opt(['12th level', 'Pact of the Blade feature'])
    expect(meetsFeatureOptionPrereqs(o, ctx({ classLevel: 12 }))).toBe(false)
    expect(meetsFeatureOptionPrereqs(o, ctx({ classLevel: 12, selectedOptionSlugs: new Set(['pact-of-the-blade']) }))).toBe(true)
  })
})

describe('allSelectedOptionSlugs', () => {
  it('flattens all group selections into one set', () => {
    const set = allSelectedOptionSlugs({ a: ['x', 'y'], b: ['z'] })
    expect(set).toEqual(new Set(['x', 'y', 'z']))
  })
})

// ── Class abilities (resource-backed — Lay on Hands, Rage, Ki …) ───────────────

const flatAbilities = (over: Partial<Abilities> = {}): Abilities =>
  ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...over })

const layOnHands: ClassAbility = {
  key: 'ability:paladin:lay-on-hands', source: { classSlug: 'paladin' },
  level: 1, name: 'Lay on Hands', action: 'action',
  resource: { label: 'Healing Pool', kind: 'pool', perLevel: 5, rest: 'long' },
  effect: { kind: 'heal-pool' },
}
const paladinChannelDivinity: ClassAbility = {
  key: 'ability:paladin:channel-divinity', source: { classSlug: 'paladin' },
  level: 3, name: 'Channel Divinity', action: 'other',
  resource: { label: 'Uses', kind: 'uses', by: [{ level: 3, n: 1 }], rest: 'short' },
}
const actionSurge: ClassAbility = {
  key: 'ability:fighter:action-surge', source: { classSlug: 'fighter' },
  level: 2, name: 'Action Surge', action: 'other',
  resource: { label: 'Uses', kind: 'uses', by: [{ level: 2, n: 1 }, { level: 17, n: 2 }], rest: 'short' },
}
const bardicInspiration: ClassAbility = {
  key: 'ability:bard:bardic-inspiration', source: { classSlug: 'bard' },
  level: 1, name: 'Bardic Inspiration', action: 'bonus_action',
  resource: { label: 'Inspiration Dice', kind: 'uses', abilityMod: 'cha', rest: 'long' },
}
const wildShape: ClassAbility = {
  key: 'ability:druid:wild-shape', source: { classSlug: 'druid' },
  level: 2, name: 'Wild Shape', action: 'action',
  resource: { label: 'Uses', kind: 'uses', by: [{ level: 2, n: 2 }], rest: 'short' },
}
const subclassAbility: ClassAbility = {
  key: 'ability:cleric:war-priest', source: { classSlug: 'cleric', subclassSlug: 'war-domain' },
  level: 1, name: 'War Priest', action: 'bonus_action',
  resource: { label: 'Uses', kind: 'uses', abilityMod: 'wis', rest: 'long' },
}
const abilityCatalog = [layOnHands, paladinChannelDivinity, actionSurge, bardicInspiration, wildShape, subclassAbility]

describe('resolveResourceMax', () => {
  it('perLevel scales with the OWNING class level (Lay on Hands 5 × 3 = 15)', () => {
    expect(resolveResourceMax(layOnHands.resource!, 3, flatAbilities())).toBe(15)
    expect(resolveResourceMax(layOnHands.resource!, 20, flatAbilities())).toBe(100)
  })

  it('by-table takes the highest reached step (Action Surge: 1, then 2 at 17)', () => {
    expect(resolveResourceMax(actionSurge.resource!, 1, flatAbilities())).toBe(0)
    expect(resolveResourceMax(actionSurge.resource!, 2, flatAbilities())).toBe(1)
    expect(resolveResourceMax(actionSurge.resource!, 16, flatAbilities())).toBe(1)
    expect(resolveResourceMax(actionSurge.resource!, 17, flatAbilities())).toBe(2)
  })

  it('abilityMod reads effective abilities and floors at 1 ("minimum of once")', () => {
    expect(resolveResourceMax(bardicInspiration.resource!, 2, flatAbilities({ cha: 16 }))).toBe(3)
    expect(resolveResourceMax(bardicInspiration.resource!, 2, flatAbilities({ cha: 8 }))).toBe(1)
    expect(resolveResourceMax(bardicInspiration.resource!, 2, flatAbilities({ cha: 10 }))).toBe(1)
  })

  it('owning level 0 → 0 even for abilityMod resources', () => {
    expect(resolveResourceMax(bardicInspiration.resource!, 0, flatAbilities({ cha: 20 }))).toBe(0)
  })
})

describe('earnedAbilities — owning-class gating and sizing (INV-2)', () => {
  it('paladin 3 earns Lay on Hands + paladin Channel Divinity, nothing from other classes', () => {
    const ch = makeCharacter([{ classSlug: 'paladin', subclassSlug: null, level: 3 }])
    const keys = earnedAbilities(ch, abilityCatalog).map(a => a.key)
    expect(keys).toEqual(['ability:paladin:lay-on-hands', 'ability:paladin:channel-divinity'])
  })

  it('paladin 2 does not yet earn Channel Divinity (level 3 gate)', () => {
    const ch = makeCharacter([{ classSlug: 'paladin', subclassSlug: null, level: 2 }])
    const keys = earnedAbilities(ch, abilityCatalog).map(a => a.key)
    expect(keys).toContain('ability:paladin:lay-on-hands')
    expect(keys).not.toContain('ability:paladin:channel-divinity')
  })

  it('bard 5 / paladin 3 multiclass: Lay on Hands pool sizes by PALADIN level (15, not 40)', () => {
    const ch = makeCharacter([
      { classSlug: 'bard', subclassSlug: null, level: 5 },
      { classSlug: 'paladin', subclassSlug: null, level: 3 },
    ])
    const earned = earnedAbilities(ch, abilityCatalog)
    const loh = earned.find(a => a.key === layOnHands.key)!
    expect(earned.map(a => a.key)).toContain(bardicInspiration.key)
    expect(resolveResourceMax(loh.resource!, owningClassLevel(ch, loh), flatAbilities())).toBe(15)
  })

  it('subclass-sourced ability requires the matching subclass', () => {
    const wrongSub = makeCharacter([{ classSlug: 'cleric', subclassSlug: 'life-domain', level: 5 }])
    const rightSub = makeCharacter([{ classSlug: 'cleric', subclassSlug: 'war-domain', level: 5 }])
    expect(earnedAbilities(wrongSub, [subclassAbility])).toEqual([])
    expect(earnedAbilities(rightSub, [subclassAbility])).toEqual([subclassAbility])
  })

  it('legacy single-class record (empty classes[]) still gates by class/level', () => {
    const ch: Character = { ...makeCharacter([]), class: 'druid', level: 2 }
    expect(earnedAbilities(ch, abilityCatalog).map(a => a.key)).toEqual([wildShape.key])
  })
})

describe('class-ability key namespace', () => {
  it('every starter key carries the "ability:" prefix (featureResourcesUsed collision guard)', () => {
    for (const a of abilityCatalog) expect(a.key).toMatch(/^ability:/)
    // …and therefore can never equal a feature-choice group key like "fighter:fighting-style".
    expect(abilityCatalog.some(a => a.key === fightingStyle.key)).toBe(false)
  })
})

describe('computeFeatureWeaponBonus (Phase C — Archery / Dueling)', () => {
  const weapon = (weapon_type: string, properties: string[] = []): WeaponItem => ({
    name: 'W', category: 'weapon', weapon_type: weapon_type as WeaponItem['weapon_type'],
    damage_dice: '1d8', damage_type: 'piercing', properties,
  })
  const archery: FeatureWeaponEffect = { type: 'weapon_attack', weaponClass: 'ranged', amount: 2 }
  const dueling: FeatureWeaponEffect = { type: 'weapon_damage', weaponClass: 'melee', handed: 'one-handed', amount: 2 }

  it('Archery adds +2 to-hit on ranged weapons only', () => {
    expect(computeFeatureWeaponBonus(weapon('Martial Ranged'), [archery])).toEqual({ toHit: 2, damage: 0 })
    expect(computeFeatureWeaponBonus(weapon('Martial Melee'), [archery])).toEqual({ toHit: 0, damage: 0 })
  })
  it('Dueling adds +2 damage to one-handed melee, not two-handed or ranged', () => {
    expect(computeFeatureWeaponBonus(weapon('Martial Melee'), [dueling])).toEqual({ toHit: 0, damage: 2 })
    expect(computeFeatureWeaponBonus(weapon('Martial Melee', ['Two-Handed']), [dueling])).toEqual({ toHit: 0, damage: 0 })
    expect(computeFeatureWeaponBonus(weapon('Martial Ranged'), [dueling])).toEqual({ toHit: 0, damage: 0 })
  })
  it('no effects → zero', () => {
    expect(computeFeatureWeaponBonus(weapon('Martial Melee'), [])).toEqual({ toHit: 0, damage: 0 })
  })
})
