import { EditableTextarea } from './EditableField'
import { ALL_LANGUAGES } from '@/lib/characterSetup'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import type { Character, NewCharacter } from '@/types/character'

interface Props {
  character: Character
  onSave: (changes: Partial<NewCharacter>) => void
}

const FIELDS: Array<{ key: keyof NewCharacter; label: string; rows: number }> = [
  { key: 'personalityTraits', label: 'Personality Traits', rows: 2 },
  { key: 'ideals', label: 'Ideals', rows: 2 },
  { key: 'bonds', label: 'Bonds', rows: 2 },
  { key: 'flaws', label: 'Flaws', rows: 2 },
  { key: 'backstory', label: 'Backstory', rows: 4 },
  { key: 'notes', label: 'Notes', rows: 3 },
]

function LanguageSelector({
  selected,
  onSave,
}: {
  selected: string[]
  onSave: (langs: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  function toggle(lang: string) {
    if (selected.includes(lang)) {
      onSave(selected.filter(l => l !== lang))
    } else {
      onSave([...selected, lang])
    }
  }

  return (
    <div>
      <div
        className="flex flex-wrap gap-1 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        {selected.length === 0 ? (
          <span className="text-sm text-muted-foreground italic">Click to add languages…</span>
        ) : (
          selected.map(l => (
            <span
              key={l}
              className="px-2 py-0.5 rounded-full text-xs font-medium border border-border"
              style={{ color: 'var(--color-accent-gold)' }}
            >
              {l}
            </span>
          ))
        )}
      </div>

      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1">
          {ALL_LANGUAGES.map(lang => (
            <button
              key={lang}
              onClick={() => toggle(lang)}
              className={cn(
                'text-left text-xs px-2 py-1 rounded-md transition-colors',
                selected.includes(lang)
                  ? 'bg-secondary text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
              )}
            >
              {selected.includes(lang) ? '✓ ' : ''}{lang}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DescriptionBlock({ character, onSave }: Props) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Description
      </h2>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        {/* Languages */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Languages
          </p>
          <LanguageSelector
            selected={character.languages}
            onSave={langs => onSave({ languages: langs })}
          />
        </div>

        {/* Text fields */}
        {FIELDS.map(({ key, label, rows }) => (
          <div key={key}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {label}
            </p>
            <EditableTextarea
              value={character[key] as string}
              placeholder={`Click to add ${label.toLowerCase()}…`}
              rows={rows}
              onSave={v => onSave({ [key]: v })}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
