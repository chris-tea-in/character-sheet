import { useEffect, useMemo, useState } from 'react'
import { Plus, X, BookOpen, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import { InfoPopup } from '@/components/InfoPopup'
import { StepperField } from './StepperField'
import { getSpellcastingInfo, getPreparedSpellCount, PACT_SLOT_KEY } from '@/lib/spellcasting'
import type { SpellcastingProfile, CasterKind, SpellLevel } from '@/lib/spellcasting'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { abilityModifier } from '@/lib/dice'
import { ABILITY_FULL_TO_SHORT } from '@/lib/characterSetup'
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
  const [bonusEditorOpen, setBonusEditorOpen] = useState(false)
  const { dispatch } = useRollDispatch(derived)

  useEffect(() => {
    loadSpellsData().then(setAllSpells).catch(() => {})
  }, [])

  const { profile: rawProfile, casterKind: rawCasterKind, spellsKnown: rawSpellsKnown } = getSpellcastingInfo(classRecord, classLevel)
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

  // "Spells Known" card indicator (mirrors the creation wizard): a total
  // (cantrips + known/prepared) plus a per-level breakdown. Totals are a
  // per-class concept, so they use the primary classRecord/classLevel; per-level
  // denominators use the (override-aware) slot profile. Per the wizard, the
  // per-level denominator is the slot count and is informational only (BUG-24).
  const castingShort = classRecord.spellcasting?.ability
    ? ABILITY_FULL_TO_SHORT[classRecord.spellcasting.ability.toLowerCase()]
    : undefined
  const castingMod = castingShort ? abilityModifier(derived.effectiveAbilities[castingShort]) : 0
  const cantripsSelected = (spellsByLevel.get(0) ?? []).length
  const spellsSelected = character.spells.length - cantripsSelected
  const cantripLimit = rawProfile.kind === 'none' ? 0 : rawProfile.cantripsKnown
  const spellLimit = isPreparedCaster
    ? getPreparedSpellCount(classRecord.slug, classLevel, castingMod)
    : rawSpellsKnown
  const spellLimitLabel = isPreparedCaster ? 'Prepared' : 'Known'
  const indicatorSlots: Partial<Record<number, number>> =
    profile.kind === 'slots' || profile.kind === 'slots+pact'
      ? profile.slotsByLevel
      : profile.kind === 'pact'
        ? { [profile.slotLevel]: profile.slotCount }
        : {}

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
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Spell Slots
            </p>
            <button
              onClick={() => setBonusEditorOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Manual spell-focus override"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Attack</p>
              <p className="text-sm font-bold">{spellAttackMod >= 0 ? `+${spellAttackMod}` : `${spellAttackMod}`}</p>
              {!!character.spellBonusModifier && (
                <button
                  onClick={() => setBonusEditorOpen(true)}
                  className="text-[9px] hover:opacity-75 transition-opacity"
                  style={{ color: 'var(--color-accent-gold)' }}
                  title="Edit manual spell-focus override"
                >
                  +{character.spellBonusModifier} (manual)
                </button>
              )}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Save DC</p>
              <p className="text-sm font-bold">{derived.spellSaveDC}</p>
              {!!character.spellBonusModifier && (
                <button
                  onClick={() => setBonusEditorOpen(true)}
                  className="text-[9px] hover:opacity-75 transition-opacity"
                  style={{ color: 'var(--color-accent-gold)' }}
                  title="Edit manual spell-focus override"
                >
                  +{character.spellBonusModifier} (manual)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Pure pact pool (single-class warlock) — keyed by its slot level */}
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

        {/* Standard slot rows (single-class casters and multiclass slots/slots+pact) */}
        {(profile.kind === 'slots' || profile.kind === 'slots+pact') &&
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

        {/* Pact pool alongside standard slots — separate counter (BUG-16) */}
        {profile.kind === 'slots+pact' && (
          <div className="flex items-center gap-3 pt-1 border-t border-border">
            <span className="text-[11px] text-muted-foreground w-8 flex-none" title="Pact slots refresh on a short rest">
              Pact
            </span>
            <SlotPips
              total={profile.pactSlotCount}
              used={character.spellSlotsUsed[PACT_SLOT_KEY] ?? 0}
              onToggle={n => setSlotUsed(PACT_SLOT_KEY as SpellLevel, n)}
            />
            <span className="text-xs text-muted-foreground ml-auto">
              {ORDINALS[profile.pactSlotLevel]}-level · short rest
            </span>
          </div>
        )}

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

        {/* X/Y indicator — mirrors the creation wizard (total + per-level) */}
        {rawProfile.kind !== 'none' && (
          <p className="text-xs text-muted-foreground mb-1">
            Cantrips {cantripsSelected}/{cantripLimit}
            <span className="mx-1.5">·</span>
            {spellLimitLabel} {spellsSelected}{spellLimit > 0 && `/${spellLimit}`}
          </p>
        )}
        {Object.keys(indicatorSlots).length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {Object.entries(indicatorSlots)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([lvl, cap]) => {
                const used = (spellsByLevel.get(Number(lvl)) ?? []).length
                return (
                  <span
                    key={lvl}
                    className="text-[11px]"
                    style={{ color: 'var(--color-text-muted)', opacity: used >= (cap ?? 0) ? 0.45 : 1 }}
                  >
                    {ORDINALS[Number(lvl)]}: {used}/{cap}
                  </span>
                )
              })}
          </div>
        )}

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

      {/* Manual spell-focus override — homebrew/un-cataloged focuses only.
          Catalog focus items (Rod of the Pact Keeper, Wand of the War Mage, …)
          apply automatically at render time when equipped; leave this at 0 for them. */}
      <InfoPopup
        open={bonusEditorOpen}
        onClose={() => setBonusEditorOpen(false)}
        title="Manual Spell-Focus Override"
        description="Flat bonus to your spell attack rolls and spell save DC for a homebrew or un-cataloged focus. Catalog focus items apply automatically when equipped — leave this at 0 for them to avoid double-counting."
      >
        <StepperField
          value={character.spellBonusModifier ?? 0}
          onSave={v => onSave({ spellBonusModifier: Math.max(0, v) })}
          min={0}
          max={5}
          size="sm"
        />
        <Button onClick={() => setBonusEditorOpen(false)}>Done</Button>
      </InfoPopup>
    </section>
  )
}
