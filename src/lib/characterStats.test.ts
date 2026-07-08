import { describe, it, expect } from 'vitest'
import { computeWeaponBonus, deriveCharacterStats, applyLedger } from './characterStats'
import { defaultCharacter } from '../types/character'
import { useDiceStore } from '../store/dice'
import type { Character, AbilityName } from '../types/character'
import type { ModifierSource } from './characterStats'
import type { RollEntry } from '../types/dice'
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

  it('adds a flat item attack bonus to the to-hit modifier (to-hit effect)', () => {
    const char = lvl5Str16()
    const calc = computeWeaponBonus(greatsword, char, ['martial weapons'], char.abilities, 0, [], 3)
    expect(calc.toHitModifier).toBe(9) // STR +3 + PB +3 + item attack +3
  })

  it('surfaces an item attack effect as derived.itemAttackBonus', () => {
    const belt: WondrousItem = {
      name: 'Belt of Aim', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'attack', amount: 1 }],
    }
    const d = deriveCharacterStats(charWith({
      equipment: [{ id: 'b', name: 'Belt of Aim', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [belt] } })
    expect(d.itemAttackBonus).toBe(1)
  })

  it('surfaces an item spell-damage effect as derived.itemSpellDamageBonus', () => {
    const rod: WondrousItem = {
      name: 'Rod of Spell Power', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'spell_damage', amount: 2 }],
    }
    const d = deriveCharacterStats(charWith({
      equipment: [{ id: 'r', name: 'Rod of Spell Power', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [rod] } })
    expect(d.itemSpellDamageBonus).toBe(2)
  })

  // P4 — per-weapon attack/damage ledger breakdowns
  it('weapon attack/damage breakdowns sum to the modifiers and disabling a contributor drops it', () => {
    const char = lvl5Str16()
    // STR+3, PB+3, itemDamage+1, itemAttack+2, item id 'w1'
    const calc = computeWeaponBonus(greatsword, char, ['martial weapons'], char.abilities, 1, [], 2, 'w1')
    expect(calc.toHitModifier).toBe(8) // 3 + 3 + 2
    expect(calc.attackBreakdown.reduce((t, s) => t + s.amount, 0)).toBe(calc.toHitModifier)
    expect(calc.damageBreakdown.reduce((t, s) => t + s.amount, 0)).toBe(calc.damageBonus) // 3 + 1 = 4

    // Disable the item to-hit bonus via the per-weapon ledger key.
    const id = 'item:weapon-w1-bonus:attack'
    const led = applyLedger('weaponAttack:w1', calc.attackBreakdown, { disabled: [id], overrides: {}, custom: {} })
    expect(led.effective).toBe(6) // 8 − 2
    expect(led.rows.find(r => r.id === id)!.disabled).toBe(true)
  })

  it('a custom per-weapon attack modifier adds to the effective to-hit', () => {
    const calc = computeWeaponBonus(greatsword, lvl5Str16(), ['martial weapons'], undefined, 0, [], 0, 'w2')
    const led = applyLedger('weaponAttack:w2', calc.attackBreakdown, {
      disabled: [], overrides: {}, custom: { 'weaponAttack:w2': [{ id: 'c1', label: 'Bless', amount: 2 }] },
    })
    expect(led.effective).toBe(8) // STR+3 + PB+3 + custom +2
  })
})

describe('Proficiency Bonus ledger override (cascades)', () => {
  it('a custom Proficiency Bonus modifier raises PB and cascades into saves + skills', () => {
    const base = lvl5Str16({ savingThrowProficiencies: ['str'], skillProficiencies: { athletics: 'proficient' } })
    const before = deriveCharacterStats(base, {})
    expect(before.proficiencyBonus).toBe(3)
    expect(before.saveModifiers.str).toBe(6)      // STR +3 + PB +3
    expect(before.skillModifiers.athletics).toBe(6) // STR +3 + PB +3

    const d = deriveCharacterStats(lvl5Str16({
      savingThrowProficiencies: ['str'],
      skillProficiencies: { athletics: 'proficient' },
      ledgerOverrides: { disabled: [], overrides: {}, custom: { proficiencyBonus: [{ id: 'pb1', label: 'Homebrew', amount: 1 }] } },
    }), {})
    expect(d.proficiencyBonus).toBe(4)             // 3 + 1
    expect(d.saveModifiers.str).toBe(7)            // STR +3 + PB +4 (cascaded)
    expect(d.skillModifiers.athletics).toBe(7)     // STR +3 + PB +4 (cascaded)
    expect(d.breakdowns.proficiencyBonus.reduce((t, s) => t + s.amount, 0)).toBe(4)
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
function raceWith(effects: RaceEffect[], subraces: unknown[] = []): import('../types/data').Race {
  return {
    name: 'Test Race', slug: 'test-race', description: '',
    base: { ability_score_increases: {}, asi_choices: [], speed: 30, size: 'Medium', languages: ['Common'], senses: { darkvision: 60 }, proficiencies: [], traits: {}, effects },
    subraces,
  } as unknown as import('../types/data').Race
}

// Phase 5 — the hardcoded advantage maps are gone; racial/feat adv-dis is data-driven.
const FEY_RACE = raceWith([{ type: 'advantage', target: 'save', ability: 'all', label: 'Fey Ancestry', condition: 'vs. being charmed' }])
const DWARF_RACE = raceWith([{ type: 'advantage', target: 'save', ability: 'all', label: 'Dwarven Resilience', condition: 'vs. poison' }])
const DUERGAR_RACE = raceWith([
  { type: 'advantage', target: 'save', ability: 'all', label: 'Dwarven Resilience', condition: 'vs. poison' },
  { type: 'advantage', target: 'save', ability: 'all', label: 'Duergar Resilience', condition: 'vs. illusions, and vs. being charmed or paralyzed' },
])
const VERDAN_RACE = raceWith([
  { type: 'advantage', target: 'save', ability: 'wis', label: 'Telepathic Insight' },
  { type: 'advantage', target: 'save', ability: 'cha', label: 'Telepathic Insight' },
])
const WAR_CASTER_FEATS: Record<string, FeatData> = {
  'war-caster': { name: 'War Caster', slug: 'war-caster', prerequisites: [], description: '',
    effects: [{ type: 'advantage', target: 'save', ability: 'con', condition: 'to maintain concentration when you take damage' }] },
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
  const swiftBoots: WondrousItem = {
    name: 'Boots of Swiftness', category: 'wondrous_item', rarity: 'Uncommon', attunement: true,
    effects: [{ type: 'speed', amount: 10 }],  // additive
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

  // BUG-90: the Speed stepper back-solves the stored base as (value − speedAdditiveBonus).
  // That inverse is exact ONLY when speed is purely additive; a live floor/multiplier/
  // condition must make base + speedAdditiveBonus ≠ effectiveSpeed so the UI stops
  // back-solving and can't bake a corrupted base into character.speed.
  it('additive-only speed is back-solvable: bonus is exposed and (value − bonus) recovers the base', () => {
    const d = deriveCharacterStats(charWith({
      speed: 30,
      equipment: [{ id: 'sw', name: 'Boots of Swiftness', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [swiftBoots] } })
    expect(d.speedAdditiveBonus).toBe(10)
    expect(d.effectiveSpeed).toBe(40)
    expect(d.effectiveSpeed - d.speedAdditiveBonus).toBe(30) // inverse recovers the stored base
  })

  it('a live multiplier makes speed NOT back-solvable (base + bonus ≠ effective) → stepper goes read-only', () => {
    const d = deriveCharacterStats(charWith({
      speed: 30,
      equipment: [
        { id: 'sw', name: 'Boots of Swiftness', quantity: 1, attuned: true },
        { id: 's', name: 'Boots of Speed', quantity: 1, attuned: true },
      ],
    }), { catalog: { wondrous_items: [swiftBoots, speedBoots] } })
    expect(d.speedAdditiveBonus).toBe(10)   // additive part only, pre-multiplier
    expect(d.effectiveSpeed).toBe(80)       // (30 + 10) × 2
    expect(30 + d.speedAdditiveBonus).not.toBe(d.effectiveSpeed)
  })

  it('a speed-zeroing condition makes speed NOT back-solvable (the Grappled/Restrained repro) — no base corruption', () => {
    const d = deriveCharacterStats(charWith({
      speed: 30,
      conditions: { active: ['restrained'], exhaustion: 0 }, // speed → 0, same family as Grappled
      equipment: [{ id: 'sw', name: 'Boots of Swiftness', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [swiftBoots] } })
    expect(d.effectiveSpeed).toBe(0)
    // The old inverse would have written 35 − (0 − 30) = 65 into character.speed; the guard
    // (base + speedAdditiveBonus ≠ effectiveSpeed) is what makes the UI refuse to back-solve.
    expect(30 + d.speedAdditiveBonus).not.toBe(d.effectiveSpeed)
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

  it('a conditional racial save advantage (Dwarf vs poison) is situational — not auto-netted, on ALL saves with its condition', () => {
    const d = deriveCharacterStats(charWith({ race: 'dwarf' }), { race: DWARF_RACE })
    expect(d.rollStates.saves.con).toBeUndefined()
    const con = d.rollStateSources.saves.con?.find(s => s.label === 'Dwarven Resilience')
    expect(con?.mode).toBe('adv')
    expect(con?.condition).toContain('poison')
    // RAW scope: "saving throws against poison" — every save carries the source
    expect(d.rollStateSources.saves.wis?.some(s => s.label === 'Dwarven Resilience')).toBe(true)
  })

  it('6b-3: a situational race source is still id-tagged and ledger-disableable', () => {
    const on = deriveCharacterStats(charWith({ race: 'dwarf' }), { race: DWARF_RACE })
    const src = on.rollStateSources.saves.con!.find(s => s.id)!
    expect(src.id).toBeTruthy()
    const off = deriveCharacterStats(charWith({
      race: 'dwarf',
      ledgerOverrides: { disabled: [src.id!], overrides: {}, custom: {} },
    }), { race: DWARF_RACE })
    expect(off.rollStates.saves.con).toBeUndefined()
    expect(off.rollStateSources.saves.con!.find(s => s.id === src.id)!.disabled).toBe(true)
  })

  it('advantage + disadvantage on the same skill net to normal (RAW)', () => {
    // Boots of Elvenkind → Stealth advantage (data-driven item effect); Plate → Stealth
    // disadvantage ⇒ normal. The item advantage applies because the boots are equipped.
    const boots: WondrousItem = {
      name: 'Boots of Elvenkind', category: 'wondrous_item', rarity: 'Uncommon', attunement: false,
      effects: [{ type: 'advantage', target: 'skill', skill: 'stealth' }],
    }
    const d = deriveCharacterStats(charWith({
      equipment: [
        { id: 'b', name: 'Boots of Elvenkind', quantity: 1, equipped: true },
        { id: 'p', name: 'Plate', quantity: 1, equipped: true },
      ],
    }), { catalog: { armor: [plate], wondrous_items: [boots] } })
    expect(d.hasStealthDisadvantage).toBe(true)
    expect(d.rollStates.skills.stealth).toBeUndefined() // netted to normal
  })

  it('adv/dis sources are labeled for the ledger breakdown', () => {
    const d = deriveCharacterStats(charWith({ race: 'dwarf' }), { race: DWARF_RACE })
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

  // ── Situational (condition-bearing) sources — EFFECT_AUDIT 2026-07 checklist ──
  it('Fey Ancestry (elf) is situational on ALL saves — WIS save no longer standing (Adv)', () => {
    const d = deriveCharacterStats(charWith({ race: 'elf' }), { race: FEY_RACE })
    expect(d.rollStates.saves.wis).toBeUndefined()
    for (const ab of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const) {
      const fey = d.rollStateSources.saves[ab]?.find(s => s.label === 'Fey Ancestry')
      expect(fey?.condition).toBe('vs. being charmed')
    }
  })

  it('Verdan Telepathic Insight is genuinely unconditional — stays standing (checklist #10)', () => {
    const d = deriveCharacterStats(charWith({ race: 'verdan' }), { race: VERDAN_RACE })
    expect(d.rollStates.saves.wis).toBe('adv')
    expect(d.rollStates.saves.cha).toBe('adv')
    expect(d.rollStates.saves.con).toBeUndefined()
  })

  it('duergar carries two situational sources (Dwarven + Duergar Resilience, checklist #3)', () => {
    const d = deriveCharacterStats(charWith({ race: 'duergar' }), { race: DUERGAR_RACE })
    const labels = (d.rollStateSources.saves.con ?? []).map(s => s.label)
    expect(labels).toContain('Dwarven Resilience')
    expect(labels).toContain('Duergar Resilience')
    expect(d.rollStates.saves.con).toBeUndefined()
  })

  it('War Caster feat advantage is situational (concentration only, checklist #11)', () => {
    const d = deriveCharacterStats(charWith({ feats: ['war-caster'] }), { featData: WAR_CASTER_FEATS })
    expect(d.rollStates.saves.con).toBeUndefined()
    expect(d.rollStateSources.saves.con?.some(s => s.condition?.includes('concentration'))).toBe(true)
  })

  it('standing + situational on the same target: net reflects standing only', () => {
    const d = deriveCharacterStats(charWith({
      race: 'elf',
      ledgerOverrides: { disabled: [], overrides: {}, custom: {}, customAdvDis: [
        { id: 'custom:blessing', label: 'Blessing', target: 'save', ability: 'wis', mode: 'adv' },
      ] },
    }), { race: FEY_RACE })
    expect(d.rollStates.saves.wis).toBe('adv') // from the standing custom grant only
    expect(d.rollStateSources.saves.wis?.some(s => s.label === 'Fey Ancestry' && !!s.condition)).toBe(true)
  })

  it('a custom adv grant WITH a condition is situational — not netted', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: [], overrides: {}, custom: {}, customAdvDis: [
        { id: 'custom:ward', label: 'Ward', target: 'save', ability: 'all', mode: 'adv', condition: 'vs. fear' },
      ] },
    }), {})
    expect(d.rollStates.saves.wis).toBeUndefined()
    expect(d.rollStateSources.saves.wis?.find(s => s.id === 'custom:ward')?.condition).toBe('vs. fear')
  })

  it('a data-driven item advantage WITH a condition is situational (untagged item data stays standing)', () => {
    const goggles: WondrousItem = {
      name: "Inquisitive's Goggles", category: 'wondrous_item', rarity: 'Rare', attunement: false,
      effects: [{ type: 'advantage', target: 'skill', skill: 'insight', condition: 'to determine if a creature is lying' }],
    }
    const d = deriveCharacterStats(charWith({
      equipment: [{ id: 'g', name: "Inquisitive's Goggles", quantity: 1, equipped: true }],
    }), { catalog: { wondrous_items: [goggles] } })
    expect(d.rollStates.skills.insight).toBeUndefined()
    expect(d.rollStateSources.skills.insight?.[0]?.condition).toContain('lying')
  })

  // ── Phase 5: hardcoded maps dissolved into data — id stability ─────────────
  it('data-driven race source keeps the legacy id (advdis:race:fey-ancestry)', () => {
    const d = deriveCharacterStats(charWith({}), { race: FEY_RACE })
    expect(d.rollStateSources.saves.wis?.find(s => s.label === 'Fey Ancestry')?.id).toBe('advdis:race:fey-ancestry')
  })

  it('a legacy war-caster disable id still suppresses the renamed data source (alias shim)', () => {
    const d = deriveCharacterStats(charWith({
      feats: ['war-caster'],
      ledgerOverrides: { disabled: ['advdis:feat:war-caster-concentration'], overrides: {}, custom: {} },
    }), { featData: WAR_CASTER_FEATS })
    const src = d.rollStateSources.saves.con?.find(s => s.label === 'War Caster')
    expect(src?.id).toBe('advdis:feat:war-caster')
    expect(src?.disabled).toBe(true)
  })

  it('a subrace advantage keeps its subrace kind and id (advdis:subrace:stout-resilience)', () => {
    const halfling = raceWith(
      [{ type: 'advantage', target: 'save', ability: 'all', label: 'Brave', condition: 'vs. being frightened' }],
      [{ name: 'Stout', ability_score_increases: {}, asi_choices: [], languages: [], senses: {}, effects: [{ type: 'advantage', target: 'save', ability: 'all', label: 'Stout Resilience', condition: 'vs. poison' }] }],
    )
    const d = deriveCharacterStats(charWith({ subrace: 'stout' }), { race: halfling })
    const stout = d.rollStateSources.saves.con?.find(s => s.label === 'Stout Resilience')
    expect(stout?.kind).toBe('subrace')
    expect(stout?.id).toBe('advdis:subrace:stout-resilience')
    expect(d.rollStates.saves.con).toBeUndefined()
  })

  it('a feature advantage WITH a condition (Danger Sense tagged) is situational', () => {
    const barb = classWith('barbarian', { '2': ['Danger Sense'] })
    const cfe = { barbarian: { 'Danger Sense': [{ type: 'advantage', target: 'save', ability: 'dex', condition: 'vs. effects you can see' }] } }
    const d = deriveCharacterStats(charWith({
      level: 3, classes: [{ classSlug: 'barbarian', subclassSlug: null, level: 3 }],
    }), { classes: [barb], classFeatureEffects: cfe as never })
    expect(d.rollStates.saves.dex).toBeUndefined()
    expect(d.rollStateSources.saves.dex?.[0]?.condition).toContain('you can see')
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

  // ── Tier-1b state gates (EFFECT_AUDIT #14/#15) ─────────────────────────────
  it('Aura of Protection is suppressed while an incapacitating condition is active', () => {
    const paladin = classWith('paladin', { '6': ['Aura of Protection'] })
    const cfe = { paladin: { 'Aura of Protection': [{ type: 'derived_save', ability: 'all', from: 'cha', min: 1, whileNot: 'incapacitated' }] } }
    const base = {
      level: 6,
      classes: [{ classSlug: 'paladin', subclassSlug: null, level: 6 }],
      savingThrowProficiencies: [] as never[],
      abilities: { str: 14, dex: 10, con: 12, int: 10, wis: 10, cha: 16 },
    }
    const up = deriveCharacterStats(charWith(base), { classes: [paladin], classFeatureEffects: cfe as never })
    expect(up.saveModifiers.str).toBe(5) // +2 STR + 3 CHA aura
    // 'stunned' includes Incapacitated per RAW — the aura drops, with a visible 0-row
    const down = deriveCharacterStats(charWith({
      ...base, conditions: { active: ['stunned'], exhaustion: 0 },
    }), { classes: [paladin], classFeatureEffects: cfe as never })
    expect(down.saveModifiers.str).toBe(2)
    expect(down.breakdowns.saves.str.some(s => /suppressed: incapacitated/.test(s.label) && s.amount === 0)).toBe(true)
    expect(sumOf(down.breakdowns.saves.str)).toBe(down.saveModifiers.str)
  })

  it('Fast Movement is suppressed while wearing heavy armor (visible 0-row, sum intact)', () => {
    const barb = classWith('barbarian', { '5': ['Fast Movement'] })
    const cfe = { barbarian: { 'Fast Movement': [{ type: 'speed', amount: 10, whileNot: 'heavy-armor' }] } }
    const base = {
      level: 5, speed: 30,
      classes: [{ classSlug: 'barbarian', subclassSlug: null, level: 5 }],
    }
    const unarmored = deriveCharacterStats(charWith(base), { classes: [barb], classFeatureEffects: cfe as never })
    expect(unarmored.effectiveSpeed).toBe(40)
    const armored = deriveCharacterStats(charWith({
      ...base, equipment: [{ id: 'p', name: 'Plate', quantity: 1, equipped: true }],
    }), { classes: [barb], classFeatureEffects: cfe as never, catalog: { armor: [plate] } })
    expect(armored.effectiveSpeed).toBe(30)
    expect(armored.breakdowns.speed.some(s => /suppressed: wearing heavy armor/.test(s.label) && s.amount === 0)).toBe(true)
    expect(armored.breakdowns.speed.reduce((t, s) => t + s.amount, 0)).toBe(30)
  })

  // ── Tier-3 exemption chips (EFFECT_AUDIT #50-53) ───────────────────────────
  it('a feat immunity (Alert → surprise) reaches the Defenses set with feat provenance', () => {
    const feats: Record<string, FeatData> = {
      alert: { name: 'Alert', slug: 'alert', prerequisites: [], description: '',
        effects: [{ type: 'initiative', amount: 5 }, { type: 'immunity', damageType: 'surprise' }] },
    }
    const d = deriveCharacterStats(charWith({ feats: ['alert'] }), { featData: feats })
    expect(d.immunities).toContain('surprise')
    expect(d.immunitySources.some(s => s.kind === 'feat' && s.value === 'surprise')).toBe(true)
  })

  it('Divine Health + Aura of Courage grant condition-exemption chips (disease, frightened)', () => {
    const paladin = classWith('paladin', { '3': ['Divine Health'], '10': ['Aura of Courage'] })
    const cfe = { paladin: {
      'Divine Health': [{ type: 'immunity', damageType: 'disease' }],
      'Aura of Courage': [{ type: 'immunity', damageType: 'frightened' }],
    } }
    const d = deriveCharacterStats(charWith({
      level: 10, classes: [{ classSlug: 'paladin', subclassSlug: null, level: 10 }],
    }), { classes: [paladin], classFeatureEffects: cfe as never })
    expect(d.immunities).toContain('disease')
    expect(d.immunities).toContain('frightened')
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

// ── Step 5d: roll-time mechanics — Reliable Talent + Lucky ───────────────────
describe('Reliable Talent (Rogue 11+)', () => {
  it('sets derived.reliableTalent only at Rogue level ≥ 11', () => {
    expect(deriveCharacterStats(charWith({ classes: [{ classSlug: 'rogue', subclassSlug: null, level: 11 }] }), {}).reliableTalent).toBe(true)
    expect(deriveCharacterStats(charWith({ classes: [{ classSlug: 'rogue', subclassSlug: null, level: 10 }] }), {}).reliableTalent).toBe(false)
    expect(deriveCharacterStats(charWith({ classes: [{ classSlug: 'fighter', subclassSlug: null, level: 20 }] }), {}).reliableTalent).toBe(false)
  })

  it('floors a proficient skill natural at 10 (every roll), but not a non-proficient skill', () => {
    const d = deriveCharacterStats(charWith({
      classes: [{ classSlug: 'rogue', subclassSlug: null, level: 11 }],
      skillProficiencies: { stealth: 'proficient' },
    }), {})
    const roll = useDiceStore.getState().roll
    for (let i = 0; i < 50; i++) {
      expect(roll({ type: 'skill', skill: 'stealth' }, d).result.natural).toBeGreaterThanOrEqual(10)
    }
    // Non-proficient skill is untouched → over many rolls at least one natural < 10.
    const naturals = Array.from({ length: 80 }, () => roll({ type: 'skill', skill: 'acrobatics' }, d).result.natural)
    expect(naturals.some(n => n < 10)).toBe(true)
  })
})

describe('Lucky (feat) reroll', () => {
  const seed = (natural: number, reliableTalent = false) => {
    const entry: RollEntry = {
      id: 'x', kind: { type: 'skill', skill: 'stealth' },
      result: { natural, modifier: 2, total: natural + 2 }, label: 'Stealth', timestamp: 0,
    }
    useDiceStore.getState().openModal({ entry, phase: 'result', isCrit: false, reliableTalent })
  }

  it('keeps the better die (never worse than the original) and recomputes the total', () => {
    seed(20)
    useDiceStore.getState().luckyReroll()
    let m = useDiceStore.getState().modal!
    expect(m.entry.result.natural).toBe(20)        // a 20 can't be beaten
    expect(m.entry.result.total).toBe(22)
    seed(1)
    useDiceStore.getState().luckyReroll()
    m = useDiceStore.getState().modal!
    expect(m.entry.result.natural).toBeGreaterThanOrEqual(1)
    expect(m.entry.result.total).toBe(m.entry.result.natural + 2)
  })

  it('honors Reliable Talent on the lucky die (floors at 10)', () => {
    seed(3, true)
    useDiceStore.getState().luckyReroll()
    expect(useDiceStore.getState().modal!.entry.result.natural).toBeGreaterThanOrEqual(10)
  })

  it('derived.hasLuckyFeat gates the button (true only with the Lucky feat)', () => {
    expect(deriveCharacterStats(charWith({ feats: ['lucky'] }), {}).hasLuckyFeat).toBe(true)
    expect(deriveCharacterStats(charWith({ feats: [] }), {}).hasLuckyFeat).toBe(false)
  })
})

describe('pool roll (freestyle multi-die)', () => {
  it('rolls each group, returns per-group results that sum to the total', () => {
    const d = deriveCharacterStats(charWith({}), {})
    const e = useDiceStore.getState().roll({ type: 'pool', groups: [{ die: 8, count: 4 }, { die: 10, count: 2 }] }, d)
    expect(e.label).toBe('4d8 + 2d10')
    expect(e.result.pool).toHaveLength(2)
    expect(e.result.pool![0]).toMatchObject({ die: 8 })
    expect(e.result.pool![0].rolls).toHaveLength(4)
    expect(e.result.pool![1].rolls).toHaveLength(2)
    expect(e.result.pool![0].rolls.every(r => r >= 1 && r <= 8)).toBe(true)
    expect(e.result.pool![1].rolls.every(r => r >= 1 && r <= 10)).toBe(true)
    const sum = e.result.pool!.flatMap(g => g.rolls).reduce((a, b) => a + b, 0)
    expect(e.result.total).toBe(sum)
  })

  it('drops zero-count groups', () => {
    const d = deriveCharacterStats(charWith({}), {})
    const e = useDiceStore.getState().roll({ type: 'pool', groups: [{ die: 6, count: 0 }, { die: 12, count: 3 }] }, d)
    expect(e.result.pool).toHaveLength(1)
    expect(e.result.pool![0].die).toBe(12)
    expect(e.label).toBe('3d12')
  })
})

// ── Step 5e: item advantage/disadvantage effects ─────────────────────────────
describe('deriveCharacterStats — item advantage/disadvantage effects', () => {
  it('an item granting advantage on a save shows it on that save', () => {
    const cloak: WondrousItem = {
      name: 'Cloak of Grit', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'advantage', target: 'save', ability: 'con' }],
    }
    const d = deriveCharacterStats(charWith({
      equipment: [{ id: 'c', name: 'Cloak of Grit', quantity: 1, attuned: true }],
    }), { catalog: { wondrous_items: [cloak] } })
    expect(d.rollStates.saves.con).toBe('adv')
  })

  it('item disadvantage on a skill nets with an item advantage to normal (RAW)', () => {
    const ring: WondrousItem = {
      name: 'Clumsy Ring', category: 'wondrous_item', rarity: 'Common', attunement: true,
      effects: [{ type: 'disadvantage', target: 'skill', skill: 'stealth' }],
    }
    // Boots of Elvenkind grant a Stealth advantage (data-driven, while worn) → adv + dis = normal.
    const boots: WondrousItem = {
      name: 'Boots of Elvenkind', category: 'wondrous_item', rarity: 'Uncommon', attunement: false,
      effects: [{ type: 'advantage', target: 'skill', skill: 'stealth' }],
    }
    const d = deriveCharacterStats(charWith({
      equipment: [
        { id: 'r', name: 'Clumsy Ring', quantity: 1, attuned: true },
        { id: 'b', name: 'Boots of Elvenkind', quantity: 1, equipped: true },
      ],
    }), { catalog: { wondrous_items: [ring, boots] } })
    expect(d.rollStates.skills.stealth).toBeUndefined()
  })

  it('an unequipped item grants nothing', () => {
    const cloak: WondrousItem = {
      name: 'Cloak of Grit', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'advantage', target: 'save', ability: 'con' }],
    }
    const d = deriveCharacterStats(charWith({
      equipment: [{ id: 'c', name: 'Cloak of Grit', quantity: 1, attuned: false }],
    }), { catalog: { wondrous_items: [cloak] } })
    expect(d.rollStates.saves.con).toBeUndefined()
  })
})

// ── Step 5d-C: Great Weapon Fighting ─────────────────────────────────────────
describe('Great Weapon Fighting (5d-C)', () => {
  const gwfFeatures = {
    'fighter:fighting-style': {
      key: 'fighter:fighting-style', label: 'Fighting Style', source: { classSlug: 'fighter' },
      known: [{ level: 1, count: 1 }],
      options: [{ slug: 'great-weapon-fighting', name: 'Great Weapon Fighting', description: 'x' }],
    },
  } as never

  it('derived.greatWeaponFighting is true when the style is selected', () => {
    const d = deriveCharacterStats(charWith({
      classes: [{ classSlug: 'fighter', subclassSlug: null, level: 1 }],
      classFeatureChoices: { 'fighter:fighting-style': ['great-weapon-fighting'] },
    }), { classFeatures: gwfFeatures })
    expect(d.greatWeaponFighting).toBe(true)
  })

  it('is false without the style selected', () => {
    const d = deriveCharacterStats(charWith({
      classes: [{ classSlug: 'fighter', subclassSlug: null, level: 1 }],
    }), { classFeatures: gwfFeatures })
    expect(d.greatWeaponFighting).toBe(false)
  })
})

// ── Step 6b: custom set-membership grants (resistance/immunity/language) ──────
describe('deriveCharacterStats — custom set grants (6b)', () => {
  it('a custom resistance grant appears in derived.resistances (lowercased)', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: [], overrides: {}, custom: {}, customGrants: [{ id: 'r1', label: 'Resistance to Fire', target: 'resistance', value: 'Fire' }] },
    }), {})
    expect(d.resistances).toContain('fire')
  })

  it('a custom language grant appears in the granted languages', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: [], overrides: {}, custom: {}, customGrants: [{ id: 'l1', label: 'Language Draconic', target: 'language', value: 'Draconic' }] },
    }), {})
    expect(d.raceGrantedLanguages).toContain('Draconic')
  })

  it('a disabled custom grant is suppressed', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: ['r1'], overrides: {}, custom: {}, customGrants: [{ id: 'r1', label: 'Resistance to Fire', target: 'resistance', value: 'Fire' }] },
    }), {})
    expect(d.resistances).not.toContain('fire')
  })

  it('a custom skill-proficiency grant makes the skill proficient + locks it (customSkillGrants)', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: [], overrides: {}, custom: {}, customGrants: [{ id: 's1', label: 'Stealth proficiency', target: 'skillProf', value: 'stealth' }] },
    }), {})
    expect(d.effectiveSkillProficiencies.stealth).toBe('proficient')
    expect(d.customSkillGrants).toContain('stealth')
  })

  it('a custom save-proficiency grant adds the save; a custom sense grant adds darkvision', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: [], overrides: {}, custom: {}, customGrants: [
        { id: 'sv', label: 'DEX save proficiency', target: 'saveProf', value: 'dex' },
        { id: 'se', label: 'Darkvision 60 ft', target: 'sense', value: 'Darkvision', amount: 60 },
      ] },
    }), {})
    expect(d.effectiveSaveProficiencies).toContain('dex')
    expect(d.senses.darkvision).toBe(60)
  })

  it('a disabled skill-proficiency grant is not applied', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: ['s1'], overrides: {}, custom: {}, customGrants: [{ id: 's1', label: 'Stealth proficiency', target: 'skillProf', value: 'stealth' }] },
    }), {})
    expect(d.effectiveSkillProficiencies.stealth).toBeUndefined()
    expect(d.customSkillGrants).not.toContain('stealth')
  })

  // 6b-3 (C) — disable a DERIVED language in place
  it('a racial language has provenance; disabling its id drops it from the effective list', () => {
    const base = deriveCharacterStats(charWith({ level: 5, race: 'test-race' }), { race: raceWith([]) })
    const src = base.languageSources.find(s => s.value === 'Common')
    expect(src).toBeTruthy()
    expect(src!.kind).toBe('race')
    expect(src!.id).toBe('lang:race:Common')
    const d = deriveCharacterStats(charWith({
      level: 5, race: 'test-race',
      ledgerOverrides: { disabled: ['lang:race:Common'], overrides: {}, custom: {} },
    }), { race: raceWith([]) })
    expect(d.raceGrantedLanguages).not.toContain('Common')
    expect(d.languageSources.find(s => s.value === 'Common')!.disabled).toBe(true)
  })

  // 6b-3 (D) — disable a DERIVED skill proficiency in place (prof + modifier stay in sync)
  it('disabling a racial skill-proficiency grant un-fills it AND drops the PB from the modifier', () => {
    const race = raceWith([{ type: 'skill_proficiency', skill: 'perception' }])
    const base = { level: 5, race: 'test-race', abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } } as const
    const enabled = deriveCharacterStats(charWith({ ...base }), { race })
    expect(enabled.skillProfSources.some(s => s.value === 'perception' && s.id === 'skillprof:race:perception')).toBe(true)
    expect(enabled.skillModifiers.perception).toBe(3) // 0 WIS + 3 PB

    const disabled = deriveCharacterStats(charWith({
      ...base,
      ledgerOverrides: { disabled: ['skillprof:race:perception'], overrides: {}, custom: {} },
    }), { race })
    expect(disabled.effectiveSkillProficiencies.perception).toBeUndefined()
    expect(disabled.skillModifiers.perception).toBe(0) // 0 WIS, no PB — modifier stays in sync
    expect(disabled.raceSkillGrants).not.toContain('perception')
    expect(disabled.skillProfSources.find(s => s.value === 'perception')!.disabled).toBe(true)
  })

  // 6b-3 (D) — disable a DERIVED save proficiency in place
  it('disabling an always-on feature save-proficiency grant removes the save + its PB', () => {
    const cls = classWith('paladin', { '3': ['Save Aura'] })
    const cfe = { paladin: { 'Save Aura': [{ type: 'save_proficiency', ability: 'wis' }] } }
    const base = {
      level: 3,
      classes: [{ classSlug: 'paladin', subclassSlug: null, level: 3 }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      savingThrowProficiencies: [] as never[],
    } as const
    const enabled = deriveCharacterStats(charWith({ ...base }), { classes: [cls], classFeatureEffects: cfe as never })
    const src = enabled.saveProfSources.find(s => s.value === 'wis')
    expect(src).toBeTruthy()
    expect(enabled.effectiveSaveProficiencies).toContain('wis')
    expect(enabled.saveModifiers.wis).toBe(2) // 0 WIS + 2 PB

    const disabled = deriveCharacterStats(charWith({
      ...base,
      ledgerOverrides: { disabled: [src!.id], overrides: {}, custom: {} },
    }), { classes: [cls], classFeatureEffects: cfe as never })
    expect(disabled.effectiveSaveProficiencies).not.toContain('wis')
    expect(disabled.saveModifiers.wis).toBe(0)
    expect(disabled.saveProfSources.find(s => s.value === 'wis')!.disabled).toBe(true)
  })

  // 6b-2 — provenance + disable for derived resistances
  it('an item resistance is listed with a source; disabling its id removes the effective resistance', () => {
    const ring: WondrousItem = {
      name: 'Ring of Fire Warding', category: 'wondrous_item', rarity: 'Rare', attunement: true,
      effects: [{ type: 'resistance', damageType: 'fire' }],
    }
    const equip = [{ id: 'c', name: 'Ring of Fire Warding', quantity: 1, attuned: true }]
    const on = deriveCharacterStats(charWith({ equipment: equip }), { catalog: { wondrous_items: [ring] } })
    expect(on.resistances).toContain('fire')
    const src = on.resistanceSources.find(s => s.value === 'fire')!
    expect(src.kind).toBe('item')

    const off = deriveCharacterStats(charWith({
      equipment: equip,
      ledgerOverrides: { disabled: [src.id], overrides: {}, custom: {} },
    }), { catalog: { wondrous_items: [ring] } })
    expect(off.resistances).not.toContain('fire')
    expect(off.resistanceSources.find(s => s.value === 'fire')!.disabled).toBe(true)
  })
})

// ── Step 6c: custom always-on advantage/disadvantage grants ──────────────────
describe('deriveCharacterStats — custom adv/dis grants (6c)', () => {
  it('a custom advantage grant shows on the targeted save', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: [], overrides: {}, custom: {}, customAdvDis: [{ id: 'g1', label: 'Blessed', target: 'save', ability: 'dex', mode: 'adv' }] },
    }), {})
    expect(d.rollStates.saves.dex).toBe('adv')
  })

  it('a custom disadvantage on all saves applies to every save', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: [], overrides: {}, custom: {}, customAdvDis: [{ id: 'g1', label: 'Cursed', target: 'save', ability: 'all', mode: 'dis' }] },
    }), {})
    expect(d.rollStates.saves.con).toBe('dis')
    expect(d.rollStates.saves.cha).toBe('dis')
  })

  it('a disabled custom grant is suppressed', () => {
    const d = deriveCharacterStats(charWith({
      ledgerOverrides: { disabled: ['g1'], overrides: {}, custom: {}, customAdvDis: [{ id: 'g1', label: 'Blessed', target: 'save', ability: 'dex', mode: 'adv' }] },
    }), {})
    expect(d.rollStates.saves.dex).toBeUndefined()
  })
})

// ── Step 6a: Modifier Ledger override layer ──────────────────────────────────
describe('applyLedger', () => {
  const rows = (): ModifierSource[] => [
    { id: 'base', label: 'Base', amount: 30, kind: 'base', removable: false },
    { id: 'feat:x:speed', label: 'Feat', amount: 10, kind: 'feat', removable: true },
  ]

  it('disable drops a removable row from the sum but keeps it (flagged) in rows', () => {
    const r = applyLedger('speed', rows(), { disabled: ['feat:x:speed'], overrides: {}, custom: {} })
    expect(r.effective).toBe(30)
    expect(r.rawTotal).toBe(40)
    expect(r.rows.find(x => x.id === 'feat:x:speed')!.disabled).toBe(true)
  })

  it('override replaces a removable row amount and records the original as rawAmount', () => {
    const r = applyLedger('speed', rows(), { disabled: [], overrides: { 'feat:x:speed': 25 }, custom: {} })
    expect(r.effective).toBe(55)
    const row = r.rows.find(x => x.id === 'feat:x:speed')!
    expect(row.amount).toBe(25)
    expect(row.rawAmount).toBe(10)
  })

  it('custom rows append and add to the sum', () => {
    const r = applyLedger('speed', rows(), { disabled: [], overrides: {}, custom: { speed: [{ id: 'c1', label: 'Mount', amount: 5 }] } })
    expect(r.effective).toBe(45)
    expect(r.rows.some(x => x.id === 'c1' && x.kind === 'custom')).toBe(true)
  })

  it('a custom row can be disabled (kept + flagged, dropped from the sum)', () => {
    const r = applyLedger('speed', rows(), { disabled: ['c1'], overrides: {}, custom: { speed: [{ id: 'c1', label: 'Mount', amount: 5 }] } })
    expect(r.effective).toBe(40)  // custom suppressed
    expect(r.rows.find(x => x.id === 'c1')!.disabled).toBe(true)
  })

  it('locked (non-removable) rows ignore disable + override', () => {
    const r = applyLedger('speed', rows(), { disabled: ['base'], overrides: { base: 0 }, custom: {} })
    expect(r.effective).toBe(40)
    expect(r.rows.find(x => x.id === 'base')!.disabled).toBeFalsy()
  })
})

describe('deriveCharacterStats — ledger overrides applied + cascading', () => {
  const belt: WondrousItem = {
    name: 'Belt of Dwarvenkind', category: 'wondrous_item', rarity: 'Rare', attunement: true,
    effects: [{ type: 'ability_bonus', ability: 'con', amount: 2, cap: 20 }],
  }
  const base = {
    level: 5, // PB +3
    abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
    savingThrowProficiencies: ['con'] as AbilityName[],
    equipment: [{ id: 'b', name: 'Belt of Dwarvenkind', quantity: 1, attuned: true }],
  }

  it('disabling an item ability bonus cascades to the dependent CON save', () => {
    const on = deriveCharacterStats(charWith(base), { catalog: { wondrous_items: [belt] } })
    expect(on.effectiveAbilities.con).toBe(16)      // 14 + 2
    expect(on.saveModifiers.con).toBe(6)            // CON +3 + PB +3

    const off = deriveCharacterStats(charWith({
      ...base,
      ledgerOverrides: { disabled: ['item:belt-of-dwarvenkind:con'], overrides: {}, custom: {} },
    }), { catalog: { wondrous_items: [belt] } })
    expect(off.effectiveAbilities.con).toBe(14)     // bonus suppressed
    expect(off.saveModifiers.con).toBe(5)           // CON +2 + PB +3 — cascade
    // the disabled row still appears in the breakdown so it can be re-enabled
    expect(off.breakdowns.abilities.con.some(s => s.id === 'item:belt-of-dwarvenkind:con' && s.disabled)).toBe(true)
  })

  it('a custom speed modifier adds to the breakdown and effective speed', () => {
    const d = deriveCharacterStats(charWith({
      speed: 30,
      ledgerOverrides: { disabled: [], overrides: {}, custom: { speed: [{ id: 'c1', label: 'Mount', amount: 10 }] } },
    }), {})
    expect(d.effectiveSpeed).toBe(40)
    expect(d.breakdowns.speed.some(s => s.id === 'c1' && s.kind === 'custom')).toBe(true)
  })
})

// ── Half-proficiency checks: Jack of All Trades / Remarkable Athlete (#32/#53/#55) ──
describe('deriveCharacterStats — half-proficiency checks (JoAT / Remarkable Athlete)', () => {
  const JOAT_CFE = { bard: { 'Jack of All Trades': [{ type: 'half_proficiency_checks' }] } }
  const RA_CFE = { 'fighter:champion': { 'Remarkable Athlete': [{ type: 'half_proficiency_checks', roundUp: true, abilities: ['str', 'dex', 'con'], level: 7 }] } }
  const bard = classWith('bard', { '2': ['Jack of All Trades'] })
  const fighter = classWith('fighter', {})

  function bardChar(level = 2, overrides: Partial<Character> = {}) {
    return charWith({ level, classes: [{ classSlug: 'bard', subclassSlug: null, level }], ...overrides })
  }
  function championChar(level = 7) {
    return charWith({ level, classes: [{ classSlug: 'fighter', subclassSlug: 'champion', level }] })
  }

  it('bard 2: a non-proficient skill gains floor(PB/2) with a labeled feature row', () => {
    const d = deriveCharacterStats(bardChar(), { classes: [bard], classFeatureEffects: JOAT_CFE as never })
    expect(d.skillModifiers.athletics).toBe(1) // STR +0 + floor(2/2)
    expect(d.breakdowns.skills.athletics.some(s => s.kind === 'feature' && /Jack of All Trades/.test(s.label) && s.amount === 1)).toBe(true)
    expect(sumOf(d.breakdowns.skills.athletics)).toBe(d.skillModifiers.athletics)
  })

  it('bard 2: proficient and expertise skills are untouched (no stacking)', () => {
    const d = deriveCharacterStats(bardChar(2, {
      skillProficiencies: { athletics: 'proficient', deception: 'expertise' },
    }), { classes: [bard], classFeatureEffects: JOAT_CFE as never })
    expect(d.skillModifiers.athletics).toBe(2)  // STR +0 + PB 2 — no half row
    expect(d.skillModifiers.deception).toBe(4)  // CHA +0 + 2×PB
    expect(d.breakdowns.skills.athletics.some(s => /Jack of All Trades/.test(s.label))).toBe(false)
    expect(d.breakdowns.skills.deception.some(s => /Jack of All Trades/.test(s.label))).toBe(false)
  })

  it('bard 2: initiative gains floor(PB/2) with a provenance row; bard 1 gains nothing', () => {
    const d2 = deriveCharacterStats(bardChar(), { classes: [bard], classFeatureEffects: JOAT_CFE as never })
    expect(d2.effectiveInitiative).toBe(1) // DEX +0 + 1
    expect(d2.breakdowns.initiative.some(s => s.id === 'feature:half-prof:initiative')).toBe(true)
    const d1 = deriveCharacterStats(bardChar(1), { classes: [bard], classFeatureEffects: JOAT_CFE as never })
    expect(d1.effectiveInitiative).toBe(0)
    expect(d1.abilityCheckBonuses.str).toBeUndefined()
  })

  it('bard 2: passive perception includes the half-proficiency when not proficient', () => {
    const d = deriveCharacterStats(bardChar(), { classes: [bard], classFeatureEffects: JOAT_CFE as never })
    expect(d.passivePerception).toBe(11) // 10 + WIS 0 + 1
  })

  it('bard 2: raw ability checks read abilityCheckBonuses (dice-store modifier + total)', () => {
    const d = deriveCharacterStats(bardChar(), { classes: [bard], classFeatureEffects: JOAT_CFE as never })
    expect(d.abilityCheckBonuses.str).toEqual({ amount: 1, label: 'Jack of All Trades' })
    const entry = useDiceStore.getState().roll({ type: 'ability', ability: 'str' }, d)
    expect(entry.result.modifier).toBe(1)
    expect(entry.result.total).toBe(entry.result.natural + 1)
  })

  it('champion 7: ceil(PB/2) on STR/DEX/CON checks only; champion 6 gets nothing (fighter-level gate)', () => {
    const d7 = deriveCharacterStats(championChar(), { classes: [fighter], classFeatureEffects: RA_CFE as never })
    expect(d7.skillModifiers.athletics).toBe(2)   // STR +0 + ceil(3/2)
    expect(d7.skillModifiers.arcana).toBe(0)      // INT — not covered by Remarkable Athlete
    expect(d7.abilityCheckBonuses.con?.amount).toBe(2)
    expect(d7.abilityCheckBonuses.int).toBeUndefined()
    expect(d7.effectiveInitiative).toBe(2)        // initiative is a DEX check
    const d6 = deriveCharacterStats(championChar(6), { classes: [fighter], classFeatureEffects: RA_CFE as never })
    expect(d6.skillModifiers.athletics).toBe(0)
  })

  it('bard 2 / champion 7 multiclass: overlapping grants take the larger, never the sum', () => {
    const d = deriveCharacterStats(charWith({
      level: 9,
      classes: [
        { classSlug: 'bard', subclassSlug: null, level: 2 },
        { classSlug: 'fighter', subclassSlug: 'champion', level: 7 },
      ],
    }), { classes: [bard, fighter], classFeatureEffects: { ...JOAT_CFE, ...RA_CFE } as never })
    // Total level 9 → PB +4: JoAT floor = 2, RA ceil = 2 → best is 2, NOT 4.
    expect(d.skillModifiers.athletics).toBe(2)
    expect(d.abilityCheckBonuses.str?.amount).toBe(2)
    expect(d.abilityCheckBonuses.int?.amount).toBe(2) // JoAT-only ability still covered
  })

  it('the JoAT skill row is ledger-disableable', () => {
    const d = deriveCharacterStats(bardChar(2, {
      ledgerOverrides: { disabled: ['feature:half-prof:skill-athletics'], overrides: {}, custom: {} },
    }), { classes: [bard], classFeatureEffects: JOAT_CFE as never })
    expect(d.skillModifiers.athletics).toBe(0) // post-ledger value drops the disabled +1
  })
})
