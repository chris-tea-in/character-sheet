import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { SelectionList } from '@/components/SelectionList'
import { DetailPopup } from '@/components/DetailPopup'
import { StepperField } from './StepperField'
import { abilityModifier, proficiencyBonus, rollDie, SKILL_ABILITY_MAP } from '@/lib/dice'
import { parseHitDie, toggleAsiSelection, ABILITY_ORDER, ABILITY_SHORT, ABILITY_FULL_TO_SHORT } from '@/lib/characterSetup'
import { LEVEL_GROUP_ORDER, spellGroup, componentStr } from '@/lib/spells'
import { getSpellcastingInfo, getSpellsKnownIncrease, parseClassSlots } from '@/lib/spellcasting'
import {
  featHasChoiceAsi, featChoiceAsiOptions,
  meetsFeatPrerequisites, type FeatPrereqContext,
} from '@/lib/characterStats'
import { loadFeatsData, loadSpellsData } from '@/lib/data'
import type { SpellLevel } from '@/lib/spellcasting'
import type { DieType } from '@/types/dice'
import type { ClassData, SpellData, FeatData } from '@/types/data'
import type { Abilities, AbilityName, SkillName, Character, NewCharacter } from '@/types/character'
import type { SelectionEntry } from '@/components/SelectionList'
import { cn } from '@/lib/utils'

interface Props {
  character: Character
  // Derived scores (base + racial + feat bonuses) — character.abilities holds base only
  effectiveAbilities: Abilities
  classRecord: ClassData
  newLevel: number       // new level for THIS class (used for feature/spell lookups)
  newTotalLevel?: number // new total character level (stored as character.level); defaults to newLevel
  open: boolean
  onClose: () => void
  onApply: (changes: Partial<NewCharacter>) => void
}


function Section({ title, children, accent }: { title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="space-y-2">
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: accent ? 'var(--color-accent-gold)' : undefined }}
      >
        {title}
      </p>
      {children}
    </div>
  )
}

export function LevelUpDialog({ character, effectiveAbilities, classRecord, newLevel, newTotalLevel, open, onClose, onApply }: Props) {
  const storedLevel = newTotalLevel ?? newLevel
  const [allSpells, setAllSpells] = useState<Record<string, SpellData>>({})
  const [allFeats, setAllFeats] = useState<Record<string, FeatData>>({})
  const [hpAdd, setHpAdd] = useState(0)
  const [newSpells, setNewSpells] = useState<string[]>([])
  const [newCantrips, setNewCantrips] = useState<string[]>([])
  const [asiChoices, setAsiChoices] = useState<AbilityName[]>([])  // +1 to each chosen (max 2), or +2 to one
  const [asiMode, setAsiMode] = useState<'asi' | 'feat'>('asi')
  const [chosenFeat, setChosenFeat] = useState<string | null>(null)
  const [featAsiChoice, setFeatAsiChoice] = useState<AbilityName | null>(null)
  const [featSkillChoices, setFeatSkillChoices] = useState<SkillName[]>([])
  const [featExpertiseChoice, setFeatExpertiseChoice] = useState<SkillName | null>(null)
  const [featPickerOpen, setFeatPickerOpen] = useState(false)
  const [featDetailOpen, setFeatDetailOpen] = useState(false)
  const [spellBrowseAll, setSpellBrowseAll] = useState(false)
  const [spellPickerOpen, setSpellPickerOpen] = useState(false)
  const [cantripPickerOpen, setCantripPickerOpen] = useState(false)

  const hitDie = parseHitDie(classRecord.hit_die)
  const conMod = abilityModifier(effectiveAbilities.con)
  const avgHpIncrease = Math.floor(hitDie / 2) + 1 + conMod

  const oldProf = proficiencyBonus(character.level)
  const newProf = proficiencyBonus(storedLevel)

  const newEntry = classRecord.levels?.[String(newLevel)]
  const newFeatures = newEntry?.features ?? []
  const isASILevel = newFeatures.some(f => f.toLowerCase().includes('ability score improvement'))

  // For multiclass characters use this class's own level, not the total character level
  const currentClassLevel = character.classes?.find(c => c.classSlug === classRecord.slug)?.level ?? character.level

  const newSpellInfo = getSpellcastingInfo(classRecord, newLevel)
  const oldProfile = parseClassSlots(classRecord, currentClassLevel)
  const newProfile = parseClassSlots(classRecord, newLevel)
  const spellIncrease = getSpellsKnownIncrease(classRecord, currentClassLevel, newLevel)

  const newMaxSpellLevel = useMemo(() => {
    if (newProfile.kind === 'slots') {
      const levels = Object.keys(newProfile.slotsByLevel).map(Number)
      return levels.length > 0 ? Math.max(...levels) : 1
    }
    if (newProfile.kind === 'pact') return newProfile.slotLevel
    return 1
  }, [newProfile])

  const featPrereqCtx = useMemo((): FeatPrereqContext => ({
    level: storedLevel,
    classSlugs: character.classes.length > 0
      ? character.classes.map(c => c.classSlug)
      : [character.class],
    raceSlug: character.race,
    abilities: effectiveAbilities,
    knownFeatSlugs: character.feats,
    hasSpellcasting: classRecord.spellcasting !== null,
    hasPactMagic: character.classes.some(c => c.classSlug === 'warlock') || character.class === 'warlock',
    armorProficiencies: classRecord.armor_proficiencies,
    weaponProficiencies: classRecord.weapon_proficiencies,
    backgroundSlug: character.background,
  }), [storedLevel, character, classRecord])

  useEffect(() => {
    if (!open) return
    setHpAdd(Math.max(1, avgHpIncrease))
    setNewSpells([])
    setNewCantrips([])
    setAsiChoices([])
    setAsiMode('asi')
    setChosenFeat(null)
    setFeatAsiChoice(null)
    setFeatSkillChoices([])
    setFeatExpertiseChoice(null)
    setSpellBrowseAll(false)
    loadSpellsData().then(setAllSpells).catch(() => {})
    loadFeatsData().then(setAllFeats).catch(() => {})
  }, [open])

  // Spell entry lists — use JSON key (not s.slug which has "spell:" prefix)
  const alreadyKnown = useMemo(
    () => new Set(character.spells.map(s => s.slug.replace(/^spell:/, ''))),
    [character.spells],
  )

  function buildSpellEntries(level: number | null) {
    const baseClass = spellBrowseAll ? null : classRecord.slug
    return Object.entries(allSpells)
      .filter(([key, s]) => {
        if (alreadyKnown.has(key)) return false
        if (level !== null && s.level !== level) return false
        if (level === null && s.level === 0) return false
        if (level === null && s.level > newMaxSpellLevel) return false
        if (baseClass && !s.classes.includes(baseClass)) return false
        return true
      })
      .map(([key, s]) => ({
        slug: key,
        detail: {
          name: s.name,
          subtitle: `${s.level === 0 ? 'Cantrip' : `Level ${s.level}`} · ${s.school}`,
          description: s.description,
          sections: [
            { label: 'Casting Time', value: s.casting_time },
            { label: 'Range', value: s.range },
            { label: 'Duration', value: s.duration },
            { label: 'Components', value: componentStr(s.components) },
            ...(s.at_higher_levels ? [{ label: 'At Higher Levels', value: s.at_higher_levels }] : []),
          ],
        },
        group: spellGroup(s.level),
      } as SelectionEntry))
  }

  const spellEntries = useMemo(() => buildSpellEntries(null), [allSpells, alreadyKnown, spellBrowseAll, classRecord.slug, newMaxSpellLevel])
  const cantripEntries = useMemo(() => buildSpellEntries(0), [allSpells, alreadyKnown, spellBrowseAll, classRecord.slug])

  function rollHp() {
    setHpAdd(Math.max(1, rollDie(hitDie as DieType) + conMod))
  }

  function toggleAsi(ab: AbilityName) {
    setAsiChoices(c => toggleAsiSelection(c, ab))
  }

  function handleApply() {
    const changes: Partial<NewCharacter> = {
      level: storedLevel,
      maxHp: character.maxHp + hpAdd,
      currentHp: character.currentHp + hpAdd,
    }

    // Apply new spells
    const addedSpells = [
      ...newCantrips.map(slug => ({ slug, prepared: false })),
      ...newSpells.map(slug => ({ slug, prepared: false })),
    ]
    if (addedSpells.length) {
      changes.spells = [...character.spells, ...addedSpells]
    }

    // Apply ASI or Feat
    if (isASILevel) {
      if (asiMode === 'feat' && chosenFeat) {
        const feat = allFeats[chosenFeat]
        const newFeatChoices = { ...character.featChoices }
        const hasAnyChoice = featAsiChoice || featSkillChoices.length > 0 || featExpertiseChoice
        const hasStatEffect = feat && (feat.effects ?? []).length > 0
        if (hasAnyChoice) {
          newFeatChoices[chosenFeat] = {
            ...(featAsiChoice ? { asiAbility: featAsiChoice } : {}),
            ...(featSkillChoices.length > 0 ? { skillChoices: featSkillChoices } : {}),
            ...(featExpertiseChoice ? { expertiseSkill: featExpertiseChoice } : {}),
          }
        } else if (hasStatEffect) {
          newFeatChoices[chosenFeat] = {}
        }
        // Feat stat effects (ASI/speed/initiative/saves) are derived at render
        // time from feats + featChoices — nothing else to write here
        changes.feats = [...character.feats, chosenFeat]
        changes.featChoices = newFeatChoices
      } else if (asiMode === 'asi' && asiChoices.length > 0) {
        const newAbilities = { ...character.abilities }
        for (const ab of asiChoices) {
          newAbilities[ab] = Math.min(20, (newAbilities[ab] ?? 10) + 1)
        }
        changes.abilities = newAbilities
      }
    }

    // Reset used spell slots only when slots actually expanded
    const slotsExpanded =
      newProfile.kind !== 'none' && (
        oldProfile.kind === 'none' ||
        oldProfile.kind !== newProfile.kind ||
        (newProfile.kind === 'pact' && oldProfile.kind === 'pact' &&
          (newProfile.slotCount > oldProfile.slotCount || newProfile.slotLevel > oldProfile.slotLevel)) ||
        (newProfile.kind === 'slots' && oldProfile.kind === 'slots' &&
          (Object.entries(newProfile.slotsByLevel) as [string, number][]).some(
            ([lvl, n]) => n > (oldProfile.slotsByLevel[parseInt(lvl) as SpellLevel] ?? 0),
          ))
      )
    if (slotsExpanded) {
      changes.spellSlotsUsed = {}
    }

    onApply(changes)
  }

  const chosenFeatData = chosenFeat ? allFeats[chosenFeat] : null
  const chosenFeatNeedsAsiChoice = chosenFeatData ? featHasChoiceAsi(chosenFeatData) : false
  const chosenFeatAsiOptions = chosenFeatData ? featChoiceAsiOptions(chosenFeatData) : []
  const chosenFeatSkillCount = chosenFeatData
    ? ((chosenFeatData.effects ?? []).find(e => e.type === 'skill_proficiency') as { count?: number } | undefined)?.count ?? 0
    : 0
  const chosenFeatNeedsExpertise = chosenFeatData
    ? (chosenFeatData.effects ?? []).some(e => e.type === 'expertise')
    : false

  const ALL_SKILLS = Object.keys(SKILL_ABILITY_MAP) as SkillName[]

  function skillDisplayName(skill: SkillName): string {
    return skill.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
  }

  const spellsStillNeeded = spellIncrease.spells - newSpells.length
  const cantripsStillNeeded = spellIncrease.cantrips - newCantrips.length
  const asiStillNeeded = isASILevel && (
    asiMode === 'asi'
      ? asiChoices.length < 2
      : chosenFeat === null
          || (chosenFeatNeedsAsiChoice && featAsiChoice === null)
          || (chosenFeatSkillCount > 0 && featSkillChoices.length < chosenFeatSkillCount)
          || (chosenFeatNeedsExpertise && featExpertiseChoice === null)
  )
  const canApply = spellsStillNeeded <= 0 && cantripsStillNeeded <= 0 && !asiStillNeeded

  return (
    <>
      <Dialog open={open} onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-sm overflow-y-auto max-h-[90dvh]">
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--color-accent-gold)' }}>
              Level {newLevel}!
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 text-sm">

            {/* New features */}
            {newFeatures.length > 0 && (
              <Section title="New Features" accent>
                <ul className="space-y-0.5">
                  {newFeatures.map(f => (
                    <li key={f} className="text-sm">{f}</li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Proficiency bonus */}
            {newProf > oldProf && (
              <Section title="Proficiency Bonus">
                <p className="text-sm">
                  <span className="text-muted-foreground">+{oldProf}</span>
                  <span className="mx-2">→</span>
                  <span className="font-bold" style={{ color: 'var(--color-accent-gold)' }}>+{newProf}</span>
                </p>
              </Section>
            )}

            {/* HP increase */}
            <Section title="Hit Points">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Button variant="outline" size="sm" onClick={rollHp} className="text-xs h-7">
                    Roll d{hitDie}
                  </Button>
                  <span className="text-xs text-muted-foreground">or enter manually</span>
                  <StepperField
                    value={hpAdd}
                    onSave={v => setHpAdd(Math.max(1, v))}
                    min={1}
                    max={50}
                    size="sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {hpAdd > 0
                    ? <>Adding <span className="font-semibold text-foreground">+{hpAdd} HP</span>
                        {conMod !== 0 && <> · CON mod included ({conMod >= 0 ? `+${conMod}` : conMod})</>}
                      </>
                    : 'Roll or enter HP to add'}
                  {' '}· avg {Math.max(1, avgHpIncrease)}
                </p>
              </div>
            </Section>

            {/* Spell slots change */}
            {newProfile.kind !== 'none' && oldProfile.kind !== newProfile.kind && (
              <Section title="Spell Slots">
                <p className="text-xs text-muted-foreground">Updated slot table applied on level up.</p>
              </Section>
            )}
            {newProfile.kind === 'slots' && oldProfile.kind === 'slots' && (
              <Section title="Spell Slots">
                {(Object.entries(newProfile.slotsByLevel) as [string, number][])
                  .filter(([lvl, n]) => n !== (oldProfile.slotsByLevel[parseInt(lvl) as SpellLevel] ?? 0))
                  .map(([lvl, n]) => {
                    const old = oldProfile.slotsByLevel[parseInt(lvl) as SpellLevel] ?? 0
                    return (
                      <p key={lvl} className="text-xs">
                        {spellGroup(parseInt(lvl))} slots:
                        <span className="text-muted-foreground mx-1">{old}</span>→
                        <span className="font-bold ml-1" style={{ color: 'var(--color-accent-gold)' }}>{n}</span>
                      </p>
                    )
                  })}
              </Section>
            )}

            {/* Cantrips to learn */}
            {spellIncrease.cantrips > 0 && (
              <Section title={`Cantrips — choose ${spellIncrease.cantrips}`} accent>
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    {newCantrips.map(slug => (
                      <span
                        key={slug}
                        className="text-xs px-2 py-0.5 rounded-full cursor-pointer"
                        style={{ background: 'var(--color-accent-gold)', color: '#000' }}
                        onClick={() => setNewCantrips(c => c.filter(s => s !== slug))}
                      >
                        {allSpells[slug]?.name ?? slug} ✕
                      </span>
                    ))}
                  </div>
                  {cantripsStillNeeded > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCantripPickerOpen(true)}
                      className="text-xs h-7"
                    >
                      Choose cantrip{cantripsStillNeeded > 1 ? `s (${cantripsStillNeeded} left)` : ''}
                    </Button>
                  )}
                </div>
              </Section>
            )}

            {/* Spells to learn */}
            {spellIncrease.spells > 0 && (
              <Section title={`Spells to Learn — choose ${spellIncrease.spells}`} accent>
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    {newSpells.map(slug => (
                      <span
                        key={slug}
                        className="text-xs px-2 py-0.5 rounded-full cursor-pointer"
                        style={{ background: 'var(--color-accent-gold)', color: '#000' }}
                        onClick={() => setNewSpells(s => s.filter(x => x !== slug))}
                      >
                        {allSpells[slug]?.name ?? slug} ✕
                      </span>
                    ))}
                  </div>
                  {spellsStillNeeded > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSpellPickerOpen(true)}
                      className="text-xs h-7"
                    >
                      Choose spell{spellsStillNeeded > 1 ? `s (${spellsStillNeeded} left)` : ''}
                    </Button>
                  )}
                  <button
                    onClick={() => setSpellBrowseAll(b => !b)}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline"
                  >
                    {spellBrowseAll ? 'Show class spells only' : 'Browse all classes'}
                  </button>
                </div>
              </Section>
            )}

            {/* Prepared caster note */}
            {newSpellInfo.casterKind === 'prepared' && (
              <Section title="Spell Preparation">
                <p className="text-xs text-muted-foreground">
                  You can prepare spells from the {classRecord.slug} spell list — use the Spells section on your sheet.
                </p>
              </Section>
            )}

            {/* ASI or Feat */}
            {isASILevel && (
              <Section title="Ability Score Improvement" accent>
                {/* Mode toggle */}
                <div className="flex gap-1 mb-3">
                  {(['asi', 'feat'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setAsiMode(mode)}
                      className="px-3 py-1 text-xs rounded-md capitalize transition-colors"
                      style={{
                        background: asiMode === mode ? 'var(--color-accent-gold)' : undefined,
                        color: asiMode === mode ? '#000' : undefined,
                        border: '1px solid var(--color-border-raw)',
                      }}
                    >
                      {mode === 'asi' ? 'Ability Score' : 'Take a Feat'}
                    </button>
                  ))}
                </div>

                {asiMode === 'asi' && (
                  <>
                    <p className="text-xs text-muted-foreground mb-2">
                      Choose up to 2 abilities to increase by +1 each (or the same ability twice for +2).
                    </p>
                    <div className="grid grid-cols-3 gap-1">
                      {ABILITY_ORDER.map(ab => {
                        const count = asiChoices.filter(x => x === ab).length
                        const maxed = effectiveAbilities[ab] + count >= 20
                        const atCap = asiChoices.length >= 2
                        return (
                          <button
                            key={ab}
                            onClick={() => !maxed && toggleAsi(ab)}
                            disabled={maxed || (atCap && count === 0)}
                            className={cn(
                              'text-xs px-2 py-1.5 rounded border transition-colors text-left',
                              count > 0 && 'font-bold',
                            )}
                            style={{
                              background: count > 0 ? 'var(--color-accent-gold)' : undefined,
                              color: count > 0 ? '#000' : undefined,
                              borderColor: 'var(--color-border-raw)',
                              opacity: maxed || (atCap && count === 0) ? 0.4 : 1,
                            }}
                          >
                            {ABILITY_SHORT[ab]}
                            {count > 0 && ` +${count}`}
                          </button>
                        )
                      })}
                    </div>
                    {asiChoices.length > 0 && (
                      <p className="text-xs mt-1" style={{ color: 'var(--color-accent-gold)' }}>
                        {asiChoices.length}/2 chosen
                      </p>
                    )}
                  </>
                )}

                {asiMode === 'feat' && (
                  <div className="space-y-2">
                    {chosenFeat ? (
                      <>
                        <div className="flex items-center gap-2">
                          <button
                            className="text-xs px-2 py-0.5 rounded-full font-medium hover:opacity-80 transition-opacity"
                            style={{ background: 'var(--color-accent-gold)', color: '#000' }}
                            onClick={() => setFeatDetailOpen(true)}
                          >
                            {allFeats[chosenFeat]?.name ?? chosenFeat}
                          </button>
                          <span className="flex-1" />
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => { setFeatPickerOpen(true); setFeatAsiChoice(null); setFeatSkillChoices([]); setFeatExpertiseChoice(null) }}
                          >
                            Change
                          </button>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => { setChosenFeat(null); setFeatAsiChoice(null); setFeatSkillChoices([]); setFeatExpertiseChoice(null) }}
                          >
                            ✕
                          </button>
                        </div>
                        {chosenFeatNeedsAsiChoice && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Choose ability to increase by 1:</p>
                            <div className="grid grid-cols-3 gap-1">
                              {chosenFeatAsiOptions.map(opt => {
                                const ab = ABILITY_FULL_TO_SHORT[opt.toLowerCase()]
                                if (!ab) return null
                                const current = effectiveAbilities[ab] ?? 10
                                const selected = featAsiChoice === ab
                                return (
                                  <button
                                    key={opt}
                                    disabled={current >= 20}
                                    onClick={() => setFeatAsiChoice(ab)}
                                    className="text-xs px-2 py-1.5 rounded border transition-colors"
                                    style={{
                                      background: selected ? 'var(--color-accent-gold)' : undefined,
                                      color: selected ? '#000' : undefined,
                                      borderColor: 'var(--color-border-raw)',
                                      opacity: current >= 20 ? 0.4 : 1,
                                    }}
                                  >
                                    {ABILITY_SHORT[ab]}{selected && ' +1'}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {chosenFeatSkillCount > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              Choose {chosenFeatSkillCount === 1 ? 'a skill' : `${chosenFeatSkillCount} skills`} to gain proficiency in
                              {featSkillChoices.length > 0 && ` (${featSkillChoices.length}/${chosenFeatSkillCount})`}:
                            </p>
                            <div className="grid grid-cols-2 gap-1">
                              {ALL_SKILLS.filter(sk => !character.skillProficiencies[sk]).map(sk => {
                                const selected = featSkillChoices.includes(sk)
                                const disabled = !selected && featSkillChoices.length >= chosenFeatSkillCount
                                return (
                                  <button
                                    key={sk}
                                    disabled={disabled}
                                    onClick={() => setFeatSkillChoices(prev =>
                                      prev.includes(sk) ? prev.filter(s => s !== sk)
                                        : prev.length < chosenFeatSkillCount ? [...prev, sk] : prev,
                                    )}
                                    className="text-xs px-2 py-1 rounded border text-left transition-colors"
                                    style={{
                                      background: selected ? 'var(--color-accent-gold)' : undefined,
                                      color: selected ? '#000' : undefined,
                                      borderColor: 'var(--color-border-raw)',
                                      opacity: disabled ? 0.4 : 1,
                                    }}
                                  >
                                    {skillDisplayName(sk)}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {chosenFeatNeedsExpertise && (
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">Choose a skill for expertise (must be proficient):</p>
                            <div className="grid grid-cols-2 gap-1">
                              {[
                                ...Object.keys(character.skillProficiencies) as SkillName[],
                                ...featSkillChoices.filter(sk => !character.skillProficiencies[sk]),
                              ].map(sk => {
                                const selected = featExpertiseChoice === sk
                                return (
                                  <button
                                    key={sk}
                                    onClick={() => setFeatExpertiseChoice(sk)}
                                    className="text-xs px-2 py-1 rounded border text-left transition-colors"
                                    style={{
                                      background: selected ? 'var(--color-accent-gold)' : undefined,
                                      color: selected ? '#000' : undefined,
                                      borderColor: 'var(--color-border-raw)',
                                    }}
                                  >
                                    {skillDisplayName(sk)}
                                  </button>
                                )
                              })}
                              {Object.keys(character.skillProficiencies).length === 0 && featSkillChoices.length === 0 && (
                                <p className="col-span-2 text-xs text-muted-foreground italic">No proficient skills yet.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => setFeatPickerOpen(true)}
                        className="text-sm hover:opacity-75 transition-opacity"
                        style={{ color: 'var(--color-accent-gold)' }}
                      >
                        + Choose feat
                      </button>
                    )}
                  </div>
                )}
              </Section>
            )}

          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={handleApply} disabled={!canApply}>
              Level Up!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Spell picker */}
      <SelectionList
        entries={spellEntries}
        value=""
        title={`Choose Spell${spellsStillNeeded > 1 ? 's' : ''}`}
        open={spellPickerOpen}
        onClose={() => setSpellPickerOpen(false)}
        onSelect={slug => {
          if (newSpells.length < spellIncrease.spells) {
            setNewSpells(s => [...s, slug])
          }
          if (newSpells.length + 1 >= spellIncrease.spells) setSpellPickerOpen(false)
        }}
        groupOrder={LEVEL_GROUP_ORDER}
      />

      {/* Cantrip picker */}
      <SelectionList
        entries={cantripEntries}
        value=""
        title="Choose Cantrip"
        open={cantripPickerOpen}
        onClose={() => setCantripPickerOpen(false)}
        onSelect={slug => {
          if (newCantrips.length < spellIncrease.cantrips) {
            setNewCantrips(c => [...c, slug])
          }
          if (newCantrips.length + 1 >= spellIncrease.cantrips) setCantripPickerOpen(false)
        }}
        groupOrder={['Cantrip']}
      />

      {/* Feat picker */}
      <SelectionList
        entries={Object.entries(allFeats)
          .filter(([key]) => !character.feats.includes(key))
          .map(([key, feat]) => ({
            slug: key,
            warning: feat.prerequisites.length && !meetsFeatPrerequisites(feat, featPrereqCtx)
              ? 'Req not met'
              : undefined,
            detail: {
              name: feat.name,
              subtitle: feat.prerequisites.length ? `Prerequisite: ${feat.prerequisites.join(', ')}` : undefined,
              description: feat.description,
              sections: [],
            },
          }))}
        value={chosenFeat ?? ''}
        title="Choose Feat"
        open={featPickerOpen}
        onClose={() => setFeatPickerOpen(false)}
        onSelect={key => {
          setChosenFeat(key)
          setFeatAsiChoice(null)
          setFeatSkillChoices([])
          setFeatExpertiseChoice(null)
          setFeatPickerOpen(false)
        }}
      />

      {/* Feat detail popup */}
      {chosenFeat && chosenFeatData && (
        <DetailPopup
          item={{
            name: chosenFeatData.name,
            subtitle: chosenFeatData.prerequisites.length
              ? `Prerequisite: ${chosenFeatData.prerequisites.join(', ')}`
              : undefined,
            description: chosenFeatData.description,
            sections: [],
          }}
          mode="view"
          open={featDetailOpen}
          onClose={() => setFeatDetailOpen(false)}
        />
      )}
    </>
  )
}
