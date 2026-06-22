import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { buildCustomSpell } from '@/lib/customContent'
import type { SpellData } from '@/types/data'

const SCHOOLS = [
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
]
const fieldClass =
  'w-full bg-[var(--color-surface-2)] text-foreground border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring'
const selectClass = `${fieldClass} [color-scheme:dark]`

export interface CustomSpellDamage { dice: string; type: string }

/**
 * Create a homebrew spell. Builds a catalog-shaped SpellData (lib/customContent)
 * and hands it back via `onCreate` along with optional damage to attach to the
 * spell instance (the catalog SpellData carries no damage field — it lives on the
 * CharacterSpell, like every other spell's player-entered damage).
 */
export function CustomSpellDialog({
  open,
  classSlug,
  onClose,
  onCreate,
}: {
  open: boolean
  classSlug: string
  onClose: () => void
  onCreate: (spell: SpellData, damage: CustomSpellDamage | null) => void
}) {
  const [name, setName] = useState('')
  const [level, setLevel] = useState(0)
  const [school, setSchool] = useState('Evocation')
  const [castingTime, setCastingTime] = useState('1 action')
  const [range, setRange] = useState('60 feet')
  const [duration, setDuration] = useState('Instantaneous')
  const [verbal, setVerbal] = useState(true)
  const [somatic, setSomatic] = useState(true)
  const [material, setMaterial] = useState(false)
  const [materialText, setMaterialText] = useState('')
  const [concentration, setConcentration] = useState(false)
  const [ritual, setRitual] = useState(false)
  const [description, setDescription] = useState('')
  const [damageDice, setDamageDice] = useState('')
  const [damageType, setDamageType] = useState('')

  useEffect(() => {
    if (open) {
      setName(''); setLevel(0); setSchool('Evocation'); setCastingTime('1 action')
      setRange('60 feet'); setDuration('Instantaneous')
      setVerbal(true); setSomatic(true); setMaterial(false); setMaterialText('')
      setConcentration(false); setRitual(false); setDescription('')
      setDamageDice(''); setDamageType('')
    }
  }, [open])

  const valid = name.trim() !== ''

  function submit() {
    if (!valid) return
    const spell = buildCustomSpell({
      name, level, school, castingTime, range, duration,
      components: { verbal, somatic, material, materialText },
      concentration, ritual, description,
      classes: classSlug ? [classSlug] : [],
    })
    const damage = damageDice.trim() ? { dice: damageDice.trim(), type: damageType.trim() } : null
    onCreate(spell, damage)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Custom Spell</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Name</span>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Arc Lightning" className={fieldClass} />
          </label>

          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted-foreground">Level</span>
              <select value={level} onChange={e => setLevel(Number(e.target.value))} className={selectClass}>
                <option value={0}>Cantrip</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted-foreground">School</span>
              <select value={school} onChange={e => setSchool(e.target.value)} className={selectClass}>
                {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted-foreground">Casting time</span>
              <input value={castingTime} onChange={e => setCastingTime(e.target.value)} className={fieldClass} />
            </label>
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted-foreground">Range</span>
              <input value={range} onChange={e => setRange(e.target.value)} className={fieldClass} />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Duration</span>
            <input value={duration} onChange={e => setDuration(e.target.value)} className={fieldClass} />
          </label>

          <div>
            <span className="text-xs font-semibold text-muted-foreground">Components</span>
            <div className="flex flex-wrap gap-3 mt-1 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={verbal} onChange={() => setVerbal(v => !v)} className="h-4 w-4 accent-[var(--color-accent-gold)]" /> V
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={somatic} onChange={() => setSomatic(v => !v)} className="h-4 w-4 accent-[var(--color-accent-gold)]" /> S
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="checkbox" checked={material} onChange={() => setMaterial(v => !v)} className="h-4 w-4 accent-[var(--color-accent-gold)]" /> M
              </label>
            </div>
            {material && (
              <input
                value={materialText}
                onChange={e => setMaterialText(e.target.value)}
                placeholder="material component(s)"
                className={`${fieldClass} mt-2`}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={concentration} onChange={() => setConcentration(v => !v)} className="h-4 w-4 accent-[var(--color-accent-gold)]" /> Concentration
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={ritual} onChange={() => setRitual(v => !v)} className="h-4 w-4 accent-[var(--color-accent-gold)]" /> Ritual
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Description</span>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="What the spell does…" className={`${fieldClass} resize-y`} />
          </label>

          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted-foreground">Damage dice (optional)</span>
              <input value={damageDice} onChange={e => setDamageDice(e.target.value)} placeholder="e.g. 2d6" className={fieldClass} />
            </label>
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted-foreground">Damage type</span>
              <input value={damageType} onChange={e => setDamageType(e.target.value)} placeholder="e.g. lightning" className={fieldClass} />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
