import { AbilityBlock } from './AbilityBlock'
import { CombatBlock } from './CombatBlock'
import { ProficienciesBlock } from './ProficienciesBlock'
import { SpellBlock } from './SpellBlock'
import { EquipmentBlock } from './EquipmentBlock'
import { FeatsBlock } from './FeatsBlock'
import { DescriptionBlock } from './DescriptionBlock'
import { useDerivedSheet, type SheetReferenceData } from './useDerivedSheet'
import type { Character, NewCharacter } from '@/types/character'

const NO_SAVE = () => {}

/**
 * The full character sheet (every block) driven entirely by props — used for the
 * owner sheet's content as well as the DM's campaign view/edit of another player's
 * character. Derivation flows through the shared `useDerivedSheet` hook so the two
 * surfaces can never drift.
 *
 * `readOnly` swaps `onSave` for a no-op: edits don't persist (controlled inputs
 * snap back), but tabs, scrolling, and disclosure stay live — unlike the old
 * `pointer-events-none` approach, the sheet is fully navigable in view mode.
 */
export function CharacterSheetBlocks({
  character,
  data,
  onSave,
  readOnly = false,
}: {
  character: Character
  data: SheetReferenceData
  onSave: (changes: Partial<NewCharacter>) => void
  readOnly?: boolean
}) {
  const sheet = useDerivedSheet(character, data)
  const save = readOnly ? NO_SAVE : onSave

  return (
    <div className="space-y-6 pt-4">
      <AbilityBlock character={character} derived={sheet.derived} onSave={save} />
      <CombatBlock
        character={character}
        derived={sheet.derived}
        onSave={save}
        classHitDice={sheet.classHitDice}
      />
      <ProficienciesBlock
        character={character}
        classRecord={sheet.classRecord}
        classRecords={sheet.classRecords}
        backgroundSkills={sheet.backgroundSkills}
        derived={sheet.derived}
        onSave={save}
      />
      <FeatsBlock character={character} derived={sheet.derived} onSave={save} />
      <EquipmentBlock
        character={character}
        derived={sheet.derived}
        onSave={save}
        catalog={data.equipmentCatalog}
        classRecord={sheet.classRecord}
      />
      {sheet.classRecord && (
        <SpellBlock
          character={character}
          classRecord={sheet.classRecord}
          classLevel={sheet.primaryClassLevel}
          derived={sheet.derived}
          overrideSlotProfile={sheet.multiclassSlotProfile ?? undefined}
          overrideCasterKind={sheet.multiclassCasterKind}
          onSave={save}
        />
      )}
      <DescriptionBlock character={character} derived={sheet.derived} onSave={save} />
    </div>
  )
}
