import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { SelectionList } from '@/components/SelectionList'
import { StepperField } from './StepperField'
import { abilityModifier, proficiencyBonus } from '@/lib/dice'
import { parseHitDie, ABILITY_ORDER, ABILITY_SHORT } from '@/lib/characterSetup'
import { getSpellcastingInfo, getSpellsKnownIncrease, parseClassSlots } from '@/lib/spellcasting'
import { loadFeatsData, loadSpellsData } from '@/lib/data'
import type { SpellLevel } from '@/lib/spellcasting'
import type { ClassData, SpellData, FeatData } from '@/types/data'
import type { AbilityName, Character, NewCharacter } from '@/types/character'
import type { SelectionEntry } from '@/components/SelectionList'
import { cn } from '@/lib/utils'

interface Props {
  character: Character
  classRecord: ClassData
  newLevel: number
  open: boolean
  onClose: () => void
  onApply: (changes: Partial<NewCharacter>) => void
}

const LEVEL_GROUP_ORDER = ['Cantrip', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']

function spellLevelGroup(level: number): string {
  if (level === 0) return 'Cantrip'
  const ords = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th']
  return ords[level] ?? `${level}th`
}

function componentStr(c: SpellData['components']): string {
  return [c.verbal && 'V', c.somatic && 'S', c.material && (c.material_text ? `M (${c.material_text})` : 'M')]
    .filter(Boolean).join(', ')
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

export function LevelUpDialog({ character, classRecord, newLevel, open, onClose, onApply }: Props) {
  const [allSpells, setAllSpells] = useState<Record<string, SpellData>>({})
  const [allFeats, setAllFeats] = useState<Record<string, FeatData>>({})
  const [hpAdd, setHpAdd] = useState(0)
  const [newSpells, setNewSpells] = useState<string[]>([])
  const [newCantrips, setNewCantrips] = useState<string[]>([])
  const [asiChoices, setAsiChoices] = useState<AbilityName[]>([])  // +1 to each chosen (max 2), or +2 to one
  const [asiMode, setAsiMode] = useState<'asi' | 'feat'>('asi')
  const [chosenFeat, setChosenFeat] = useState<string | null>(null)
  const [featPickerOpen, setFeatPickerOpen] = useState(false)
  const [spellBrowseAll, setSpellBrowseAll] = useState(false)
  const [spellPickerOpen, setSpellPickerOpen] = useState(false)
  const [cantripPickerOpen, setCantripPickerOpen] = useState(false)

  const hitDie = parseHitDie(classRecord.hit_die)
  const conMod = abilityModifier(character.abilities.con)
  const avgHpIncrease = Math.floor(hitDie / 2) + 1 + conMod

  const oldProf = proficiencyBonus(character.level)
  const newProf = proficiencyBonus(newLevel)

  const newEntry = classRecord.levels?.[String(newLevel)]
  const newFeatures = newEntry?.features ?? []
  const isASILevel = newFeatures.some(f => f.toLowerCase().includes('ability score improvement'))

  const newSpellInfo = getSpellcastingInfo(classRecord, newLevel)
  const oldProfile = parseClassSlots(classRecord, character.level)
  const newProfile = parseClassSlots(classRecord, newLevel)
  const spellIncrease = getSpellsKnownIncrease(classRecord, character.level, newLevel)

  const newMaxSpellLevel = useMemo(() => {
    if (newProfile.kind === 'slots') {
      const levels = Object.keys(newProfile.slotsByLevel).map(Number)
      return levels.length > 0 ? Math.max(...levels) : 1
    }
    if (newProfile.kind === 'pact') return newProfile.slotLevel
    return 1
  }, [newProfile])

  useEffect(() => {
    if (!open) return
    setHpAdd(0)
    setNewSpells([])
    setNewCantrips([])
    setAsiChoices([])
    setAsiMode('asi')
    setChosenFeat(null)
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
    const baseClass = spellBrowseAll ? null : character.class
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
        group: spellLevelGroup(s.level),
      } as SelectionEntry))
  }

  const spellEntries = useMemo(() => buildSpellEntries(null), [allSpells, alreadyKnown, spellBrowseAll, character.class, newMaxSpellLevel])
  const cantripEntries = useMemo(() => buildSpellEntries(0), [allSpells, alreadyKnown, spellBrowseAll, character.class])

  function rollHp() {
    const result = Math.max(1, Math.floor(Math.random() * hitDie) + 1 + conMod)
    setHpAdd(result)
  }

  function toggleAsi(ab: AbilityName) {
    if (asiChoices.filter(x => x === ab).length > 0) {
      setAsiChoices(c => {
        const idx = c.lastIndexOf(ab)
        return c.filter((_, i) => i !== idx)
      })
    } else if (asiChoices.length < 2) {
      setAsiChoices(c => [...c, ab])
    }
  }

  function handleApply() {
    const changes: Partial<NewCharacter> = {
      level: newLevel,
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
        changes.feats = [...character.feats, chosenFeat]
      } else if (asiMode === 'asi' && asiChoices.length > 0) {
        const newAbilities = { ...character.abilities }
        for (const ab of asiChoices) {
          newAbilities[ab] = Math.min(30, (newAbilities[ab] ?? 10) + 1)
        }
        changes.abilities = newAbilities
      }
    }

    // Reset used spell slots if profile changed (new slots unlocked)
    if (newProfile.kind !== 'none') {
      changes.spellSlotsUsed = {}
    }

    onApply(changes)
  }

  const spellsStillNeeded = spellIncrease.spells - newSpells.length
  const cantripsStillNeeded = spellIncrease.cantrips - newCantrips.length
  const asiStillNeeded = isASILevel && (
    asiMode === 'asi' ? asiChoices.length < 2 : chosenFeat === null
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
                    onSave={v => setHpAdd(Math.max(0, v))}
                    min={0}
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
                        {spellLevelGroup(parseInt(lvl))} slots:
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
                        const maxed = character.abilities[ab] + count >= 20
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
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full cursor-pointer"
                          style={{ background: 'var(--color-accent-gold)', color: '#000' }}
                          onClick={() => setChosenFeat(null)}
                        >
                          {allFeats[chosenFeat]?.name ?? chosenFeat} ✕
                        </span>
                      </div>
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
            detail: {
              name: feat.name,
              subtitle: feat.prerequisites.length ? `Prerequisite: ${feat.prerequisites.join(', ')}` : undefined,
              description: feat.description,
              sections: [],
            },
          }))}
        value=""
        title="Choose Feat"
        open={featPickerOpen}
        onClose={() => setFeatPickerOpen(false)}
        onSelect={key => {
          setChosenFeat(key)
          setFeatPickerOpen(false)
        }}
      />
    </>
  )
}
