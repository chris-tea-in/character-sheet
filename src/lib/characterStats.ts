import { abilityModifier, proficiencyBonus } from './dice'
import type { Character } from '../types/character'
import type { ArmorItem, WeaponItem, ClassData } from '../types/data'

export interface WeaponBonus {
  toHit: string
  damage: string
  damageDice: string
  damageBonus: number
  damageType: string
  abilityLabel: string
  toHitModifier: number
}

export interface DerivedStats {
  effectiveAC: number | null  // null when armor catalog unavailable
  adjustedMaxHp: number
}

// ── Feat effect registry ────────────────────────────────────────────────────

interface FeatEffect {
  maxHpBonus?: (level: number) => number
}

const FEAT_EFFECTS: Partial<Record<string, FeatEffect>> = {
  'tough': { maxHpBonus: level => level * 2 },
}

// ── AC formula parser ────────────────────────────────────────────────────────
// Handles: "18", "+2", "11 + DEX modifier", "13 + DEX modifier (max 2)"

function parseArmorAC(formula: string, dexMod: number): number {
  const trimmed = formula.trim()

  // Shield: "+2"
  if (trimmed.startsWith('+')) {
    return parseInt(trimmed.slice(1), 10) || 0
  }

  const deхPattern = /^(\d+)\s*\+\s*DEX modifier(\s*\(max\s*(\d+)\))?$/i
  const match = trimmed.match(deхPattern)
  if (match) {
    const base = parseInt(match[1], 10)
    const cap = match[3] !== undefined ? parseInt(match[3], 10) : Infinity
    return base + Math.min(dexMod, cap)
  }

  // Plain number
  return parseInt(trimmed, 10) || 0
}

// ── Weapon proficiency check ─────────────────────────────────────────────────

function isWeaponProficient(weapon: WeaponItem, classRecord: ClassData | null): boolean {
  if (!classRecord) return false
  const profs = classRecord.weapon_proficiencies.map(p => p.toLowerCase())
  const wtype = weapon.weapon_type.toLowerCase()
  if (wtype.includes('simple') && profs.some(p => p === 'simple weapons')) return true
  if (wtype.includes('martial') && (profs.includes('martial weapons') || profs.includes('all weapons'))) return true
  if (profs.includes(weapon.name.toLowerCase())) return true
  return false
}

// ── Public API ───────────────────────────────────────────────────────────────

export function computeWeaponBonus(
  weapon: WeaponItem,
  character: Character,
  classRecord: ClassData | null,
): WeaponBonus {
  const strMod = abilityModifier(character.abilities.str)
  const dexMod = abilityModifier(character.abilities.dex)
  const isFinesse = weapon.properties.some(p => p.toLowerCase().includes('finesse'))
  const isRanged = weapon.weapon_type.toLowerCase().includes('ranged')
  const mod = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod
  const abilityLabel = isFinesse ? (dexMod > strMod ? 'DEX' : 'STR') : isRanged ? 'DEX' : 'STR'
  const pb = isWeaponProficient(weapon, classRecord) ? proficiencyBonus(character.level) : 0
  const toHitModifier = mod + pb
  const damageBonus = mod
  const dmgBonusStr = damageBonus !== 0 ? (damageBonus > 0 ? `+${damageBonus}` : `${damageBonus}`) : ''

  return {
    toHit: toHitModifier >= 0 ? `+${toHitModifier}` : `${toHitModifier}`,
    damage: `${weapon.damage_dice}${dmgBonusStr} ${weapon.damage_type}`,
    damageDice: weapon.damage_dice,
    damageBonus,
    damageType: weapon.damage_type,
    abilityLabel,
    toHitModifier,
  }
}

export function deriveCharacterStats(
  character: Character,
  catalog?: { armor?: ArmorItem[] },
): DerivedStats {
  const dexMod = abilityModifier(character.abilities.dex)

  // ── Effective AC ──────────────────────────────────────────────────────────
  let effectiveAC: number | null = null

  if (catalog?.armor) {
    const armorByName = new Map(catalog.armor.map(a => [a.name.toLowerCase(), a]))
    const equippedArmor = character.equipment.filter(e => armorByName.has(e.name.toLowerCase()))

    if (equippedArmor.length > 0) {
      const bodyPieces = equippedArmor.filter(e => {
        const item = armorByName.get(e.name.toLowerCase())!
        return item.armor_type !== 'Shield'
      })
      const shields = equippedArmor.filter(e => {
        const item = armorByName.get(e.name.toLowerCase())!
        return item.armor_type === 'Shield'
      })

      let baseAC = 10 + dexMod  // unarmored
      if (bodyPieces.length > 0) {
        const bodyArmor = armorByName.get(bodyPieces[0].name.toLowerCase())!
        baseAC = parseArmorAC(bodyArmor.ac_formula, dexMod)
      }

      const shieldBonus = shields.length > 0
        ? parseArmorAC(armorByName.get(shields[0].name.toLowerCase())!.ac_formula, dexMod)
        : 0

      effectiveAC = baseAC + shieldBonus
    }
  }

  // ── Adjusted Max HP ───────────────────────────────────────────────────────
  let hpBonus = 0
  for (const slug of character.feats) {
    const effect = FEAT_EFFECTS[slug]
    if (effect?.maxHpBonus) hpBonus += effect.maxHpBonus(character.level)
  }

  return {
    effectiveAC,
    adjustedMaxHp: character.maxHp + hpBonus,
  }
}
