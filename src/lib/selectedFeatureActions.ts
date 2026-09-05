import type { Character } from '@/types/character'
import type { ClassFeatureData } from '@/types/data'
import { applicableGroups } from './classFeatures'
import { getSpellSlotPools, normalizeSpellSlotUsage, type SpellcastingProfile } from './spellcasting'

/** Choices remain the source of truth; no copied spell/ability records to go stale. */
export function selectedFeatureOptions(character: Character, features: ClassFeatureData | null | undefined) {
  return applicableGroups(character, features).flatMap(({ group }) => {
    const selected = new Set(character.classFeatureChoices[group.key] ?? [])
    return group.options.filter(option => selected.has(option.slug)).map(option => ({ group, option }))
  })
}

/** Eldritch Smite spends only Pact Magic, including a secondary warlock class. */
export function eldritchSmiteDamage(profile: SpellcastingProfile, used: Character['spellSlotsUsed']) {
  const pool = getSpellSlotPools(profile).find(pool => pool.kind === 'pact')
  if (!pool) return null
  const usage = normalizeSpellSlotUsage(profile, used)
  return { ...pool, dice: `${pool.castLevel + 1}d8`, remaining: Math.max(0, pool.total - (usage[pool.key] ?? 0)) }
}
