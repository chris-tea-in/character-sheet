import { useState } from 'react'
import { SelectionList, type SelectionEntry } from '@/components/SelectionList'
import { backgroundToDetailItem } from '@/lib/characterSetup'
import type { SetupDraft } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import { cn } from '@/lib/utils'

interface Props {
  draft: SetupDraft
  data: SetupData
  errors: string[]
  onChange: (updates: Partial<SetupDraft>) => void
}

const ALIGNMENTS = [
  'Lawful Good', 'Neutral Good', 'Chaotic Good',
  'Lawful Neutral', 'True Neutral', 'Chaotic Neutral',
  'Lawful Evil', 'Neutral Evil', 'Chaotic Evil',
]

export function SetupScreen2({ draft, data, errors, onChange }: Props) {
  const [bgListOpen, setBgListOpen] = useState(false)

  const selectedBg = data.backgrounds[draft.backgroundSlug]

  const bgEntries: SelectionEntry[] = Object.values(data.backgrounds).map((b) => ({
    slug: b.slug,
    detail: backgroundToDetailItem(b),
  }))

  const hasError = (field: string) => errors.some((e) => e.toLowerCase().includes(field.toLowerCase()))

  return (
    <div className="space-y-6">
      {/* Background */}
      <Field label="Background" error={hasError('background') ? 'Background is required' : undefined}>
        <button
          onClick={() => setBgListOpen(true)}
          className={cn(
            'w-full text-left px-3 py-2 text-sm rounded-md border transition-colors',
            'bg-secondary hover:bg-secondary/80',
            selectedBg ? 'border-border text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
            hasError('background') && 'border-destructive',
          )}
        >
          {selectedBg ? selectedBg.name.replace(/^Background:\s*/i, '') : 'Choose Background'}
        </button>
        <SelectionList
          entries={bgEntries}
          value={draft.backgroundSlug}
          onSelect={(slug) => onChange({ backgroundSlug: slug })}
          open={bgListOpen}
          onClose={() => setBgListOpen(false)}
          title="Choose Background"
          allowCreateOwn
        />
      </Field>

      {/* Details — all optional */}
      <p className="text-xs text-muted-foreground">
        The fields below are optional and can be filled in later.
      </p>

      <Field label="Alignment">
        <select
          value={draft.alignment}
          onChange={(e) => onChange({ alignment: e.target.value })}
          className={selectClass}
        >
          <option value="">— choose —</option>
          {ALIGNMENTS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </Field>

      <Field label="Personality Traits">
        {selectedBg?.personality_traits.length ? (
          <SuggestTextarea
            value={draft.personalityTraits}
            onChange={(v) => onChange({ personalityTraits: v })}
            suggestions={selectedBg.personality_traits}
            placeholder="Enter or pick a personality trait…"
          />
        ) : (
          <textarea
            value={draft.personalityTraits}
            onChange={(e) => onChange({ personalityTraits: e.target.value })}
            placeholder="Describe your personality traits…"
            rows={2}
            className={textareaClass}
          />
        )}
      </Field>

      <Field label="Ideals">
        {selectedBg?.ideals.length ? (
          <SuggestTextarea
            value={draft.ideals}
            onChange={(v) => onChange({ ideals: v })}
            suggestions={selectedBg.ideals}
            placeholder="Enter or pick an ideal…"
          />
        ) : (
          <textarea
            value={draft.ideals}
            onChange={(e) => onChange({ ideals: e.target.value })}
            placeholder="What do you believe in?"
            rows={2}
            className={textareaClass}
          />
        )}
      </Field>

      <Field label="Bonds">
        {selectedBg?.bonds.length ? (
          <SuggestTextarea
            value={draft.bonds}
            onChange={(v) => onChange({ bonds: v })}
            suggestions={selectedBg.bonds}
            placeholder="Enter or pick a bond…"
          />
        ) : (
          <textarea
            value={draft.bonds}
            onChange={(e) => onChange({ bonds: e.target.value })}
            placeholder="What connects you to the world?"
            rows={2}
            className={textareaClass}
          />
        )}
      </Field>

      <Field label="Flaws">
        {selectedBg?.flaws.length ? (
          <SuggestTextarea
            value={draft.flaws}
            onChange={(v) => onChange({ flaws: v })}
            suggestions={selectedBg.flaws}
            placeholder="Enter or pick a flaw…"
          />
        ) : (
          <textarea
            value={draft.flaws}
            onChange={(e) => onChange({ flaws: e.target.value })}
            placeholder="What is your greatest weakness?"
            rows={2}
            className={textareaClass}
          />
        )}
      </Field>

      <Field label="Backstory">
        <textarea
          value={draft.backstory}
          onChange={(e) => onChange({ backstory: e.target.value })}
          placeholder="Tell your character's story…"
          rows={4}
          className={textareaClass}
        />
      </Field>

      <Field label="Appearance">
        <textarea
          value={draft.appearance}
          onChange={(e) => onChange({ appearance: e.target.value })}
          placeholder="Describe your character's appearance…"
          rows={2}
          className={textareaClass}
        />
      </Field>
    </div>
  )
}

// Shows a textarea with a dropdown of background-provided suggestions
function SuggestTextarea({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
  placeholder: string
}) {
  return (
    <div className="space-y-1.5">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className={textareaClass}
      />
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
          Suggestions from background ({suggestions.length})
        </summary>
        <div className="mt-1 space-y-1 border border-border rounded-md overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onChange(s)}
              className="w-full text-left px-3 py-2 text-xs hover:bg-secondary transition-colors border-b border-border last:border-0"
            >
              {s}
            </button>
          ))}
        </div>
      </details>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}

const textareaClass =
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-secondary resize-none ' +
  'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring'

const selectClass =
  'w-full px-3 py-2 text-sm rounded-md border border-border bg-secondary ' +
  'focus:outline-none focus:ring-1 focus:ring-ring'
