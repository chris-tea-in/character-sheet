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
  | { kind: 'advdis'; target: RollTarget; mode: 'adv' | 'dis' }
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
  if (spec.kind === 'advdis') return `${spec.mode === 'adv' ? 'Advantage' : 'Disadvantage'} on ${targetText}`
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
    const entry: CustomAdvDis = spec.target.t === 'save'
      ? { id, label, target: 'save', ability: spec.target.ability, mode: spec.mode }
      : { id, label, target: 'skill', skill: spec.target.skill, mode: spec.mode }
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
