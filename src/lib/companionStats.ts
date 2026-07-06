import { abilityModifier, SKILL_ABILITY_MAP } from './dice'
import type { RollStats } from './characterStats'
import type { AbilityName, SkillName } from '../types/character'
import type { CompanionData } from '../../shared/companionValidation'

// Builds the RollStats a companion stat block feeds into the shared dice seam
// (useRollDispatch / useDiceStore.roll). Companions are first-class rollers, not
// PC impersonators: every value here comes from the companion's own block —
// nothing bleeds in from the owning character's conditions or feats.
//
// Modifier rules: an explicit save/skill override IS the total bonus (stat blocks
// print final numbers, e.g. "DEX +4"); anything not overridden derives as the
// plain ability modifier. Each breakdown holds the single row that sums to its
// modifier — the invariant the roll modal's itemization relies on.

const ALL_ABILITIES: AbilityName[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ALL_SKILLS = Object.keys(SKILL_ABILITY_MAP) as SkillName[]

export function companionRollStats(data: CompanionData): RollStats {
  const saveModifiers = {} as Record<AbilityName, number>
  const saveBreakdowns = {} as Record<AbilityName, { label: string; amount: number }[]>
  for (const ab of ALL_ABILITIES) {
    const override = data.saveOverrides?.[ab]
    const amount = override ?? abilityModifier(data.abilities[ab])
    saveModifiers[ab] = amount
    saveBreakdowns[ab] = [{
      label: override !== undefined ? 'Stat block' : `${ab.toUpperCase()} modifier`,
      amount,
    }]
  }

  const skillModifiers = {} as Record<SkillName, number>
  const skillBreakdowns = {} as Record<SkillName, { label: string; amount: number }[]>
  for (const sk of ALL_SKILLS) {
    const override = data.skillOverrides?.[sk]
    const amount = override ?? abilityModifier(data.abilities[SKILL_ABILITY_MAP[sk]])
    skillModifiers[sk] = amount
    skillBreakdowns[sk] = [{
      label: override !== undefined ? 'Stat block' : `${SKILL_ABILITY_MAP[sk].toUpperCase()} modifier`,
      amount,
    }]
  }

  return {
    effectiveAbilities: { ...data.abilities },
    skillModifiers,
    saveModifiers,
    abilityCheckBonuses: {},
    reliableTalent: false,
    hasLuckyFeat: false,
    effectiveSkillProficiencies: {},
    breakdowns: { skills: skillBreakdowns, saves: saveBreakdowns },
    rollStateSources: { skills: {}, saves: {} },
    attackRollState: undefined,
  }
}
