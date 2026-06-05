import { useDiceStore } from '../store/dice'
import type { Character } from '../types/character'
import type { RollKind } from '../types/dice'

export function useRollDispatch(character: Character) {
  const roll = useDiceStore(s => s.roll)
  const openModal = useDiceStore(s => s.openModal)

  function dispatch(kind: RollKind) {
    const entry = roll(kind, character)

    if (kind.type === 'attack') {
      const isCrit = entry.result.natural === 20
      openModal({
        entry,
        phase: 'hit',
        damageDice: kind.damageDice,
        damageBonus: kind.damageBonus,
        damageType: kind.damageType,
        isCrit,
      })
    } else {
      openModal({ entry, phase: 'result', isCrit: false })
    }
  }

  return { dispatch }
}
