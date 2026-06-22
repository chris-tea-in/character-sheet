// Healing, like damage (see spellDamage.ts), lives only in spell prose. This
// derives a best-effort healing default from the text so a healing spell shows a
// "Heal" button (a roll for HP restored) instead of a "Dmg" button. Anchored on
// "hit points" plus a regain/heal context word so it never fires on dice that
// measure time/distance ("1d4 hours") or damage ("8d6 ... damage").

import type { SpellData } from '../types/data'

export interface ParsedSpellHeal {
  dice: string            // healing dice at the spell's base level, e.g. "1d8"
  addsMod: boolean        // adds the caster's spellcasting ability modifier
  perLevel: string | null // upcast increment per slot above base (leveled spells)
}

// Context gate: only spells that actually restore HP. "gain" (temp HP) is
// intentionally excluded — \bregains?\b does not match "gain".
const CONTEXT_RE = /\b(?:regains?|heal(?:s|ed|ing)?)\b/i
// Dice after the phrase: "regains a number of hit points equal to 1d8 + …"
const AFTER_RE = /hit points?(?:\s+equal to)?[^.\d]{0,40}(\d+d\d+)/i
// Dice before the phrase: "regains 2d8 hit points"
const BEFORE_RE = /(\d+d\d+)[^.]{0,40}?\bhit points?\b/i
const MOD_RE = /spellcasting ability modifier/i
const PER_LEVEL_RE = /(?:healing increases by|increases by)\s*(\d+d\d+)\s*for each slot/i

export function parseSpellHeal(spell: SpellData): ParsedSpellHeal | null {
  const text = spell.description ?? ''
  if (!CONTEXT_RE.test(text)) return null
  const m = text.match(AFTER_RE) ?? text.match(BEFORE_RE)
  if (!m) return null
  const dice = m[1].toLowerCase()
  const addsMod = MOD_RE.test(text)

  let perLevel: string | null = null
  if (spell.level > 0 && spell.at_higher_levels) {
    const p = spell.at_higher_levels.match(PER_LEVEL_RE)
    if (p) perLevel = p[1].toLowerCase()
  }
  return { dice, addsMod, perLevel }
}
