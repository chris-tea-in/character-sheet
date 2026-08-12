import type { NewCharacter } from '../types/character'

export type RecoveryScope = 'spell-slots' | 'class-resources' | 'all'

type RecoveryState = Pick<
  NewCharacter,
  'spellSlotsUsed' | 'featureResourcesUsed' | 'equipment' | 'hitDiceUsed' | 'hitDiceUsedByClass'
>

const hasPositiveUsage = (usage: Record<string | number, number>) =>
  Object.values(usage).some(value => value > 0)

export function buildResourceRecoveryPatch(
  character: RecoveryState,
  scope: RecoveryScope,
): Partial<NewCharacter> {
  const patch: Partial<NewCharacter> = {}

  if ((scope === 'spell-slots' || scope === 'all') && hasPositiveUsage(character.spellSlotsUsed)) {
    patch.spellSlotsUsed = {}
  }
  if ((scope === 'class-resources' || scope === 'all') && hasPositiveUsage(character.featureResourcesUsed)) {
    patch.featureResourcesUsed = {}
  }
  if (scope !== 'all') return patch

  if (character.equipment.some(item => (item.chargesUsed ?? 0) > 0)) {
    patch.equipment = character.equipment.map(item =>
      (item.chargesUsed ?? 0) > 0 ? { ...item, chargesUsed: 0 } : item,
    )
  }
  if (character.hitDiceUsed > 0) patch.hitDiceUsed = 0
  if (hasPositiveUsage(character.hitDiceUsedByClass)) patch.hitDiceUsedByClass = {}

  return patch
}
