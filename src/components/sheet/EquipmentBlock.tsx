import { useEffect, useMemo, useState } from 'react'
import { Plus, X, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import { StepperField } from './StepperField'
import { generateId } from '@/lib/uuid'
import { abilityModifier, proficiencyBonus } from '@/lib/dice'
import { useDiceStore } from '@/store/dice'
import type { Character, EquipmentItem, NewCharacter, Currency } from '@/types/character'
import type { ClassData, WeaponItem, ArmorItem, AdventuringGearItem, WondrousItem } from '@/types/data'
import type { SelectionEntry, TabConfig } from '@/components/SelectionList'

interface Props {
  character: Character
  classRecord: ClassData | null
  onSave: (changes: Partial<NewCharacter>) => void
}

interface EquipmentCatalog {
  weapons?: WeaponItem[]
  armor?: ArmorItem[]
  adventuring_gear?: AdventuringGearItem[]
  wondrous_items?: WondrousItem[]
}

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'] as const

const CURRENCY_KEYS: Array<{ key: keyof Currency; label: string }> = [
  { key: 'pp', label: 'PP' },
  { key: 'gp', label: 'GP' },
  { key: 'ep', label: 'EP' },
  { key: 'sp', label: 'SP' },
  { key: 'cp', label: 'CP' },
]

function isWeaponProficient(weapon: WeaponItem, classRecord: ClassData | null): boolean {
  if (!classRecord) return false
  const profs = classRecord.weapon_proficiencies.map(p => p.toLowerCase())
  const wtype = weapon.weapon_type.toLowerCase()
  if (wtype.includes('simple') && profs.some(p => p === 'simple weapons')) return true
  if (wtype.includes('martial') && (profs.includes('martial weapons') || profs.includes('all weapons'))) return true
  if (profs.includes(weapon.name.toLowerCase())) return true
  return false
}

function weaponBonus(
  weapon: WeaponItem,
  character: Character,
  classRecord: ClassData | null,
): { toHit: string; damage: string; label: string; modifier: number } {
  const strMod = abilityModifier(character.abilities.str)
  const dexMod = abilityModifier(character.abilities.dex)
  const isFinesse = weapon.properties.some(p => p.toLowerCase().includes('finesse'))
  const isRanged = weapon.weapon_type.toLowerCase().includes('ranged')
  const mod = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod
  const label = isFinesse ? (dexMod > strMod ? 'DEX' : 'STR') : isRanged ? 'DEX' : 'STR'
  const pb = isWeaponProficient(weapon, classRecord) ? proficiencyBonus(character.level) : 0
  const modifier = mod + pb
  const dmgBonus = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : ''
  return {
    toHit: modifier >= 0 ? `+${modifier}` : `${modifier}`,
    damage: `${weapon.damage_dice}${dmgBonus} ${weapon.damage_type}`,
    label,
    modifier,
  }
}

function WeaponRow({
  item,
  weapon,
  character,
  classRecord,
  onUpdate,
  onRemove,
}: {
  item: EquipmentItem
  weapon: WeaponItem
  character: Character
  classRecord: ClassData | null
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
}) {
  const roll = useDiceStore(s => s.roll)
  const calc = weaponBonus(weapon, character, classRecord)
  const displayToHit = item.customToHit ?? calc.toHit
  const displayDamage = item.customDamage ?? calc.damage
  const rollModifier = item.customToHit !== undefined
    ? (parseInt(item.customToHit.replace(/^\+/, ''), 10) || 0)
    : calc.modifier
  const [expanded, setExpanded] = useState(false)
  const [editingStats, setEditingStats] = useState(false)
  const [toHitDraft, setToHitDraft] = useState(displayToHit)
  const [damageDraft, setDamageDraft] = useState(displayDamage)

  function commitEdit() {
    onUpdate({
      customToHit: toHitDraft !== calc.toHit ? toHitDraft : undefined,
      customDamage: damageDraft !== calc.damage ? damageDraft : undefined,
    })
    setEditingStats(false)
  }

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left text-sm font-medium hover:opacity-75 transition-opacity truncate min-w-0"
        >
          {item.name}
          {item.quantity > 1 && (
            <span className="text-xs text-muted-foreground ml-1.5">×{item.quantity}</span>
          )}
        </button>
        <div className="flex items-center gap-2 text-xs flex-none">
          <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
            {displayToHit}
          </span>
          <span className="text-muted-foreground">{displayDamage}</span>
        </div>
        <button
          onClick={() => roll({ type: 'attack', label: item.name, modifier: rollModifier }, character)}
          className="px-2 py-0.5 rounded text-xs font-semibold hover:opacity-80 transition-opacity flex-none"
          style={{ background: 'var(--color-accent)', color: '#fff' }}
        >
          Roll
        </button>
      </div>

      {expanded && (
        <div className="pb-3 px-1 space-y-2 text-xs text-muted-foreground">
          <div className="flex gap-x-4 gap-y-1 flex-wrap">
            <span><span className="font-semibold text-foreground">Type:</span> {weapon.weapon_type}</span>
            {weapon.properties.length > 0 && (
              <span><span className="font-semibold text-foreground">Properties:</span> {weapon.properties.join(', ')}</span>
            )}
            {weapon.cost && (
              <span><span className="font-semibold text-foreground">Cost:</span> {weapon.cost}</span>
            )}
            {weapon.weight && (
              <span><span className="font-semibold text-foreground">Weight:</span> {weapon.weight}</span>
            )}
            {(item.customToHit || item.customDamage) && (
              <span className="text-[10px]">(custom stats)</span>
            )}
          </div>

          {editingStats ? (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <span>To Hit:</span>
                <input
                  value={toHitDraft}
                  onChange={e => setToHitDraft(e.target.value)}
                  className="w-14 bg-transparent border-b border-ring focus:outline-none text-center"
                />
              </div>
              <div className="flex items-center gap-1">
                <span>Damage:</span>
                <input
                  value={damageDraft}
                  onChange={e => setDamageDraft(e.target.value)}
                  className="w-28 bg-transparent border-b border-ring focus:outline-none"
                />
              </div>
              <button onClick={commitEdit} className="hover:opacity-75">
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setToHitDraft(displayToHit); setDamageDraft(displayDamage); setEditingStats(true) }}
                className="flex items-center gap-1 hover:opacity-75 transition-opacity"
              >
                <Pencil className="h-3 w-3" />
                <span>Edit stats</span>
              </button>
              <button
                onClick={onRemove}
                className="flex items-center gap-1 hover:text-destructive transition-colors ml-auto"
              >
                <X className="h-3.5 w-3.5" />
                <span>Remove</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ArmorRow({
  item,
  armor,
  onRemove,
}: {
  item: EquipmentItem
  armor: ArmorItem
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left text-sm font-medium hover:opacity-75 transition-opacity truncate min-w-0"
        >
          {item.name}
        </button>
        <div className="flex items-center gap-3 text-xs flex-none">
          <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
            AC {armor.ac_formula}
          </span>
          <span className="text-muted-foreground">{armor.armor_type}</span>
          {armor.stealth_disadvantage && (
            <span className="text-muted-foreground hidden sm:block">Stealth disadv.</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="pb-3 px-1 space-y-2 text-xs text-muted-foreground">
          <div className="flex gap-x-4 gap-y-1 flex-wrap">
            <span><span className="font-semibold text-foreground">Type:</span> {armor.armor_type}</span>
            <span><span className="font-semibold text-foreground">AC:</span> {armor.ac_formula}</span>
            {armor.stealth_disadvantage && (
              <span><span className="font-semibold text-foreground">Stealth:</span> Disadvantage</span>
            )}
            {armor.strength_requirement && (
              <span><span className="font-semibold text-foreground">STR Required:</span> {armor.strength_requirement}</span>
            )}
            {armor.cost && (
              <span><span className="font-semibold text-foreground">Cost:</span> {armor.cost}</span>
            )}
            {armor.weight && (
              <span><span className="font-semibold text-foreground">Weight:</span> {armor.weight}</span>
            )}
          </div>
          <div className="flex justify-end">
            <button
              onClick={onRemove}
              className="flex items-center gap-1 hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: EquipmentItem
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(item.name)

  function commitName() {
    if (nameDraft.trim()) onUpdate({ name: nameDraft.trim() })
    else setNameDraft(item.name)
    setEditingName(false)
  }

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 py-1.5">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left text-sm hover:opacity-75 transition-opacity truncate min-w-0"
        >
          {item.name}
          {item.quantity > 1 && (
            <span className="text-xs text-muted-foreground ml-1.5">×{item.quantity}</span>
          )}
        </button>
      </div>

      {expanded && (
        <div className="pb-2 px-1 space-y-2">
          {editingName && (
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={e => { if (e.key === 'Enter') commitName() }}
              className="w-full bg-transparent border-b border-ring focus:outline-none text-sm"
            />
          )}
          <div className="flex items-center gap-3">
            <StepperField
              value={item.quantity}
              onSave={v => onUpdate({ quantity: Math.max(1, v) })}
              min={1}
              size="sm"
            />
            <span className="text-xs text-muted-foreground">qty</span>
            <button
              onClick={() => { setNameDraft(item.name); setEditingName(e => !e) }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Rename"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={onRemove}
              className="flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors ml-auto"
            >
              <X className="h-3.5 w-3.5" />
              <span className="text-xs">Remove</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const RARITY_COLORS: Record<string, string> = {
  Common: 'var(--color-text-muted)',
  Uncommon: '#3cb371',
  Rare: '#4169e1',
  'Very Rare': '#9400d3',
  Legendary: '#ff8c00',
  Artifact: 'var(--color-accent)',
}

function MagicItemRow({
  item,
  wondrousItem,
  onRemove,
}: {
  item: EquipmentItem
  wondrousItem: WondrousItem
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const rarityColor = RARITY_COLORS[wondrousItem.rarity] ?? 'var(--color-text-muted)'

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left text-sm font-medium hover:opacity-75 transition-opacity truncate min-w-0"
        >
          {item.name}
        </button>
        <div className="flex items-center gap-2 text-xs flex-none">
          <span className="font-semibold" style={{ color: rarityColor }}>
            {wondrousItem.rarity}
          </span>
          {wondrousItem.attunement && (
            <span className="text-muted-foreground">(Attune)</span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="pb-3 px-1 space-y-2 text-xs text-muted-foreground">
          {wondrousItem.description && (
            <p>{wondrousItem.description}</p>
          )}
          <div className="flex justify-end">
            <button
              onClick={onRemove}
              className="flex items-center gap-1 hover:text-destructive transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function buildWondrousEntries(items: WondrousItem[]): SelectionEntry[] {
  return items.map(w => ({
    slug: w.name,
    detail: {
      name: w.name,
      subtitle: `${w.rarity}${w.attunement ? ' · Requires Attunement' : ''}`,
      sections: [
        ...(w.description ? [{ label: 'Description', value: w.description }] : []),
      ],
    },
    group: w.rarity,
  }))
}

function buildWeaponEntries(weapons: WeaponItem[]): SelectionEntry[] {
  return weapons.map(w => ({
    slug: w.name,
    detail: {
      name: w.name,
      subtitle: `${w.weapon_type} · ${w.damage_dice} ${w.damage_type}`,
      sections: [
        { label: 'Properties', value: w.properties.length ? w.properties : ['None'] },
        ...(w.cost ? [{ label: 'Cost', value: w.cost }] : []),
      ],
    },
    group: w.weapon_type.includes('Simple') ? 'Simple Weapons' : 'Martial Weapons',
  }))
}

function buildArmorEntries(armor: ArmorItem[]): SelectionEntry[] {
  return armor.map(a => ({
    slug: a.name,
    detail: {
      name: a.name,
      subtitle: `${a.armor_type} Armor · AC ${a.ac_formula}`,
      sections: [
        ...(a.stealth_disadvantage ? [{ label: 'Stealth', value: 'Disadvantage' }] : []),
        ...(a.strength_requirement ? [{ label: 'STR Required', value: String(a.strength_requirement) }] : []),
        ...(a.cost ? [{ label: 'Cost', value: a.cost }] : []),
      ],
    },
    group: `${a.armor_type} Armor`,
  }))
}

function buildGearEntries(gear: AdventuringGearItem[]): SelectionEntry[] {
  return gear.map(g => ({
    slug: g.name,
    detail: {
      name: g.name,
      subtitle: g.subcategory,
      sections: [
        ...(g.cost ? [{ label: 'Cost', value: g.cost }] : []),
        ...(g.description ? [{ label: 'Description', value: g.description }] : []),
      ],
    },
    group: 'Adventuring Gear',
  }))
}

export function EquipmentBlock({ character, classRecord, onSave }: Props) {
  const [catalog, setCatalog] = useState<EquipmentCatalog>({})
  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false)
  const [armorPickerOpen, setArmorPickerOpen] = useState(false)
  const [gearPickerOpen, setGearPickerOpen] = useState(false)

  useEffect(() => {
    fetch('/data/equipment.json')
      .then(r => r.json())
      .then((data: EquipmentCatalog) => setCatalog(data))
      .catch(() => {})
  }, [])

  const weaponByName = useMemo(
    () => new Map((catalog.weapons ?? []).map(w => [w.name.toLowerCase(), w])),
    [catalog.weapons],
  )
  const armorByName = useMemo(
    () => new Map((catalog.armor ?? []).map(a => [a.name.toLowerCase(), a])),
    [catalog.armor],
  )
  const wondrousItemByName = useMemo(
    () => new Map((catalog.wondrous_items ?? []).map(w => [w.name.toLowerCase(), w])),
    [catalog.wondrous_items],
  )

  const weaponEntries = useMemo(() => buildWeaponEntries(catalog.weapons ?? []), [catalog.weapons])
  const armorEntries = useMemo(() => buildArmorEntries(catalog.armor ?? []), [catalog.armor])
  const gearEntries = useMemo(() => buildGearEntries(catalog.adventuring_gear ?? []), [catalog.adventuring_gear])
  const wondrousEntries = useMemo(() => buildWondrousEntries(catalog.wondrous_items ?? []), [catalog.wondrous_items])

  const weaponTabs = useMemo((): TabConfig[] => {
    const rarityTabs = RARITY_ORDER
      .map(rarity => ({ label: rarity, entries: wondrousEntries.filter(e => e.group === rarity) }))
      .filter(t => t.entries.length > 0)
    return [
      { label: 'Simple', entries: weaponEntries.filter(e => e.group === 'Simple Weapons') },
      { label: 'Martial', entries: weaponEntries.filter(e => e.group === 'Martial Weapons') },
      ...rarityTabs,
    ]
  }, [weaponEntries, wondrousEntries])

  const armorTabs = useMemo((): TabConfig[] => {
    const typeTabs: TabConfig[] = [
      { label: 'Light', entries: armorEntries.filter(e => e.group === 'Light Armor') },
      { label: 'Medium', entries: armorEntries.filter(e => e.group === 'Medium Armor') },
      { label: 'Heavy', entries: armorEntries.filter(e => e.group === 'Heavy Armor') },
      { label: 'Shield', entries: armorEntries.filter(e => e.group === 'Shield Armor') },
    ].filter(t => t.entries.length > 0)
    const rarityTabs = RARITY_ORDER
      .map(rarity => ({ label: rarity, entries: wondrousEntries.filter(e => e.group === rarity) }))
      .filter(t => t.entries.length > 0)
    return [...typeTabs, ...rarityTabs]
  }, [armorEntries, wondrousEntries])

  const itemsTabs = useMemo((): TabConfig[] => {
    const rarityTabs = RARITY_ORDER
      .map(rarity => ({ label: rarity, entries: wondrousEntries.filter(e => e.group === rarity) }))
      .filter(t => t.entries.length > 0)
    return [{ label: 'Gear', entries: gearEntries }, ...rarityTabs]
  }, [gearEntries, wondrousEntries])

  const weaponItems = character.equipment.filter(
    e => weaponByName.has(e.name.toLowerCase()) ||
      (wondrousItemByName.has(e.name.toLowerCase()) && e.displayCategory === 'weapon'),
  )
  const armorItems = character.equipment.filter(
    e => armorByName.has(e.name.toLowerCase()) ||
      (wondrousItemByName.has(e.name.toLowerCase()) && e.displayCategory === 'armor'),
  )
  const wondrousInItems = character.equipment.filter(
    e => wondrousItemByName.has(e.name.toLowerCase()) &&
      (e.displayCategory === 'item' || e.displayCategory === undefined),
  )
  const gearItems = character.equipment.filter(
    e => !weaponByName.has(e.name.toLowerCase()) &&
      !armorByName.has(e.name.toLowerCase()) &&
      !wondrousItemByName.has(e.name.toLowerCase()),
  )

  function updateItem(id: string, changes: Partial<EquipmentItem>) {
    onSave({ equipment: character.equipment.map(e => e.id === id ? { ...e, ...changes } : e) })
  }
  function removeItem(id: string) {
    onSave({ equipment: character.equipment.filter(e => e.id !== id) })
  }
  function addItem(name: string, displayCategory?: 'weapon' | 'armor' | 'item') {
    const newItem: EquipmentItem = { id: generateId(), name, quantity: 1 }
    if (displayCategory) newItem.displayCategory = displayCategory
    onSave({ equipment: [...character.equipment, newItem] })
  }
  function addCustomItem() {
    onSave({ equipment: [...character.equipment, { id: generateId(), name: 'New item', quantity: 1 }] })
  }
  function setCurrency(key: keyof Currency, value: number) {
    onSave({ currency: { ...character.currency, [key]: value } })
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Equipment
      </h2>

      {/* Weapons */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Weapons
        </p>
        {weaponItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No weapons.</p>
        ) : (
          <div>
            {weaponItems.map(item => {
              const weapon = weaponByName.get(item.name.toLowerCase())
              if (weapon) {
                return (
                  <WeaponRow
                    key={item.id}
                    item={item}
                    weapon={weapon}
                    character={character}
                    classRecord={classRecord}
                    onUpdate={changes => updateItem(item.id, changes)}
                    onRemove={() => removeItem(item.id)}
                  />
                )
              }
              const wondrousItem = wondrousItemByName.get(item.name.toLowerCase())
              if (wondrousItem) {
                return (
                  <MagicItemRow
                    key={item.id}
                    item={item}
                    wondrousItem={wondrousItem}
                    onRemove={() => removeItem(item.id)}
                  />
                )
              }
              return null
            })}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeaponPickerOpen(true)}
          className="text-muted-foreground hover:text-foreground mt-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Weapon
        </Button>
      </div>

      {/* Armor */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Armor
        </p>
        {armorItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No armor.</p>
        ) : (
          <div>
            {armorItems.map(item => {
              const armor = armorByName.get(item.name.toLowerCase())
              if (armor) {
                return (
                  <ArmorRow
                    key={item.id}
                    item={item}
                    armor={armor}
                    onRemove={() => removeItem(item.id)}
                  />
                )
              }
              const wondrousItem = wondrousItemByName.get(item.name.toLowerCase())
              if (wondrousItem) {
                return (
                  <MagicItemRow
                    key={item.id}
                    item={item}
                    wondrousItem={wondrousItem}
                    onRemove={() => removeItem(item.id)}
                  />
                )
              }
              return null
            })}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setArmorPickerOpen(true)}
          className="text-muted-foreground hover:text-foreground mt-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Armor
        </Button>
      </div>

      {/* Items */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Items
        </p>
        {gearItems.length === 0 && wondrousInItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items yet.</p>
        ) : (
          <div>
            {gearItems.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                onUpdate={changes => updateItem(item.id, changes)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
            {wondrousInItems.map(item => {
              const wondrousItem = wondrousItemByName.get(item.name.toLowerCase())!
              return (
                <MagicItemRow
                  key={item.id}
                  item={item}
                  wondrousItem={wondrousItem}
                  onRemove={() => removeItem(item.id)}
                />
              )
            })}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setGearPickerOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={addCustomItem}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Custom
          </Button>
        </div>
      </div>

      {/* Currency */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Currency
        </p>
        <div className="flex gap-4 flex-wrap">
          {CURRENCY_KEYS.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              <StepperField
                value={character.currency[key]}
                onSave={v => setCurrency(key, Math.max(0, v))}
                min={0}
                size="sm"
              />
            </div>
          ))}
        </div>
      </div>

      <SelectionList
        entries={[]}
        value=""
        title="Add Weapon"
        open={weaponPickerOpen}
        onClose={() => setWeaponPickerOpen(false)}
        tabs={weaponTabs}
        onSelect={name => {
          addItem(name, wondrousItemByName.has(name.toLowerCase()) ? 'weapon' : undefined)
          setWeaponPickerOpen(false)
        }}
      />
      <SelectionList
        entries={[]}
        value=""
        title="Add Armor"
        open={armorPickerOpen}
        onClose={() => setArmorPickerOpen(false)}
        tabs={armorTabs}
        onSelect={name => {
          addItem(name, wondrousItemByName.has(name.toLowerCase()) ? 'armor' : undefined)
          setArmorPickerOpen(false)
        }}
      />
      <SelectionList
        entries={[]}
        value=""
        title="Add Item"
        open={gearPickerOpen}
        onClose={() => setGearPickerOpen(false)}
        tabs={itemsTabs}
        onSelect={name => {
          addItem(name, wondrousItemByName.has(name.toLowerCase()) ? 'item' : undefined)
          setGearPickerOpen(false)
        }}
      />
    </section>
  )
}
