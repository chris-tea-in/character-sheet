import type { SetupDraft } from '@/lib/characterSetup'
import { cn } from '@/lib/utils'

interface Props {
  draft: SetupDraft
  onChange: (updates: Partial<SetupDraft>) => void
}

export function SetupScreen5({ draft, onChange }: Props) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        How will your character advance in level?
      </p>

      <div className="space-y-3">
        <ProgressionOption
          value="milestone"
          selected={draft.progressionType === 'milestone'}
          title="Milestone"
          description="Your DM decides when you level up, based on story progress. No XP tracking needed."
          onClick={() => onChange({ progressionType: 'milestone' })}
        />
        <ProgressionOption
          value="xp"
          selected={draft.progressionType === 'xp'}
          title="Experience Points (XP)"
          description="You earn XP from encounters and events. You level up when you reach the required total."
          onClick={() => onChange({ progressionType: 'xp' })}
        />
      </div>
    </div>
  )
}

function ProgressionOption({
  selected,
  title,
  description,
  onClick,
}: {
  value: string
  selected: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border px-4 py-3 transition-colors',
        selected
          ? 'border-[var(--color-accent-gold)] bg-secondary'
          : 'border-border hover:border-border/80 hover:bg-secondary/50',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-4 h-4 rounded-full border-2 flex-none transition-colors"
          style={{
            borderColor: selected ? 'var(--color-accent-gold)' : 'var(--color-border-raw)',
            background: selected ? 'var(--color-accent-gold)' : 'transparent',
          }}
        />
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  )
}
