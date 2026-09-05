import { useState } from 'react'
import type { Character, NewCharacter } from '@/types/character'
import type { ClassFeatureData } from '@/types/data'
import type { DerivedStats } from '@/lib/characterStats'
import { selectedFeatureOptions, eldritchSmiteDamage } from '@/lib/selectedFeatureActions'
import { normalizeSpellSlotUsage, type SpellcastingProfile } from '@/lib/spellcasting'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { Button } from '@/components/ui/button'
import { RollButton } from './RollButton'

export function SelectedFeaturesSection({ character, features, derived, profile, onSave }: {
  character: Character
  features: ClassFeatureData | null | undefined
  derived: DerivedStats
  profile: SpellcastingProfile
  onSave: (changes: Partial<NewCharacter>) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const { dispatchDamage } = useRollDispatch(derived)
  const selected = selectedFeatureOptions(character, features)
  if (selected.length === 0) return null

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected Class Features</h3>
      <div className="divide-y divide-border">
        {selected.map(({ group, option }) => {
          const key = `${group.key}:${option.slug}`
          const isSmite = group.source.classSlug === 'warlock' && option.slug === 'eldritch-smite'
          const smite = isSmite ? eldritchSmiteDamage(profile, character.spellSlotsUsed) : null
          return (
            <div key={key} className="py-2 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="flex-1 text-sm font-medium text-left hover:opacity-75"
                  aria-expanded={expanded === key}
                  onClick={() => setExpanded(expanded === key ? null : key)}
                >{option.name}</button>
                <span className="text-xs text-muted-foreground">{group.label}</span>
                {smite && <>
                  <span className="text-xs text-muted-foreground">{smite.dice} force · {smite.remaining} Pact slots left</span>
                  <Button size="sm" variant="outline" disabled={smite.remaining === 0} onClick={() => {
                    const usage = normalizeSpellSlotUsage(profile, character.spellSlotsUsed)
                    onSave({ spellSlotsUsed: { ...usage, [smite.key]: (usage[smite.key] ?? 0) + 1 } })
                  }}>Use Pact slot</Button>
                  <RollButton label="Dmg" tone="gold" onClick={() => dispatchDamage({
                    label: option.name, baseDice: smite.dice, damageBonus: 0, damageType: 'force',
                  })} />
                </>}
              </div>
              {isSmite && <p className="text-xs text-muted-foreground">
                Once per turn, after a pact weapon hit. Spend a slot and roll the extra damage separately.
                {!smite && ' No Pact Magic slots available.'}
              </p>}
              {expanded === key && <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{option.description}</p>}
            </div>
          )
        })}
      </div>
    </section>
  )
}
