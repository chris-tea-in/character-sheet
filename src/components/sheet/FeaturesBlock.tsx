import { useMemo, useState } from 'react'
import { BookOpen, Sword, Shield, Sparkles, GraduationCap, Eye, Heart, MessageCircle, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SelectionList } from '@/components/SelectionList'
import { DetailPopup } from '@/components/DetailPopup'
import { slugToTitle } from '@/lib/characterSetup'
import { toSubraceSlug } from '@/lib/racialBonuses'
import { lookupFeatureDescription } from '@/lib/data'
import { applicableGroups, resourceCount, meetsFeatureOptionPrereqs, allSelectedOptionSlugs } from '@/lib/classFeatures'
import type { SetupData } from '@/lib/data'
import type { Character, NewCharacter } from '@/types/character'
import type { FeatureOption, FeatureChoiceGroup } from '@/types/data'
import type { SelectionEntry } from '@/components/SelectionList'
import type { DetailItem } from '@/types/detail-item'

interface Props {
  character: Character
  setupData: SetupData | null
  onSave: (changes: Partial<NewCharacter>) => void
}

function optionToDetail(opt: FeatureOption): DetailItem {
  return {
    name: opt.name,
    subtitle: opt.prerequisites?.length ? `Prerequisite: ${opt.prerequisites.join(', ')}` : undefined,
    description: opt.description,
    sections: [],
  }
}

interface EarnedFeature { name: string; description?: string; note?: string }
interface EarnedFeatureGroup { heading: string; features: EarnedFeature[] }

// Race traits that are descriptive boilerplate, not "features" worth listing.
const SKIP_RACE_TRAITS = new Set(['ability score increase', 'age', 'alignment', 'size', 'speed', 'languages'])

// At-a-glance category for a feature so you can scan the list for "what helps in
// combat / with a skill / etc." A stored category (data/feature-categories.json,
// authored against the full description text — far more accurate) wins; otherwise we
// fall back to a keyword heuristic on name + description. Heuristic order matters:
// the first category whose keyword appears wins.
export type FeatureCategoryKey =
  | 'combat' | 'defense' | 'magic' | 'skill' | 'exploration' | 'support' | 'social' | 'utility'

const CATEGORY_META: Record<FeatureCategoryKey, { label: string; Icon: LucideIcon }> = {
  combat:      { label: 'Combat', Icon: Sword },
  defense:     { label: 'Defense', Icon: Shield },
  magic:       { label: 'Magic / Spellcasting', Icon: Sparkles },
  skill:       { label: 'Skill / Knowledge', Icon: GraduationCap },
  exploration: { label: 'Exploration / Senses', Icon: Eye },
  support:     { label: 'Support / Healing', Icon: Heart },
  social:      { label: 'Social', Icon: MessageCircle },
  utility:     { label: 'Utility', Icon: Star },
}

const CATEGORY_KEYWORDS: { key: FeatureCategoryKey; keywords: string[] }[] = [
  { key: 'magic', keywords: ['spell', 'cantrip', 'arcanum', 'eldritch', 'channel divinity', 'metamagic', 'sorcer', 'invocation', 'wild shape', 'mystic', 'infuse', 'magical', 'font of magic', 'pact', 'crimson rite', 'druidic', 'beast spell'] },
  { key: 'support', keywords: ['lay on hands', 'heal', 'second wind', 'song of rest', 'bardic inspiration', 'inspiration', 'cure', 'restoration', 'aura of courage', 'wholeness', 'relentless endurance', 'stabiliz'] },
  { key: 'defense', keywords: ['armor', 'unarmored defense', 'resistance', 'resilien', 'deflect', 'indomitable', 'relentless rage', 'evasion', 'defense', 'parry', 'aura of protection', 'uncanny dodge', 'hardened', 'danger sense', 'blindsense', 'natural armor', 'fey ancestry', 'brave', 'magic resistance'] },
  { key: 'combat', keywords: ['rage', 'attack', 'smite', 'sneak attack', 'martial arts', 'fury', 'strike', 'weapon', 'critical', 'brutal', 'reckless', 'action surge', 'maneuver', 'fighting style', 'favored enemy', 'favored foe', 'hunter', 'feral', 'pounce', 'savage', 'bite', 'ki'] },
  { key: 'social', keywords: ['persuasion', 'deception', 'intimidat', 'performance', 'charm', 'menacing', 'countercharm'] },
  { key: 'skill', keywords: ['expertise', 'proficien', 'jack of all trades', 'lore', 'knowledge', 'cunning', 'reliable talent', 'tool', 'versatility', 'psychometry', 'right tool', 'stonecunning'] },
  { key: 'exploration', keywords: ['darkvision', 'vision', 'sense', 'perception', 'stealth', 'movement', 'explorer', "land's stride", 'tracking', 'vanish', 'hide', 'trance', 'fleet', 'mask of the wild', 'fast movement', 'swim', 'fly', 'climb', 'hold breath'] },
]

function categorizeFeature(
  name: string,
  description?: string,
  stored?: Record<string, string>,
): { label: string; Icon: LucideIcon } {
  const key = stored?.[name]
  if (key && key in CATEGORY_META) return CATEGORY_META[key as FeatureCategoryKey]
  const hay = `${name} ${description ?? ''}`.toLowerCase()
  for (const c of CATEGORY_KEYWORDS) {
    if (c.keywords.some(k => hay.includes(k))) return CATEGORY_META[c.key]
  }
  return CATEGORY_META.utility
}

/** Read-only roll-up of every feature the character has earned, from ALL sources:
 * class + subclass (by per-class level), race + subrace traits, and the background
 * feature. Class-level features are name-only (the class data carries no description);
 * subclass / race / background features include their text. */
function collectEarnedFeatures(character: Character, setupData: SetupData | null): EarnedFeatureGroup[] {
  if (!setupData) return []
  const classes = character.classes?.length
    ? character.classes
    : [{ classSlug: character.class, subclassSlug: character.subclass, level: character.level }]
  const multiclass = classes.length > 1
  const out: EarnedFeatureGroup[] = []

  // ── Class + subclass ──────────────────────────────────────────────────────
  for (const c of classes) {
    if (!c.classSlug) continue
    const classRec = setupData.classes[c.classSlug]
    const className = classRec?.name ?? slugToTitle(c.classSlug)
    const features: EarnedFeature[] = []

    if (classRec) {
      for (let lvl = 1; lvl <= c.level; lvl++) {
        for (const name of (classRec.levels[String(lvl)]?.features ?? [])) {
          features.push({
            name,
            description: lookupFeatureDescription(setupData.featureDescriptions, c.classSlug, name),
            note: `${className} feature · level ${lvl}`,
          })
        }
      }
    }

    const subRec = c.subclassSlug ? setupData.subclasses[`${c.classSlug}:${c.subclassSlug}`] : null
    if (subRec) {
      for (const [lvlKey, entries] of Object.entries(subRec.features)) {
        if (Number(lvlKey) > c.level) continue
        for (const f of entries) features.push({ name: f.name, description: f.description, note: `${subRec.name} · level ${lvlKey}` })
      }
    }

    if (features.length) {
      out.push({ heading: multiclass ? `${className} ${c.level}` : className, features })
    }
  }

  // ── Race + subrace traits ─────────────────────────────────────────────────
  const raceRec = setupData.races[character.race]
  if (raceRec) {
    const features: EarnedFeature[] = []
    const addTraits = (traits: Record<string, string> | undefined, src: string) => {
      for (const [name, description] of Object.entries(traits ?? {})) {
        if (SKIP_RACE_TRAITS.has(name.toLowerCase())) continue
        features.push({ name, description, note: src })
      }
    }
    addTraits(raceRec.base.traits, raceRec.name)
    const subrace = character.subrace
      ? raceRec.subraces.find(s => toSubraceSlug(s.name) === character.subrace)
      : undefined
    if (subrace) addTraits(subrace.traits, subrace.name)
    if (features.length) out.push({ heading: `${raceRec.name} (Race)`, features })
  }

  // ── Background feature ────────────────────────────────────────────────────
  const bgRec = character.background ? setupData.backgrounds[character.background] : null
  if (bgRec?.feature?.name) {
    out.push({
      heading: `${bgRec.name} (Background)`,
      features: [{ name: bgRec.feature.name, description: bgRec.feature.description, note: 'Background feature' }],
    })
  }

  return out
}

/** Legend decoding the category symbols actually present in the earned list. */
function FeatureLegend({ earned, categories }: { earned: EarnedFeatureGroup[]; categories?: Record<string, string> }) {
  const present = new Map<string, LucideIcon>()
  for (const g of earned) {
    for (const f of g.features) {
      const cat = categorizeFeature(f.name, f.description, categories)
      if (!present.has(cat.label)) present.set(cat.label, cat.Icon)
    }
  }
  if (present.size <= 1) return null
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[10px] text-muted-foreground"
      style={{ background: 'var(--color-surface)' }}
    >
      <span className="uppercase tracking-wide font-semibold">Key:</span>
      {[...present].map(([label, Icon]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <Icon className="h-3 w-3" style={{ color: 'var(--color-accent-gold)' }} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  )
}

export function FeaturesBlock({ character, setupData, onSave }: Props) {
  const [pickerGroupKey, setPickerGroupKey] = useState<string | null>(null)
  const [viewingDetail, setViewingDetail] = useState<DetailItem | null>(null)

  const groups = useMemo(
    () => applicableGroups(character, setupData?.classFeatures),
    [character, setupData],
  )
  const earned = useMemo(() => collectEarnedFeatures(character, setupData), [character, setupData])

  const openGroup: FeatureChoiceGroup | null = useMemo(() => {
    if (!pickerGroupKey) return null
    return setupData?.classFeatures[pickerGroupKey] ?? null
  }, [pickerGroupKey, setupData])

  const pickerEntries: SelectionEntry[] = useMemo(() => {
    if (!openGroup) return []
    const selected = new Set(character.classFeatureChoices[openGroup.key] ?? [])
    const classLevel = groups.find(g => g.group.key === openGroup.key)?.classLevel ?? 0
    const prereqCtx = {
      classLevel,
      selectedOptionSlugs: allSelectedOptionSlugs(character.classFeatureChoices),
      knownSpellSlugs: new Set(character.spells.map(s => s.slug.replace(/^spell:/, ''))),
    }
    return openGroup.options
      .filter(o => !selected.has(o.slug))
      .map(o => ({
        slug: o.slug,
        detail: optionToDetail(o),
        warning: meetsFeatureOptionPrereqs(o, prereqCtx) ? undefined : 'Req not met',
      }))
  }, [openGroup, character.classFeatureChoices, character.spells, groups])

  function addOption(group: FeatureChoiceGroup, known: number, slug: string) {
    const current = character.classFeatureChoices[group.key] ?? []
    if (current.includes(slug)) return
    onSave({
      classFeatureChoices: { ...character.classFeatureChoices, [group.key]: [...current, slug] },
    })
    if (current.length + 1 >= known) setPickerGroupKey(null)
  }

  function removeOption(groupKey: string, slug: string) {
    const current = character.classFeatureChoices[groupKey] ?? []
    const nextArr = current.filter(s => s !== slug)
    const next = { ...character.classFeatureChoices }
    if (nextArr.length) next[groupKey] = nextArr
    else delete next[groupKey]
    onSave({ classFeatureChoices: next })
  }

  function setResourceUsed(groupKey: string, used: number) {
    const next = { ...character.featureResourcesUsed }
    if (used > 0) next[groupKey] = used
    else delete next[groupKey]
    onSave({ featureResourcesUsed: next })
  }

  if (!setupData) return null
  if (groups.length === 0 && earned.length === 0) return null

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Features &amp; Traits
      </h2>

      {/* Choosable feature groups (maneuvers, fighting styles, …) */}
      {groups.map(({ group, classLevel, known }) => {
        const selected = character.classFeatureChoices[group.key] ?? []
        const optBySlug = new Map(group.options.map(o => [o.slug, o]))
        const atCap = selected.length >= known
        const overCap = selected.length > known
        const resTotal = resourceCount(group, classLevel)
        const resUsed = Math.min(character.featureResourcesUsed[group.key] ?? 0, resTotal)

        return (
          <div key={group.key} className="rounded-lg border border-border bg-card mb-3">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-sm font-semibold">{group.label}</span>
              <span
                className="text-xs"
                style={{ color: overCap ? 'var(--color-accent-red)' : 'var(--color-text-muted)' }}
              >
                {selected.length}/{known} known
              </span>
            </div>

            {overCap && (
              <p
                className="px-4 py-1.5 text-[11px] border-b border-border"
                style={{ color: 'var(--color-accent-red)' }}
              >
                ⚠ Over the normal limit of {known} for this level (homebrew).
              </p>
            )}

            <div className="divide-y divide-border">
              {selected.length === 0 && (
                <p className="px-4 py-2.5 text-sm text-muted-foreground italic">None selected</p>
              )}
              {selected.map(slug => {
                const opt = optBySlug.get(slug)
                return (
                  <div key={slug} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      onClick={() => opt && setViewingDetail(optionToDetail(opt))}
                      className="flex-1 text-sm text-left hover:opacity-75 transition-opacity truncate"
                    >
                      {opt?.name ?? slugToTitle(slug)}
                    </button>
                    <button
                      onClick={() => removeOption(group.key, slug)}
                      className="text-muted-foreground hover:text-foreground transition-colors text-xs flex-none px-1"
                      aria-label={`Remove ${opt?.name ?? slug}`}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}

              {/* Soft cap (homebrew): adding past `known` is always allowed, just
                  flagged. Hard-locking here would block legitimate homebrew. */}
              <button
                onClick={() => setPickerGroupKey(group.key)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/30 transition-colors"
                style={{ color: atCap ? 'var(--color-accent-red)' : 'var(--color-accent-gold)' }}
                title={atCap ? `This class normally knows ${known}. Adding more exceeds the standard ruleset (homebrew) — allowed, not blocked.` : undefined}
              >
                + Add {group.label.toLowerCase()}{atCap ? ' (over limit)' : ''}
              </button>
            </div>

            {/* Choice-attached resource tracker (e.g. Superiority Dice) */}
            {group.resource && resTotal > 0 && (
              <div className="px-4 py-2.5 border-t border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {group.resource.name}
                    {group.resource.die ? ` (${group.resource.die})` : ''}
                  </span>
                  <span className="text-xs text-muted-foreground">{resTotal - resUsed}/{resTotal}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {Array.from({ length: resTotal }).map((_, i) => {
                    const filled = i < resUsed
                    return (
                      <button
                        key={i}
                        onClick={() => setResourceUsed(group.key, filled ? i : i + 1)}
                        className="w-5 h-5 rounded-full border-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-accent-gold)',
                          background: filled ? 'var(--color-accent-gold)' : 'transparent',
                        }}
                        aria-label={filled ? `Restore ${group.resource!.name}` : `Use ${group.resource!.name}`}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Read-only roll-up of every earned feature — class, subclass, race, background.
          Every row is tappable to read its description (BUG-61); name-only class
          features (no authored text yet) open a stub that points to the rulebook. */}
      {earned.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {earned.map(group => (
            <div key={group.heading}>
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground" style={{ background: 'var(--color-surface)' }}>
                {group.heading}
              </div>
              {group.features.map((f, i) => {
                const cat = categorizeFeature(f.name, f.description, setupData.featureCategories)
                return (
                  <button
                    key={`${f.name}-${i}`}
                    onClick={() => setViewingDetail({
                      name: f.name,
                      subtitle: f.note,
                      description: f.description
                        ?? 'No description is recorded for this feature yet — see your rulebook for the full rules.',
                      sections: [],
                    })}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-left hover:bg-secondary/30 transition-colors"
                  >
                    <cat.Icon className="h-3.5 w-3.5 flex-none" style={{ color: 'var(--color-accent-gold)' }} aria-hidden />
                    <span className="flex-1 truncate">{f.name}</span>
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground flex-none" />
                  </button>
                )
              })}
            </div>
          ))}
          <FeatureLegend earned={earned} categories={setupData.featureCategories} />
        </div>
      )}

      {openGroup && (
        <SelectionList
          entries={pickerEntries}
          value=""
          title={`Choose ${openGroup.label}`}
          open={pickerGroupKey !== null}
          multiSelect={(groups.find(g => g.group.key === openGroup.key)?.known ?? 1) > 1}
          onClose={() => setPickerGroupKey(null)}
          onSelect={slug => {
            const g = groups.find(x => x.group.key === openGroup.key)
            if (g) addOption(g.group, g.known, slug)
          }}
        />
      )}

      <DetailPopup
        item={viewingDetail}
        mode="view"
        open={viewingDetail !== null}
        onClose={() => setViewingDetail(null)}
      />
    </section>
  )
}
