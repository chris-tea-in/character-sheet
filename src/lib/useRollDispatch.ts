import { useDiceStore } from '../store/dice'
import { abilityModifier } from './dice'
import { buildSituationalOptions } from './rollSituational'
import type { RollStats } from './characterStats'
import type { RollKind, DamageSpec, RollBonus } from '../types/dice'

export function useRollDispatch(derived: RollStats) {
  const roll = useDiceStore(s => s.roll)
  const openModal = useDiceStore(s => s.openModal)
  const openDamage = useDiceStore(s => s.openDamage)

  // Itemized "bonuses you have" for this roll, shown under the die. Sums to the roll's
  // modifier. Skill/save reuse the ledger breakdown; ability checks are mod-only; attack
  // bonuses are passed by the caller (weapon/spell row); hit-die heal is the CON mod.
  function bonusesFor(kind: RollKind): RollBonus[] {
    if (kind.type === 'skill') return derived.breakdowns.skills[kind.skill].map(s => ({ label: s.label, amount: s.amount }))
    if (kind.type === 'save') return derived.breakdowns.saves[kind.ability].map(s => ({ label: s.label, amount: s.amount }))
    if (kind.type === 'ability') {
      // Must mirror the dice-store modifier exactly (itemized rows sum to the total):
      // ability mod + any half-proficiency grant (Jack of All Trades / Remarkable Athlete).
      const half = derived.abilityCheckBonuses[kind.ability]
      return [
        { label: `${kind.ability.toUpperCase()} modifier`, amount: abilityModifier(derived.effectiveAbilities[kind.ability]) },
        ...(half ? [{ label: `${half.label} (half PB)`, amount: half.amount }] : []),
      ]
    }
    if (kind.type === 'attack') return kind.bonuses ?? []
    if (kind.type === 'heal') return kind.modifier !== 0 ? [{ label: 'CON modifier', amount: kind.modifier }] : []
    return []
  }

  function dispatch(kind: RollKind) {
    // Attacks inherit the character's condition-driven advantage/disadvantage
    // (Poisoned/Prone/Restrained → dis, Invisible → adv, …) unless explicitly set.
    if (kind.type === 'attack' && kind.advantage === undefined && derived.attackRollState) {
      kind = { ...kind, advantage: derived.attackRollState === 'adv' }
    }
    const entry = roll(kind, derived)
    const bonuses = bonusesFor(kind)

    if (kind.type === 'attack') {
      const isCrit = entry.result.natural === 20
      openModal({
        entry,
        phase: 'hit',
        damageDice: kind.damageDice,
        damageBonus: kind.damageBonus,
        damageType: kind.damageType,
        extraDamage: kind.extraDamage,
        rerollBelow: kind.rerollBelow,
        isCrit,
        hasLuckyFeat: derived.hasLuckyFeat,
        bonuses,
      })
    } else {
      // Reliable Talent eligibility travels with the modal so rerolls keep flooring at 10.
      const reliableTalent = kind.type === 'skill' && derived.reliableTalent && !!derived.effectiveSkillProficiencies[kind.skill]
      // Situational chips: the target's condition-bearing (non-disabled) sources,
      // grouped by condition. baseMode snapshots the standing net the row rolled with.
      const situational =
        kind.type === 'skill' ? buildSituationalOptions(derived.rollStateSources.skills[kind.skill])
        : kind.type === 'save' ? buildSituationalOptions(derived.rollStateSources.saves[kind.ability])
        : []
      const baseMode = 'advantage' in kind && kind.advantage !== undefined ? (kind.advantage ? 'adv' as const : 'dis' as const) : undefined
      openModal({
        entry, phase: 'result', isCrit: false, reliableTalent, hasLuckyFeat: derived.hasLuckyFeat, bonuses,
        situational: situational.length ? situational : undefined, baseMode,
      })
    }
  }

  // Dmg button: open the damage-setup modal directly (no preceding hit roll).
  function dispatchDamage(spec: DamageSpec) {
    openDamage(spec)
  }

  return { dispatch, dispatchDamage }
}
