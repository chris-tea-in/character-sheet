import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { SetupScreen1 } from '@/components/setup/SetupScreen1'
import { SetupScreen2 } from '@/components/setup/SetupScreen2'
import { SetupScreen3 } from '@/components/setup/SetupScreen3'
import { SetupScreen4 } from '@/components/setup/SetupScreen4'
import { SetupScreen5 } from '@/components/setup/SetupScreen5'
import {
  INITIAL_DRAFT,
  characterToDraft,
  draftToNewCharacter,
  equipStartingArmor,
  isEquipmentComplete,
  isLevelAsiComplete,
} from '@/lib/characterSetup'
import { getSpellcastingInfo } from '@/lib/spellcasting'
import { loadSetupData, loadFeatsData, loadSpellsData, loadEquipmentData } from '@/lib/data'
import { useCharacterStore } from '@/store/characters'
import type { SetupDraft } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import type { FeatData } from '@/types/data'
import type { NewCharacter } from '@/types/character'


const SCREEN_TITLES = [
  'Identity & Stats',
  'Background & Details',
  'Proficiencies',
  'Starting Equipment',
  'Progression',
]

function validateScreen(
  screen: number,
  draft: SetupDraft,
  data: SetupData | null,
  allFeats?: Record<string, FeatData>,
  isEditMode?: boolean,
): string[] {
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
    // Edit mode: ASI/feat slots are hidden — choices live in the stored record
    if (data && !isEditMode && !isLevelAsiComplete(draft, data, allFeats)) {
      errors.push('Complete all ability score improvement or feat choices')
    }
    return errors
  }
  if (screen === 2) {
    if (!draft.backgroundSlug) return ['Background is required']
  }
  // Skip equipment validation in edit mode (equipment managed on sheet)
  if (screen === 4 && data && !isEditMode) {
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
  const { id: editId } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const campaignParam = searchParams.get('campaign')
  const isEditMode = !!editId

  const createCharacter = useCharacterStore((s) => s.create)
  const updateCharacter = useCharacterStore((s) => s.update)
  const characters = useCharacterStore((s) => s.characters)

  const [data, setData] = useState<SetupData | null>(null)
  const [allFeats, setAllFeats] = useState<Record<string, FeatData>>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<SetupDraft>(INITIAL_DRAFT)
  const [screen, setScreen] = useState(1)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [draftReady, setDraftReady] = useState(!isEditMode)
  const [doneConfirmOpen, setDoneConfirmOpen] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [screen])

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [setupData, feats] = await Promise.all([
          loadSetupData(),
          loadFeatsData().catch(() => ({})),
        ])
        setData(setupData)
        setAllFeats(feats)

        if (isEditMode) {
          // Load spell data to correctly split cantrips vs leveled spells
          const spellData = await loadSpellsData().catch(() => ({}))
          const existing = characters.find(c => c.id === editId)
          if (existing) {
            setDraft(characterToDraft(existing, spellData))
          }
          setDraftReady(true)
        }
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load data')
      }
    }
    loadAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function updateDraft(updates: Partial<SetupDraft>) {
    setDraft((prev) => ({ ...prev, ...updates }))
    setErrors([])
  }

  function handleNext() {
    const errs = validateScreen(screen, draft, data, allFeats, isEditMode)
    if (errs.length) {
      setErrors(errs)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setErrors([])
    setScreen((s) => s + 1)
  }

  function handleBack() {
    setErrors([])
    if (screen === 1) {
      navigate(isEditMode ? `/character/${editId}` : '/')
    } else {
      setScreen((s) => s - 1)
    }
  }

  async function handleFinish(skipValidation = false) {
    // Name is non-negotiable even on the skip-validation "Done" path — an
    // empty name breaks the character list (BUG-12)
    if (!draft.name.trim()) {
      setErrors(['Name is required'])
      setScreen(1)
      setDoneConfirmOpen(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!skipValidation) {
      const errs = validateScreen(screen, draft, data, allFeats, isEditMode)
      if (errs.length) {
        setErrors(errs)
        return
      }
    }
    if (!data) return
    setSubmitting(true)
    try {
      const feats = await loadFeatsData().catch(() => ({}))
      const newCharData = draftToNewCharacter(draft, data, feats)

      if (isEditMode && editId) {
        const existing = characters.find(c => c.id === editId)
        if (!existing) throw new Error('Character not found')

        // Merge: use new data for identity/stats, preserve combat state,
        // equipment, and everything managed on the sheet (feats, AC, saves, notes)
        const mergedSpells = mergeSpells(existing.spells, newCharData.spells)

        // Wizard skills come back as 'proficient' — restore expertise where it existed
        const skillProficiencies = { ...newCharData.skillProficiencies }
        for (const [skill, prof] of Object.entries(existing.skillProficiencies)) {
          if (prof === 'expertise' && skillProficiencies[skill as keyof typeof skillProficiencies]) {
            skillProficiencies[skill as keyof typeof skillProficiencies] = 'expertise'
          }
        }

        // The wizard only edits the "Appearance: …" prefix of notes — keep the
        // stored notes unless the appearance field actually changed
        const originalAppearance = existing.notes?.startsWith('Appearance: ')
          ? existing.notes.slice('Appearance: '.length)
          : ''
        const notes = draft.appearance !== originalAppearance ? newCharData.notes : existing.notes

        const changes: Partial<NewCharacter> = {
          name: newCharData.name,
          race: newCharData.race,
          subrace: newCharData.subrace,
          class: newCharData.class,
          subclass: newCharData.subclass,
          classes: newCharData.classes,
          background: newCharData.background,
          level: newCharData.level,
          xp: existing.xp,
          progressionType: newCharData.progressionType,
          alignment: newCharData.alignment,
          languages: newCharData.languages,
          backstory: newCharData.backstory,
          abilities: newCharData.abilities,
          raceAsiChoices: newCharData.raceAsiChoices,
          maxHp: newCharData.maxHp,
          // Preserve current HP (clamped to new max)
          currentHp: Math.min(existing.currentHp, newCharData.maxHp),
          tempHp: existing.tempHp,
          // Preserve sheet-managed stats — the wizard cannot represent them
          armorClass: existing.armorClass,
          initiativeBonus: existing.initiativeBonus,
          speed: newCharData.speed,
          // Preserve combat state
          deathSaves: existing.deathSaves,
          hitDiceUsed: existing.hitDiceUsed,
          inspiration: existing.inspiration,
          skillProficiencies,
          savingThrowProficiencies: existing.savingThrowProficiencies,
          spells: mergedSpells,
          spellSlotsUsed: existing.spellSlotsUsed,
          personalityTraits: newCharData.personalityTraits,
          ideals: newCharData.ideals,
          bonds: newCharData.bonds,
          flaws: newCharData.flaws,
          notes,
          // Preserve equipment and currency (managed on sheet)
          equipment: existing.equipment,
          currency: existing.currency,
          // Preserve feats — added via FeatsBlock/level-up, not the wizard
          feats: existing.feats,
          featChoices: existing.featChoices,
          toolProficiencies: newCharData.toolProficiencies,
          // Preserve campaign membership — the wizard can't represent it, so a
          // bare merge would silently drop the character from its campaign (INV-4)
          campaignId: existing.campaignId,
        }
        updateCharacter(editId, changes)
        navigate(`/character/${editId}`)
      } else {
        // Auto-equip the starting body armor + shield so AC is correct out of the
        // box (the AC derivation only counts worn armor). The catalog load is cached.
        const catalog = await loadEquipmentData().catch(() => null)
        if (catalog?.armor) {
          newCharData.equipment = equipStartingArmor(newCharData.equipment, catalog.armor)
        }
        // Created from within a campaign (?campaign=:id) → join it on creation.
        if (campaignParam) newCharData.campaignId = campaignParam
        const created = await createCharacter(newCharData)
        navigate(`/character/${created.id}`)
      }
    } catch {
      setErrors([isEditMode ? 'Failed to save changes.' : 'Failed to create character.'])
      setSubmitting(false)
    }
  }

  if (loadError) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <p className="text-destructive">{loadError}</p>
          <Button variant="outline" onClick={() => navigate(isEditMode ? `/character/${editId}` : '/')}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  if (!data || !draftReady) {
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
              {isEditMode ? 'Editing character · ' : ''}Step {screen} of {SCREEN_TITLES.length}
            </p>
            <h1 className="text-base font-semibold leading-tight truncate">
              {SCREEN_TITLES[screen - 1]}
            </h1>
          </div>
          {isEditMode && (
            <button
              onClick={() => setDoneConfirmOpen(true)}
              className="flex-none text-sm font-medium px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Done
            </button>
          )}
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
            <>
              {isEditMode && (
                <p className="text-sm text-muted-foreground mb-4 p-3 rounded-lg border border-border">
                  Equipment is managed directly on your character sheet. Any changes here will not affect your existing inventory.
                </p>
              )}
              <SetupScreen4 draft={draft} data={data} errors={errors} onChange={updateDraft} />
            </>
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

      {/* Done confirmation — save or discard edits */}
      <Dialog open={doneConfirmOpen} onOpenChange={setDoneConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save changes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Apply your edits to the character sheet, or discard them and return without changing anything.
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={() => {
                setDoneConfirmOpen(false)
                navigate(`/character/${editId}`)
              }}
            >
              Discard changes
            </Button>
            <Button
              onClick={async () => {
                setDoneConfirmOpen(false)
                await handleFinish(true)
              }}
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer nav */}
      <footer className="flex-none border-t border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex justify-between gap-3">
          <Button variant="ghost" onClick={handleBack} disabled={submitting}>
            {screen === 1 ? 'Cancel' : 'Back'}
          </Button>
          {isLastScreen ? (
            <Button onClick={() => handleFinish()} disabled={submitting}>
              {submitting
                ? (isEditMode ? 'Saving…' : 'Creating…')
                : (isEditMode ? 'Save Changes' : 'Create Character')}
            </Button>
          ) : (
            <Button onClick={handleNext}>Next</Button>
          )}
        </div>
      </footer>
    </div>
  )
}

// Merge existing spells with new ones: prefer existing (preserves prepared state),
// add new slugs that aren't already present, remove slugs absent from newSpells.
function mergeSpells(
  existing: Array<{ slug: string; prepared: boolean }>,
  incoming: Array<{ slug: string; prepared: boolean }>,
): Array<{ slug: string; prepared: boolean }> {
  const normalize = (s: string) => s.replace(/^spell:/, '')
  const incomingKeys = new Set(incoming.map(s => normalize(s.slug)))
  // Keep existing spells that are still in the incoming list
  const kept = existing.filter(s => incomingKeys.has(normalize(s.slug)))
  const existingKeys = new Set(kept.map(s => normalize(s.slug)))
  // Add incoming spells that weren't already kept
  const added = incoming.filter(s => !existingKeys.has(normalize(s.slug)))
  return [...kept, ...added]
}
