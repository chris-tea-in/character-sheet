// Spell catalog data has no structured damage field — it lives in the prose
// (`description`, with upcast scaling in `at_higher_levels`). This derives a
// best-effort damage default from that text for the Dmg button, parallel to the
// app's other render-time derivations. A per-character override
// (CharacterSpell.damageDice/...) always wins over this; the player can correct
// any spell the heuristic misses.

import type { SpellData } from '../types/data'

const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic',
  'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
] as const

export interface ParsedSpellDamage {
  dice: string          // primary damage dice at the spell's base level, e.g. "8d6"
  type: string | null   // damage type, or null when the spell lets you choose (Chromatic Orb)
  perLevel: string | null // upcast increment per slot above base (leveled spells only)
}

// First "<NdM> [type] damage" in the text. The type word is optional (Chromatic
// Orb → "3d8 damage of the type you chose"); a trailing flat bonus ("1d4 + 1 ...")
// is consumed but ignored. The `damage` anchor keeps it off dice that measure
// time/distance/healing ("1d4 hours", "regains 1d8 hit points").
const PRIMARY_RE = new RegExp(
  `(\\d+d\\d+)(?:\\s*\\+\\s*\\d+)?\\s+(?:(${DAMAGE_TYPES.join('|')})\\s+)?damage`,
  'i',
)

// Standard upcast phrasing for leveled spells. Cantrips scale by character level
// instead and are handled by the roller, so their per-level is left null.
const PER_LEVEL_RE = /increases by (\d+d\d+) for each slot level above/i

export function parseSpellDamage(spell: SpellData): ParsedSpellDamage | null {
  const m = (spell.description ?? '').match(PRIMARY_RE)
  if (!m) return null
  const dice = m[1].toLowerCase()
  const type = m[2] ? m[2].toLowerCase() : null

  let perLevel: string | null = null
  if (spell.level > 0 && spell.at_higher_levels) {
    const p = spell.at_higher_levels.match(PER_LEVEL_RE)
    if (p) perLevel = p[1].toLowerCase()
  }
  return { dice, type, perLevel }
}
