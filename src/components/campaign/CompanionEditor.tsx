import { useEffect, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { parseCustomDamage } from '@/lib/weaponActions'
import { formatBonus } from '@/lib/dice'
import {
  validateCompanionData, defaultCompanion,
  COMPANION_ABILITIES, COMPANION_SKILLS,
  MAX_COMPANION_BYTES, MAX_COMPANION_ATTACKS, MAX_COMPANION_TRAITS,
} from '../../../shared/companionValidation'
import type {
  CompanionData, CompanionAttack, CompanionAbility, CompanionSkill,
} from '../../../shared/companionValidation'

// Create/edit dialog for a companion stat block. Attacks take FREE-FORM damage
// ("2d6+4 fire") parsed by the same helper custom weapons use; validation mirrors
// the server gate (shared/companionValidation) so nothing leaves the form the
// backend would reject. Field state is editing-friendly strings; assembly and
// validation happen on save.

interface AttackDraft {
  name: string
  toHit: string   // "+4" / "4"
  damage: string  // "2d6+4 fire" (dice required; bonus/type optional)
  rider: string   // optional "1d6 fire"
  notes: string
}

interface TraitDraft { name: string; description: string }
interface OverrideDraft { key: string; value: string } // key = "save:dex" | "skill:stealth"

const SKILL_LABELS: Record<string, string> = {
  acrobatics: 'Acrobatics', animalHandling: 'Animal Handling', arcana: 'Arcana',
  athletics: 'Athletics', deception: 'Deception', history: 'History', insight: 'Insight',
  intimidation: 'Intimidation', investigation: 'Investigation', medicine: 'Medicine',
  nature: 'Nature', perception: 'Perception', performance: 'Performance',
  persuasion: 'Persuasion', religion: 'Religion', sleightOfHand: 'Sleight of Hand',
  stealth: 'Stealth', survival: 'Survival',
}

function attackToDraft(a: CompanionAttack): AttackDraft {
  const bonus = a.damageBonus !== 0 ? formatBonus(a.damageBonus) : ''
  const rider = a.extraDamage?.[0]
  return {
    name: a.name,
    toHit: String(a.toHit),
    damage: `${a.damageDice}${bonus}${a.damageType ? ` ${a.damageType}` : ''}`,
    rider: rider ? `${rider.dice}${rider.damageType ? ` ${rider.damageType}` : ''}` : '',
    notes: a.notes,
  }
}

function dataToOverrideDrafts(data: CompanionData): OverrideDraft[] {
  const rows: OverrideDraft[] = []
  for (const [k, v] of Object.entries(data.saveOverrides ?? {})) rows.push({ key: `save:${k}`, value: String(v) })
  for (const [k, v] of Object.entries(data.skillOverrides ?? {})) rows.push({ key: `skill:${k}`, value: String(v) })
  return rows
}

interface CompanionEditorProps {
  open: boolean
  title: string
  initial?: CompanionData
  /** Rendered under the name row — the parent supplies the assignee picker when relevant. */
  assignPicker?: React.ReactNode
  /** Network-failure message from the parent; shown inline, the form keeps its state. */
  error?: string | null
  saving?: boolean
  onClose: () => void
  onSave: (data: CompanionData) => void
}

export function CompanionEditor({
  open, title, initial, assignPicker, error, saving, onClose, onSave,
}: CompanionEditorProps) {
  const seed = useMemo(() => initial ?? defaultCompanion(), [initial])

  const [draft, setDraft] = useState<CompanionData>(seed)
  const [attacks, setAttacks] = useState<AttackDraft[]>(seed.attacks.map(attackToDraft))
  const [traits, setTraits] = useState<TraitDraft[]>(seed.traits.map(t => ({ ...t })))
  const [overrides, setOverrides] = useState<OverrideDraft[]>(dataToOverrideDrafts(seed))
  const [formError, setFormError] = useState<string | null>(null)

  // Re-seed whenever the dialog opens (create after edit, edit a different card, …).
  useEffect(() => {
    if (open) {
      setDraft(seed)
      setAttacks(seed.attacks.map(attackToDraft))
      setTraits(seed.traits.map(t => ({ ...t })))
      setOverrides(dataToOverrideDrafts(seed))
      setFormError(null)
    }
  }, [open, seed])

  const set = <K extends keyof CompanionData>(key: K, value: CompanionData[K]) =>
    setDraft(d => ({ ...d, [key]: value }))
  const setAbility = (ab: CompanionAbility, raw: string) => {
    const v = parseInt(raw, 10)
    setDraft(d => ({ ...d, abilities: { ...d.abilities, [ab]: Number.isNaN(v) ? 0 : v } }))
  }
  const setNum = (key: 'ac' | 'maxHp' | 'currentHp' | 'tempHp', raw: string) => {
    const v = parseInt(raw, 10)
    set(key, Number.isNaN(v) ? 0 : v)
  }

  function assemble(): CompanionData | null {
    const outAttacks: CompanionAttack[] = []
    for (const a of attacks) {
      const parsed = parseCustomDamage(a.damage)
      if (!parsed) {
        setFormError(`Attack "${a.name || '(unnamed)'}": damage must look like "2d6+4 piercing"`)
        return null
      }
      const toHit = parseInt(a.toHit, 10)
      if (Number.isNaN(toHit)) {
        setFormError(`Attack "${a.name || '(unnamed)'}": to-hit must be a number`)
        return null
      }
      const attack: CompanionAttack = {
        name: a.name.trim(),
        toHit,
        damageDice: parsed.damageDice,
        damageBonus: parsed.damageBonus,
        damageType: parsed.damageType,
        notes: a.notes.trim(),
      }
      if (a.rider.trim()) {
        const r = parseCustomDamage(a.rider)
        if (!r) {
          setFormError(`Attack "${a.name || '(unnamed)'}": extra damage must look like "1d6 fire"`)
          return null
        }
        attack.extraDamage = [{ dice: r.damageDice, damageType: r.damageType }]
      }
      outAttacks.push(attack)
    }

    const saveOverrides: Partial<Record<CompanionAbility, number>> = {}
    const skillOverrides: Partial<Record<CompanionSkill, number>> = {}
    for (const o of overrides) {
      if (!o.key) continue
      const v = parseInt(o.value, 10)
      if (Number.isNaN(v)) {
        setFormError('Every bonus override needs a number')
        return null
      }
      const [kind, key] = o.key.split(':')
      if (kind === 'save') saveOverrides[key as CompanionAbility] = v
      else skillOverrides[key as CompanionSkill] = v
    }

    const data: CompanionData = {
      ...draft,
      name: draft.name.trim(),
      attacks: outAttacks,
      traits: traits
        .filter(t => t.name.trim() !== '' || t.description.trim() !== '')
        .map(t => ({ name: t.name.trim(), description: t.description })),
      ...(Object.keys(saveOverrides).length ? { saveOverrides } : {}),
      ...(Object.keys(skillOverrides).length ? { skillOverrides } : {}),
    }
    if (!Object.keys(saveOverrides).length) delete data.saveOverrides
    if (!Object.keys(skillOverrides).length) delete data.skillOverrides

    const valid = validateCompanionData(data)
    if (!valid.ok) {
      setFormError(valid.reason)
      return null
    }
    if (JSON.stringify(data).length > MAX_COMPANION_BYTES) {
      setFormError('This stat block is too large — trim some text')
      return null
    }
    return data
  }

  function handleSave() {
    setFormError(null)
    const data = assemble()
    if (data) onSave(data)
  }

  const input = 'w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring'
  const label = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
  const usedKeys = new Set(overrides.map(o => o.key))

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md flex flex-col max-h-[85dvh] p-0 gap-0" aria-describedby={undefined}>
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div className="space-y-2">
            <input className={input} placeholder="Name (e.g. Shadowfang)" value={draft.name}
              onChange={e => set('name', e.target.value)} aria-label="Companion name" />
            <input className={input} placeholder="Kind (e.g. Medium beast, unaligned)" value={draft.kindLine}
              onChange={e => set('kindLine', e.target.value)} aria-label="Kind line" />
            {assignPicker}
          </div>

          <div>
            <p className={label}>Abilities</p>
            <div className="grid grid-cols-6 gap-1 mt-1">
              {COMPANION_ABILITIES.map(ab => (
                <div key={ab} className="text-center">
                  <p className="text-[10px] uppercase text-muted-foreground">{ab}</p>
                  <input
                    type="number" inputMode="numeric" value={draft.abilities[ab]}
                    onChange={e => setAbility(ab, e.target.value)}
                    className="w-full rounded-md border border-input bg-transparent px-1 py-1 text-sm text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                    aria-label={`${ab.toUpperCase()} score`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {([['ac', 'AC'], ['maxHp', 'Max HP'], ['currentHp', 'HP'], ['tempHp', 'Temp HP']] as const).map(([key, lbl]) => (
              <div key={key}>
                <p className={label}>{lbl}</p>
                <input type="number" inputMode="numeric" value={draft[key]}
                  onChange={e => setNum(key, e.target.value)}
                  className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring mt-1"
                  aria-label={lbl} />
              </div>
            ))}
          </div>
          <input className={input} placeholder="AC note (e.g. natural armor)" value={draft.acNote ?? ''}
            onChange={e => set('acNote', e.target.value || undefined)} aria-label="AC note" />

          <div className="grid grid-cols-1 gap-2">
            <input className={input} placeholder="Speed (e.g. 40 ft., swim 30 ft.)" value={draft.speed}
              onChange={e => set('speed', e.target.value)} aria-label="Speed" />
            <input className={input} placeholder="Senses (e.g. darkvision 60 ft.)" value={draft.senses}
              onChange={e => set('senses', e.target.value)} aria-label="Senses" />
            <input className={input} placeholder="Languages" value={draft.languages}
              onChange={e => set('languages', e.target.value)} aria-label="Languages" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={label}>Attacks</p>
              {attacks.length < MAX_COMPANION_ATTACKS && (
                <button
                  onClick={() => setAttacks(a => [...a, { name: '', toHit: '0', damage: '', rider: '', notes: '' }])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add attack
                </button>
              )}
            </div>
            {attacks.length === 0 && <p className="text-xs text-muted-foreground">No attacks yet.</p>}
            {attacks.map((a, i) => (
              <div key={i} className="rounded-md border border-border p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input className={input} placeholder="Attack name (e.g. Bite)" value={a.name}
                    onChange={e => setAttacks(rows => rows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                    aria-label={`Attack ${i + 1} name`} />
                  <button onClick={() => setAttacks(rows => rows.filter((_, j) => j !== i))}
                    className="flex-none text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove attack ${i + 1}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <div className="w-20 flex-none">
                    <input className={input} placeholder="+4" value={a.toHit} inputMode="numeric"
                      onChange={e => setAttacks(rows => rows.map((r, j) => j === i ? { ...r, toHit: e.target.value } : r))}
                      aria-label={`Attack ${i + 1} to-hit bonus`} title="To-hit bonus" />
                  </div>
                  <input className={input} placeholder='Damage — "2d6+4 piercing"' value={a.damage}
                    onChange={e => setAttacks(rows => rows.map((r, j) => j === i ? { ...r, damage: e.target.value } : r))}
                    aria-label={`Attack ${i + 1} damage`} />
                </div>
                <div className="flex gap-1.5">
                  <input className={input} placeholder='Extra damage — "1d6 fire" (optional)' value={a.rider}
                    onChange={e => setAttacks(rows => rows.map((r, j) => j === i ? { ...r, rider: e.target.value } : r))}
                    aria-label={`Attack ${i + 1} extra damage`} />
                  <input className={input} placeholder="Notes (reach 5 ft.)" value={a.notes}
                    onChange={e => setAttacks(rows => rows.map((r, j) => j === i ? { ...r, notes: e.target.value } : r))}
                    aria-label={`Attack ${i + 1} notes`} />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={label}>Traits</p>
              {traits.length < MAX_COMPANION_TRAITS && (
                <button
                  onClick={() => setTraits(t => [...t, { name: '', description: '' }])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" /> Add trait
                </button>
              )}
            </div>
            {traits.map((t, i) => (
              <div key={i} className="rounded-md border border-border p-2 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input className={input} placeholder="Trait name (e.g. Pack Tactics)" value={t.name}
                    onChange={e => setTraits(rows => rows.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                    aria-label={`Trait ${i + 1} name`} />
                  <button onClick={() => setTraits(rows => rows.filter((_, j) => j !== i))}
                    className="flex-none text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Remove trait ${i + 1}`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <textarea className={`${input} min-h-16 resize-y`} placeholder="Description" value={t.description}
                  onChange={e => setTraits(rows => rows.map((r, j) => j === i ? { ...r, description: e.target.value } : r))}
                  aria-label={`Trait ${i + 1} description`} />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className={label} title="A rolled save or skill uses this total bonus instead of the ability modifier">
                Save &amp; skill bonuses
              </p>
              <button
                onClick={() => setOverrides(o => [...o, { key: '', value: '0' }])}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add bonus
              </button>
            </div>
            {overrides.length === 0 && (
              <p className="text-xs text-muted-foreground">
                None — saves and skills roll with plain ability modifiers.
              </p>
            )}
            {overrides.map((o, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  className={input}
                  value={o.key}
                  onChange={e => setOverrides(rows => rows.map((r, j) => j === i ? { ...r, key: e.target.value } : r))}
                  aria-label={`Bonus ${i + 1} target`}
                >
                  <option value="">Choose…</option>
                  <optgroup label="Saving throws">
                    {COMPANION_ABILITIES.map(ab => (
                      <option key={ab} value={`save:${ab}`} disabled={usedKeys.has(`save:${ab}`) && o.key !== `save:${ab}`}>
                        {ab.toUpperCase()} save
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Skills">
                    {COMPANION_SKILLS.map(sk => (
                      <option key={sk} value={`skill:${sk}`} disabled={usedKeys.has(`skill:${sk}`) && o.key !== `skill:${sk}`}>
                        {SKILL_LABELS[sk]}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <input className={`${input} w-20 flex-none`} inputMode="numeric" value={o.value}
                  onChange={e => setOverrides(rows => rows.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
                  aria-label={`Bonus ${i + 1} amount`} placeholder="+4" />
                <button onClick={() => setOverrides(rows => rows.filter((_, j) => j !== i))}
                  className="flex-none text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove bonus ${i + 1}`}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2">
            <input className={input} placeholder="Damage resistances" value={draft.resistances}
              onChange={e => set('resistances', e.target.value)} aria-label="Damage resistances" />
            <input className={input} placeholder="Damage immunities" value={draft.immunities}
              onChange={e => set('immunities', e.target.value)} aria-label="Damage immunities" />
            <input className={input} placeholder="Condition immunities" value={draft.conditionImmunities}
              onChange={e => set('conditionImmunities', e.target.value)} aria-label="Condition immunities" />
            <input className={input} placeholder="Vulnerabilities" value={draft.vulnerabilities}
              onChange={e => set('vulnerabilities', e.target.value)} aria-label="Vulnerabilities" />
            <textarea className={`${input} min-h-16 resize-y`} placeholder="Notes" value={draft.playerNotes}
              onChange={e => set('playerNotes', e.target.value)} aria-label="Companion notes" />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border space-y-2">
          {(formError || error) && (
            <p className="text-xs text-destructive" role="alert">{formError ?? error}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Companion'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
