import { useMemo, useState } from 'react'
import { SelectionList } from '@/components/SelectionList'
import { DetailPopup } from '@/components/DetailPopup'
import { slugToTitle } from '@/lib/characterSetup'
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

interface EarnedFeature { name: string; description?: string }
interface EarnedClassFeatures { heading: string; features: EarnedFeature[] }

/** Read-only list of every class + subclass feature the character has earned at
 * its current per-class levels. Class-level features are name-only (the class data
 * carries no descriptions); subclass features include their description. */
function collectEarnedFeatures(character: Character, setupData: SetupData | null): EarnedClassFeatures[] {
  if (!setupData) return []
  const classes = character.classes?.length
    ? character.classes
    : [{ classSlug: character.class, subclassSlug: character.subclass, level: character.level }]
  const multiclass = classes.length > 1
  const out: EarnedClassFeatures[] = []

  for (const c of classes) {
    if (!c.classSlug) continue
    const classRec = setupData.classes[c.classSlug]
    const className = classRec?.name ?? slugToTitle(c.classSlug)
    const features: EarnedFeature[] = []

    if (classRec) {
      for (let lvl = 1; lvl <= c.level; lvl++) {
        for (const name of (classRec.levels[String(lvl)]?.features ?? [])) {
          features.push({ name })
        }
      }
    }

    const subRec = c.subclassSlug ? setupData.subclasses[`${c.classSlug}:${c.subclassSlug}`] : null
    if (subRec) {
      for (const [lvlKey, entries] of Object.entries(subRec.features)) {
        if (Number(lvlKey) > c.level) continue
        for (const f of entries) features.push({ name: f.name, description: f.description })
      }
    }

    if (features.length) {
      out.push({
        heading: multiclass ? `${className} ${c.level}` : `${className}`,
        features,
      })
    }
  }
  return out
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
        Features
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

              {!atCap && (
                <button
                  onClick={() => setPickerGroupKey(group.key)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/30 transition-colors"
                  style={{ color: 'var(--color-accent-gold)' }}
                >
                  + Add {group.label.toLowerCase()}
                </button>
              )}
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

      {/* Read-only roll-up of every earned class/subclass feature */}
      {earned.length > 0 && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {earned.map(group => (
            <div key={group.heading}>
              <div className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground" style={{ background: 'var(--color-surface)' }}>
                {group.heading}
              </div>
              {group.features.map((f, i) => (
                f.description ? (
                  <button
                    key={`${f.name}-${i}`}
                    onClick={() => setViewingDetail({ name: f.name, description: f.description, sections: [] })}
                    className="w-full text-left px-4 py-2 text-sm hover:opacity-75 transition-opacity"
                  >
                    {f.name}
                  </button>
                ) : (
                  <p key={`${f.name}-${i}`} className="px-4 py-2 text-sm text-muted-foreground">
                    {f.name}
                  </p>
                )
              ))}
            </div>
          ))}
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
