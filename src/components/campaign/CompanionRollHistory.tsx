import { useDiceStore } from '@/store/dice'
import { formatBonus } from '@/lib/dice'

// The companions' own roll history (user decision 2026-07-06: companion rolls do
// NOT appear in the main dice tray — its history filters them out; this panel is
// their home). Entries are matched by the origin tag their kinds carry. Attack and
// damage labels already lead with the companion's name ("Wolf: Bite …"); check-type
// rolls get the name prefixed here at render time — the store's label builder
// stays untouched.
export function CompanionRollHistory({ companionIds }: { companionIds: string[] }) {
  const allRolls = useDiceStore(s => s.rolls)
  const rolls = allRolls.filter(r =>
    r.kind.origin?.scope === 'companion' && companionIds.includes(r.kind.origin.companionId))

  if (rolls.length === 0) return null

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Companion Rolls
      </p>
      <div className="space-y-1">
        {rolls.map(entry => {
          const kt = entry.kind.type
          const needsName = kt === 'save' || kt === 'skill' || kt === 'ability'
          const label = needsName
            ? `${entry.kind.origin?.companionName} — ${entry.label}`
            : entry.label
          return (
            <div key={entry.id} className="flex items-center gap-2 text-sm py-1">
              <span className="text-muted-foreground flex-1 truncate">{label}</span>
              {entry.result.natural2 !== undefined ? (
                <span className="text-muted-foreground text-xs tabular-nums">
                  ({entry.result.natural}
                  <span className="opacity-40 line-through ml-0.5">{entry.result.natural2}</span>
                  {entry.result.modifier !== 0 && <>{formatBonus(entry.result.modifier)}</>})
                </span>
              ) : entry.result.modifier !== 0 ? (
                <span className="text-muted-foreground text-xs">
                  ({entry.result.natural}{formatBonus(entry.result.modifier)})
                </span>
              ) : null}
              <span
                className="font-bold text-base min-w-[2ch] text-right tabular-nums"
                style={{
                  color:
                    entry.result.natural === 20 && kt !== 'damage'
                      ? 'var(--color-accent-gold)'
                      : entry.result.natural === 1 && kt !== 'damage'
                      ? 'var(--color-accent-red)'
                      : undefined,
                }}
              >
                {entry.result.total}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
