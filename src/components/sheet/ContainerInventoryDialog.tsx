import { useEffect, useMemo, useState } from 'react'
import { Plus, X, ArrowLeft, PackageOpen, ArrowDownToLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { StepperField } from './StepperField'
import { EditableField } from './EditableField'
import { ValueAdjustModal } from './ValueAdjustModal'
import { generateId } from '@/lib/uuid'
import {
  isContainerName, isCoinContainer, COIN_FIELDS, totalCoins,
  getWondrousItemType, ITEM_TYPE_ORDER, contentsOf,
} from '@/lib/containers'
import type { Character, EquipmentItem, NewCharacter, Currency } from '@/types/character'
import type { EquipmentData } from '@/types/data'

interface Props {
  open: boolean
  container: EquipmentItem | null
  character: Character
  catalog: EquipmentData | null
  onSave: (changes: Partial<NewCharacter>) => void
  onClose: () => void
  // Open the parent's existing catalog picker, targeted at this container.
  onAddCatalog: (kind: 'weapon' | 'armor' | 'item') => void
}

const fieldClass =
  'w-full bg-transparent border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-ring'

// Group display order: real weapons/armor first, then the wondrous-item subtypes,
// then loose gear. Anything unrecognized falls into "Gear".
const GROUP_ORDER = ['Weapons', 'Armor', ...ITEM_TYPE_ORDER, 'Gear'] as const

export function ContainerInventoryDialog({
  open, container, character, catalog, onSave, onClose, onAddCatalog,
}: Props) {
  const [mode, setMode] = useState<'main' | 'import' | 'custom'>('main')
  // Bulk-import selection (ids of on-person items checked to move in).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Add-custom form fields.
  const [cName, setCName] = useState('')
  const [cQty, setCQty] = useState(1)
  const [cDamage, setCDamage] = useState('')
  const [cDesc, setCDesc] = useState('')
  // Move-coins helper.
  const [coinKey, setCoinKey] = useState<keyof Currency>('gp')
  const [coinAmt, setCoinAmt] = useState('')
  // Per-denomination +/- adjust on the bag's own pile (BUG-69), matching the main
  // Currency block's ValueAdjustModal affordance.
  const [coinAdjust, setCoinAdjust] = useState<keyof Currency | null>(null)

  useEffect(() => {
    if (open) {
      setMode('main'); setSelected(new Set())
      setCName(''); setCQty(1); setCDamage(''); setCDesc('')
      setCoinKey('gp'); setCoinAmt(''); setCoinAdjust(null)
    }
  }, [open, container?.id])

  const weaponByName = useMemo(
    () => new Set((catalog?.weapons ?? []).map(w => w.name.toLowerCase())),
    [catalog?.weapons],
  )
  const armorByName = useMemo(
    () => new Set((catalog?.armor ?? []).map(a => a.name.toLowerCase())),
    [catalog?.armor],
  )
  const wondrousByName = useMemo(
    () => new Set((catalog?.wondrous_items ?? []).map(w => w.name.toLowerCase())),
    [catalog?.wondrous_items],
  )

  function classify(item: EquipmentItem): string {
    const n = item.name.toLowerCase()
    if (item.displayCategory === 'weapon' || weaponByName.has(n)) return 'Weapons'
    if (item.displayCategory === 'armor' || armorByName.has(n)) return 'Armor'
    if (wondrousByName.has(n)) return getWondrousItemType(item.name)
    return 'Gear'
  }

  // Recomputed every render so the view always reflects the live character.
  const contents = container ? contentsOf(character.equipment, container.id) : []
  const coinCapable = container ? isCoinContainer(container.name) : false

  const grouped = useMemo(() => {
    if (!container) return []
    const buckets = new Map<string, EquipmentItem[]>()
    for (const item of contents) {
      const g = classify(item)
      const arr = buckets.get(g)
      if (arr) arr.push(item)
      else buckets.set(g, [item])
    }
    const ordered = [...buckets.keys()].sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a as typeof GROUP_ORDER[number])
      const ib = GROUP_ORDER.indexOf(b as typeof GROUP_ORDER[number])
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
    return ordered.map(label => ({ label, items: buckets.get(label)! }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contents, container?.id, weaponByName, armorByName, wondrousByName])

  if (!container) return null
  const cid = container.id

  function updateItem(id: string, changes: Partial<EquipmentItem>) {
    onSave({ equipment: character.equipment.map(e => e.id === id ? { ...e, ...changes } : e) })
  }
  function removeItem(id: string) {
    onSave({ equipment: character.equipment.filter(e => e.id !== id) })
  }
  // Take an item out of the bag (back onto the person).
  function takeOut(id: string) {
    updateItem(id, { containerId: undefined })
  }

  // On-person items that may be moved into the bag (not already stored, not the bag
  // itself, and not another container — bags don't nest).
  const importable = character.equipment.filter(
    e => !e.containerId && e.id !== cid && !isContainerName(e.name),
  )

  function toggleSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function moveSelectedIn() {
    if (selected.size === 0) return
    // Moving into a bag clears the active flags — a stored item can't be worn/wielded.
    onSave({
      equipment: character.equipment.map(e =>
        selected.has(e.id) ? { ...e, containerId: cid, equipped: false, attuned: false } : e,
      ),
    })
    setSelected(new Set())
    setMode('main')
  }

  function addCustom() {
    const name = cName.trim()
    if (!name) return
    const item: EquipmentItem = { id: generateId(), name, quantity: Math.max(1, cQty), containerId: cid }
    if (cDamage.trim()) item.customDamage = cDamage.trim()
    if (cDesc.trim()) item.notes = cDesc.trim()
    onSave({ equipment: [...character.equipment, item] })
    setCName(''); setCQty(1); setCDamage(''); setCDesc('')
    setMode('main')
  }

  function setBagCoin(key: keyof Currency, value: number) {
    const next = { ...(container!.currency ?? {}), [key]: Math.max(0, Math.floor(value)) }
    updateItem(cid, { currency: next })
  }
  function moveCoins(dir: 'deposit' | 'withdraw') {
    const amount = Math.abs(Math.floor(Number(coinAmt)))
    if (!Number.isFinite(amount) || amount <= 0) return
    const charAmt = character.currency[coinKey]
    const bagAmt = container!.currency?.[coinKey] ?? 0
    const n = Math.min(amount, dir === 'deposit' ? charAmt : bagAmt)
    if (n <= 0) return
    const nextChar: Currency = { ...character.currency, [coinKey]: charAmt + (dir === 'deposit' ? -n : n) }
    const nextBag = { ...(container!.currency ?? {}), [coinKey]: bagAmt + (dir === 'deposit' ? n : -n) }
    onSave({
      currency: nextChar,
      equipment: character.equipment.map(e => e.id === cid ? { ...e, currency: nextBag } : e),
    })
    setCoinAmt('')
  }

  const coinTotal = totalCoins(container.currency)

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="flex flex-col p-0 gap-0 max-h-[90dvh] sm:max-w-lg">
        <DialogHeader className="flex-none px-4 pt-4 pb-3 border-b border-border">
          {mode !== 'main' && (
            <button
              onClick={() => setMode('main')}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 -ml-0.5 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to inventory
            </button>
          )}
          <DialogTitle className="flex items-center gap-2 pr-6">
            <PackageOpen className="h-4 w-4 flex-none" style={{ color: 'var(--color-accent-gold)' }} />
            {container.name}
            <span className="text-xs font-normal text-muted-foreground">
              {mode === 'import' ? '· Move items in' : mode === 'custom' ? '· Add custom' : 'Inventory'}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {mode === 'main' && (
            <>
              {/* Coin pouch — general bags only */}
              {coinCapable && (
                <div className="rounded-lg border border-border bg-card p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Coins in bag
                    </p>
                    <span className="text-[11px] text-muted-foreground">{coinTotal} total</span>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    {COIN_FIELDS.map(({ key, label }) => (
                      <div key={key} className="flex flex-col items-center gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                        <EditableField
                          type="number"
                          min={0}
                          value={String(container.currency?.[key] ?? 0)}
                          onSave={v => setBagCoin(key, Number(v) || 0)}
                          className="text-sm font-bold tabular-nums min-w-[2ch] text-center"
                          inputClassName="text-sm font-bold tabular-nums w-12 text-center"
                        />
                        <button
                          onClick={() => setCoinAdjust(key)}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                          title={`Add or subtract ${label} in the bag`}
                        >
                          +/−
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Move coins between you and the bag */}
                  <div className="flex items-end gap-2 flex-wrap pt-1 border-t border-border">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">Coin</span>
                      <select
                        value={coinKey}
                        onChange={e => setCoinKey(e.target.value as keyof Currency)}
                        className="bg-transparent border border-border rounded-md px-1.5 py-1 text-sm focus:outline-none focus:border-ring"
                      >
                        {COIN_FIELDS.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">Amount</span>
                      <input
                        type="number" min={0} value={coinAmt}
                        onChange={e => setCoinAmt(e.target.value)}
                        placeholder="0"
                        className="w-20 bg-transparent border border-border rounded-md px-2 py-1 text-sm focus:outline-none focus:border-ring"
                      />
                    </label>
                    <Button variant="outline" size="sm" onClick={() => moveCoins('deposit')}>
                      Deposit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => moveCoins('withdraw')}>
                      Withdraw
                    </Button>
                    <span className="text-[10px] text-muted-foreground ml-auto self-center">
                      You carry {character.currency[coinKey]} {coinKey.toUpperCase()}
                    </span>
                  </div>

                  <ValueAdjustModal
                    open={coinAdjust !== null}
                    label={coinAdjust ? `${COIN_FIELDS.find(c => c.key === coinAdjust)?.label ?? ''} in bag` : ''}
                    onClose={() => setCoinAdjust(null)}
                    onApply={delta => {
                      if (coinAdjust) setBagCoin(coinAdjust, (container.currency?.[coinAdjust] ?? 0) + delta)
                    }}
                  />
                </div>
              )}

              {/* Contents grouped by type */}
              {contents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Empty. Move items in from your sheet or add new ones below.
                </p>
              ) : (
                grouped.map(({ label, items }) => (
                  <div key={label}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      {label}
                    </p>
                    <div className="rounded-lg border border-border bg-card divide-y divide-border">
                      {items.map(item => (
                        <ContainedRow
                          key={item.id}
                          item={item}
                          onQty={q => updateItem(item.id, { quantity: Math.max(1, q) })}
                          onTakeOut={() => takeOut(item.id)}
                          onRemove={() => removeItem(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setMode('import')} className="text-muted-foreground hover:text-foreground" disabled={importable.length === 0}>
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  Move items in
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onAddCatalog('item')} className="text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onAddCatalog('weapon')} className="text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                  Add Weapon
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onAddCatalog('armor')} className="text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                  Add Armor
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMode('custom')} className="text-muted-foreground hover:text-foreground">
                  <Plus className="h-3.5 w-3.5" />
                  Add Custom
                </Button>
              </div>
            </>
          )}

          {mode === 'import' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelected(selected.size === importable.length ? new Set() : new Set(importable.map(e => e.id)))}
                  className="text-xs underline hover:opacity-75 transition-opacity"
                  style={{ color: 'var(--color-accent-gold)' }}
                >
                  {selected.size === importable.length && importable.length > 0 ? 'Deselect all' : 'Select all'}
                </button>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              </div>
              {importable.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nothing on your sheet to move.</p>
              ) : (
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                  {importable.map(item => (
                    <label key={item.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary transition-colors">
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        className="h-4 w-4 accent-[var(--color-accent-gold)]"
                      />
                      <span className="text-sm flex-1 truncate">{item.name}</span>
                      {item.quantity > 1 && <span className="text-xs text-muted-foreground">×{item.quantity}</span>}
                    </label>
                  ))}
                </div>
              )}
              <div className="flex justify-end">
                <Button size="sm" onClick={moveSelectedIn} disabled={selected.size === 0}>
                  Move {selected.size > 0 ? selected.size : ''} here
                </Button>
              </div>
            </div>
          )}

          {mode === 'custom' && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Name</span>
                <input autoFocus value={cName} onChange={e => setCName(e.target.value)} placeholder="e.g. Arrow of Slaying" className={fieldClass} />
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground">Quantity</span>
                <StepperField value={cQty} onSave={v => setCQty(Math.max(1, v))} min={1} size="sm" />
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Damage <span className="font-normal">(optional)</span></span>
                <input value={cDamage} onChange={e => setCDamage(e.target.value)} placeholder="e.g. 1d6 piercing  or  +2d6 fire" className={fieldClass} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-muted-foreground">Description <span className="font-normal">(optional)</span></span>
                <textarea value={cDesc} onChange={e => setCDesc(e.target.value)} rows={3} placeholder="Notes about this item…" className={fieldClass} />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMode('main')}>Cancel</Button>
                <Button size="sm" onClick={addCustom} disabled={!cName.trim()}>Add to bag</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ContainedRow({
  item, onQty, onTakeOut, onRemove,
}: {
  item: EquipmentItem
  onQty: (q: number) => void
  onTakeOut: () => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = !!(item.customDamage || item.notes)
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => hasDetail && setExpanded(e => !e)}
          className={`flex-1 text-left text-sm truncate min-w-0 ${hasDetail ? 'hover:opacity-75 transition-opacity' : 'cursor-default'}`}
        >
          {item.name}
          {item.quantity > 1 && <span className="text-xs text-muted-foreground ml-1.5">×{item.quantity}</span>}
        </button>
        <StepperField value={item.quantity} onSave={onQty} min={1} size="sm" />
        <button onClick={onTakeOut} className="text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap" title="Move back onto your sheet">
          Take out
        </button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors" title="Remove">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && hasDetail && (
        <div className="px-3 pb-2 -mt-1 text-xs text-muted-foreground space-y-1">
          {item.customDamage && <p><span className="font-semibold text-foreground">Damage:</span> {item.customDamage}</p>}
          {item.notes && <p>{item.notes}</p>}
        </div>
      )}
    </div>
  )
}
