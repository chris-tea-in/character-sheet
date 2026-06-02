import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SetupScreen1 } from '@/components/setup/SetupScreen1'
import { SetupScreen2 } from '@/components/setup/SetupScreen2'
import { SetupScreen3 } from '@/components/setup/SetupScreen3'
import { SetupScreen4 } from '@/components/setup/SetupScreen4'
import { SetupScreen5 } from '@/components/setup/SetupScreen5'
import { INITIAL_DRAFT, draftToNewCharacter, isEquipmentComplete, isLevelAsiComplete } from '@/lib/characterSetup'
import { getSpellcastingInfo } from '@/lib/spellcasting'
import { loadSetupData } from '@/lib/data'
import { useCharacterStore } from '@/store/characters'
import type { SetupDraft } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'

// Ordered top-to-bottom: first match wins
const FIELD_IDS: Array<[string, string]> = [
  ['name', 'field-name'],
  ['race', 'field-race'],
  ['class', 'field-class'],
  ['subclass', 'field-subclass'],
  ['background', 'field-background'],
]

function scrollToFirstError(errs: string[]) {
  for (const [keyword, id] of FIELD_IDS) {
    if (errs.some((e) => e.toLowerCase().includes(keyword))) {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
  }
}

const SCREEN_TITLES = [
  'Identity & Stats',
  'Background & Details',
  'Proficiencies',
  'Starting Equipment',
  'Progression',
]

function validateScreen(screen: number, draft: SetupDraft, data: SetupData | null): string[] {
  if (screen === 1) {
    const errors: string[] = []
    if (!draft.name.trim()) errors.push('Name is required')
    if (!draft.raceSlug) errors.push('Race is required')
    if (!draft.classSlug) errors.push('Class is required')
    if (data && draft.classSlug) {
      const hasSubclasses = Object.values(data.subclasses).some(
        (s) => s.classSlug === draft.classSlug && draft.level >= s.choiceLevel,
      )
      if (hasSubclasses && !draft.subclassSlug) errors.push('Subclass is required')
    }
    if (draft.hpMethod === 'roll' && draft.hpRolled === null) {
      errors.push('HP roll is required — click the Roll button')
    }
    if (data && !isLevelAsiComplete(draft, data)) {
      errors.push('Complete all ability score improvement or feat choices')
    }
    return errors
  }
  if (screen === 2) {
    if (!draft.backgroundSlug) return ['Background is required']
  }
  if (screen === 4 && data) {
    if (!isEquipmentComplete(draft, data)) {
      return ['Complete all starting equipment choices before continuing']
    }
  }
  if (screen === 3 && data && draft.classSlug) {
    const cls = data.classes[draft.classSlug]
    if (cls) {
      const info = getSpellcastingInfo(cls, draft.level)
      const errors: string[] = []
      if (info.cantripsKnown > draft.cantripSlugs.length) {
        errors.push(`Choose ${info.cantripsKnown - draft.cantripSlugs.length} more cantrip(s)`)
      }
      if ((info.casterKind === 'known' || info.casterKind === 'pact') && info.spellsKnown > draft.spellSlugs.length) {
        errors.push(`Choose ${info.spellsKnown - draft.spellSlugs.length} more spell(s)`)
      }
      return errors
    }
  }
  return []
}

export default function CreateCharacterPage() {
  const navigate = useNavigate()
  const createCharacter = useCharacterStore((s) => s.create)

  const [data, setData] = useState<SetupData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<SetupDraft>(INITIAL_DRAFT)
  const [screen, setScreen] = useState(1)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  useEffect(() => {
    loadSetupData()
      .then(setData)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load data'),
      )
  }, [])

  function updateDraft(updates: Partial<SetupDraft>) {
    setDraft((prev) => ({ ...prev, ...updates }))
    setErrors([])
  }

  function handleNext() {
    const errs = validateScreen(screen, draft, data)
    if (errs.length) {
      setErrors(errs)
      scrollToFirstError(errs)
      return
    }
    setErrors([])
    setScreen((s) => s + 1)
  }

  function handleBack() {
    setErrors([])
    if (screen === 1) {
      navigate('/')
    } else {
      setScreen((s) => s - 1)
    }
  }

  async function handleFinish() {
    const errs = validateScreen(screen, draft, data)
    if (errs.length) {
      setErrors(errs)
      return
    }
    if (!data) return
    setSubmitting(true)
    try {
      const newChar = draftToNewCharacter(draft, data)
      const created = await createCharacter(newChar)
      navigate(`/character/${created.id}`)
    } catch {
      setErrors(['Failed to create character. Please try again.'])
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-destructive">{loadError}</p>
          <Button variant="outline" onClick={() => navigate('/')}>Go back</Button>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    )
  }

  const isLastScreen = screen === SCREEN_TITLES.length

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Header */}
      <header className="flex-none border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={handleBack}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              Step {screen} of {SCREEN_TITLES.length}
            </p>
            <h1 className="text-base font-semibold leading-tight truncate">
              {SCREEN_TITLES[screen - 1]}
            </h1>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-2xl mx-auto mt-2">
          <div className="h-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(screen / SCREEN_TITLES.length) * 100}%`,
                background: 'var(--color-accent-gold)',
              }}
            />
          </div>
        </div>
      </header>

      {/* Validation error banner */}
      {errors.length > 0 && (
        <div className="flex-none bg-destructive/10 border-b border-destructive/30 px-4 py-2">
          <div className="max-w-2xl mx-auto">
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-destructive">{e}</p>
            ))}
          </div>
        </div>
      )}

      {/* Screen content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {screen === 1 && (
            <SetupScreen1 draft={draft} data={data} errors={errors} onChange={updateDraft} />
          )}
          {screen === 2 && (
            <SetupScreen2 draft={draft} data={data} errors={errors} onChange={updateDraft} />
          )}
          {screen === 3 && (
            <SetupScreen3 draft={draft} data={data} errors={errors} onChange={updateDraft} />
          )}
          {screen === 4 && (
            <SetupScreen4 draft={draft} data={data} errors={errors} onChange={updateDraft} />
          )}
          {screen === 5 && (
            <SetupScreen5 draft={draft} onChange={updateDraft} />
          )}

          {!isLastScreen && (
            <div className="mt-8 pt-4 border-t border-border">
              <p className="text-[11px] text-muted-foreground">
                <span className="uppercase tracking-wide font-medium">Up next</span>
                <span className="mx-2 opacity-40">—</span>
                {SCREEN_TITLES[screen]}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Footer nav */}
      <footer className="flex-none border-t border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex justify-between gap-3">
          <Button variant="ghost" onClick={handleBack} disabled={submitting}>
            {screen === 1 ? 'Cancel' : 'Back'}
          </Button>
          {isLastScreen ? (
            <Button onClick={handleFinish} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Character'}
            </Button>
          ) : (
            <Button onClick={handleNext}>Next</Button>
          )}
        </div>
      </footer>
    </div>
  )
}
