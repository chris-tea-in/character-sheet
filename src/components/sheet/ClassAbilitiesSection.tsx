// Class abilities (Lay on Hands, Rage, Ki …) rendered as a section of the Spells
// area — resource-backed feature rows, NOT spells (no slot interaction). Gating and
// resource sizing both use the OWNING class's level (INV-2) via earnedAbilities /
// resolveResourceMax; abilityMod resources read derived.effectiveAbilities so
// racial ASIs and feat bonuses count (INV-1). Usage persists in
// character.featureResourcesUsed under the ability's namespaced "ability:…" key;
// reset is manual (tap pips / Reset) — the app has no rest system.
import { useState } from 'react'
import { StepperField } from './StepperField'
import { ResourcePips } from './ResourcePips'
import { earnedAbilities, owningClassLevel, resolveResourceMax } from '@/lib/classFeatures'
import { lookupFeatureDescription } from '@/lib/data'
import type { FeatureDescriptions } from '@/lib/data'
import type { ClassAbility } from '@/types/data'
import type { Character, NewCharacter } from '@/types/character'
import type { DerivedStats } from '@/lib/characterStats'

const ACTION_BADGE: Record<ClassAbility['action'], string> = {
  action: 'A', bonus_action: 'BA', reaction: 'R', other: '—',
}
const ACTION_TITLE: Record<ClassAbility['action'], string> = {
  action: 'Action', bonus_action: 'Bonus action', reaction: 'Reaction', other: 'No action / special',
}

interface Props {
  character: Character
  abilities: ClassAbility[]
  featureDescriptions: FeatureDescriptions
  derived: DerivedStats
  onSave: (changes: Partial<NewCharacter>) => void
}

export function ClassAbilitiesSection({ character, abilities, featureDescriptions, derived, onSave }: Props) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const earned = earnedAbilities(character, abilities)
  if (earned.length === 0) return null

  const maxFor = (a: ClassAbility) =>
    a.resource ? resolveResourceMax(a.resource, owningClassLevel(character, a), derived.effectiveAbilities) : 0
  const usedFor = (key: string, max: number) =>
    Math.min(character.featureResourcesUsed[key] ?? 0, max)

  function setUsed(key: string, used: number) {
    const next = { ...character.featureResourcesUsed }
    if (used > 0) next[key] = used
    else delete next[key]
    onSave({ featureResourcesUsed: next })
  }

  // Cost rows (Flurry of Blows → Ki) spend from another EARNED ability's resource.
  const byKey = new Map(earned.map(a => [a.key, a]))

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Class Abilities
      </p>
      <div className="divide-y divide-border">
        {earned.map(a => {
          const max = maxFor(a)
          const used = usedFor(a.key, max)
          const remaining = max - used
          const expanded = expandedKey === a.key
          const description = lookupFeatureDescription(featureDescriptions, a.source.classSlug, a.name)

          const cost = a.cost
          const costPool = cost ? byKey.get(cost.key) : undefined
          const costMax = costPool ? maxFor(costPool) : 0
          const costUsed = costPool ? usedFor(costPool.key, costMax) : 0
          const costRemaining = costMax - costUsed
          const costLabel = costPool?.resource?.label ?? 'resource'
          // "1 ki point", "2 ki points" — depluralize the label for a single spend.
          const costNoun = cost?.amount === 1 ? costLabel.toLowerCase().replace(/s$/, '') : costLabel.toLowerCase()

          return (
            <div key={a.key} className="py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="text-[10px] font-bold px-1 py-0.5 rounded flex-none w-8 text-center"
                  title={ACTION_TITLE[a.action]}
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-accent-gold)' }}
                >
                  {ACTION_BADGE[a.action]}
                </span>
                <button
                  onClick={() => setExpandedKey(expanded ? null : a.key)}
                  className="flex-1 text-left text-sm font-medium hover:opacity-75 truncate"
                >
                  {a.name}
                </button>
                {cost && (
                  <button
                    onClick={() => costPool && setUsed(costPool.key, Math.min(costUsed + cost.amount, costMax))}
                    disabled={!costPool || costRemaining < cost.amount}
                    className="text-xs px-2 py-1 rounded border border-border hover:bg-secondary transition-colors disabled:opacity-40 disabled:hover:bg-transparent flex-none"
                    title={costPool
                      ? `Spends ${cost.amount} from ${costLabel} (${costRemaining} left)`
                      : 'Requires a resource this character does not have'}
                  >
                    Use ({cost.amount} {costNoun})
                  </button>
                )}
              </div>

              {a.resource && max > 0 && (
                a.resource.kind === 'uses' && max <= 12 ? (
                  <div className="flex items-center gap-3 pl-10">
                    <ResourcePips
                      total={max}
                      used={used}
                      onChange={u => setUsed(a.key, u)}
                      label={a.resource.label.toLowerCase()}
                      size="sm"
                    />
                    <span className="text-xs text-muted-foreground ml-auto flex-none">
                      {remaining}/{max}{a.resource.rest ? ` · ${a.resource.rest} rest` : ''}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pl-10">
                    <span className="text-xs text-muted-foreground">{a.resource.label}</span>
                    <StepperField
                      value={remaining}
                      min={0}
                      max={max}
                      typeable
                      size="sm"
                      valueClassName="text-sm"
                      onSave={v => setUsed(a.key, max - v)}
                    />
                    <span className="text-xs text-muted-foreground ml-auto flex-none">
                      {remaining}/{max}{a.resource.rest ? ` · ${a.resource.rest} rest` : ''}
                    </span>
                    {used > 0 && (
                      <button
                        onClick={() => setUsed(a.key, 0)}
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex-none"
                        title={`Restore all ${a.resource.label}`}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )
              )}

              {expanded && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap pl-10">
                  {description ?? 'No description authored yet — see the class entry in the rulebook.'}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
