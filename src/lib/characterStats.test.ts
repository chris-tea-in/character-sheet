import { describe, it, expect } from 'vitest'
import { computeWeaponBonus, deriveCharacterStats } from './characterStats'
import { defaultCharacter } from '../types/character'
import type { Character } from '../types/character'
import type { WeaponItem, ArmorItem, WondrousItem, FeatData, ClassData } from '../types/data'

// A martial weapon, used to test the proficiency-bonus gate. computeWeaponBonus
// only reads name / weapon_type / properties / damage_dice / damage_type / bonus.
const greatsword = {
  name: 'Greatsword',
  weapon_type: 'Martial Melee',
  properties: ['Two-Handed', 'Heavy'],
  damage_dice: '2d6',
  damage_type: 'slashing',
} as unknown as WeaponItem

// Level 5 → proficiency bonus +3; STR 16 → +3 modifier.
function lvl5Str16(overrides: Partial<Character> = {}): Character {
  return {
    ...defaultCharacter('Tester'),
    id: 't', createdAt: 0, updatedAt: 0,
    level: 5,
    abilities: { str: 16, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ...overrides,
  }
}

describe('computeWeaponBonus — homebrew all-weapons-proficient', () => {
  it('omits the proficiency bonus for a non-proficient weapon by default', () => {
    const char = lvl5Str16()
    // no martial proficiency passed
    const calc = computeWeaponBonus(greatsword, char, [], char.abilities)
    expect(calc.toHitModifier).toBe(3) // STR +3 only
  })

  it('adds the proficiency bonus to a non-proficient weapon when the homebrew flag is on', () => {
    const char = lvl5Str16({ homebrewAllWeaponsProficient: true })
    const calc = computeWeaponBonus(greatsword, char, [], char.abilities)
    expect(calc.toHitModifier).toBe(6) // STR +3 + PB +3
  })

  it('still grants the proficiency bonus normally when actually proficient (flag off)', () => {
    const char = lvl5Str16()
    const calc = computeWeaponBonus(greatsword, char, ['martial weapons'], char.abilities)
    expect(calc.toHitModifier).toBe(6) // STR +3 + PB +3
  })
})

// ── AC ledger (Modifier Ledger P1.5) ─────────────────────────────────────────
function charWith(overrides: Partial<Character> = {}): Character {
  return { ...defaultCharacter('Tester'), id: 't', createdAt: 0, updatedAt: 0, ...overrides }
}
const plate: ArmorItem = { name: 'Plate', category: 'armor', armor_type: 'Heavy', ac_formula: '18', stealth_disadvantage: true, strength_requirement: 15 }
const shield: ArmorItem = { name: 'Shield', category: 'shield', armor_type: 'Shield', ac_formula: '+2', stealth_disadvantage: false, strength_requirement: null }
const sumAc = (d: ReturnType<typeof deriveCharacterStats>) => d.breakdowns.ac.reduce((t, s) => t + s.amount, 0)

describe('deriveCharacterStats — AC breakdown + Unarmored Defense', () => {
  it('Barbarian Unarmored Defense = 10 + DEX + CON, and the breakdown reconstructs it', () => {
    const d = deriveCharacterStats(charWith({
      classes: [{ classSlug: 'barbarian', subclassSlug: null, level: 5 }],
      abilities: { str: 14, dex: 14, con: 16, int: 10, wis: 10, cha: 8 },
      equipment: [],
    }), {})
    expect(d.effectiveAC).toBe(15) // 10 + 2 (DEX) + 3 (CON)
    expect(sumAc(d)).toBe(15)
    expect(d.breakdowns.ac.some(s => s.id.includes('barbarian-unarmored-defense'))).toBe(true)
  })

  it('Monk Unarmored Defense = 10 + DEX + WIS; lost when a shield is worn', () => {
    const base = {
      classes: [{ classSlug: 'monk', subclassSlug: null, level: 5 }],
      abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 10 },
    }
    const noShield = deriveCharacterStats(charWith({ ...base, equipment: [] }), {})
    expect(noShield.effectiveAC).toBe(15) // 10 + 3 + 2 (WIS)
    const withShield = deriveCharacterStats(
      charWith({ ...base, equipment: [{ id: 's', name: 'Shield', quantity: 1, equipped: true }] }),
      { catalog: { armor: [shield] } },
    )
    expect(withShield.effectiveAC).toBe(15) // 10 + 3 (DEX) + 2 (shield) — WIS dropped, RAW
  })

  it('worn armor is unchanged: Plate = 18, Plate + Shield = 20', () => {
    const plateOnly = deriveCharacterStats(
      charWith({ equipment: [{ id: 'p', name: 'Plate', quantity: 1, equipped: true }] }),
      { catalog: { armor: [plate] } },
    )
    expect(plateOnly.effectiveAC).toBe(18)
    expect(sumAc(plateOnly)).toBe(18)
    const plateShield = deriveCharacterStats(
      charWith({ equipment: [
        { id: 'p', name: 'Plate', quantity: 1, equipped: true },
        { id: 's', name: 'Shield', quantity: 1, equipped: true },
      ] }),
      { catalog: { armor: [plate, shield] } },
    )
    expect(plateShield.effectiveAC).toBe(20)
  })

  it('plain unarmored non-barb/monk still falls back to manual AC (null)', () => {
    const d = deriveCharacterStats(charWith({
      classes: [{ classSlug: 'wizard', subclassSlug: null, level: 5 }],
      abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
      equipment: [],
    }), {})
    expect(d.effectiveAC).toBeNull()
  })
})

// ── Modifier Ledger — breakdown rollout (Step 1) ─────────────────────────────
// Every breakdown list must reconstruct its effective value exactly (the same
// invariant the in-derive console.asserts guard). These cover the non-trivial
// non-additive cases (feat-ASI cap, item set-to-N) and the cross-channel sums.
const sumOf = (rows: { amount: number }[]) => rows.reduce((t, s) => t + s.amount, 0)

describe('deriveCharacterStats — ability breakdowns (cap + set)', () => {
  it('feat ASI clamped at 20 records the realized delta and flags "capped"', () => {
    const feats: Record<string, FeatData> = {
      mighty: { name: 'Mighty', slug: 'mighty', prerequisites: [], description: '',
        effects: [{ type: 'asi', subtype: 'fixed', ability: 'Strength', amount: 2 }] },
    }
    const d = deriveCharacterStats(charWith({
      level: 5,
      abilities: { str: 19, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      feats: ['mighty'],
    }), { featData: feats })
    expect(d.effectiveAbilities.str).toBe(20)          // min(20, 19 + 2)
    expect(sumOf(d.breakdowns.abilities.str)).toBe(20) // base 19 + realized +1
    expect(d.breakdowns.abilities.str.some(s => /capped at 20/.test(s.label))).toBe(true)
  })

  it('item ability_set (Amulet of Health) reconstructs as a realized delta', () => {
    const amulet: WondrousItem = {
      name: 'Amulet of Health', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'ability_set', ability: 'con', value: 19 }],
    }
    const d = deriveCharacterStats(charWith({
      level: 5,
      abilities: { str: 10, dex: 10, con: 12, int: 10, wis: 10, cha: 10 },
      equipment: [{ id: 'a', name: 'Amulet of Health', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [amulet] } })
    expect(d.effectiveAbilities.con).toBe(19)          // max(12, 19)
    expect(sumOf(d.breakdowns.abilities.con)).toBe(19) // base 12 + set +7
    expect(d.breakdowns.abilities.con.some(s => /sets to 19/.test(s.label))).toBe(true)
  })

  // 5c — optional per-source cap on item ability effects
  it('item ability_bonus with cap clamps the realized delta (Belt of Dwarvenkind)', () => {
    const belt: WondrousItem = {
      name: 'Belt of Dwarvenkind', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'ability_bonus', ability: 'con', amount: 2, cap: 20 }],
    }
    const d = deriveCharacterStats(charWith({
      abilities: { str: 10, dex: 10, con: 19, int: 10, wis: 10, cha: 10 },
      equipment: [{ id: 'b', name: 'Belt of Dwarvenkind', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [belt] } })
    expect(d.effectiveAbilities.con).toBe(20)          // 19 + 2 clamped to 20 → realized +1
    expect(sumOf(d.breakdowns.abilities.con)).toBe(20)
    expect(d.breakdowns.abilities.con.some(s => /max 20/.test(s.label))).toBe(true)
  })

  it('capped ability_bonus is a no-op when already at the cap; never lowers a higher score', () => {
    const belt: WondrousItem = {
      name: 'Belt of Dwarvenkind', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'ability_bonus', ability: 'con', amount: 2, cap: 20 }],
    }
    const atCap = deriveCharacterStats(charWith({
      abilities: { str: 10, dex: 10, con: 20, int: 10, wis: 10, cha: 10 },
      equipment: [{ id: 'b', name: 'Belt of Dwarvenkind', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [belt] } })
    expect(atCap.effectiveAbilities.con).toBe(20)      // +0
    expect(atCap.breakdowns.abilities.con.some(s => /Belt of Dwarvenkind/.test(s.label))).toBe(false)
    const overCap = deriveCharacterStats(charWith({
      abilities: { str: 10, dex: 10, con: 22, int: 10, wis: 10, cha: 10 }, // already above cap
      equipment: [{ id: 'b', name: 'Belt of Dwarvenkind', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [belt] } })
    expect(overCap.effectiveAbilities.con).toBe(22)    // not lowered to 20
  })

  it('uncapped item ability_set still exceeds 20 (RAW: items can)', () => {
    const beltGiant: WondrousItem = {
      name: 'Belt of Hill Giant Strength', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'ability_set', ability: 'str', value: 21 }], // no cap
    }
    const d = deriveCharacterStats(charWith({
      abilities: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      equipment: [{ id: 'g', name: 'Belt of Hill Giant Strength', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [beltGiant] } })
    expect(d.effectiveAbilities.str).toBe(21)
  })
})

describe('deriveCharacterStats — save / skill / maxHp / spell breakdowns', () => {
  it('save breakdown = ability mod + proficiency + all-saves item bonus', () => {
    const cloak: WondrousItem = {
      name: 'Cloak of Protection', category: 'wondrous_item', rarity: 'Uncommon', attunement: true,
      effects: [{ type: 'save', ability: 'all', amount: 1 }],
    }
    const d = deriveCharacterStats(charWith({
      level: 5, // PB +3
      abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
      savingThrowProficiencies: ['con'],
      equipment: [{ id: 'c', name: 'Cloak of Protection', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [cloak] } })
    expect(d.saveModifiers.con).toBe(6)             // +2 CON, +3 PB, +1 item
    expect(sumOf(d.breakdowns.saves.con)).toBe(6)
  })

  it('skill breakdown = ability mod + expertise + flat item bonus', () => {
    const gloves: WondrousItem = {
      name: 'Gloves of Sneaking', category: 'wondrous_item', rarity: 'Uncommon', attunement: false,
      effects: [{ type: 'skill', skill: 'stealth', amount: 2 }],
    }
    const d = deriveCharacterStats(charWith({
      level: 5, // PB +3 → expertise +6
      abilities: { str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10 },
      skillProficiencies: { stealth: 'expertise' },
      equipment: [{ id: 'g', name: 'Gloves of Sneaking', quantity: 1, equipped: true }],
    }), { catalog: { wondrous_items: [gloves] } })
    expect(d.skillModifiers.stealth).toBe(10)       // +2 DEX, +6 expertise, +2 item
    expect(sumOf(d.breakdowns.skills.stealth)).toBe(10)
  })

  it('maxHp breakdown = base + Tough feat + Dwarven Toughness subrace (data-driven)', () => {
    const dwarf = {
      name: 'Dwarf', slug: 'dwarf', description: '',
      base: { ability_score_increases: {}, asi_choices: [], speed: 25, size: 'Medium', languages: [], senses: {}, proficiencies: [], traits: {} },
      subraces: [{ name: 'Hill Dwarf', ability_score_increases: {}, asi_choices: [], speed: null, size: null, languages: [], senses: {}, proficiencies: [], traits: {}, hp_bonus_per_level: 1 }],
    } as unknown as import('../types/data').Race
    const d = deriveCharacterStats(charWith({
      level: 5, maxHp: 40, feats: ['tough'], race: 'dwarf', subrace: 'hill-dwarf',
    }), { race: dwarf })
    expect(d.adjustedMaxHp).toBe(55)                // 40 + (5×2 Tough) + 5 (hill dwarf)
    expect(sumOf(d.breakdowns.maxHp)).toBe(55)
  })

  it('spell attack + save DC breakdowns reconstruct for an INT caster', () => {
    const wizard = {
      spellcasting: { ability: 'Intelligence' }, weapon_proficiencies: [], armor_proficiencies: [], hit_die: 'd6',
    } as unknown as ClassData
    const d = deriveCharacterStats(charWith({
      level: 5, // PB +3
      classes: [{ classSlug: 'wizard', subclassSlug: null, level: 5 }],
      abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
    }), { classes: [wizard] })
    expect(d.spellAttackBonus).toBe(6)              // +3 INT, +3 PB
    expect(d.spellSaveDC).toBe(14)                  // 8 + 3 + 3
    expect(sumOf(d.breakdowns.spellAttack)).toBe(6)
    expect(sumOf(d.breakdowns.spellSaveDC)).toBe(14)
  })
})

// ── Step 2: structured race-effect system ────────────────────────────────────
type RaceEffect = import('../types/data').RaceEffect
function raceWith(effects: RaceEffect[]): import('../types/data').Race {
  return {
    name: 'Test Race', slug: 'test-race', description: '',
    base: { ability_score_increases: {}, asi_choices: [], speed: 30, size: 'Medium', languages: ['Common'], senses: { darkvision: 60 }, proficiencies: [], traits: {}, effects },
    subraces: [],
  } as unknown as import('../types/data').Race
}

// ── Step 4d: conditions ──────────────────────────────────────────────────────
describe('deriveCharacterStats — conditions', () => {
  it('Poisoned → disadvantage on all ability checks and attacks', () => {
    const d = deriveCharacterStats(charWith({ conditions: { active: ['poisoned'], exhaustion: 0 } }), {})
    expect(d.rollStates.skills.stealth).toBe('dis')
    expect(d.rollStates.skills.arcana).toBe('dis')
    expect(d.attackRollState).toBe('dis')
    expect(d.rollStates.saves.str).toBeUndefined() // poisoned doesn't touch saves
  })

  it('Restrained → speed 0 + DEX-save disadvantage only', () => {
    const d = deriveCharacterStats(charWith({ speed: 30, conditions: { active: ['restrained'], exhaustion: 0 } }), {})
    expect(d.effectiveSpeed).toBe(0)
    expect(d.breakdowns.speed.reduce((t, s) => t + s.amount, 0)).toBe(0)
    expect(d.rollStates.saves.dex).toBe('dis')
    expect(d.rollStates.saves.con).toBeUndefined()
  })

  it('Exhaustion 2 halves speed; level 4 halves max HP', () => {
    const d2 = deriveCharacterStats(charWith({ speed: 30, conditions: { active: [], exhaustion: 2 } }), {})
    expect(d2.effectiveSpeed).toBe(15)
    const d4 = deriveCharacterStats(charWith({ maxHp: 41, conditions: { active: [], exhaustion: 4 } }), {})
    expect(d4.adjustedMaxHp).toBe(20) // floor(41/2)
    expect(d4.breakdowns.maxHp.reduce((t, s) => t + s.amount, 0)).toBe(20)
  })

  it('Invisible (adv) + Poisoned (dis) net attacks to normal', () => {
    const d = deriveCharacterStats(charWith({ conditions: { active: ['invisible', 'poisoned'], exhaustion: 0 } }), {})
    expect(d.attackRollState).toBeUndefined() // netted
  })
})

// ── Step 5b: AC floor (Barkskin-style) ───────────────────────────────────────
describe('deriveCharacterStats — AC floor (5b)', () => {
  const barkBracers: WondrousItem = {
    name: 'Bracers of Barkskin', category: 'wondrous_item', rarity: 'Rare', attunement: true,
    effects: [{ type: 'ac_floor', value: 16 }],
  }

  it('floors a lower computed AC up to the value, as a realized delta', () => {
    const d = deriveCharacterStats(charWith({
      classes: [{ classSlug: 'barbarian', subclassSlug: null, level: 5 }],
      abilities: { str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 8 }, // UD = 10+1+1 = 12
      equipment: [{ id: 'b', name: 'Bracers of Barkskin', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [barkBracers] } })
    expect(d.effectiveAC).toBe(16)
    expect(sumAc(d)).toBe(16)
    expect(d.breakdowns.ac.some(s => /AC ≥ 16/.test(s.label))).toBe(true)
  })

  it('is a no-op when the computed AC already meets the floor', () => {
    const d = deriveCharacterStats(charWith({
      equipment: [
        { id: 'p', name: 'Plate', quantity: 1, equipped: true },        // AC 18
        { id: 'b', name: 'Bracers of Barkskin', quantity: 1, attuned: true },
      ],
    }), { catalog: { armor: [plate], wondrous_items: [barkBracers] } })
    expect(d.effectiveAC).toBe(18)
    expect(d.breakdowns.ac.some(s => /AC ≥/.test(s.label))).toBe(false)
  })
})

// ── Step 5a: non-additive speed semantics (floor / multiplier) ───────────────
describe('deriveCharacterStats — speed floor & multiplier (5a)', () => {
  const sumSpeed = (d: ReturnType<typeof deriveCharacterStats>) => d.breakdowns.speed.reduce((t, s) => t + s.amount, 0)
  const stridingBoots: WondrousItem = {
    name: 'Boots of Striding and Springing', category: 'wondrous_item', rarity: 'Uncommon', attunement: true,
    effects: [{ type: 'speed_set', value: 30 }],
  }
  const speedBoots: WondrousItem = {
    name: 'Boots of Speed', category: 'wondrous_item', rarity: 'Rare', attunement: true,
    effects: [{ type: 'speed_multiplier', factor: 2 }],
  }

  it('speed_set floors a slower speed up to its value; breakdown sums', () => {
    const d = deriveCharacterStats(charWith({
      speed: 25,
      equipment: [{ id: 'b', name: 'Boots of Striding and Springing', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [stridingBoots] } })
    expect(d.effectiveSpeed).toBe(30)
    expect(sumSpeed(d)).toBe(30)
    expect(d.breakdowns.speed.some(s => /speed ≥ 30/.test(s.label))).toBe(true)
  })

  it('speed_set is a no-op when base speed already exceeds it', () => {
    const d = deriveCharacterStats(charWith({
      speed: 35,
      equipment: [{ id: 'b', name: 'Boots of Striding and Springing', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [stridingBoots] } })
    expect(d.effectiveSpeed).toBe(35)
    expect(d.breakdowns.speed.some(s => /speed ≥/.test(s.label))).toBe(false)
  })

  it('speed_multiplier doubles the post-floor speed; breakdown still sums', () => {
    const d = deriveCharacterStats(charWith({
      speed: 30,
      equipment: [{ id: 's', name: 'Boots of Speed', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [speedBoots] } })
    expect(d.effectiveSpeed).toBe(60)
    expect(sumSpeed(d)).toBe(60)
  })

  it('RAW order floor → multiplier → condition: 25 →30 →60 →halved =30', () => {
    const d = deriveCharacterStats(charWith({
      speed: 25,
      conditions: { active: [], exhaustion: 2 },
      equipment: [
        { id: 'b', name: 'Boots of Striding and Springing', quantity: 1, attuned: true },
        { id: 's', name: 'Boots of Speed', quantity: 1, attuned: true },
      ],
    }), { catalog: { wondrous_items: [stridingBoots, speedBoots] } })
    expect(d.effectiveSpeed).toBe(30)
    expect(sumSpeed(d)).toBe(30)
  })
})

// ── Step 4a: advantage / disadvantage netting ────────────────────────────────
describe('deriveCharacterStats — roll states (adv/dis netting)', () => {
  it('stealth-disadvantage armor sets Stealth to disadvantage', () => {
    const d = deriveCharacterStats(charWith({
      equipment: [{ id: 'p', name: 'Plate', quantity: 1, equipped: true }],
    }), { catalog: { armor: [plate] } })
    expect(d.hasStealthDisadvantage).toBe(true)
    expect(d.rollStates.skills.stealth).toBe('dis')
  })

  it('a racial save advantage (Dwarf vs poison → CON) shows as advantage', () => {
    const d = deriveCharacterStats(charWith({ race: 'dwarf' }), {})
    expect(d.rollStates.saves.con).toBe('adv')
  })

  it('advantage + disadvantage on the same skill net to normal (RAW)', () => {
    // Boots of Elvenkind → Stealth advantage; Plate → Stealth disadvantage ⇒ normal.
    const d = deriveCharacterStats(charWith({
      equipment: [
        { id: 'b', name: 'Boots of Elvenkind', quantity: 1, equipped: true },
        { id: 'p', name: 'Plate', quantity: 1, equipped: true },
      ],
    }), { catalog: { armor: [plate] } })
    expect(d.hasStealthDisadvantage).toBe(true)
    expect(d.rollStates.skills.stealth).toBeUndefined() // netted to normal
  })

  it('adv/dis sources are labeled for the ledger breakdown', () => {
    const d = deriveCharacterStats(charWith({ race: 'dwarf' }), {})
    expect(d.rollStateSources.saves.con?.some(s => s.label === 'Dwarven Resilience' && s.mode === 'adv')).toBe(true)
  })

  it('data-driven feature advantage (Danger Sense → DEX save) applies + is labeled', () => {
    const barb = classWith('barbarian', { '2': ['Danger Sense'] })
    const cfe = { barbarian: { 'Danger Sense': [{ type: 'advantage', target: 'save', ability: 'dex' }] } }
    const d = deriveCharacterStats(charWith({
      level: 3, classes: [{ classSlug: 'barbarian', subclassSlug: null, level: 3 }],
    }), { classes: [barb], classFeatureEffects: cfe as never })
    expect(d.rollStates.saves.dex).toBe('adv')
    expect(d.rollStateSources.saves.dex?.some(s => s.label === 'Danger Sense')).toBe(true)
  })
})

// ── Step 3: always-on class-feature effects ──────────────────────────────────
function classWith(slug: string, levels: Record<string, string[]>): ClassData {
  const lv: Record<string, { features: string[] }> = {}
  for (const [k, features] of Object.entries(levels)) lv[k] = { features }
  return { name: slug, slug, hit_die: 'd10', weapon_proficiencies: [], armor_proficiencies: [], levels: lv } as unknown as ClassData
}

describe('deriveCharacterStats — always-on class-feature effects', () => {
  it('Aura of Protection adds +CHA (min 1) to every save with a feature breakdown row', () => {
    const paladin = classWith('paladin', { '6': ['Aura of Protection'] })
    const cfe = { paladin: { 'Aura of Protection': [{ type: 'derived_save', ability: 'all', from: 'cha', min: 1 }] } }
    const d = deriveCharacterStats(charWith({
      level: 6,
      classes: [{ classSlug: 'paladin', subclassSlug: null, level: 6 }],
      savingThrowProficiencies: [],
      abilities: { str: 14, dex: 10, con: 12, int: 10, wis: 10, cha: 16 },
    }), { classes: [paladin], classFeatureEffects: cfe as never })
    // +3 CHA to every save: STR save = +2 (STR) + 3 = 5
    expect(d.saveModifiers.str).toBe(5)
    expect(d.saveModifiers.dex).toBe(3) // +0 DEX + 3
    expect(sumOf(d.breakdowns.saves.cha)).toBe(d.saveModifiers.cha)
    expect(d.breakdowns.saves.wis.some(s => s.kind === 'feature' && /Aura of Protection/.test(s.label))).toBe(true)
  })

  it('Diamond Soul grants proficiency in all saves', () => {
    const monk = classWith('monk', { '14': ['Diamond Soul'] })
    const cfe = { monk: { 'Diamond Soul': [{ type: 'save_proficiency', ability: 'all' }] } }
    const d = deriveCharacterStats(charWith({
      level: 14, // PB +5
      classes: [{ classSlug: 'monk', subclassSlug: null, level: 14 }],
      savingThrowProficiencies: [],
      abilities: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 10 },
    }), { classes: [monk], classFeatureEffects: cfe as never })
    expect(d.effectiveSaveProficiencies.length).toBe(6)
    expect(d.saveModifiers.str).toBe(5)  // +0 STR + 5 PB
    expect(d.saveModifiers.dex).toBe(8)  // +3 DEX + 5 PB
  })

  it('data-driven feat effects apply: resistance + armor proficiency + max_hp', () => {
    const feats: Record<string, FeatData> = {
      'infernal-constitution': { name: 'Infernal Constitution', slug: 'infernal-constitution', prerequisites: [], description: '',
        effects: [{ type: 'resistance', damageType: 'cold' }, { type: 'resistance', damageType: 'poison' }] },
      'heavily-armored': { name: 'Heavily Armored', slug: 'heavily-armored', prerequisites: [], description: '',
        effects: [{ type: 'armor_proficiency', armor: ['heavy'] }] },
      'rugged': { name: 'Rugged', slug: 'rugged', prerequisites: [], description: '',
        effects: [{ type: 'max_hp', perLevel: 1 }] },
    }
    const d = deriveCharacterStats(charWith({
      level: 5, maxHp: 40, feats: ['infernal-constitution', 'heavily-armored', 'rugged'],
    }), { featData: feats })
    expect(d.resistances).toEqual(expect.arrayContaining(['cold', 'poison']))
    expect(d.armorProficiencies).toContain('heavy')
    expect(d.adjustedMaxHp).toBe(45) // 40 base + 5 (perLevel 1 × level 5)
  })

  it('Fast Movement adds +10 speed, itemized in the breakdown', () => {
    const barb = classWith('barbarian', { '5': ['Fast Movement'] })
    const cfe = { barbarian: { 'Fast Movement': [{ type: 'speed', amount: 10 }] } }
    const d = deriveCharacterStats(charWith({
      level: 5, speed: 30,
      classes: [{ classSlug: 'barbarian', subclassSlug: null, level: 5 }],
    }), { classes: [barb], classFeatureEffects: cfe as never })
    expect(d.effectiveSpeed).toBe(40)
    expect(d.breakdowns.speed.reduce((t, s) => t + s.amount, 0)).toBe(40)
  })
})

describe('deriveCharacterStats — structured race effects', () => {
  it('grants a racial skill proficiency (filled+locked) with a racial breakdown row', () => {
    const d = deriveCharacterStats(charWith({
      level: 5, race: 'test-race',
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    }), { race: raceWith([{ type: 'skill_proficiency', skill: 'perception' }]) })
    expect(d.effectiveSkillProficiencies.perception).toBe('proficient')
    expect(d.raceSkillGrants).toContain('perception')
    expect(d.skillModifiers.perception).toBe(3) // 0 WIS + 3 PB
    expect(d.breakdowns.skills.perception.some(s => s.kind === 'race')).toBe(true)
  })

  it('grants racial weapon proficiencies into the union', () => {
    const d = deriveCharacterStats(charWith({
      level: 5, race: 'test-race',
    }), { race: raceWith([{ type: 'weapon_proficiency', weapons: ['Longsword', 'Shortbow'] }]) })
    expect(d.weaponProficiencies).toEqual(expect.arrayContaining(['longsword', 'shortbow']))
  })

  it('adds racial damage resistance (merged + lowercased) alongside item resistances', () => {
    const d = deriveCharacterStats(charWith({
      level: 5, race: 'test-race',
    }), { race: raceWith([{ type: 'resistance', damageType: 'Poison' }]) })
    expect(d.resistances).toContain('poison')
  })

  it('exposes racial languages + senses for display', () => {
    const d = deriveCharacterStats(charWith({ level: 5, race: 'test-race' }), { race: raceWith([]) })
    expect(d.raceGrantedLanguages).toContain('Common')
    expect(d.senses.darkvision).toBe(60)
  })

  it('natural armor sets the unarmored AC base (Lizardfolk 13 + DEX)', () => {
    const d = deriveCharacterStats(charWith({
      level: 5, race: 'test-race', armorClass: 10,
      abilities: { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 },
      equipment: [],
    }), { race: raceWith([{ type: 'natural_armor', base: 13, addDex: true }]) })
    expect(d.effectiveAC).toBe(15) // 13 + 2 (DEX)
    expect(sumAc(d)).toBe(15)
    expect(d.breakdowns.ac.some(s => s.id === 'race:natural-armor:ac')).toBe(true)
  })
})
