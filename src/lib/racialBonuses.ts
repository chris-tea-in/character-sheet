import type { AbilityName } from '@/types/character'
import type { Race } from '@/types/data'

// Dependency-free helpers shared by characterSetup.ts and characterStats.ts.
// They live here (not in characterSetup) so characterStats can derive racial
// bonuses without an import cycle: characterSetup → characterStats → here.

// Race data stores full lowercase ability names ("strength"), not short form ("str")
export const ABILITY_FULL_TO_SHORT: Record<string, AbilityName> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
}

export function toSubraceSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}

// Fixed race + subrace ASIs plus any flexible picks. `asiChoices` is the
// ordered list of chosen abilities: race pool slots first, then subrace pools.
export function getRacialBonuses(
  race: Race | undefined | null,
  asiChoices: AbilityName[],
  subraceSlug?: string,
): Partial<Record<AbilityName, number>> {
  const bonuses: Partial<Record<AbilityName, number>> = {}
  if (!race) return bonuses

  for (const [key, val] of Object.entries(race.base.ability_score_increases)) {
    const short = ABILITY_FULL_TO_SHORT[key] ?? (key as AbilityName)
    bonuses[short] = (bonuses[short] ?? 0) + val
  }

  let offset = 0
  for (const pool of race.base.asi_choices) {
    for (let i = 0; i < pool.count; i++) {
      const ability = asiChoices[offset + i]
      if (ability) bonuses[ability] = (bonuses[ability] ?? 0) + pool.amount
    }
    offset += pool.count
  }

  // Apply subrace ASIs
  const subrace = subraceSlug
    ? race.subraces.find(s => toSubraceSlug(s.name) === subraceSlug)
    : undefined
  if (subrace) {
    for (const [key, val] of Object.entries(subrace.ability_score_increases)) {
      const short = ABILITY_FULL_TO_SHORT[key] ?? (key as AbilityName)
      bonuses[short] = (bonuses[short] ?? 0) + val
    }
    for (const pool of subrace.asi_choices) {
      for (let i = 0; i < pool.count; i++) {
        const ability = asiChoices[offset + i]
        if (ability) bonuses[ability] = (bonuses[ability] ?? 0) + pool.amount
      }
      offset += pool.count
    }
  }

  return bonuses
}
