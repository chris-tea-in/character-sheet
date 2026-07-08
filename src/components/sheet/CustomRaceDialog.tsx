import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { generateId } from '@/lib/uuid'
import type { AbilityName } from '@/types/character'
import type { Race } from '@/types/data'

const ABILITIES: { key: AbilityName; label: string }[] = [
  { key: 'str', label: 'STR' }, { key: 'dex', label: 'DEX' }, { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' }, { key: 'wis', label: 'WIS' }, { key: 'cha', label: 'CHA' },
]
const fieldClass =
  'w-full bg-[var(--color-surface-2)] text-foreground border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring'

function traitsToText(traits: Record<string, string>): string {
  return Object.entries(traits).map(([k, v]) => (v ? `${k}: ${v}` : k)).join('\n')
}
function parseTraits(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const idx = t.indexOf(':')
    if (idx > 0) out[t.slice(0, idx).trim()] = t.slice(idx + 1).trim()
    else out[t] = ''
  }
  return out
}
const splitList = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

/**
 * Create a homebrew race, or edit an existing one. In 'edit' mode the result keeps
 * the base race's slug so it overrides the built-in (mergeCustomRaces / resolveRace
 * — #10); in 'new' mode it gets a fresh custom slug (#11). ASI / speed / size /
 * languages / proficiencies are mechanical where the sheet supports them; "bonuses"
 * (darkvision, resistances, …) are stored as descriptive traits per the agreed
 * scope. Flexible ASI pools are intentionally omitted (fixed ASIs cover homebrew).
 */
export function CustomRaceDialog({
  open,
  mode,
  base,
  onClose,
  onCreate,
}: {
  open: boolean
  mode: 'new' | 'edit'
  base: Race | null
  onClose: () => void
  onCreate: (race: Race) => void
}) {
  const [name, setName] = useState('')
  const [size, setSize] = useState('Medium')
  const [speed, setSpeed] = useState(30)
  const [asi, setAsi] = useState<Record<AbilityName, number>>({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 })
  const [languages, setLanguages] = useState('')
  const [proficiencies, setProficiencies] = useState('')
  const [traits, setTraits] = useState('')

  useEffect(() => {
    if (!open) return
    if (base) {
      setName(mode === 'edit' ? base.name : `${base.name} (Custom)`)
      setSize(base.base.size || 'Medium')
      setSpeed(base.base.speed || 30)
      setAsi({
        str: base.base.ability_score_increases.str ?? 0,
        dex: base.base.ability_score_increases.dex ?? 0,
        con: base.base.ability_score_increases.con ?? 0,
        int: base.base.ability_score_increases.int ?? 0,
        wis: base.base.ability_score_increases.wis ?? 0,
        cha: base.base.ability_score_increases.cha ?? 0,
      })
      setLanguages(base.base.languages.join(', '))
      setProficiencies(base.base.proficiencies.join(', '))
      setTraits(traitsToText(base.base.traits))
    } else {
      setName(''); setSize('Medium'); setSpeed(30)
      setAsi({ str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 })
      setLanguages(''); setProficiencies(''); setTraits('')
    }
  }, [open, base, mode])

  const valid = name.trim() !== ''

  function submit() {
    if (!valid) return
    const ability_score_increases: Partial<Record<AbilityName, number>> = {}
    for (const { key } of ABILITIES) if (asi[key]) ability_score_increases[key] = asi[key]
    const slug = mode === 'edit' && base ? base.slug : `custom-race:${generateId()}`
    const race: Race = {
      name: name.trim(),
      slug,
      description: base?.description ?? '',
      base: {
        ability_score_increases,
        asi_choices: [],
        speed,
        size: size.trim() || 'Medium',
        languages: splitList(languages),
        senses: base?.base.senses ?? {},
        proficiencies: splitList(proficiencies),
        traits: parseTraits(traits),
        // BUG-89: carry the base race's machine-readable effect channel through the
        // edit. In edit mode the fork keeps the base slug and WINS over the built-in
        // (resolveRace), so dropping this would silently strip every derived racial
        // mechanic — resistances, immunities, weapon/skill/tool/armor proficiencies,
        // natural armor. The form can't edit these yet (BUG-70's deferred editor), but
        // it must not destroy them. Deep-cloned so the custom race never aliases the
        // shared catalog object.
        effects: base?.base.effects ? structuredClone(base.base.effects) : undefined,
      },
      subraces: mode === 'edit' && base ? base.subraces : [],
    }
    onCreate(race)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit Race (Homebrew)' : 'Custom Race'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Name</span>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Starborn" className={fieldClass} />
          </label>

          <div className="flex gap-2">
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted-foreground">Size</span>
              <input value={size} onChange={e => setSize(e.target.value)} className={fieldClass} />
            </label>
            <label className="block flex-1">
              <span className="text-xs font-semibold text-muted-foreground">Speed (ft)</span>
              <input type="number" min={0} value={speed} onChange={e => setSpeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))} className={fieldClass} />
            </label>
          </div>

          <div>
            <span className="text-xs font-semibold text-muted-foreground">Ability score increases</span>
            <div className="grid grid-cols-6 gap-1 mt-1">
              {ABILITIES.map(({ key, label }) => (
                <label key={key} className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                  <input
                    type="number" min={0}
                    value={asi[key]}
                    onChange={e => setAsi(a => ({ ...a, [key]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                    className="w-full bg-[var(--color-surface-2)] text-foreground border border-border rounded px-1 py-1 text-sm text-center"
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Languages (comma-separated)</span>
            <input value={languages} onChange={e => setLanguages(e.target.value)} placeholder="Common, Elvish" className={fieldClass} />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Proficiencies (comma-separated)</span>
            <input value={proficiencies} onChange={e => setProficiencies(e.target.value)} placeholder="Perception, Longsword" className={fieldClass} />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Traits / bonuses (one per line, "Name: description")</span>
            <textarea value={traits} onChange={e => setTraits(e.target.value)} rows={4} placeholder={'Superior Darkvision: see 120 ft in the dark\nFey Ancestry: advantage vs. charmed'} className={`${fieldClass} resize-y`} />
            <span className="text-[10px] text-muted-foreground">Bonuses like darkvision or resistances are recorded as descriptive traits.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>{mode === 'edit' ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
