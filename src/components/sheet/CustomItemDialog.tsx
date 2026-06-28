import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { buildCustomWeapon, buildCustomArmor, buildCustomWondrous, buildAcFormula } from '@/lib/customContent'
import { EffectBuilder } from './EffectBuilder'
import { specToItemEffect } from '@/lib/effectSpec'
import type { EffectSpec } from '@/lib/effectSpec'
import type { WeaponItem, ArmorItem, WondrousItem, ItemEffect } from '@/types/data'

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
const RARITIES: WondrousItem['rarity'][] = [
  'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact',
]

const fieldClass =
  'w-full bg-[var(--color-surface-2)] text-foreground border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring'
const selectClass = `${fieldClass} [color-scheme:dark]`

export type CustomItemKind = 'weapon' | 'armor' | 'item'

// Sensible AC-builder defaults per armor type (so the friendly form starts useful).
const ARMOR_DEFAULTS: Record<ArmorItem['armor_type'], { base: number; dex: boolean; cap: number | null }> = {
  Light: { base: 11, dex: true, cap: null },
  Medium: { base: 14, dex: true, cap: 2 },
  Heavy: { base: 16, dex: false, cap: null },
  Shield: { base: 2, dex: false, cap: null }, // base = the flat shield bonus
  Varies: { base: 10, dex: true, cap: null }, // not offered in the picker; satisfies the type
}

/**
 * Create a homebrew weapon, armor, or generic (wondrous) item. On submit it builds
 * a catalog-shaped def (lib/customContent) and hands it back via `onCreate`; the
 * caller stores it on the character and adds the loadout instance. Armor uses a
 * friendly AC builder that generates the ac_formula for the user (#5).
 */
export function CustomItemDialog({
  open,
  kind,
  onClose,
  onCreate,
}: {
  open: boolean
  kind: CustomItemKind
  onClose: () => void
  onCreate: (def: WeaponItem | ArmorItem | WondrousItem) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  // weapon
  const [weaponType, setWeaponType] = useState<WeaponItem['weapon_type']>('Martial Melee')
  const [damageDice, setDamageDice] = useState('')
  const [damageType, setDamageType] = useState('slashing')
  const [properties, setProperties] = useState<string[]>([])
  // armor (friendly AC builder)
  const [armorType, setArmorType] = useState<ArmorItem['armor_type']>('Medium')
  const [baseAc, setBaseAc] = useState(14)
  const [addsDex, setAddsDex] = useState(true)
  const [hasCap, setHasCap] = useState(true)
  const [dexCap, setDexCap] = useState(2)
  const [flatBonus, setFlatBonus] = useState(0)
  const [stealthDisadvantage, setStealthDisadvantage] = useState(false)
  // generic item
  const [rarity, setRarity] = useState<WondrousItem['rarity']>('Uncommon')
  const [attunement, setAttunement] = useState(false)
  // structured effects (apply while equipped/attuned) — armor + generic items
  const [effects, setEffects] = useState<EffectSpec[]>([])

  // Reset every time it opens so a previous draft never leaks in.
  useEffect(() => {
    if (open) {
      setName(''); setDescription('')
      setWeaponType('Martial Melee'); setDamageDice(''); setDamageType('slashing'); setProperties([])
      setArmorType('Medium'); setBaseAc(14); setAddsDex(true); setHasCap(true); setDexCap(2)
      setFlatBonus(0); setStealthDisadvantage(false)
      setRarity('Uncommon'); setAttunement(false)
      setEffects([])
    }
  }, [open])

  // When the armor type changes, snap the AC inputs to that type's defaults.
  function pickArmorType(t: ArmorItem['armor_type']) {
    setArmorType(t)
    const d = ARMOR_DEFAULTS[t]
    setBaseAc(d.base); setAddsDex(d.dex); setHasCap(d.cap != null); setDexCap(d.cap ?? 2); setFlatBonus(0)
  }

  const valid = name.trim() !== ''

  function toggleProperty(p: string) {
    setProperties(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const acPreview = buildAcFormula(armorType, baseAc, addsDex, hasCap ? dexCap : null, flatBonus)

  function submit() {
    if (!valid) return
    const itemEffects = effects.map(specToItemEffect).filter((e): e is ItemEffect => e !== null)
    if (kind === 'weapon') {
      onCreate(buildCustomWeapon({ name, weaponType, damageDice, damageType, properties, description, effects: itemEffects }))
    } else if (kind === 'armor') {
      onCreate(buildCustomArmor({ name, armorType, acFormula: acPreview, stealthDisadvantage, description, effects: itemEffects }))
    } else {
      onCreate(buildCustomWondrous({ name, rarity, attunement, description, effects: itemEffects }))
    }
    onClose()
  }

  const title = kind === 'weapon' ? 'Weapon' : kind === 'armor' ? 'Armor' : 'Item'

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Custom {title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Name</span>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={kind === 'weapon' ? 'e.g. Storm Blade' : kind === 'armor' ? 'e.g. Dragonscale' : 'e.g. Lucky Coin'}
              className={fieldClass}
            />
          </label>

          {kind === 'weapon' && (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Weapon type</span>
                <select value={weaponType} onChange={e => setWeaponType(e.target.value as WeaponItem['weapon_type'])} className={selectClass}>
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
                  <select value={damageType} onChange={e => setDamageType(e.target.value)} className={selectClass}>
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
          )}

          {kind === 'armor' && (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Armor type</span>
                <select value={armorType} onChange={e => pickArmorType(e.target.value as ArmorItem['armor_type'])} className={selectClass}>
                  {ARMOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              {/* Friendly AC builder — we generate the formula (#5) */}
              {armorType === 'Shield' ? (
                <label className="block">
                  <span className="text-xs font-semibold text-muted-foreground">AC bonus (added to your AC)</span>
                  <input
                    type="number" min={0}
                    value={baseAc}
                    onChange={e => setBaseAc(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className={fieldClass}
                  />
                </label>
              ) : (
                <div className="space-y-2 rounded-md border border-border p-2.5">
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">Base AC</span>
                    <input
                      type="number" min={0}
                      value={baseAc}
                      onChange={e => setBaseAc(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className={fieldClass}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={addsDex} onChange={() => setAddsDex(v => !v)} className="h-4 w-4 accent-[var(--color-accent-gold)]" />
                    Add Dexterity modifier
                  </label>
                  {addsDex && (
                    <div className="pl-6 space-y-2">
                      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                        <input type="checkbox" checked={hasCap} onChange={() => setHasCap(v => !v)} className="h-4 w-4 accent-[var(--color-accent-gold)]" />
                        Cap the Dex bonus
                      </label>
                      {hasCap && (
                        <label className="block">
                          <span className="text-xs font-semibold text-muted-foreground">Max Dex bonus</span>
                          <input
                            type="number" min={0}
                            value={dexCap}
                            onChange={e => setDexCap(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                            className={fieldClass}
                          />
                        </label>
                      )}
                    </div>
                  )}
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground">Magic bonus (optional)</span>
                    <input
                      type="number" min={0}
                      value={flatBonus}
                      onChange={e => setFlatBonus(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      className={fieldClass}
                    />
                  </label>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Resulting AC: <span className="font-mono" style={{ color: 'var(--color-accent-gold)' }}>{acPreview}</span>
              </p>

              {armorType !== 'Shield' && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={stealthDisadvantage}
                    onChange={() => setStealthDisadvantage(v => !v)}
                    className="h-4 w-4 accent-[var(--color-accent-gold)]"
                  />
                  Stealth disadvantage
                </label>
              )}
            </>
          )}

          {kind === 'item' && (
            <div className="flex gap-2">
              <label className="block flex-1">
                <span className="text-xs font-semibold text-muted-foreground">Rarity</span>
                <select value={rarity} onChange={e => setRarity(e.target.value as WondrousItem['rarity'])} className={selectClass}>
                  {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="flex items-end gap-2 text-sm cursor-pointer select-none pb-1.5">
                <input type="checkbox" checked={attunement} onChange={() => setAttunement(v => !v)} className="h-4 w-4 accent-[var(--color-accent-gold)]" />
                Attunement
              </label>
            </div>
          )}

          <div className="rounded-md border border-border p-2.5">
            <EffectBuilder effects={effects} onChange={setEffects} />
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Bonuses apply while the item is {attunement && kind === 'item' ? 'attuned' : 'equipped'}.
              {kind === 'armor' ? ' (Separate from the armor’s own AC above.)' : ''}
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Description</span>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="What it is and what it does…"
              className={`${fieldClass} resize-y`}
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!valid}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
