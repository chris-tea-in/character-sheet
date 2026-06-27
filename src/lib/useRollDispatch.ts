import { useDiceStore } from '../store/dice'
import type { DerivedStats } from './characterStats'
import type { RollKind, DamageSpec } from '../types/dice'

export function useRollDispatch(derived: DerivedStats) {
  const roll = useDiceStore(s => s.roll)
  const openModal = useDiceStore(s => s.openModal)
  const openDamage = useDiceStore(s => s.openDamage)

  function dispatch(kind: RollKind) {
    // Attacks inherit the character's condition-driven advantage/disadvantage
    // (Poisoned/Prone/Restrained → dis, Invisible → adv, …) unless explicitly set.
    if (kind.type === 'attack' && kind.advantage === undefined && derived.attackRollState) {
      kind = { ...kind, advantage: derived.attackRollState === 'adv' }
    }
    const entry = roll(kind, derived)

    if (kind.type === 'attack') {
      const isCrit = entry.result.natural === 20
      openModal({
        entry,
        phase: 'hit',
        damageDice: kind.damageDice,
        damageBonus: kind.damageBonus,
        damageType: kind.damageType,
        extraDamage: kind.extraDamage,
        isCrit,
        hasLuckyFeat: derived.hasLuckyFeat,
      })
    } else {
      // Reliable Talent eligibility travels with the modal so rerolls keep flooring at 10.
      const reliableTalent = kind.type === 'skill' && derived.reliableTalent && !!derived.effectiveSkillProficiencies[kind.skill]
      openModal({ entry, phase: 'result', isCrit: false, reliableTalent, hasLuckyFeat: derived.hasLuckyFeat })
    }
  }

  // Dmg button: open the damage-setup modal directly (no preceding hit roll).
  function dispatchDamage(spec: DamageSpec) {
    openDamage(spec)
  }

  return { dispatch, dispatchDamage }
}
