// Quick-add bonus presets for the roll modal: things the character (or an ally) can
// add to a d20 roll or to damage — Guidance/Bless, Sneak Attack, Divine Smite, Rage, …
// Each preset is GATED so a character only ever sees its own handful (no clutter). The
// "From an ally" set (campaign buffs another player can grant you) is always offered when
// you're in a campaign — approach #1, shown in a labeled dropdown in the picker.

import type { Character } from '../types/character'
import type { DerivedStats } from './characterStats'
import { abilityModifier } from './dice'

export interface BonusPreset {
  id: string
  label: string
  target: 'roll' | 'damage'
  flat?: number                    // a fixed flat amount (signed; Rage +2)
  dice?: { count: number; sides: number }  // a fixed die roll (Sneak Attack 3d6)
  diePick?: number[]               // let the player pick the die size (Bardic d6/d8/d10/d12)
  sign?: 1 | -1                    // -1 for a penalty (Bane, GWM/Sharpshooter to-hit)
}

const normSlug = (s: string) => s.replace(/^spell:/, '')
const knows = (c: Character, slug: string) => (c.spells ?? []).some(s => normSlug(s.slug) === slug)
const classLevel = (c: Character, slug: string) => (c.classes ?? []).find(x => x.classSlug === slug)?.level ?? 0
const hasSubclass = (c: Character, sub: string) => (c.classes ?? []).some(x => x.subclassSlug === sub)
const hasFeat = (c: Character, slug: string) => (c.feats ?? []).includes(slug)

/** All bonus presets applicable to this character, gated by class / spell / feat /
 *  subclass (and campaign membership for the ally buffs). The picker groups them. */
export function getBonusPresets(character: Character, derived: DerivedStats): BonusPreset[] {
  const out: BonusPreset[] = []

  // ── Buffs another player can grant you (or you cast on yourself) ──────────────────
  // Always offered in the roll picker — any character can be handed Guidance / Bless /
  // Bardic Inspiration / etc. by a party member, so these aren't gated by class, known
  // spells, or campaign membership.
  out.push({ id: 'guidance', label: 'Guidance', target: 'roll', dice: { count: 1, sides: 4 } })
  out.push({ id: 'resistance', label: 'Resistance', target: 'roll', dice: { count: 1, sides: 4 } })
  out.push({ id: 'bless', label: 'Bless', target: 'roll', dice: { count: 1, sides: 4 } })
  out.push({ id: 'bardic', label: 'Bardic Inspiration', target: 'roll', diePick: [6, 8, 10, 12] })
  out.push({ id: 'bane', label: 'Bane', target: 'roll', dice: { count: 1, sides: 4 }, sign: -1 })

  // ── Your own roll boosts ────────────────────────────────────────────────────────
  if (classLevel(character, 'artificer') >= 7) {
    const intMod = abilityModifier(derived.effectiveAbilities.int)
    if (intMod > 0) out.push({ id: 'flash-of-genius', label: 'Flash of Genius', target: 'roll', flat: intMod })
  }
  // Great Weapon Master / Sharpshooter: the −5 to-hit half (the +10 damage half is below).
  if (hasFeat(character, 'great-weapon-master')) out.push({ id: 'gwm-hit', label: 'Great Weapon Master (−5)', target: 'roll', flat: 5, sign: -1 })
  if (hasFeat(character, 'sharpshooter')) out.push({ id: 'ss-hit', label: 'Sharpshooter (−5)', target: 'roll', flat: 5, sign: -1 })

  // ── Damage extras ───────────────────────────────────────────────────────────────
  const rogue = classLevel(character, 'rogue')
  if (rogue > 0) out.push({ id: 'sneak-attack', label: 'Sneak Attack', target: 'damage', dice: { count: Math.ceil(rogue / 2), sides: 6 } })
  if (classLevel(character, 'paladin') > 0) out.push({ id: 'divine-smite', label: 'Divine Smite', target: 'damage', dice: { count: 2, sides: 8 } })
  if (knows(character, 'hunters-mark')) out.push({ id: 'hunters-mark', label: "Hunter's Mark", target: 'damage', dice: { count: 1, sides: 6 } })
  if (knows(character, 'hex')) out.push({ id: 'hex', label: 'Hex', target: 'damage', dice: { count: 1, sides: 6 } })
  if (knows(character, 'divine-favor')) out.push({ id: 'divine-favor', label: 'Divine Favor', target: 'damage', dice: { count: 1, sides: 4 } })
  const barb = classLevel(character, 'barbarian')
  if (barb > 0) out.push({ id: 'rage', label: 'Rage', target: 'damage', flat: barb >= 16 ? 4 : barb >= 9 ? 3 : 2 })

  // Smite spells (each gated on knowing it)
  const smites: Array<[string, string, number, number]> = [
    ['searing-smite', 'Searing Smite', 1, 6],
    ['wrathful-smite', 'Wrathful Smite', 1, 6],
    ['thunderous-smite', 'Thunderous Smite', 2, 6],
    ['branding-smite', 'Branding Smite', 2, 6],
    ['blinding-smite', 'Blinding Smite', 3, 8],
    ['staggering-smite', 'Staggering Smite', 4, 6],
    ['banishing-smite', 'Banishing Smite', 5, 10],
  ]
  for (const [slug, label, count, sides] of smites) {
    if (knows(character, slug)) out.push({ id: slug, label, target: 'damage', dice: { count, sides } })
  }
  if (knows(character, 'elemental-weapon')) out.push({ id: 'elemental-weapon', label: 'Elemental Weapon', target: 'damage', dice: { count: 1, sides: 4 } })

  // Subclass / feature damage riders
  if (hasSubclass(character, 'hexblade')) out.push({ id: 'hexblade-curse', label: "Hexblade's Curse", target: 'damage', flat: derived.proficiencyBonus })
  if (hasSubclass(character, 'hunter')) out.push({ id: 'colossus-slayer', label: 'Colossus Slayer', target: 'damage', dice: { count: 1, sides: 8 } })
  const ranger = classLevel(character, 'ranger')
  if (ranger > 0) out.push({ id: 'favored-foe', label: 'Favored Foe', target: 'damage', dice: { count: 1, sides: ranger >= 14 ? 8 : ranger >= 6 ? 6 : 4 } })
  if (hasSubclass(character, 'battle-master')) {
    const fighter = classLevel(character, 'fighter')
    out.push({ id: 'maneuver', label: 'Maneuver (superiority die)', target: 'damage', dice: { count: 1, sides: fighter >= 18 ? 12 : fighter >= 10 ? 10 : 8 } })
  }
  if (hasFeat(character, 'great-weapon-master')) out.push({ id: 'gwm-dmg', label: 'Great Weapon Master (+10)', target: 'damage', flat: 10 })
  if (hasFeat(character, 'sharpshooter')) out.push({ id: 'ss-dmg', label: 'Sharpshooter (+10)', target: 'damage', flat: 10 })

  return out
}
