import { EditableTextarea } from './EditableField'
import { ALL_LANGUAGES } from '@/lib/characterSetup'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Lock, Plus, X } from 'lucide-react'
import type { Character, NewCharacter } from '@/types/character'
import type { DerivedStats, SetGrantSource } from '@/lib/characterStats'

interface Props {
  character: Character
  derived: DerivedStats
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
  sources,
  onSave,
  onToggleSource,
}: {
  selected: string[]
  sources: SetGrantSource[]   // race/feat/item/custom-granted, with provenance + disabled flag
  onSave: (langs: string[]) => void
  onToggleSource: (id: string) => void  // toggle a granted source on/off in the ledger
}) {
  const [open, setOpen] = useState(false)
  const [customLang, setCustomLang] = useState('')

  // Only ACTIVE (non-disabled) grants lock a language; a disabled grant frees it to be
  // added manually if the player wants their own copy (the "augmentable" principle).
  const activeGranted = sources.filter(s => !s.disabled).map(s => s.value)

  function toggle(lang: string) {
    if (activeGranted.includes(lang)) return  // active granted languages are not stored
    if (selected.includes(lang)) {
      onSave(selected.filter(l => l !== lang))
    } else {
      onSave([...selected, lang])
    }
  }

  // Homebrew language not in the standard list — `languages` is a free string[]
  // so a typed name renders as a chip just like a catalog language (BUG-62).
  function addCustom() {
    const name = customLang.trim()
    if (!name) return
    const exists = [...selected, ...activeGranted].some(l => l.toLowerCase() === name.toLowerCase())
    if (!exists) onSave([...selected, name])
    setCustomLang('')
  }

  // Granted sources render first as locked chips (tap to disable/enable); stored ones
  // that aren't also actively granted render after as the editable set.
  const storedOnly = selected.filter(l => !activeGranted.includes(l))
  const isEmpty = sources.length === 0 && storedOnly.length === 0

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {isEmpty ? (
          <span
            className="text-sm text-muted-foreground italic cursor-pointer"
            onClick={() => setOpen(o => !o)}
          >
            Click to add languages…
          </span>
        ) : (
          <>
            {sources.map(s => (
              <button
                key={`src-${s.id}`}
                onClick={() => onToggleSource(s.id)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium border border-border inline-flex items-center gap-1 transition-colors',
                  s.disabled && 'opacity-40 line-through',
                )}
                style={{ color: 'var(--color-accent-gold)' }}
                title={`${s.label}${s.disabled ? ' (off)' : ''} — tap to ${s.disabled ? 'enable' : 'disable'}`}
              >
                <Lock className="h-2.5 w-2.5" />
                {s.value}
              </button>
            ))}
            {storedOnly.map(l => (
              <span
                key={l}
                onClick={() => setOpen(o => !o)}
                className="px-2 py-0.5 rounded-full text-xs font-medium border border-border cursor-pointer"
                style={{ color: 'var(--color-accent-gold)' }}
              >
                {l}
              </span>
            ))}
          </>
        )}
        <button
          onClick={() => setOpen(o => !o)}
          title={open ? 'Close' : 'Add or edit languages'}
          className="ml-0.5 h-5 w-5 inline-flex items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-1">
            {ALL_LANGUAGES.map(lang => {
              const isGranted = activeGranted.includes(lang)
              const isChecked = isGranted || selected.includes(lang)
              return (
                <button
                  key={lang}
                  onClick={() => toggle(lang)}
                  disabled={isGranted}
                  title={isGranted ? 'Granted by your race, a feat, or an item — tap the chip above to disable' : undefined}
                  className={cn(
                    'text-left text-xs px-2 py-1 rounded-md transition-colors inline-flex items-center gap-1',
                    isChecked
                      ? 'bg-secondary text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
                    isGranted && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {isGranted ? <Lock className="h-2.5 w-2.5" /> : isChecked ? '✓ ' : ''}{lang}
                </button>
              )
            })}
          </div>
          {/* Add a homebrew language not in the standard list (BUG-62) */}
          <div className="flex items-center gap-1">
            <input
              value={customLang}
              onChange={e => setCustomLang(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
              placeholder="Add a custom language…"
              className="flex-1 bg-transparent border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-ring"
            />
            <button
              onClick={addCustom}
              disabled={!customLang.trim()}
              className="text-xs px-2 py-1 rounded-md bg-secondary text-foreground font-medium disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function DescriptionBlock({ character, derived, onSave }: Props) {
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
            sources={derived.languageSources}
            onSave={langs => onSave({ languages: langs })}
            onToggleSource={id => {
              const lo = character.ledgerOverrides
              const has = lo.disabled.includes(id)
              onSave({
                ledgerOverrides: {
                  ...lo,
                  disabled: has ? lo.disabled.filter(d => d !== id) : [...lo.disabled, id],
                },
              })
            }}
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
