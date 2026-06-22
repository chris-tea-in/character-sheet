import { describe, it, expect } from 'vitest'
import {
  mergeCustomEquipment, mergeCustomFeats, mergeCustomSpells, mergeCustomRaces, resolveRace,
  mergeCampaignEquipment,
  buildCustomWeapon, buildCustomArmor, buildCustomFeat,
  buildCustomWondrous, buildCustomTool, buildCustomSpell, buildAcFormula,
} from './customContent'
import { computeFeatStatDelta } from './characterStats'
import type { EquipmentData, WeaponItem, ArmorItem, FeatData, SpellData, Race, WondrousItem } from '../types/data'

const weapon = (name: string): WeaponItem => ({
  name, category: 'weapon', weapon_type: 'Martial Melee',
  damage_dice: '1d8', damage_type: 'slashing', properties: [],
})
const armor = (name: string): ArmorItem => ({
  name, category: 'armor', armor_type: 'Heavy', ac_formula: '18',
  stealth_disadvantage: true, strength_requirement: null,
})
const noCustom = { customWeapons: [], customArmor: [], customItems: [], customTools: [] }

describe('mergeCustomEquipment', () => {
  const base: EquipmentData = { weapons: [weapon('Longsword')], armor: [armor('Plate')] }

  it('appends custom weapons, armor, wondrous items, and tools', () => {
    const merged = mergeCustomEquipment(base, {
      ...noCustom,
      customWeapons: [weapon('Storm Blade')],
      customArmor: [armor('Dragonscale')],
      customItems: [buildCustomWondrous({ name: 'Lucky Coin', description: 'reroll' })],
      customTools: [buildCustomTool({ name: 'Glassblower', toolCategory: "Artisan's Tools" })],
    })!
    expect(merged.weapons!.map(w => w.name)).toEqual(['Longsword', 'Storm Blade'])
    expect(merged.armor!.map(a => a.name)).toEqual(['Plate', 'Dragonscale'])
    expect(merged.wondrous_items!.map(w => w.name)).toEqual(['Lucky Coin'])
    expect(merged.tools!.map(t => t.name)).toEqual(['Glassblower'])
  })

  it('returns the base catalog unchanged when there is nothing custom', () => {
    expect(mergeCustomEquipment(base, noCustom)).toBe(base)
  })

  it('passes null through (catalog still loading)', () => {
    expect(mergeCustomEquipment(null, { ...noCustom, customWeapons: [weapon('x')] })).toBeNull()
  })
})

describe('mergeCampaignEquipment (#12)', () => {
  const base: EquipmentData = { weapons: [weapon('Longsword')], armor: [armor('Plate')], wondrous_items: [] }
  const charm = (): WondrousItem => ({ name: 'DM Charm', category: 'wondrous_item', rarity: 'Rare', attunement: false })

  it('routes DM items into the right catalog sections by their category', () => {
    const merged = mergeCampaignEquipment(base, [
      { data: weapon('DM Blade') },
      { data: armor('DM Plate') },
      { data: charm() },
    ])!
    expect(merged.weapons!.map(w => w.name)).toEqual(['Longsword', 'DM Blade'])
    expect(merged.armor!.map(a => a.name)).toEqual(['Plate', 'DM Plate'])
    expect(merged.wondrous_items!.map(w => w.name)).toEqual(['DM Charm'])
  })

  it('returns base unchanged when empty, and passes null through', () => {
    expect(mergeCampaignEquipment(base, [])).toBe(base)
    expect(mergeCampaignEquipment(null, [{ data: weapon('x') }])).toBeNull()
  })
})

describe('mergeCustomSpells', () => {
  const spell = (slug: string, name: string): SpellData =>
    ({ slug, name, level: 1, description: '' } as unknown as SpellData)
  const base = { fireball: spell('fireball', 'Fireball') }

  it('merges custom spells keyed by their custom slug', () => {
    const cs = spell('custom:1', 'Arc Bolt')
    const merged = mergeCustomSpells(base, [cs])!
    expect(Object.keys(merged).sort()).toEqual(['custom:1', 'fireball'])
    expect(merged['custom:1'].name).toBe('Arc Bolt')
  })

  it('returns base when no custom spells', () => {
    expect(mergeCustomSpells(base, [])).toBe(base)
  })
})

describe('mergeCustomRaces', () => {
  const race = (slug: string, name: string): Race =>
    ({ slug, name, description: '', base: {} as Race['base'], subraces: [] })
  const base = { elf: race('elf', 'Elf') }

  it('merges custom races; a slug collision lets the custom race win (#10 override)', () => {
    const custom = race('elf', 'Homebrew Elf')
    const merged = mergeCustomRaces(base, [custom])!
    expect(merged['elf'].name).toBe('Homebrew Elf')
  })

  it('returns base when no custom races', () => {
    expect(mergeCustomRaces(base, [])).toBe(base)
  })
})

describe('resolveRace', () => {
  const race = (slug: string, name: string): Race =>
    ({ slug, name, description: '', base: {} as Race['base'], subraces: [] })
  const races = { elf: race('elf', 'Elf') }

  it('returns the built-in when no custom override', () => {
    expect(resolveRace('elf', races, [])!.name).toBe('Elf')
  })
  it('prefers a custom race with the same slug (#10 edit override)', () => {
    expect(resolveRace('elf', races, [race('elf', 'Homebrew Elf')])!.name).toBe('Homebrew Elf')
  })
  it('finds a purely custom race not in the catalog (#11)', () => {
    expect(resolveRace('custom-race:1', races, [race('custom-race:1', 'Starborn')])!.name).toBe('Starborn')
  })
  it('returns null for an empty slug or unknown race', () => {
    expect(resolveRace('', races, [])).toBeNull()
    expect(resolveRace('dwarf', races, [])).toBeNull()
  })
})

describe('mergeCustomFeats', () => {
  const base: Record<string, FeatData> = {
    tough: { name: 'Tough', slug: 'tough', prerequisites: [], description: '' },
  }

  it('merges custom feats keyed by slug', () => {
    const cf: FeatData = { name: 'Iron Will', slug: 'custom:1', prerequisites: [], description: '' }
    const merged = mergeCustomFeats(base, [cf])!
    expect(Object.keys(merged).sort()).toEqual(['custom:1', 'tough'])
    expect(merged['custom:1'].name).toBe('Iron Will')
  })

  it('returns base when no custom feats', () => {
    expect(mergeCustomFeats(base, [])).toBe(base)
    expect(mergeCustomFeats(base, undefined)).toBe(base)
  })
})

describe('buildCustomWeapon', () => {
  it('builds a valid mundane weapon, nulling empty damage', () => {
    const w = buildCustomWeapon({
      name: '  Net ', weaponType: 'Martial Ranged', damageDice: '', damageType: '', properties: ['Thrown'],
    })
    expect(w).toMatchObject({
      name: 'Net', category: 'weapon', weapon_type: 'Martial Ranged',
      damage_dice: null, damage_type: null, properties: ['Thrown'], magical: false,
    })
  })

  it('keeps provided damage dice/type', () => {
    const w = buildCustomWeapon({
      name: 'Storm Blade', weaponType: 'Martial Melee', damageDice: '1d10', damageType: 'lightning', properties: ['Finesse'],
    })
    expect(w.damage_dice).toBe('1d10')
    expect(w.damage_type).toBe('lightning')
  })
})

describe('buildCustomArmor', () => {
  it('categorizes a shield as category "shield"', () => {
    const a = buildCustomArmor({ name: 'Aegis', armorType: 'Shield', acFormula: '+2', stealthDisadvantage: false })
    expect(a.category).toBe('shield')
    expect(a.armor_type).toBe('Shield')
  })
  it('categorizes body armor as category "armor"', () => {
    const a = buildCustomArmor({ name: 'Dragonscale', armorType: 'Heavy', acFormula: '18', stealthDisadvantage: true })
    expect(a).toMatchObject({ category: 'armor', armor_type: 'Heavy', ac_formula: '18', stealth_disadvantage: true, magical: false })
  })
})

describe('buildCustomFeat', () => {
  it('has no effects when no ASI is chosen', () => {
    const f = buildCustomFeat({ name: 'Lorekeeper', description: 'knows things' })
    expect(f.slug.startsWith('custom:')).toBe(true)
    expect(f.effects).toBeUndefined()
  })

  it('attaches a fixed ASI that flows through computeFeatStatDelta', () => {
    const f = buildCustomFeat({ name: 'Iron Will', description: '', asiAbility: 'con', asiAmount: 1 })
    expect(f.effects).toEqual([{ type: 'asi', subtype: 'fixed', ability: 'constitution', amount: 1 }])
    const delta = computeFeatStatDelta(f.slug, f, {})
    expect(delta.abilities.con).toBe(1)
  })

  it('drops the ASI when amount is 0', () => {
    const f = buildCustomFeat({ name: 'x', description: '', asiAbility: 'str', asiAmount: 0 })
    expect(f.effects).toBeUndefined()
  })
})

describe('descriptions on custom weapons/armor (#6b)', () => {
  it('weapon stores a trimmed description, omits when blank', () => {
    expect(buildCustomWeapon({ name: 'A', weaponType: 'Martial Melee', damageDice: '', damageType: '', properties: [], description: '  glows  ' }).description).toBe('glows')
    expect(buildCustomWeapon({ name: 'A', weaponType: 'Martial Melee', damageDice: '', damageType: '', properties: [] }).description).toBeUndefined()
  })
  it('armor stores a trimmed description', () => {
    expect(buildCustomArmor({ name: 'A', armorType: 'Heavy', acFormula: '18', stealthDisadvantage: false, description: 'scaly' }).description).toBe('scaly')
  })
})

describe('buildCustomWondrous / Tool / Spell', () => {
  it('wondrous item defaults rarity/attunement and keeps a description', () => {
    const w = buildCustomWondrous({ name: 'Lucky Coin', description: 'reroll a d20' })
    expect(w).toMatchObject({ name: 'Lucky Coin', category: 'wondrous_item', rarity: 'Common', attunement: false, source: 'Custom', description: 'reroll a d20' })
  })
  it('tool carries its category', () => {
    expect(buildCustomTool({ name: 'Glassblower', toolCategory: "Artisan's Tools" }))
      .toMatchObject({ name: 'Glassblower', category: 'tool', tool_category: "Artisan's Tools" })
  })
  it('spell gets a custom slug and fills component flags', () => {
    const s = buildCustomSpell({
      name: 'Arc Bolt', level: 1, school: 'Evocation', castingTime: '1 action', range: '60 feet',
      components: { verbal: true, somatic: false, material: false }, duration: 'Instantaneous',
      concentration: false, ritual: false, description: 'zap', classes: ['wizard'],
    })
    expect(s.slug.startsWith('custom:')).toBe(true)
    expect(s).toMatchObject({ name: 'Arc Bolt', level: 1, classes: ['wizard'] })
    expect(s.components).toMatchObject({ verbal: true, somatic: false, material: false, material_text: null })
  })
})

describe('buildAcFormula (#5 — generates parseArmorAC grammar)', () => {
  it('base only', () => {
    expect(buildAcFormula('Heavy', 18, false, null, 0)).toBe('18')
  })
  it('base + uncapped Dex', () => {
    expect(buildAcFormula('Light', 11, true, null, 0)).toBe('11 + Dex modifier')
  })
  it('base + capped Dex', () => {
    expect(buildAcFormula('Medium', 14, true, 2, 0)).toBe('14 + Dex modifier (max 2)')
  })
  it('base + capped Dex + magic bonus', () => {
    expect(buildAcFormula('Medium', 14, true, 2, 1)).toBe('14 + Dex modifier (max 2) + 1')
  })
  it('shield is a pure flat bonus', () => {
    expect(buildAcFormula('Shield', 2, false, null, 0)).toBe('+2')
  })
})
