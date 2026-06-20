import { useMemo } from 'react'
import { deriveCharacterStats } from '@/lib/characterStats'
import { computeMulticlassSlots, getSpellcastingInfo } from '@/lib/spellcasting'
import type { CasterKind } from '@/lib/spellcasting'
import { parseHitDie, slugToTitle, backgroundGrantedSkills } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import type { ClassData, EquipmentData, FeatData } from '@/types/data'
import type { Character, SkillName } from '@/types/character'

export interface SheetReferenceData {
  setupData: SetupData | null
  equipmentCatalog: EquipmentData | null
  featData: Record<string, FeatData> | null
}

export interface DerivedSheet {
  classRecord: ClassData | null
  classRecords: (ClassData | null)[]
  derived: ReturnType<typeof deriveCharacterStats>
  backgroundSkills: SkillName[]
  primaryClassLevel: number
  multiclassSlotProfile: ReturnType<typeof computeMulticlassSlots> | null
  multiclassCasterKind: CasterKind | undefined
  classHitDice:
    | { classSlug: string; className: string; hitDie: number; level: number }[]
    | undefined
}

/**
 * The single source of every render-time character stat — extracted from
 * CharacterPage so the owner sheet and the campaign (DM) sheet derive identically
 * and can never drift. Pass the loaded reference data (null while loading); the
 * hook is resilient to nulls. See codebase-invariants INV-1/INV-2.
 */
export function useDerivedSheet(character: Character, data: SheetReferenceData): DerivedSheet {
  const { setupData, equipmentCatalog, featData } = data

  const classRecord = character.class ? (setupData?.classes[character.class] ?? null) : null
  const raceData = character.race ? (setupData?.races[character.race] ?? null) : null

  const classRecords = useMemo(() => (
    character.classes?.length
      ? character.classes.map(c => setupData?.classes[c.classSlug] ?? null)
      : [classRecord]
  ), [character.classes, setupData, classRecord])

  const derived = useMemo(
    () => deriveCharacterStats(character, {
      classes: classRecords, race: raceData, catalog: equipmentCatalog, featData,
      classFeatures: setupData?.classFeatures ?? null,
    }),
    [character, classRecords, raceData, equipmentCatalog, featData, setupData],
  )

  const backgroundSkills = useMemo((): SkillName[] => (
    backgroundGrantedSkills(
      setupData?.backgrounds[character.background]?.skill_proficiencies ?? [],
      character.skillProficiencies,
    )
  ), [setupData, character.background, character.skillProficiencies])

  const primaryClassLevel = character.classes?.length
    ? (character.classes[0]?.level ?? character.level)
    : character.level

  const multiclassSlotProfile = character.classes?.length > 1 && setupData
    ? computeMulticlassSlots(character.classes, setupData.classes)
    : null

  const multiclassCasterKind = useMemo((): CasterKind | undefined => {
    if (!multiclassSlotProfile || !setupData || !character.classes?.length) return undefined
    for (const c of character.classes) {
      const rec = setupData.classes[c.classSlug]
      if (rec && getSpellcastingInfo(rec, c.level).casterKind === 'prepared') return 'prepared'
    }
    return undefined
  }, [multiclassSlotProfile, setupData, character.classes])

  const classHitDice = character.classes?.length > 1
    ? character.classes.map(c => ({
        classSlug: c.classSlug,
        className: slugToTitle(c.classSlug),
        hitDie: setupData?.classes[c.classSlug]
          ? parseHitDie(setupData.classes[c.classSlug].hit_die)
          : derived.hitDiceType,
        level: c.level,
      }))
    : undefined

  return {
    classRecord,
    classRecords,
    derived,
    backgroundSkills,
    primaryClassLevel,
    multiclassSlotProfile,
    multiclassCasterKind,
    classHitDice,
  }
}
