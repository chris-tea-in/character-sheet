import { generateId } from './uuid'
import type { AbilityName, Character } from '@/types/character'
import type { EquipmentData, WeaponItem, ArmorItem, FeatData } from '@/types/data'

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
  character: Pick<Character, 'customWeapons' | 'customArmor'>,
): EquipmentData | null {
  if (!catalog) return catalog
  const cw = character.customWeapons ?? []
  const ca = character.customArmor ?? []
  if (cw.length === 0 && ca.length === 0) return catalog
  return {
    ...catalog,
    weapons: [...(catalog.weapons ?? []), ...cw],
    armor: [...(catalog.armor ?? []), ...ca],
  }
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
  }
}

export interface CustomArmorInput {
  name: string
  armorType: ArmorItem['armor_type']
  acFormula: string
  stealthDisadvantage: boolean
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
