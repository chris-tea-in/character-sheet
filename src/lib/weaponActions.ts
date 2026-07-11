// Single-point weapon attack assembly. WeaponRow (EquipmentBlock) and the Combat
// tab both consume this module, so to-hit/damage numbers and roll payloads can
// never drift between the two surfaces — the known dual-computation bug family
// (bugs.md systemic table). Everything here was extracted verbatim from
// EquipmentBlock's WeaponRow/renderRow glue; keep it the ONLY place that turns a
// weapon + item into displayed stats and dice payloads.

import { useRollDispatch } from './useRollDispatch'
import { computeWeaponBonus, applyLedger } from './characterStats'
import { formatBonus } from './dice'
import { mergeCustomEquipment } from './customContent'
import type { DerivedStats } from './characterStats'
import type { Character, EquipmentItem } from '../types/character'
import type { ArmorItem, EquipmentData, WeaponItem, WondrousItem } from '../types/data'

// ── Catalog lookups shared by EquipmentBlock and the Combat tab ────────────────

export interface CatalogMaps {
  weaponByName: Map<string, WeaponItem>
  armorByName: Map<string, ArmorItem>
  wondrousItemByName: Map<string, WondrousItem>
}

export function buildCatalogMaps(catalog: EquipmentData | null): CatalogMaps {
  return {
    weaponByName: new Map((catalog?.weapons ?? []).map(w => [w.name.toLowerCase(), w])),
    armorByName: new Map((catalog?.armor ?? []).map(a => [a.name.toLowerCase(), a])),
    wondrousItemByName: new Map((catalog?.wondrous_items ?? []).map(w => [w.name.toLowerCase(), w])),
  }
}

/**
 * Does a melee weapon auto-qualify for Great Weapon Fighting? RAW: a melee weapon
 * wielded with two hands — i.e. Two-Handed, or Versatile (used two-handed, which the
 * app can't know, so Versatile always qualifies). Property tokens are matched by
 * SUBSTRING because the catalog stores Versatile with its die notation
 * ("Versatile (1d8)"), never a bare `versatile` token — an exact-match `.includes`
 * was always false for every mundane versatile weapon (Longsword, Battleaxe, Warhammer,
 * Quarterstaff, Spear, Trident), so GWF never auto-applied to them (BUG-93). Mirrors the
 * substring matching in computeFeatureWeaponBonus.
 */
export function weaponAutoQualifiesForGwf(weapon: WeaponItem): boolean {
  if (!weapon.weapon_type.toLowerCase().includes('melee')) return false
  const props = weapon.properties.map(p => p.toLowerCase())
  return props.some(p => p.includes('two-handed')) || props.some(p => p.includes('versatile'))
}

/** Does this item's catalog entry require attunement? (attune-required items gate
 * their effects on `attuned`; everything else on `equipped`.) Lookup order matches
 * the sheet: wondrous → armor → weapon. */
export function requiresAttunement(maps: CatalogMaps, name: string): boolean {
  const n = name.toLowerCase()
  const w = maps.wondrousItemByName.get(n)
  if (w) return w.attunement
  const a = maps.armorByName.get(n)
  if (a) return a.attunement ?? false
  const wp = maps.weaponByName.get(n)
  if (wp) return wp.attunement ?? false
  return false
}

/** An item is "active" (its effects apply) when the gate matching its type is set. */
export function isItemActive(maps: CatalogMaps, item: EquipmentItem): boolean {
  return requiresAttunement(maps, item.name) ? !!item.attuned : !!item.equipped
}

// ── Weapon resolution ──────────────────────────────────────────────────────────

// Parse a free-form custom damage string ("2d6+4 fire") into roll components.
// Falls back to null when no dice notation is present.
export function parseCustomDamage(s: string): { damageDice: string; damageBonus: number; damageType: string } | null {
  const m = s.match(/(\d+d\d+)\s*([+-]\s*\d+)?\s*([a-zA-Z]+)?/)
  if (!m) return null
  return {
    damageDice: m[1],
    damageBonus: m[2] ? parseInt(m[2].replace(/\s+/g, ''), 10) : 0,
    damageType: m[3] ?? '',
  }
}

// A magic weapon built on "any sword / any weapon / …" has no fixed base — the
// player chooses the mundane weapon it's forged from (EquipmentItem.baseWeapon).
export function isVariableBaseWeapon(w: WeaponItem): boolean {
  if (!w.magical) return false
  if (w.weapon_type === 'Varies') return true
  return /\bany\b/i.test(w.base_weapon_type ?? '')
}

/** Resolve the weapon whose dice/type/properties actually apply for this item:
 * variable-base magic weapons take the player-chosen mundane base; specific-base
 * magic weapons with null damage inherit their named base's dice. */
export function resolveEffectiveWeapon(
  weapon: WeaponItem,
  item: EquipmentItem,
  weaponByName: Map<string, WeaponItem>,
): { weapon: WeaponItem; variableBase: boolean } {
  const variableBase = isVariableBaseWeapon(weapon)
  let effWeapon = weapon
  if (variableBase && item.baseWeapon) {
    const base = weaponByName.get(item.baseWeapon.toLowerCase())
    if (base) {
      effWeapon = {
        ...weapon,
        damage_dice: base.damage_dice,
        damage_type: base.damage_type,
        properties: base.properties,
        weapon_type: base.weapon_type,
      }
    }
  } else if (!variableBase && weapon.damage_dice == null && weapon.base_weapon_type) {
    // Specific-base magic weapons (e.g. Mace of Smiting → "mace") that ship with a
    // null damage_dice inherit the named base weapon's dice/type so they display and
    // roll correctly instead of showing "—". No player choice — the base is fixed.
    const base = weaponByName.get(weapon.base_weapon_type.toLowerCase())
    if (base?.damage_dice) {
      effWeapon = {
        ...weapon,
        damage_dice: base.damage_dice,
        damage_type: weapon.damage_type ?? base.damage_type,
        properties: weapon.properties.length ? weapon.properties : base.properties,
        weapon_type: weapon.weapon_type && weapon.weapon_type !== 'Varies' ? weapon.weapon_type : base.weapon_type,
      }
    }
  }
  return { weapon: effWeapon, variableBase }
}

/** Every top-level (not stowed in a container) weapon the character carries, with
 * its effective base resolved and its active state. `catalog` is the base/campaign
 * catalog — the character's custom weapons merge in here, same as the sheet. */
export interface CharacterWeapon {
  item: EquipmentItem
  weapon: WeaponItem
  active: boolean
}

export function characterWeapons(character: Character, catalog: EquipmentData | null): CharacterWeapon[] {
  const maps = buildCatalogMaps(mergeCustomEquipment(catalog, character))
  const out: CharacterWeapon[] = []
  for (const item of character.equipment) {
    if (item.containerId) continue
    const w = maps.weaponByName.get(item.name.toLowerCase())
    if (!w) continue
    out.push({
      item,
      weapon: resolveEffectiveWeapon(w, item, maps.weaponByName).weapon,
      active: isItemActive(maps, item),
    })
  }
  return out
}

// ── The assembly ───────────────────────────────────────────────────────────────

export interface WeaponAssembly {
  calc: ReturnType<typeof computeWeaponBonus>
  atkLedger: ReturnType<typeof applyLedger>
  dmgLedger: ReturnType<typeof applyLedger>
  ledgerToHit: number
  ledgerDamageBonus: number
  /** Ledger-adjusted computed strings — the baseline "custom stats" compare against. */
  computedToHit: string
  computedDamage: string
  /** What the row shows (custom override wins, rider suffix appended to damage). */
  displayToHit: string
  displayDamage: string
  rollModifier: number
  rollDamageDice: string
  rollDamageBonus: number
  rollDamageType: string
  riderDamage: { dice: string; damageType: string }[]
  riderSuffix: string
  gwfAuto: boolean
  gwfActive: boolean
  gwfReroll: number | undefined
  rollHit: () => void
  rollDamage: () => void
}

export function useWeaponActions(character: Character, derived: DerivedStats) {
  const { dispatch, dispatchDamage } = useRollDispatch(derived)

  function assemble(item: EquipmentItem, weapon: WeaponItem, active: boolean): WeaponAssembly {
    const calc = computeWeaponBonus(weapon, character, derived.weaponProficiencies, derived.effectiveAbilities, derived.itemDamageBonus, derived.featureWeaponEffects, derived.itemAttackBonus, item.id)
    // Per-weapon Modifier Ledger (P4): disable/augment contributors. Applied at render
    // (INV-1) via the same pure helper as every other stat; the override cascades into
    // both the displayed value and the dice roll. The custom to-hit/damage string
    // override (Edit stats) still takes final precedence when set.
    const atkLedger = applyLedger(`weaponAttack:${item.id}`, calc.attackBreakdown, character.ledgerOverrides)
    const dmgLedger = applyLedger(`weaponDamage:${item.id}`, calc.damageBreakdown, character.ledgerOverrides)
    const ledgerToHit = atkLedger.effective
    const ledgerDamageBonus = dmgLedger.effective
    const computedToHit = formatBonus(ledgerToHit)
    const computedDamage = `${calc.damageDice || '—'}${ledgerDamageBonus ? formatBonus(ledgerDamageBonus) : ''} ${calc.damageType}`.trim()
    // Rider damage of another type (Flame Tongue → +2d6 fire) applies only while the
    // weapon is active (equipped/attuned per its requirement); crit doubles it.
    const riderDamage = active
      ? (weapon.effects ?? []).flatMap(e => e.type === 'damage_dice' ? [{ dice: e.dice, damageType: e.damageType }] : [])
      : []
    const riderSuffix = riderDamage.map(r => `+${r.dice} ${r.damageType}`).join(' ')
    const displayToHit = item.customToHit ?? computedToHit
    const displayDamage = (item.customDamage ?? computedDamage) + (riderSuffix ? ` ${riderSuffix}` : '')
    const rollModifier = item.customToHit !== undefined
      ? (parseInt(item.customToHit.replace(/^\+/, ''), 10) || 0)
      : ledgerToHit
    // Honor a custom damage override when it parses; otherwise use ledger-adjusted values (BUG-20)
    const customDmg = item.customDamage ? parseCustomDamage(item.customDamage) : null
    const rollDamageDice = customDmg?.damageDice ?? calc.damageDice
    const rollDamageBonus = customDmg?.damageBonus ?? ledgerDamageBonus
    const rollDamageType = customDmg?.damageType || calc.damageType
    // Great Weapon Fighting: reroll 1s/2s on a two-handed (or versatile) melee weapon's
    // damage dice. Auto-qualification is substring-based (see weaponAutoQualifiesForGwf —
    // BUG-93). Homebrew per-weapon override (item.gwf) still forces GWF on any weapon.
    const gwfAuto = derived.greatWeaponFighting && weaponAutoQualifiesForGwf(weapon)
    const gwfActive = gwfAuto || !!item.gwf
    const gwfReroll = gwfActive ? 2 : undefined

    const rollHit = () => dispatch({ type: 'attack', label: item.name, modifier: rollModifier, damageDice: rollDamageDice, damageBonus: rollDamageBonus, damageType: rollDamageType, extraDamage: riderDamage, rerollBelow: gwfReroll, bonuses: item.customToHit !== undefined ? [{ label: 'Custom to-hit', amount: rollModifier }] : atkLedger.rows.filter(r => !r.disabled).map(r => ({ label: r.label, amount: r.amount })) })
    const rollDamage = () => dispatchDamage({ label: item.name, baseDice: rollDamageDice, damageBonus: rollDamageBonus, damageType: rollDamageType, extraDamage: riderDamage, rerollBelow: gwfReroll })

    return {
      calc, atkLedger, dmgLedger, ledgerToHit, ledgerDamageBonus,
      computedToHit, computedDamage, displayToHit, displayDamage,
      rollModifier, rollDamageDice, rollDamageBonus, rollDamageType,
      riderDamage, riderSuffix, gwfAuto, gwfActive, gwfReroll,
      rollHit, rollDamage,
    }
  }

  return { assemble }
}
