import { SKILL_DISPLAY_MAP } from './dice'
import type { AbilityName, SkillName } from '../types/character'
import type { ItemEffect } from '../types/data'

// Neutral "effect intent" emitted by <EffectBuilder>: a target + either a numeric
// amount or an advantage/disadvantage on a roll. Each consumer translates it to its
// own shape (specToItemEffect for items; a ledger custom in Phase 2).

export type NumberTarget =
  | { t: 'ability'; ability: AbilityName }
  | { t: 'ac' }
  | { t: 'speed' }
  | { t: 'initiative' }
  | { t: 'maxHp' }
  | { t: 'save'; ability: AbilityName | 'all' }
  | { t: 'skill'; skill: SkillName }
  | { t: 'weaponAttack' }
  | { t: 'spellAttack' }
  | { t: 'spellSaveDC' }
  | { t: 'spellDamage' }
  | { t: 'damage' }

export type RollTarget =
  | { t: 'save'; ability: AbilityName | 'all' }
  | { t: 'skill'; skill: SkillName }

export type EffectSpec =
  | { kind: 'number'; target: NumberTarget; amount: number }
  | { kind: 'advdis'; target: RollTarget; mode: 'adv' | 'dis' }

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

const NUMBER_TARGET_LABEL: Record<NumberTarget['t'], string> = {
  ability: '', ac: 'AC', speed: 'Speed', initiative: 'Initiative', maxHp: 'Max HP',
  save: '', skill: '', weaponAttack: 'Weapon attack', spellAttack: 'Spell attack', spellSaveDC: 'Spell save DC', spellDamage: 'Spell damage', damage: 'Damage',
}

/** Human-readable summary of one effect, for the builder list + item display. */
export function specLabel(spec: EffectSpec): string {
  const t = spec.target
  const targetText =
    t.t === 'ability' ? t.ability.toUpperCase() :
    t.t === 'save' ? `${t.ability === 'all' ? 'all' : t.ability.toUpperCase()} save${t.ability === 'all' ? 's' : ''}` :
    t.t === 'skill' ? SKILL_DISPLAY_MAP[t.skill] :
    NUMBER_TARGET_LABEL[t.t]
  if (spec.kind === 'advdis') return `${spec.mode === 'adv' ? 'Advantage' : 'Disadvantage'} on ${targetText}`
  return `${fmt(spec.amount)} ${targetText}`
}

/** Translate an EffectSpec into the item's structured ItemEffect. */
export function specToItemEffect(spec: EffectSpec): ItemEffect {
  if (spec.kind === 'advdis') {
    if (spec.mode === 'adv') {
      return spec.target.t === 'save'
        ? { type: 'advantage', target: 'save', ability: spec.target.ability }
        : { type: 'advantage', target: 'skill', skill: spec.target.skill }
    }
    return spec.target.t === 'save'
      ? { type: 'disadvantage', target: 'save', ability: spec.target.ability }
      : { type: 'disadvantage', target: 'skill', skill: spec.target.skill }
  }
  const { target, amount } = spec
  switch (target.t) {
    case 'ability': return { type: 'ability_bonus', ability: target.ability, amount }
    case 'ac': return { type: 'ac', amount }
    case 'speed': return { type: 'speed', amount }
    case 'initiative': return { type: 'initiative', amount }
    case 'maxHp': return { type: 'max_hp', amount }
    case 'save': return { type: 'save', ability: target.ability, amount }
    case 'skill': return { type: 'skill', skill: target.skill, amount }
    case 'weaponAttack': return { type: 'attack', amount }
    case 'spellAttack': return { type: 'spell_attack', amount }
    case 'spellSaveDC': return { type: 'spell_save_dc', amount }
    case 'spellDamage': return { type: 'spell_damage', amount }
    case 'damage': return { type: 'damage', amount }
  }
}
