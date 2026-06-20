import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { buildCustomFeat } from '@/lib/customContent'
import type { AbilityName } from '@/types/character'
import type { FeatData } from '@/types/data'

const ABILITIES: { value: AbilityName; label: string }[] = [
  { value: 'str', label: 'Strength' },
  { value: 'dex', label: 'Dexterity' },
  { value: 'con', label: 'Constitution' },
  { value: 'int', label: 'Intelligence' },
  { value: 'wis', label: 'Wisdom' },
  { value: 'cha', label: 'Charisma' },
]

const fieldClass =
  'w-full bg-transparent border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring'

/**
 * Create a homebrew feat: name + description, plus an optional ability-score
 * increase that derives through the normal feat-effect path (computeFeatStatDelta).
 * On submit it builds the FeatData and hands it back via `onCreate`.
 */
export function CustomFeatDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean
  onClose: () => void
  onCreate: (feat: FeatData) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ability, setAbility] = useState<AbilityName | 'none'>('none')
  const [amount, setAmount] = useState(1)

  useEffect(() => {
    if (open) { setName(''); setDescription(''); setAbility('none'); setAmount(1) }
  }, [open])

  const valid = name.trim() !== ''

  function submit() {
    if (!valid) return
    onCreate(buildCustomFeat({
      name,
      description,
      asiAbility: ability === 'none' ? null : ability,
      asiAmount: amount,
    }))
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Custom Feat</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Name</span>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Iron Will"
              className={fieldClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Description</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="What the feat does…"
              className={`${fieldClass} resize-y`}
            />
          </label>

          <div>
            <span className="text-xs font-semibold text-muted-foreground">
              Ability score increase (optional)
            </span>
            <div className="flex gap-2 mt-1">
              <select
                value={ability}
                onChange={e => setAbility(e.target.value as AbilityName | 'none')}
                className={fieldClass}
              >
                <option value="none">None</option>
                {ABILITIES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <select
                value={amount}
                onChange={e => setAmount(Number(e.target.value))}
                disabled={ability === 'none'}
                className={`${fieldClass} w-20 disabled:opacity-40`}
              >
                <option value={1}>+1</option>
                <option value={2}>+2</option>
              </select>
            </div>
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
