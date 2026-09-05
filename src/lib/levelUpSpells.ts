import type { CharacterSpell } from '../types/character'
import type { ClassData } from '../types/data'
import { getSpellcastingInfo, isSpellbookCaster } from './spellcasting'

/** Level-up picks follow the same preparation policy as the sheet's Add spell action. */
export function buildLevelUpSpells(
  cls: ClassData,
  level: number,
  cantrips: string[],
  spells: string[],
): CharacterSpell[] {
  const prepared = getSpellcastingInfo(cls, level).casterKind === 'prepared'
    && !isSpellbookCaster(cls.slug)
  return [
    ...cantrips.map(slug => ({ slug, prepared: false })),
    ...spells.map(slug => ({ slug, prepared })),
  ]
}
