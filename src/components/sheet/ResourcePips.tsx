// Shared spend-tracker pip row (spell slots, superiority dice, item charges, …).
// CONVENTION: filled = AVAILABLE (remaining), hollow = SPENT. The leftmost `remaining`
// pips are lit; spent pips empty out from the right. Clicking a lit pip spends one
// (used+1); clicking a hollow pip restores one (used-1). Bounds hold naturally
// (lit ⇒ used<total, hollow ⇒ used>0). Use this everywhere so every resource tracker
// reads the same way as spell slots.
export function ResourcePips({
  total,
  used,
  onChange,
  size = 'md',
  color = 'var(--color-accent-gold)',
  label = 'one',
}: {
  total: number
  used: number
  onChange: (used: number) => void
  size?: 'sm' | 'md'
  color?: string
  label?: string  // noun for the title, e.g. "slot", "die", "charge"
}) {
  const remaining = total - used
  const dim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: total }).map((_, i) => {
        const available = i < remaining
        return (
          <button
            key={i}
            onClick={() => onChange(available ? used + 1 : used - 1)}
            title={available ? `Use a ${label}` : `Restore a ${label}`}
            aria-label={available ? `Use a ${label}` : `Restore a ${label}`}
            className={`${dim} rounded-full border-2 transition-colors`}
            style={{ borderColor: color, background: available ? color : 'transparent' }}
          />
        )
      })}
    </div>
  )
}
