import { SKILL_DISPLAY_MAP } from './dice'
import type { AbilityName, SkillName, CustomModifier, CustomAdvDis, CustomGrant } from '../types/character'
import type { ItemEffect } from '../types/data'
import type { TargetKey } from './characterStats'

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

// Set-membership grant target (Step 6b): resistance/immunity to a damage type, a
// language, a sense (with a range), or a skill/save proficiency. The first three map
// to ItemEffects (authorable on items); the rest are ledger-only (always-on grants).
export type GrantTarget = 'resistance' | 'immunity' | 'language' | 'sense' | 'skillProf' | 'saveProf'

export type EffectSpec =
  | { kind: 'number'; target: NumberTarget; amount: number }
  // `condition` (Tier-2 situational): optional clause limiting when the adv/dis applies
  // ("vs. being charmed") — present ⇒ never auto-netted, opt-in chip at roll time.
  | { kind: 'advdis'; target: RollTarget; mode: 'adv' | 'dis'; condition?: string }
  | { kind: 'grant'; target: GrantTarget; value: string; amount?: number }

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

const NUMBER_TARGET_LABEL: Record<NumberTarget['t'], string> = {
  ability: '', ac: 'AC', speed: 'Speed', initiative: 'Initiative', maxHp: 'Max HP',
  save: '', skill: '', weaponAttack: 'Weapon attack', spellAttack: 'Spell attack', spellSaveDC: 'Spell save DC', spellDamage: 'Spell damage', damage: 'Damage',
}

/** Human-readable summary of one effect, for the builder list + item display. */
export function specLabel(spec: EffectSpec): string {
  if (spec.kind === 'grant') {
    switch (spec.target) {
      case 'resistance': return `Resistance to ${spec.value}`
      case 'immunity': return `Immunity to ${spec.value}`
      case 'language': return `Language ${spec.value}`
      case 'sense': return `${spec.value}${spec.amount ? ` ${spec.amount} ft` : ''}`
      case 'skillProf': return `${SKILL_DISPLAY_MAP[spec.value as SkillName] ?? spec.value} proficiency`
      case 'saveProf': return `${spec.value.toUpperCase()} save proficiency`
    }
  }
  const t = spec.target
  const targetText =
    t.t === 'ability' ? t.ability.toUpperCase() :
    t.t === 'save' ? `${t.ability === 'all' ? 'all' : t.ability.toUpperCase()} save${t.ability === 'all' ? 's' : ''}` :
    t.t === 'skill' ? SKILL_DISPLAY_MAP[t.skill] :
    NUMBER_TARGET_LABEL[t.t]
  if (spec.kind === 'advdis') {
    return `${spec.mode === 'adv' ? 'Advantage' : 'Disadvantage'} on ${targetText}${spec.condition ? ` (only ${spec.condition})` : ''}`
  }
  return `${fmt(spec.amount)} ${targetText}`
}

// ── Ledger (always-on character grant) translation ───────────────────────────

const ALL_SAVE_ABILITIES: AbilityName[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

// Item-only targets — no ledger breakdown to attach an always-on custom to.
const LEDGER_UNSUPPORTED = new Set<NumberTarget['t']>(['weaponAttack', 'damage', 'spellDamage'])

/** Whether a number target can be authored as an always-on ledger grant. */
export function ledgerTargetSupported(t: NumberTarget['t']): boolean {
  return !LEDGER_UNSUPPORTED.has(t)
}

export type LedgerGrant =
  | { kind: 'number'; targetKey: TargetKey; mod: CustomModifier }
  | { kind: 'advdis'; entry: CustomAdvDis }
  | { kind: 'grant'; entry: CustomGrant }

/**
 * Translate an EffectSpec into always-on ledger grant(s). Numeric → a custom modifier
 * on the matching TargetKey (6a applies it); adv/dis → a CustomAdvDis (6c). "All saves"
 * numeric expands to one grant per save, sharing the `id` so disable/remove acts on all.
 * Item-only targets (weapon to-hit/damage, spell damage) return [].
 */
export function specToLedgerCustom(spec: EffectSpec, id: string): LedgerGrant[] {
  const label = specLabel(spec)
  if (spec.kind === 'grant') {
    return [{ kind: 'grant', entry: { id, label, target: spec.target, value: spec.value, ...(spec.amount != null ? { amount: spec.amount } : {}) } }]
  }
  if (spec.kind === 'advdis') {
    // Stored label stays clean — the breakdown/panel render the condition separately.
    const cleanLabel = specLabel({ ...spec, condition: undefined })
    const cond = spec.condition?.trim() ? { condition: spec.condition.trim() } : {}
    const entry: CustomAdvDis = spec.target.t === 'save'
      ? { id, label: cleanLabel, target: 'save', ability: spec.target.ability, mode: spec.mode, ...cond }
      : { id, label: cleanLabel, target: 'skill', skill: spec.target.skill, mode: spec.mode, ...cond }
    return [{ kind: 'advdis', entry }]
  }
  const { target, amount } = spec
  const mod: CustomModifier = { id, label, amount }
  switch (target.t) {
    case 'ability': return [{ kind: 'number', targetKey: `ability:${target.ability}`, mod }]
    case 'ac': return [{ kind: 'number', targetKey: 'ac', mod }]
    case 'speed': return [{ kind: 'number', targetKey: 'speed', mod }]
    case 'initiative': return [{ kind: 'number', targetKey: 'initiative', mod }]
    case 'maxHp': return [{ kind: 'number', targetKey: 'maxHp', mod }]
    case 'spellAttack': return [{ kind: 'number', targetKey: 'spellAttack', mod }]
    case 'spellSaveDC': return [{ kind: 'number', targetKey: 'spellSaveDC', mod }]
    case 'skill': return [{ kind: 'number', targetKey: `skill:${target.skill}`, mod }]
    case 'save':
      return target.ability === 'all'
        ? ALL_SAVE_ABILITIES.map(ab => ({ kind: 'number' as const, targetKey: `save:${ab}` as TargetKey, mod }))
        : [{ kind: 'number', targetKey: `save:${target.ability}`, mod }]
    case 'weaponAttack': case 'damage': case 'spellDamage': return [] // item-only, no ledger home
  }
}

/**
 * Inverse of specToItemEffect — lift a stored ItemEffect back into the builder's
 * EffectSpec so a homebrew def can be re-edited. Returns null for effect types the
 * builder can't author (catalog-only annotations like spell_focus); custom defs only
 * ever carry builder-emitted effects, so nothing is lost on their round-trip.
 */
export function itemEffectToSpec(e: ItemEffect): EffectSpec | null {
  switch (e.type) {
    case 'ability_bonus': return { kind: 'number', target: { t: 'ability', ability: e.ability }, amount: e.amount }
    case 'ac': return { kind: 'number', target: { t: 'ac' }, amount: e.amount }
    case 'speed': return { kind: 'number', target: { t: 'speed' }, amount: e.amount }
    case 'initiative': return { kind: 'number', target: { t: 'initiative' }, amount: e.amount }
    case 'max_hp': return e.amount === undefined ? null : { kind: 'number', target: { t: 'maxHp' }, amount: e.amount }
    case 'save': return { kind: 'number', target: { t: 'save', ability: e.ability }, amount: e.amount }
    case 'skill': return { kind: 'number', target: { t: 'skill', skill: e.skill }, amount: e.amount }
    case 'attack': return { kind: 'number', target: { t: 'weaponAttack' }, amount: e.amount }
    case 'spell_attack': return { kind: 'number', target: { t: 'spellAttack' }, amount: e.amount }
    case 'spell_save_dc': return { kind: 'number', target: { t: 'spellSaveDC' }, amount: e.amount }
    case 'spell_damage': return { kind: 'number', target: { t: 'spellDamage' }, amount: e.amount }
    case 'damage': return { kind: 'number', target: { t: 'damage' }, amount: e.amount }
    case 'resistance': return { kind: 'grant', target: 'resistance', value: e.damageType }
    case 'immunity': return { kind: 'grant', target: 'immunity', value: e.damageType }
    case 'language': return { kind: 'grant', target: 'language', value: e.name }
    case 'advantage':
    case 'disadvantage': {
      const mode = e.type === 'advantage' ? 'adv' as const : 'dis' as const
      const cond = e.condition ? { condition: e.condition } : {}
      if (e.target === 'save') return { kind: 'advdis', target: { t: 'save', ability: e.ability ?? 'all' }, mode, ...cond }
      if (e.skill === undefined) return null // skill-target advantage with no skill — not builder-authorable
      return { kind: 'advdis', target: { t: 'skill', skill: e.skill }, mode, ...cond }
    }
    default: return null
  }
}

/**
 * Translate an EffectSpec into the item's structured ItemEffect, or null when the
 * effect has no item representation (sense / proficiency grants are ledger-only).
 */
export function specToItemEffect(spec: EffectSpec): ItemEffect | null {
  if (spec.kind === 'grant') {
    if (spec.target === 'resistance' || spec.target === 'immunity') return { type: spec.target, damageType: spec.value }
    if (spec.target === 'language') return { type: 'language', name: spec.value }
    return null // sense / skillProf / saveProf — no ItemEffect
  }
  if (spec.kind === 'advdis') {
    const cond = spec.condition?.trim() ? { condition: spec.condition.trim() } : {}
    if (spec.mode === 'adv') {
      return spec.target.t === 'save'
        ? { type: 'advantage', target: 'save', ability: spec.target.ability, ...cond }
        : { type: 'advantage', target: 'skill', skill: spec.target.skill, ...cond }
    }
    return spec.target.t === 'save'
      ? { type: 'disadvantage', target: 'save', ability: spec.target.ability, ...cond }
      : { type: 'disadvantage', target: 'skill', skill: spec.target.skill, ...cond }
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
