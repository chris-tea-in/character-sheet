import { generateId } from './uuid'
import type { AbilityName, Character } from '@/types/character'
import type { EquipmentData, WeaponItem, ArmorItem, FeatData, WondrousItem, ToolItem, SpellData, Race, ItemEffect } from '@/types/data'

// Homebrew custom content: per-character, catalog-shaped weapon/armor/feat
// definitions stored on the Character (customWeapons/customArmor/customFeats).
// These helpers fold them into the equipment catalog / feat data at render time so
// their stats derive through the exact same paths as built-in entries (INV-1) — no
// write-time baking, no second derivation path.

const SHORT_TO_FULL_ABILITY: Record<AbilityName, string> = {
  str: 'strength', dex: 'dexterity', con: 'constitution',
  int: 'intelligence', wis: 'wisdom', cha: 'charisma',
}

// ── Render-time merge ─────────────────────────────────────────────────────────

/**
 * The equipment catalog with the character's homebrew weapons/armor appended, so
 * the sheet blocks AND `deriveCharacterStats` resolve them by name exactly like
 * built-ins (AC formulas, weapon attack/damage). Returns the base catalog
 * unchanged when there's nothing custom; passes `null` through while it loads.
 */
export function mergeCustomEquipment(
  catalog: EquipmentData | null,
  character: Pick<Character, 'customWeapons' | 'customArmor' | 'customItems' | 'customTools'>,
): EquipmentData | null {
  if (!catalog) return catalog
  const cw = character.customWeapons ?? []
  const ca = character.customArmor ?? []
  const ci = character.customItems ?? []
  const ct = character.customTools ?? []
  if (cw.length === 0 && ca.length === 0 && ci.length === 0 && ct.length === 0) return catalog
  return {
    ...catalog,
    weapons: [...(catalog.weapons ?? []), ...cw],
    armor: [...(catalog.armor ?? []), ...ca],
    wondrous_items: [...(catalog.wondrous_items ?? []), ...ci],
    tools: [...(catalog.tools ?? []), ...ct],
  }
}

/**
 * The spell map with the character's homebrew spells merged in (keyed by their
 * `custom:<uuid>` slug, which never collides with a catalog slug), so the spell
 * list, pickers, and damage/heal classification resolve them like built-ins.
 */
export function mergeCustomSpells(
  allSpells: Record<string, SpellData> | null,
  customSpells: SpellData[] | undefined,
): Record<string, SpellData> | null {
  if (!allSpells) return allSpells
  const cs = customSpells ?? []
  if (cs.length === 0) return allSpells
  const merged = { ...allSpells }
  for (const s of cs) merged[s.slug] = s
  return merged
}

/**
 * The race map with the character's homebrew races merged in (keyed by slug).
 * A custom race whose slug matches a built-in WINS — that's how "edit an existing
 * race" works: it forks the built-in into a per-character override (#10/#11).
 */
export function mergeCustomRaces(
  races: Record<string, Race> | null,
  customRaces: Race[] | undefined,
): Record<string, Race> | null {
  if (!races) return races
  const cr = customRaces ?? []
  if (cr.length === 0) return races
  const merged = { ...races }
  for (const r of cr) merged[r.slug] = r
  return merged
}

/**
 * Resolve a race by slug, custom-first: a per-character `customRaces` entry wins
 * over the built-in catalog (that's how "edit a built-in race" works — fork it
 * into customRaces under the same slug, #10). Use this at EVERY race lookup that
 * feeds the sheet (render + display) so a custom race's stats and name never
 * disagree across the UI.
 */
export function resolveRace(
  slug: string,
  races: Record<string, Race> | null | undefined,
  customRaces: Race[] | undefined,
): Race | null {
  if (!slug) return null
  const custom = (customRaces ?? []).find(r => r.slug === slug)
  if (custom) return custom
  return races?.[slug] ?? null
}

/**
 * The catalog with a campaign's DM-created shared items folded in (#12). Same
 * append-at-render pattern as the per-character custom merge, but the source is
 * the campaign and it affects every member. Routes each def by its own `category`.
 * The caller is responsible for only passing items whose campaign matches the
 * character; merge order is base → campaign → per-character custom.
 */
export function mergeCampaignEquipment(
  catalog: EquipmentData | null,
  items: ReadonlyArray<{ data: WeaponItem | ArmorItem | WondrousItem }> | undefined,
): EquipmentData | null {
  if (!catalog) return catalog
  const list = items ?? []
  if (list.length === 0) return catalog
  const weapons = [...(catalog.weapons ?? [])]
  const armor = [...(catalog.armor ?? [])]
  const wondrous = [...(catalog.wondrous_items ?? [])]
  for (const { data } of list) {
    if (data.category === 'weapon') weapons.push(data)
    else if (data.category === 'armor' || data.category === 'shield') armor.push(data)
    else if (data.category === 'wondrous_item') wondrous.push(data)
  }
  return { ...catalog, weapons, armor, wondrous_items: wondrous }
}

/**
 * Feat data with the character's homebrew feats merged in (keyed by slug), so
 * FeatsBlock lists/views them and `computeFeatStatDelta` derives their effects.
 */
export function mergeCustomFeats(
  featData: Record<string, FeatData> | null,
  customFeats: FeatData[] | undefined,
): Record<string, FeatData> | null {
  if (!featData) return featData
  const cf = customFeats ?? []
  if (cf.length === 0) return featData
  const merged = { ...featData }
  for (const f of cf) merged[f.slug] = f
  return merged
}

// ── Builders ──────────────────────────────────────────────────────────────────
// Turn a small form payload into a valid catalog-shaped definition, filling the
// fields the form doesn't capture with safe defaults (mundane, no source rules).

export interface CustomWeaponInput {
  name: string
  weaponType: WeaponItem['weapon_type']
  damageDice: string
  damageType: string
  properties: string[]
  description?: string
  effects?: ItemEffect[]
}

export function buildCustomWeapon(input: CustomWeaponInput): WeaponItem {
  return {
    name: input.name.trim(),
    category: 'weapon',
    weapon_type: input.weaponType,
    damage_dice: input.damageDice.trim() || null,
    damage_type: input.damageType.trim() || null,
    properties: input.properties,
    magical: false,
    source: 'Custom',
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.effects?.length ? { effects: input.effects } : {}),
  }
}

export interface CustomArmorInput {
  name: string
  armorType: ArmorItem['armor_type']
  acFormula: string
  stealthDisadvantage: boolean
  description?: string
  effects?: ItemEffect[]
}

export function buildCustomArmor(input: CustomArmorInput): ArmorItem {
  return {
    name: input.name.trim(),
    category: input.armorType === 'Shield' ? 'shield' : 'armor',
    armor_type: input.armorType,
    ac_formula: input.acFormula.trim(),
    stealth_disadvantage: input.stealthDisadvantage,
    strength_requirement: null,
    magical: false,
    source: 'Custom',
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.effects?.length ? { effects: input.effects } : {}),
  }
}

// Generate the `ac_formula` string in the exact grammar parseArmorAC understands,
// from the friendly AC-builder inputs (#5). Shields are a pure flat bonus ("+2").
export function buildAcFormula(
  armorType: ArmorItem['armor_type'],
  base: number,
  addsDex: boolean,
  dexCap: number | null,
  flatBonus: number,
): string {
  if (armorType === 'Shield') return `+${base}`
  let f = `${base}`
  if (addsDex) f += dexCap != null ? ` + Dex modifier (max ${dexCap})` : ' + Dex modifier'
  if (flatBonus) f += ` + ${flatBonus}`
  return f
}

export interface CustomItemInput {
  name: string
  rarity?: WondrousItem['rarity']
  attunement?: boolean
  description: string
  effects?: ItemEffect[]
}

export function buildCustomWondrous(input: CustomItemInput): WondrousItem {
  return {
    name: input.name.trim(),
    category: 'wondrous_item',
    rarity: input.rarity ?? 'Common',
    attunement: input.attunement ?? false,
    source: 'Custom',
    ...(input.description.trim() ? { description: input.description.trim() } : {}),
    ...(input.effects?.length ? { effects: input.effects } : {}),
  }
}

export interface CustomToolInput {
  name: string
  toolCategory: ToolItem['tool_category']
}

export function buildCustomTool(input: CustomToolInput): ToolItem {
  return {
    name: input.name.trim(),
    category: 'tool',
    tool_category: input.toolCategory,
    cost: null,
    weight: null,
  }
}

export interface CustomSpellInput {
  name: string
  level: number
  school: string
  castingTime: string
  range: string
  components: { verbal: boolean; somatic: boolean; material: boolean; materialText?: string }
  duration: string
  concentration: boolean
  ritual: boolean
  description: string
  classes: string[]
}

export function buildCustomSpell(input: CustomSpellInput): SpellData {
  return {
    name: input.name.trim(),
    slug: `custom:${generateId()}`,
    level: input.level,
    school: input.school.trim() || 'evocation',
    casting_time: input.castingTime.trim() || '1 action',
    range: input.range.trim() || 'Self',
    components: {
      verbal: input.components.verbal,
      somatic: input.components.somatic,
      material: input.components.material,
      material_text: input.components.materialText?.trim() || null,
    },
    duration: input.duration.trim() || 'Instantaneous',
    concentration: input.concentration,
    ritual: input.ritual,
    description: input.description.trim(),
    at_higher_levels: null,
    classes: input.classes,
  }
}

export interface CustomFeatInput {
  name: string
  description: string
  asiAbility?: AbilityName | null
  asiAmount?: number
}

export function buildCustomFeat(input: CustomFeatInput): FeatData {
  // Only attach an effect when a real ASI was chosen; the ability is stored as the
  // full lowercase name so computeFeatStatDelta's ABILITY_FULL_TO_SHORT lookup hits.
  const hasAsi = !!input.asiAbility && (input.asiAmount ?? 0) !== 0
  const feat: FeatData = {
    name: input.name.trim(),
    slug: `custom:${generateId()}`,
    prerequisites: [],
    description: input.description.trim(),
  }
  if (hasAsi) {
    feat.effects = [{
      type: 'asi',
      subtype: 'fixed',
      ability: SHORT_TO_FULL_ABILITY[input.asiAbility!],
      amount: input.asiAmount!,
    }]
  }
  return feat
}
