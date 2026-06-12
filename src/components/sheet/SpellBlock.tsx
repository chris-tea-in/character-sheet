import { useEffect, useMemo, useState } from 'react'
import { Plus, X, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import { getSpellcastingInfo } from '@/lib/spellcasting'
import type { SpellcastingProfile, CasterKind, SpellLevel } from '@/lib/spellcasting'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { loadSpellsData } from '@/lib/data'
import { ORDINALS, LEVEL_GROUP_ORDER, spellGroup, componentStr } from '@/lib/spells'
import { RollButton } from '@/components/sheet/RollButton'
import type { ClassData, SpellData } from '@/types/data'
import type { Character, CharacterSpell, NewCharacter } from '@/types/character'
import type { SelectionEntry, TabConfig } from '@/components/SelectionList'
import type { DerivedStats } from '@/lib/characterStats'

interface Props {
  character: Character
  classRecord: ClassData
  classLevel: number
  derived: DerivedStats
  overrideSlotProfile?: SpellcastingProfile
  overrideCasterKind?: CasterKind
  onSave: (changes: Partial<NewCharacter>) => void
}

// The raw SpellData.slug field carries a "spell:" prefix; the JSON is keyed without it.
const normalizeSlug = (slug: string) => slug.replace(/^spell:/, '')

function SlotPips({
  total, used, onToggle,
}: {
  total: number; used: number; onToggle: (n: number) => void
}) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: total }).map((_, i) => {
        const filled = i < used
        return (
          <button
            key={i}
            onClick={() => onToggle(filled ? i : i + 1)}
            className="w-5 h-5 rounded-full border-2 transition-colors"
            style={{
              borderColor: 'var(--color-accent-gold)',
              background: filled ? 'var(--color-accent-gold)' : 'transparent',
            }}
          />
        )
      })}
    </div>
  )
}

function SpellRow({
  spell,
  charSpell,
  isPreparedCaster,
  onTogglePrepared,
  onRemove,
  onRoll,
}: {
  spell: SpellData | undefined
  charSpell: CharacterSpell
  isPreparedCaster: boolean
  onTogglePrepared: () => void
  onRemove: () => void
  onRoll: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const level = spell?.level ?? 0
  const levelLabel = level === 0 ? 'Cantrip' : `Lv ${level}`

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 py-2">
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-none"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-accent-gold)' }}
        >
          {levelLabel}
        </span>

        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left text-sm font-medium hover:opacity-75 truncate"
        >
          {spell?.name ?? normalizeSlug(charSpell.slug)}
        </button>

        {spell && level > 0 && isPreparedCaster && (
          <div className="flex flex-col items-center gap-0.5 flex-none">
            <button
              onClick={onTogglePrepared}
              className="w-5 h-5 rounded border-2 transition-colors"
              style={{
                borderColor: 'var(--color-accent-gold)',
                background: charSpell.prepared ? 'var(--color-accent-gold)' : 'transparent',
              }}
              title={charSpell.prepared ? 'Prepared' : 'Not prepared'}
            />
            <span className="text-[9px] text-muted-foreground leading-none">Prepared</span>
          </div>
        )}

        <RollButton onClick={onRoll} />

        {spell && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-muted-foreground hover:text-foreground flex-none"
          >
            <BookOpen className="h-3.5 w-3.5" />
          </button>
        )}

        {/* X always visible for spells with no catalog data (can't expand to remove them otherwise) */}
        {!spell && (
          <button onClick={onRemove} className="text-muted-foreground hover:text-destructive flex-none">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {expanded && spell && (
        <div className="pb-3 px-1 space-y-1.5 text-xs text-muted-foreground">
          <div className="flex gap-4 flex-wrap">
            <span><span className="font-semibold text-foreground">Casting:</span> {spell.casting_time}</span>
            <span><span className="font-semibold text-foreground">Range:</span> {spell.range}</span>
            <span><span className="font-semibold text-foreground">Duration:</span> {spell.duration}</span>
            {spell.concentration && <span className="text-amber-400">Concentration</span>}
            {spell.ritual && <span className="text-purple-400">Ritual</span>}
          </div>
          <span><span className="font-semibold text-foreground">Components:</span> {componentStr(spell.components)}</span>
          <p className="text-foreground/80 leading-relaxed">{spell.description}</p>
          {spell.at_higher_levels && (
            <p className="italic">{spell.at_higher_levels}</p>
          )}
          <div className="flex justify-end pt-1">
            <button
              onClick={onRemove}
              className="flex items-center gap-1 hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


export function SpellBlock({ character, classRecord, classLevel, derived, overrideSlotProfile, overrideCasterKind, onSave }: Props) {
  const [allSpells, setAllSpells] = useState<Record<string, SpellData>>({})
  const [spellListOpen, setSpellListOpen] = useState(false)
  const { dispatch } = useRollDispatch(derived)

  useEffect(() => {
    loadSpellsData().then(setAllSpells).catch(() => {})
  }, [])

  const { profile: rawProfile, casterKind: rawCasterKind } = getSpellcastingInfo(classRecord, classLevel)
  const profile = overrideSlotProfile ?? rawProfile
  if (profile.kind === 'none' && rawProfile.kind === 'none') return null

  const casterKind = overrideCasterKind ?? rawCasterKind
  const isPreparedCaster = casterKind === 'prepared'
  const spellAttackMod = derived.spellAttackBonus

  // Normalized set of slugs the character already knows (strips legacy "spell:" prefix)
  const alreadyKnown = useMemo(
    () => new Set(character.spells.map(s => normalizeSlug(s.slug))),
    [character.spells],
  )

  const toEntry = ([key, s]: [string, SpellData]): SelectionEntry => ({
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
  })

  const classSpellEntries: SelectionEntry[] = useMemo(() =>
    Object.entries(allSpells)
      .filter(([key]) => !alreadyKnown.has(key))
      .filter(([, s]) => s.classes.includes(classRecord.slug))
      .map(toEntry),
  [allSpells, alreadyKnown, classRecord.slug])

  const allSpellEntries: SelectionEntry[] = useMemo(() =>
    Object.entries(allSpells)
      .filter(([key]) => !alreadyKnown.has(key))
      .map(toEntry),
  [allSpells, alreadyKnown])

  const spellTabs: TabConfig[] = useMemo(() => [
    { label: classRecord.name, entries: classSpellEntries, groupOrder: LEVEL_GROUP_ORDER },
    { label: 'All Spells', entries: allSpellEntries, groupOrder: LEVEL_GROUP_ORDER },
  ], [classSpellEntries, allSpellEntries, classRecord.name])

  function setSlotUsed(level: SpellLevel, used: number) {
    onSave({ spellSlotsUsed: { ...character.spellSlotsUsed, [level]: used } })
  }

  function addSpell(key: string) {
    onSave({ spells: [...character.spells, { slug: key, prepared: false }] })
    setSpellListOpen(false)
  }

  function removeSpell(key: string) {
    onSave({ spells: character.spells.filter(s => normalizeSlug(s.slug) !== key) })
  }

  function togglePrepared(key: string) {
    onSave({
      spells: character.spells.map(s =>
        normalizeSlug(s.slug) === key ? { ...s, prepared: !s.prepared } : s,
      ),
    })
  }

  // Group character's spells by level, normalizing legacy slugs for lookup
  const spellsByLevel = useMemo(() => {
    const map = new Map<number, CharacterSpell[]>()
    for (const cs of character.spells) {
      const spell = allSpells[normalizeSlug(cs.slug)]
      const level = spell?.level ?? 0
      if (!map.has(level)) map.set(level, [])
      map.get(level)!.push(cs)
    }
    return map
  }, [character.spells, allSpells])

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Spellcasting
        {classRecord.spellcasting && (
          <span className="ml-2 normal-case font-normal text-muted-foreground">
            ({classRecord.spellcasting.ability} based)
          </span>
        )}
      </h2>

      {/* Spell slot tracker */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Spell Slots
          </p>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Attack</p>
              <p className="text-sm font-bold">{spellAttackMod >= 0 ? `+${spellAttackMod}` : `${spellAttackMod}`}</p>
              {!!character.spellBonusModifier && (
                <p className="text-[9px]" style={{ color: 'var(--color-accent-2)' }}>+{character.spellBonusModifier} (item)</p>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Save DC</p>
              <p className="text-sm font-bold">{derived.spellSaveDC}</p>
              {!!character.spellBonusModifier && (
                <p className="text-[9px]" style={{ color: 'var(--color-accent-2)' }}>+{character.spellBonusModifier} (item)</p>
              )}
            </div>
          </div>
        </div>

        {profile.kind === 'pact' && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-8">{ORDINALS[profile.slotLevel]}</span>
            <SlotPips
              total={profile.slotCount}
              used={character.spellSlotsUsed[profile.slotLevel] ?? 0}
              onToggle={n => setSlotUsed(profile.slotLevel, n)}
            />
          </div>
        )}

        {profile.kind === 'slots' &&
          Object.entries(profile.slotsByLevel).map(([k, total]) => {
            const level = parseInt(k, 10) as SpellLevel
            const used = character.spellSlotsUsed[level] ?? 0
            return (
              <div key={level} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-8 flex-none">{ORDINALS[level]}</span>
                <SlotPips total={total!} used={used} onToggle={n => setSlotUsed(level, n)} />
                <span className="text-xs text-muted-foreground ml-auto">{total! - used}/{total}</span>
              </div>
            )
          })}

        {profile.kind !== 'none' && profile.cantripsKnown > 0 && (
          <p className="text-xs text-muted-foreground">
            Cantrips known: <span className="text-foreground font-semibold">{profile.cantripsKnown}</span>
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">Tap a pip to use or restore a slot</p>
      </div>

      {/* Spell list */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Spells Known
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSpellListOpen(true)}
            className="text-muted-foreground hover:text-foreground h-7 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Spell
          </Button>
        </div>

        {character.spells.length === 0 ? (
          <p className="text-sm text-muted-foreground">No spells added yet.</p>
        ) : (
          <div>
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => {
              const spells = spellsByLevel.get(level)
              if (!spells?.length) return null
              return (
                <div key={level}>
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wide py-1 mt-2 first:mt-0"
                    style={{ color: 'var(--color-accent-gold)' }}
                  >
                    {level === 0 ? 'Cantrips' : `${ORDINALS[level]} Level`}
                  </p>
                  {spells.map(cs => (
                    <SpellRow
                      key={cs.slug}
                      charSpell={cs}
                      spell={allSpells[normalizeSlug(cs.slug)]}
                      isPreparedCaster={isPreparedCaster}
                      onTogglePrepared={() => togglePrepared(normalizeSlug(cs.slug))}
                      onRemove={() => removeSpell(normalizeSlug(cs.slug))}
                      onRoll={() => dispatch(
                        { type: 'attack', label: allSpells[normalizeSlug(cs.slug)]?.name ?? normalizeSlug(cs.slug), modifier: spellAttackMod },
                      )}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SelectionList
        entries={[]}
        value=""
        title="Add Spell"
        open={spellListOpen}
        onClose={() => setSpellListOpen(false)}
        onSelect={addSpell}
        tabs={spellTabs}
      />
    </section>
  )
}
