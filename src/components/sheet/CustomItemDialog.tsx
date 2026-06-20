import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { buildCustomWeapon, buildCustomArmor } from '@/lib/customContent'
import type { WeaponItem, ArmorItem } from '@/types/data'

const WEAPON_TYPES: WeaponItem['weapon_type'][] = [
  'Simple Melee', 'Simple Ranged', 'Martial Melee', 'Martial Ranged',
]
const DAMAGE_TYPES = [
  'bludgeoning', 'piercing', 'slashing', 'acid', 'cold', 'fire', 'force',
  'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder',
]
const WEAPON_PROPERTIES = [
  'Finesse', 'Light', 'Heavy', 'Two-Handed', 'Versatile', 'Thrown',
  'Ammunition', 'Reach', 'Loading', 'Special',
]
const ARMOR_TYPES: ArmorItem['armor_type'][] = ['Light', 'Medium', 'Heavy', 'Shield']

const fieldClass =
  'w-full bg-transparent border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring'

/**
 * Create a homebrew weapon or armor definition. On submit it builds a
 * catalog-shaped def (lib/customContent) and hands it back via `onCreate`; the
 * caller stores it on the character and adds the loadout instance.
 */
export function CustomItemDialog({
  open,
  kind,
  onClose,
  onCreate,
}: {
  open: boolean
  kind: 'weapon' | 'armor'
  onClose: () => void
  onCreate: (def: WeaponItem | ArmorItem) => void
}) {
  const [name, setName] = useState('')
  // weapon
  const [weaponType, setWeaponType] = useState<WeaponItem['weapon_type']>('Martial Melee')
  const [damageDice, setDamageDice] = useState('')
  const [damageType, setDamageType] = useState('slashing')
  const [properties, setProperties] = useState<string[]>([])
  // armor
  const [armorType, setArmorType] = useState<ArmorItem['armor_type']>('Medium')
  const [acFormula, setAcFormula] = useState('')
  const [stealthDisadvantage, setStealthDisadvantage] = useState(false)

  // Reset every time it opens so a previous draft never leaks in.
  useEffect(() => {
    if (open) {
      setName(''); setWeaponType('Martial Melee'); setDamageDice(''); setDamageType('slashing')
      setProperties([]); setArmorType('Medium'); setAcFormula(''); setStealthDisadvantage(false)
    }
  }, [open])

  const valid = kind === 'weapon'
    ? name.trim() !== ''
    : name.trim() !== '' && acFormula.trim() !== ''

  function toggleProperty(p: string) {
    setProperties(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  function submit() {
    if (!valid) return
    if (kind === 'weapon') {
      onCreate(buildCustomWeapon({ name, weaponType, damageDice, damageType, properties }))
    } else {
      onCreate(buildCustomArmor({ name, armorType, acFormula, stealthDisadvantage }))
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Custom {kind === 'weapon' ? 'Weapon' : 'Armor'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Name</span>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={kind === 'weapon' ? 'e.g. Storm Blade' : 'e.g. Dragonscale'}
              className={fieldClass}
            />
          </label>

          {kind === 'weapon' ? (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Weapon type</span>
                <select value={weaponType} onChange={e => setWeaponType(e.target.value as WeaponItem['weapon_type'])} className={fieldClass}>
                  {WEAPON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <div className="flex gap-2">
                <label className="block flex-1">
                  <span className="text-xs font-semibold text-muted-foreground">Damage dice</span>
                  <input value={damageDice} onChange={e => setDamageDice(e.target.value)} placeholder="1d8" className={fieldClass} />
                </label>
                <label className="block flex-1">
                  <span className="text-xs font-semibold text-muted-foreground">Damage type</span>
                  <select value={damageType} onChange={e => setDamageType(e.target.value)} className={fieldClass}>
                    {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
              </div>
              <div>
                <span className="text-xs font-semibold text-muted-foreground">Properties</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {WEAPON_PROPERTIES.map(p => {
                    const on = properties.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => toggleProperty(p)}
                        className="px-2 py-1 rounded text-xs border transition-colors"
                        style={{
                          background: on ? 'var(--color-accent-gold)' : undefined,
                          color: on ? '#000' : undefined,
                          borderColor: 'var(--color-border-raw)',
                        }}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Finesse uses your best of STR/DEX for attacks.
                </p>
              </div>
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Armor type</span>
                <select value={armorType} onChange={e => setArmorType(e.target.value as ArmorItem['armor_type'])} className={fieldClass}>
                  {ARMOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">AC formula</span>
                <input
                  value={acFormula}
                  onChange={e => setAcFormula(e.target.value)}
                  placeholder="e.g. 16  or  14 + Dex modifier (max 2)"
                  className={fieldClass}
                />
                <span className="text-[10px] text-muted-foreground">
                  A flat number, or a formula like the catalog uses (Dex modifier, max N).
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={stealthDisadvantage}
                  onChange={() => setStealthDisadvantage(v => !v)}
                  className="h-4 w-4 accent-[var(--color-accent-gold)]"
                />
                Stealth disadvantage
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
