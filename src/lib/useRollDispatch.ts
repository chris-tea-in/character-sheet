import { useDiceStore } from '../store/dice'
import { abilityModifier } from './dice'
import type { DerivedStats } from './characterStats'
import type { RollKind, DamageSpec, RollBonus } from '../types/dice'

export function useRollDispatch(derived: DerivedStats) {
  const roll = useDiceStore(s => s.roll)
  const openModal = useDiceStore(s => s.openModal)
  const openDamage = useDiceStore(s => s.openDamage)

  // Itemized "bonuses you have" for this roll, shown under the die. Sums to the roll's
  // modifier. Skill/save reuse the ledger breakdown; ability checks are mod-only; attack
  // bonuses are passed by the caller (weapon/spell row); hit-die heal is the CON mod.
  function bonusesFor(kind: RollKind): RollBonus[] {
    if (kind.type === 'skill') return derived.breakdowns.skills[kind.skill].map(s => ({ label: s.label, amount: s.amount }))
    if (kind.type === 'save') return derived.breakdowns.saves[kind.ability].map(s => ({ label: s.label, amount: s.amount }))
    if (kind.type === 'ability') return [{ label: `${kind.ability.toUpperCase()} modifier`, amount: abilityModifier(derived.effectiveAbilities[kind.ability]) }]
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
      openModal({ entry, phase: 'result', isCrit: false, reliableTalent, hasLuckyFeat: derived.hasLuckyFeat, bonuses })
    }
  }

  // Dmg button: open the damage-setup modal directly (no preceding hit roll).
  function dispatchDamage(spec: DamageSpec) {
    openDamage(spec)
  }

  return { dispatch, dispatchDamage }
}
