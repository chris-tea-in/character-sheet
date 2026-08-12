import { ResourcePips } from '@/components/sheet/ResourcePips'
import { getSpellSlotPools, normalizeSpellSlotUsage } from '@/lib/spellcasting'
import type { SpellcastingProfile } from '@/lib/spellcasting'
import { ORDINALS } from '@/lib/spells'

interface Props {
  profile: SpellcastingProfile
  used: Partial<Record<number, number>>
  onChange: (used: Partial<Record<number, number>>) => void
}

export function SpellSlotTracker({ profile, used, onChange }: Props) {
  const pools = getSpellSlotPools(profile)
  if (pools.length === 0) return null

  const normalizedUsed = normalizeSpellSlotUsage(profile, used)
  const hasUsedSlots = Object.values(normalizedUsed).some(value => (value ?? 0) > 0)

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spell Slots</p>

      {pools.map(pool => {
        const usedSlots = Math.min(pool.total, Math.max(0, normalizedUsed[pool.key] ?? 0))
        const isPactPool = pool.kind === 'pact'
        const label = isPactPool && profile.kind === 'slots+pact'
          ? 'Pact'
          : ORDINALS[pool.castLevel]

        return (
          <div key={pool.key} className="flex items-center gap-3">
            <span
              className="text-xs text-muted-foreground w-8 flex-none"
              title={isPactPool ? 'Pact slots refresh on a short rest' : undefined}
            >
              {label}
            </span>
            <ResourcePips
              total={pool.total}
              used={usedSlots}
              onChange={nextUsed => onChange({ ...normalizedUsed, [pool.key]: nextUsed })}
              label="slot"
            />
            {isPactPool && profile.kind === 'slots+pact' ? (
              <span className="text-xs text-muted-foreground ml-auto">
                {ORDINALS[pool.castLevel]}-level Â· short rest
              </span>
            ) : (
              <span className="text-xs text-muted-foreground ml-auto">{pool.total - usedSlots}/{pool.total}</span>
            )}
          </div>
        )
      })}

      {profile.kind !== 'none' && profile.cantripsKnown > 0 && (
        <p className="text-xs text-muted-foreground">
          Cantrips known: <span className="text-foreground font-semibold">{profile.cantripsKnown}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">Tap a pip to use or restore a slot</p>
        <button
          onClick={() => onChange({})}
          disabled={!hasUsedSlots}
          className="text-[11px] rounded border border-border px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
        >
          Restore all spell slots
        </button>
      </div>
    </div>
  )
}
