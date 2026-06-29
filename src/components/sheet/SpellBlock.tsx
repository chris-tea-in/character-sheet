import { useEffect, useMemo, useState } from 'react'
import { Plus, X, BookOpen, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import { InfoPopup } from '@/components/InfoPopup'
import { StepperField } from './StepperField'
import { getSpellcastingInfo, getPreparedSpellCount, isSpellbookCaster, PACT_SLOT_KEY } from '@/lib/spellcasting'
import type { SpellcastingProfile, CasterKind, SpellLevel } from '@/lib/spellcasting'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { abilityModifier } from '@/lib/dice'
import { ABILITY_FULL_TO_SHORT } from '@/lib/characterSetup'
import { loadSpellsData } from '@/lib/data'
import { ORDINALS, LEVEL_GROUP_ORDER, spellGroup, componentStr } from '@/lib/spells'
import { RollButton } from '@/components/sheet/RollButton'
import { parseSpellDamage } from '@/lib/spellDamage'
import type { ParsedSpellDamage } from '@/lib/spellDamage'
import { parseSpellHeal } from '@/lib/spellHeal'
import type { ParsedSpellHeal } from '@/lib/spellHeal'
import { mergeCustomSpells } from '@/lib/customContent'
import { CustomSpellDialog } from './CustomSpellDialog'
import { StatBreakdown } from './StatBreakdown'
import { ResourcePips } from './ResourcePips'
import type { CustomSpellDamage } from './CustomSpellDialog'
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
  // Shared spend-tracker convention (filled = available, hollow = spent).
  return <ResourcePips total={total} used={used} onChange={onToggle} label="slot" />
}

function SpellRow({
  spell,
  charSpell,
  showPreparedToggle,
  homebrew,
  catalogDamage,
  catalogHeal,
  onTogglePrepared,
  onRemove,
  onHit,
  onDamage,
  onHeal,
  onSetDamage,
  attackRollMode,
}: {
  spell: SpellData | undefined
  charSpell: CharacterSpell
  showPreparedToggle: boolean
  homebrew?: boolean   // spell level is above your slot levels — allowed, flagged
  catalogDamage: ParsedSpellDamage | null
  catalogHeal: ParsedSpellHeal | null
  onTogglePrepared: () => void
  onRemove: () => void
  onHit: () => void
  onDamage: () => void
  onHeal: () => void
  onSetDamage: (patch: Partial<CharacterSpell>) => void
  attackRollMode?: 'adv' | 'dis'
}) {
  const [expanded, setExpanded] = useState(false)
  const level = spell?.level ?? 0
  const levelLabel = level === 0 ? 'Cantrip' : `Lv ${level}`
  const dmgInputClass = 'w-16 bg-[var(--color-surface-2)] border border-border rounded px-1.5 py-0.5 text-xs text-foreground'
  // Classify what this spell does, to show the right roll button (#3b):
  //  • damage  → Dmg   • heals (no damage) → Heal   • neither → Utility (no roll)
  // A per-character damage override always counts as damage.
  const hasDamage = !!(charSpell.damageDice || catalogDamage?.dice)
  const hasHeal = !hasDamage && !!catalogHeal
  const usingCatalog = !charSpell.damageDice && !!catalogDamage?.dice

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

        {homebrew && (
          <span
            className="text-[9px] uppercase tracking-wide flex-none"
            style={{ color: 'var(--color-accent-red)' }}
            title="Above your spell-slot levels — kept as homebrew"
          >
            homebrew
          </span>
        )}

        {spell && level > 0 && showPreparedToggle && (
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

        <div className="flex items-center gap-1 flex-none">
          <RollButton label="Hit" rollMode={attackRollMode} onClick={onHit} />
          {hasDamage ? (
            <RollButton label="Dmg" tone="gold" onClick={onDamage} />
          ) : hasHeal ? (
            <RollButton label="Heal" tone="gold" title="Roll how much you heal" onClick={onHeal} />
          ) : (
            <span
              className="text-[10px] text-muted-foreground italic px-1"
              title="No attack, damage, or healing — open for details / set damage manually"
            >
              Utility
            </span>
          )}
        </div>

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

          {/* Damage for the Dmg button. Auto-detected from the spell text (shown as
              the placeholder); type a value only to override it. */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="font-semibold text-foreground">Damage:</span>
            <input
              key={`dice-${charSpell.slug}`}
              defaultValue={charSpell.damageDice ?? ''}
              onBlur={e => onSetDamage({ damageDice: e.target.value.trim() || undefined })}
              placeholder={catalogDamage?.dice ?? '8d6'}
              className={dmgInputClass}
            />
            <input
              key={`type-${charSpell.slug}`}
              defaultValue={charSpell.damageType ?? ''}
              onBlur={e => onSetDamage({ damageType: e.target.value.trim() || undefined })}
              placeholder={catalogDamage?.type ?? 'fire'}
              className={dmgInputClass}
            />
            {level > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">+ per slot above {level}:</span>
                <input
                  key={`per-${charSpell.slug}`}
                  defaultValue={charSpell.damagePerLevel ?? ''}
                  onBlur={e => onSetDamage({ damagePerLevel: e.target.value.trim() || undefined })}
                  placeholder={catalogDamage?.perLevel ?? '1d6'}
                  className="w-14 bg-[var(--color-surface-2)] border border-border rounded px-1.5 py-0.5 text-xs text-foreground"
                />
              </span>
            )}
          </div>
          {usingCatalog && (
            <p className="text-[11px] italic">
              Auto-detected: {catalogDamage!.dice}{catalogDamage!.type ? ` ${catalogDamage!.type}` : ''}
              {catalogDamage!.perLevel ? ` (+${catalogDamage!.perLevel}/slot)` : ''}. Type above to override.
            </p>
          )}
          {level === 0 && hasDamage && (
            <p className="text-[11px] italic">Cantrip damage scales automatically at levels 5 / 11 / 17.</p>
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
  const [customSpellOpen, setCustomSpellOpen] = useState(false)
  const [bonusEditorOpen, setBonusEditorOpen] = useState(false)
  const [openBreakdown, setOpenBreakdown] = useState<null | 'attack' | 'dc'>(null)
  const { dispatch, dispatchDamage } = useRollDispatch(derived)

  useEffect(() => {
    loadSpellsData().then(setAllSpells).catch(() => {})
  }, [])

  // The catalog with this character's homebrew spells folded in (keyed by their
  // custom:<uuid> slug), so they list, view, and classify damage/heal like built-ins.
  const spellMap = useMemo(
    () => mergeCustomSpells(allSpells, character.customSpells) ?? allSpells,
    [allSpells, character.customSpells],
  )

  const { profile: rawProfile, casterKind: rawCasterKind, spellsKnown: rawSpellsKnown } = getSpellcastingInfo(classRecord, classLevel)
  const profile = overrideSlotProfile ?? rawProfile
  if (profile.kind === 'none' && rawProfile.kind === 'none') return null

  const casterKind = overrideCasterKind ?? rawCasterKind
  const isPreparedCaster = casterKind === 'prepared'
  // Wizard prepares a subset of its spellbook (show the Prepared toggle). Other
  // prepared casters prepare their whole list, so every spell is prepared (no toggle).
  const isSpellbook = isPreparedCaster && isSpellbookCaster(classRecord.slug)
  const spellAttackMod = derived.spellAttackBonus
  // Highest level you have slots for — spells above it are castable only as homebrew
  // (RAW: "of a level for which you have spell slots"). Flagged, never blocked.
  const maxSlotLevel =
    profile.kind === 'slots' || profile.kind === 'slots+pact'
      ? Math.max(0, ...Object.keys(profile.slotsByLevel).map(Number))
      : profile.kind === 'pact' ? profile.slotLevel : 0

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
    // Soft cap: spells above your slot levels still appear, flagged as homebrew.
    ...(s.level > maxSlotLevel ? { warning: 'homebrew' } : {}),
  })

  const classSpellEntries: SelectionEntry[] = useMemo(() =>
    Object.entries(spellMap)
      .filter(([key]) => !alreadyKnown.has(key))
      .filter(([, s]) => s.classes.includes(classRecord.slug))
      .map(toEntry),
  [spellMap, alreadyKnown, classRecord.slug, maxSlotLevel])

  const allSpellEntries: SelectionEntry[] = useMemo(() =>
    Object.entries(spellMap)
      .filter(([key]) => !alreadyKnown.has(key))
      .map(toEntry),
  [spellMap, alreadyKnown, maxSlotLevel])

  const spellTabs: TabConfig[] = useMemo(() => [
    { label: classRecord.name, entries: classSpellEntries, groupOrder: LEVEL_GROUP_ORDER },
    { label: 'All Spells', entries: allSpellEntries, groupOrder: LEVEL_GROUP_ORDER },
  ], [classSpellEntries, allSpellEntries, classRecord.name])

  function setSlotUsed(level: SpellLevel, used: number) {
    onSave({ spellSlotsUsed: { ...character.spellSlotsUsed, [level]: used } })
  }

  function addSpell(key: string) {
    // Single-model prepared casters (cleric/druid/paladin/artificer) prepare their
    // whole list, so a newly added spell is prepared immediately. Wizard (spellbook)
    // and known casters add unprepared.
    onSave({ spells: [...character.spells, { slug: key, prepared: isPreparedCaster && !isSpellbook }] })
    setSpellListOpen(false)
  }

  // Homebrew spell: store the catalog-shaped def (so it resolves by slug via the
  // merged spell map) AND add the known-spell instance, with optional damage on
  // the instance (#6a). One write.
  function createCustomSpell(spell: SpellData, damage: CustomSpellDamage | null) {
    const instance: CharacterSpell = { slug: spell.slug, prepared: isPreparedCaster && !isSpellbook }
    if (damage) { instance.damageDice = damage.dice; if (damage.type) instance.damageType = damage.type }
    onSave({
      customSpells: [...(character.customSpells ?? []), spell],
      spells: [...character.spells, instance],
    })
    setCustomSpellOpen(false)
  }

  function removeSpell(key: string) {
    onSave({ spells: character.spells.filter(s => normalizeSlug(s.slug) !== key) })
  }

  function updateSpellDamage(key: string, patch: Partial<CharacterSpell>) {
    onSave({
      spells: character.spells.map(s =>
        normalizeSlug(s.slug) === key ? { ...s, ...patch } : s,
      ),
    })
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
      const spell = spellMap[normalizeSlug(cs.slug)]
      const level = spell?.level ?? 0
      if (!map.has(level)) map.set(level, [])
      map.get(level)!.push(cs)
    }
    return map
  }, [character.spells, spellMap])

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
  // Prepared = leveled spells with the prepared flag set. Every prepared caster has
  // the toggle on the sheet; single-model casters' spells default to prepared on add,
  // so this still reads as their whole list until they unprepare something.
  const preparedCount = character.spells.filter(s => {
    const sp = spellMap[normalizeSlug(s.slug)]
    return (sp?.level ?? 0) > 0 && s.prepared
  }).length
  const cantripLimit = rawProfile.kind === 'none' ? 0 : rawProfile.cantripsKnown
  const spellLimit = isPreparedCaster
    ? getPreparedSpellCount(classRecord.slug, classLevel, castingMod)
    : rawSpellsKnown
  const spellLimitLabel = isPreparedCaster ? 'Prepared' : 'Known'
  // Known casters show total selected; prepared casters show the prepared count.
  // Either way the limit is a soft homebrew cap — going over just flags red.
  const spellCountShown = isPreparedCaster ? preparedCount : spellsSelected
  const overLimit = spellLimit > 0 && spellCountShown > spellLimit

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
              <button
                onClick={() => setOpenBreakdown('attack')}
                title="What's affecting spell attack?"
                className="flex items-center gap-1 mx-auto hover:opacity-75 transition-opacity"
              >
                <span className="text-sm font-bold">{spellAttackMod >= 0 ? `+${spellAttackMod}` : `${spellAttackMod}`}</span>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
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
              <button
                onClick={() => setOpenBreakdown('dc')}
                title="What's affecting spell save DC?"
                className="flex items-center gap-1 mx-auto hover:opacity-75 transition-opacity"
              >
                <span className="text-sm font-bold">{derived.spellSaveDC}</span>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
              </button>
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
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSpellListOpen(true)}
              className="text-muted-foreground hover:text-foreground h-7 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Spell
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCustomSpellOpen(true)}
              className="text-muted-foreground hover:text-foreground h-7 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Custom
            </Button>
          </div>
        </div>

        {/* X/Y indicator — cantrips known, then spells (Known total / Prepared count) */}
        {rawProfile.kind !== 'none' && (
          <p className="text-xs text-muted-foreground mb-1">
            Cantrips {cantripsSelected}/{cantripLimit}
            <span className="mx-1.5">·</span>
            <span style={overLimit ? { color: 'var(--color-accent-red)' } : undefined}>
              {spellLimitLabel} {spellCountShown}{spellLimit > 0 && `/${spellLimit}`}
              {overLimit ? ' (homebrew)' : ''}
            </span>
          </p>
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
                  {spells.map(cs => {
                    const sp = spellMap[normalizeSlug(cs.slug)]
                    const spellLevel = sp?.level ?? 0
                    const label = sp?.name ?? normalizeSlug(cs.slug)
                    // Per-character override wins; otherwise fall back to the damage
                    // auto-detected from the spell's text.
                    const catalog = sp ? parseSpellDamage(sp) : null
                    const heal = sp ? parseSpellHeal(sp) : null
                    const dmgDice = cs.damageDice ?? catalog?.dice ?? ''
                    const dmgType = cs.damageType ?? catalog?.type ?? undefined
                    const dmgPerLevel = cs.damagePerLevel ?? catalog?.perLevel ?? undefined
                    return (
                      <SpellRow
                        key={cs.slug}
                        charSpell={cs}
                        spell={sp}
                        attackRollMode={derived.attackRollState}
                        showPreparedToggle={isPreparedCaster}
                        homebrew={spellLevel > maxSlotLevel}
                        catalogDamage={catalog}
                        catalogHeal={heal}
                        onTogglePrepared={() => togglePrepared(normalizeSlug(cs.slug))}
                        onRemove={() => removeSpell(normalizeSlug(cs.slug))}
                        onHit={() => dispatch({ type: 'attack', label, modifier: spellAttackMod })}
                        onDamage={() => dispatchDamage({
                          label,
                          baseDice: dmgDice,
                          damageBonus: derived.itemSpellDamageBonus,
                          damageType: dmgType,
                          scaling: spellLevel === 0
                            ? { kind: 'cantrip', characterLevel: character.level }
                            : { kind: 'leveled', baseLevel: spellLevel, perLevel: dmgPerLevel, maxLevel: 9 },
                        })}
                        onHeal={() => heal && dispatchDamage({
                          label,
                          baseDice: heal.dice,
                          damageBonus: heal.addsMod ? castingMod : 0,
                          mode: 'heal',
                          scaling: spellLevel === 0
                            ? undefined
                            : { kind: 'leveled', baseLevel: spellLevel, perLevel: heal.perLevel ?? undefined, maxLevel: 9 },
                        })}
                        onSetDamage={patch => updateSpellDamage(normalizeSlug(cs.slug), patch)}
                      />
                    )
                  })}
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

      <CustomSpellDialog
        open={customSpellOpen}
        classSlug={classRecord.slug}
        onClose={() => setCustomSpellOpen(false)}
        onCreate={createCustomSpell}
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

      <StatBreakdown
        open={openBreakdown === 'attack'}
        onClose={() => setOpenBreakdown(null)}
        title="Spell Attack"
        signed
        sources={derived.breakdowns.spellAttack}
        targetKey="spellAttack"
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
      <StatBreakdown
        open={openBreakdown === 'dc'}
        onClose={() => setOpenBreakdown(null)}
        title="Spell Save DC"
        sources={derived.breakdowns.spellSaveDC}
        targetKey="spellSaveDC"
        ledger={character.ledgerOverrides}
        onChange={next => onSave({ ledgerOverrides: next })}
      />
    </section>
  )
}
