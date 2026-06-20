import { useMemo, useState } from 'react'
import { SelectionList } from '@/components/SelectionList'
import { DetailPopup } from '@/components/DetailPopup'
import { applicableGroups, meetsFeatureOptionPrereqs, allSelectedOptionSlugs } from '@/lib/classFeatures'
import type { SetupDraft } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import type { Character, ClassEntry } from '@/types/character'
import type { FeatureOption } from '@/types/data'
import type { SelectionEntry } from '@/components/SelectionList'
import type { DetailItem } from '@/types/detail-item'

interface Props {
  draft: SetupDraft
  data: SetupData
  errors: string[]
  onChange: (patch: Partial<SetupDraft>) => void
}

function optionToDetail(opt: FeatureOption): DetailItem {
  return {
    name: opt.name,
    subtitle: opt.prerequisites?.length ? `Prerequisite: ${opt.prerequisites.join(', ')}` : undefined,
    description: opt.description,
    sections: [],
  }
}

export function SetupScreenFeatures({ draft, data, onChange }: Props) {
  const [pickerKey, setPickerKey] = useState<string | null>(null)
  const [viewingDetail, setViewingDetail] = useState<DetailItem | null>(null)

  const groups = useMemo(() => {
    const classes: ClassEntry[] = [
      { classSlug: draft.classSlug, subclassSlug: draft.subclassSlug || null, level: draft.level },
      ...draft.extraClasses.map(ec => ({
        classSlug: ec.classSlug,
        subclassSlug: ec.subclassSlug || null,
        level: ec.level,
      })),
    ].filter(c => c.classSlug)
    // applicableGroups only reads `classes` (+ legacy fallback, unused here)
    const charLike = {
      classes,
      class: draft.classSlug,
      subclass: draft.subclassSlug || null,
      level: draft.level,
    } as Character
    return applicableGroups(charLike, data.classFeatures)
  }, [draft.classSlug, draft.subclassSlug, draft.level, draft.extraClasses, data.classFeatures])

  const openGroupInfo = pickerKey ? groups.find(g => g.group.key === pickerKey) : null

  const pickerEntries: SelectionEntry[] = useMemo(() => {
    if (!openGroupInfo) return []
    const selected = new Set(draft.classFeatureChoices[openGroupInfo.group.key] ?? [])
    const prereqCtx = {
      classLevel: openGroupInfo.classLevel,
      selectedOptionSlugs: allSelectedOptionSlugs(draft.classFeatureChoices),
      knownSpellSlugs: new Set([...draft.cantripSlugs, ...draft.spellSlugs]),
    }
    return openGroupInfo.group.options
      .filter(o => !selected.has(o.slug))
      .map(o => ({
        slug: o.slug,
        detail: optionToDetail(o),
        warning: meetsFeatureOptionPrereqs(o, prereqCtx) ? undefined : 'Req not met',
      }))
  }, [openGroupInfo, draft.classFeatureChoices, draft.cantripSlugs, draft.spellSlugs])

  function add(groupKey: string, known: number, slug: string) {
    const cur = draft.classFeatureChoices[groupKey] ?? []
    if (cur.includes(slug)) return
    onChange({ classFeatureChoices: { ...draft.classFeatureChoices, [groupKey]: [...cur, slug] } })
    if (cur.length + 1 >= known) setPickerKey(null)
  }

  function remove(groupKey: string, slug: string) {
    const cur = draft.classFeatureChoices[groupKey] ?? []
    const arr = cur.filter(s => s !== slug)
    const next = { ...draft.classFeatureChoices }
    if (arr.length) next[groupKey] = arr
    else delete next[groupKey]
    onChange({ classFeatureChoices: next })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Choose the class features that require a selection at your level. You can change these
        anytime on your character sheet.
      </p>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground italic rounded-lg border border-border p-4">
          No class features to select at this level.
        </p>
      )}

      {groups.map(({ group, known }) => {
        const selected = draft.classFeatureChoices[group.key] ?? []
        const optBySlug = new Map(group.options.map(o => [o.slug, o]))
        const atCap = selected.length >= known
        const overCap = selected.length > known
        const remaining = known - selected.length

        return (
          <div key={group.key} className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-sm font-semibold">{group.label}</span>
              <span
                className="text-xs"
                style={{ color: overCap ? 'var(--color-accent-red)' : atCap ? 'var(--color-text-muted)' : 'var(--color-accent-gold)' }}
              >
                {selected.length}/{known} chosen
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
              {selected.map(slug => {
                const opt = optBySlug.get(slug)
                return (
                  <div key={slug} className="flex items-center gap-3 px-4 py-2.5">
                    <button
                      onClick={() => opt && setViewingDetail(optionToDetail(opt))}
                      className="flex-1 text-sm text-left hover:opacity-75 transition-opacity truncate"
                    >
                      {opt?.name ?? slug}
                    </button>
                    <button
                      onClick={() => remove(group.key, slug)}
                      className="text-muted-foreground hover:text-foreground transition-colors text-xs flex-none px-1"
                      aria-label={`Remove ${opt?.name ?? slug}`}
                    >
                      ✕
                    </button>
                  </div>
                )
              })}

              {/* Soft cap (homebrew): choosing past `known` is allowed, just flagged. */}
              <button
                onClick={() => setPickerKey(group.key)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-secondary/30 transition-colors"
                style={{ color: atCap ? 'var(--color-accent-red)' : 'var(--color-accent-gold)' }}
                title={atCap ? `This class normally chooses ${known}. Adding more exceeds the standard ruleset (homebrew) — allowed, not blocked.` : undefined}
              >
                + {atCap ? `Add ${group.label.toLowerCase()} (over limit)` : `Choose ${group.label.toLowerCase()} (${remaining} left)`}
              </button>
            </div>
          </div>
        )
      })}

      {openGroupInfo && (
        <SelectionList
          entries={pickerEntries}
          value=""
          title={`Choose ${openGroupInfo.group.label}`}
          open={pickerKey !== null}
          multiSelect={openGroupInfo.known - (draft.classFeatureChoices[openGroupInfo.group.key]?.length ?? 0) > 1}
          onClose={() => setPickerKey(null)}
          onSelect={slug => add(openGroupInfo.group.key, openGroupInfo.known, slug)}
        />
      )}

      <DetailPopup
        item={viewingDetail}
        mode="view"
        open={viewingDetail !== null}
        onClose={() => setViewingDetail(null)}
      />
    </div>
  )
}
