import { useMemo, useState } from 'react'
import { Plus, X, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import { StepperField } from './StepperField'
import { generateId } from '@/lib/uuid'
import { computeWeaponBonus, SPELL_BONUS_ITEM_NAMES } from '@/lib/characterStats'
import { InfoPopup } from '@/components/InfoPopup'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { RollButton } from '@/components/sheet/RollButton'
import type { Character, EquipmentItem, NewCharacter, Currency } from '@/types/character'
import type { WeaponItem, ArmorItem, AdventuringGearItem, WondrousItem, EquipmentData } from '@/types/data'
import type { SelectionEntry, TabConfig } from '@/components/SelectionList'
import type { DerivedStats } from '@/lib/characterStats'

interface Props {
  character: Character
  derived: DerivedStats
  onSave: (changes: Partial<NewCharacter>) => void
  catalog: EquipmentData | null
}

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Unique'] as const

const ITEM_TYPE_ORDER = [
  'Rings', 'Rods', 'Scrolls', 'Staffs', 'Wands',
  'Amulets & Jewelry', 'Bags & Containers', 'Belts',
  'Books & Tomes', 'Cloaks & Robes', 'Footwear',
  'Gloves & Bracers', 'Headwear', 'Instruments',
  'Tattoos', 'Other Wondrous',
] as const

const WONDROUS_RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'] as const

function getWondrousItemType(name: string): string {
  const n = name.toLowerCase()
  if (/ring/.test(n) || /signet$/.test(n) || n === 'band of loyalty') return 'Rings'
  if (/staff/.test(n)) return 'Staffs'
  if (n.startsWith('wand') || n === 'spindle of fate' || n === 'radiance') return 'Wands'
  if (/\brod\b/.test(n) || /scepter/.test(n)) return 'Rods'
  if (/scroll/.test(n)) return 'Scrolls'
  if (/tattoo/.test(n)) return 'Tattoos'
  if (/^instrument/.test(n) || /^pipes? of/.test(n) || /lyre/.test(n) || /\bharp\b/.test(n) || /^horn of/.test(n) || /\bdrum\b/.test(n) || /concertina/.test(n)) return 'Instruments'
  if (/^helm/.test(n) || /^hat/.test(n) || /^headband/.test(n) || /^circlet/.test(n) || /^crown/.test(n) || /^cap /.test(n) || /^goggles/.test(n) || /^mask/.test(n) || n === 'dread helm' || /nimbus coronet/.test(n) || n === 'skull helm' || n === 'peregrine mask') return 'Headwear'
  if (/^cloak/.test(n) || /^robe/.test(n) || /^cape/.test(n) || /^mantle/.test(n) || /piwafwi/.test(n) || /shroud/.test(n)) return 'Cloaks & Robes'
  if (/^boots/.test(n) || /^slippers/.test(n) || /^horseshoes/.test(n) || /greaves/.test(n)) return 'Footwear'
  if (/^gauntlets/.test(n) || /^gloves/.test(n) || /^bracers/.test(n) || /^bracelet/.test(n) || /^bracer/.test(n) || /\bclaws\b/.test(n)) return 'Gloves & Bracers'
  if (/^belt/.test(n) || /girdle/.test(n)) return 'Belts'
  if (/^amulet/.test(n) || /^necklace/.test(n) || /^medallion/.test(n) || /^periapt/.test(n) || /^brooch/.test(n) || /^scarab/.test(n) || /^talisman/.test(n) || /^badge/.test(n) || /\binsignia\b/.test(n) || /\bemblem\b/.test(n) || /^charm of/.test(n)) return 'Amulets & Jewelry'
  if (/^bag/.test(n) || /quiver/.test(n) || /haversack/.test(n) || n === 'portable hole' || n === 'chest of preserving') return 'Bags & Containers'
  if (/^tome/.test(n) || /^manual/.test(n) || /^book/.test(n) || /^grimoire/.test(n) || /^libram/.test(n) || /^codex/.test(n) || /compendium/.test(n) || /\barchive\b/.test(n) || /treatise/.test(n) || /manuscript/.test(n) || /primer$/.test(n) || /^atlas/.test(n)) return 'Books & Tomes'
  return 'Other Wondrous'
}

const CURRENCY_KEYS: Array<{ key: keyof Currency; label: string }> = [
  { key: 'pp', label: 'PP' },
  { key: 'gp', label: 'GP' },
  { key: 'ep', label: 'EP' },
  { key: 'sp', label: 'SP' },
  { key: 'cp', label: 'CP' },
]


// Parse a free-form custom damage string ("2d6+4 fire") into roll components.
// Falls back to null when no dice notation is present.
function parseCustomDamage(s: string): { damageDice: string; damageBonus: number; damageType: string } | null {
  const m = s.match(/(\d+d\d+)\s*([+-]\s*\d+)?\s*([a-zA-Z]+)?/)
  if (!m) return null
  return {
    damageDice: m[1],
    damageBonus: m[2] ? parseInt(m[2].replace(/\s+/g, ''), 10) : 0,
    damageType: m[3] ?? '',
  }
}

function WeaponRow({
  item,
  weapon,
  character,
  derived,
  onUpdate,
  onRemove,
}: {
  item: EquipmentItem
  weapon: WeaponItem
  character: Character
  derived: DerivedStats
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
}) {
  const { dispatch } = useRollDispatch(derived)
  const calc = computeWeaponBonus(weapon, character, derived.weaponProficiencies, derived.effectiveAbilities)
  const displayToHit = item.customToHit ?? calc.toHit
  const displayDamage = item.customDamage ?? calc.damage
  const rollModifier = item.customToHit !== undefined
    ? (parseInt(item.customToHit.replace(/^\+/, ''), 10) || 0)
    : calc.toHitModifier
  // Honor a custom damage override when it parses; otherwise use computed values (BUG-20)
  const customDmg = item.customDamage ? parseCustomDamage(item.customDamage) : null
  const rollDamageDice = customDmg?.damageDice ?? calc.damageDice
  const rollDamageBonus = customDmg?.damageBonus ?? calc.damageBonus
  const rollDamageType = customDmg?.damageType || calc.damageType
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
        <RollButton
          onClick={() => dispatch({ type: 'attack', label: item.name, modifier: rollModifier, damageDice: rollDamageDice, damageBonus: rollDamageBonus, damageType: rollDamageType })}
        />
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
  Artifact: 'var(--color-accent-red)',
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

function MagicArmorRow({
  item,
  armor,
  onRemove,
}: {
  item: EquipmentItem
  armor: ArmorItem
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const rarityColor = RARITY_COLORS[armor.rarity ?? ''] ?? 'var(--color-text-muted)'

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
            {armor.rarity}
          </span>
          {armor.bonus != null && (
            <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>+{armor.bonus}</span>
          )}
          {armor.attunement && (
            <span className="text-muted-foreground">(Attune)</span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="pb-3 px-1 space-y-2 text-xs text-muted-foreground">
          {armor.description && <p>{armor.description}</p>}
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
        ...(w.source ? [{ label: 'Source', value: w.source }] : []),
      ],
    },
    group: w.rarity,
  }))
}

function buildWeaponEntries(weapons: WeaponItem[]): SelectionEntry[] {
  return weapons.map(w => {
    if (w.magical) {
      return {
        slug: w.name,
        detail: {
          name: w.name,
          subtitle: `${w.rarity}${w.bonus != null ? ` · +${w.bonus}` : ''}${w.attunement ? ' · Requires Attunement' : ''}`,
          sections: [
            ...(w.base_weapon_type ? [{ label: 'Base Weapon', value: w.base_weapon_type }] : []),
            ...(w.damage_dice ? [{ label: 'Damage', value: `${w.damage_dice}${w.damage_type ? ` ${w.damage_type}` : ''}` }] : []),
            ...(w.bonus != null ? [{ label: 'Bonus', value: `+${w.bonus}` }] : []),
            ...(w.source ? [{ label: 'Source', value: w.source }] : []),
            ...(w.description ? [{ label: 'Description', value: w.description }] : []),
            ...(w.special_properties?.length ? [{ label: 'Properties', value: w.special_properties }] : []),
          ],
        },
        group: w.rarity ?? 'Unknown',
      }
    }
    return {
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
    }
  })
}

function buildArmorEntries(armor: ArmorItem[]): SelectionEntry[] {
  return armor.map(a => {
    if (a.magical) {
      return {
        slug: a.name,
        detail: {
          name: a.name,
          subtitle: `${a.rarity}${a.bonus != null ? ` · +${a.bonus}` : ''}${a.attunement ? ' · Requires Attunement' : ''}`,
          sections: [
            ...(a.base_armor_type ? [{ label: 'Base Armor', value: a.base_armor_type }] : []),
            ...(a.source ? [{ label: 'Source', value: a.source }] : []),
            ...(a.description ? [{ label: 'Description', value: a.description }] : []),
          ],
        },
        group: a.rarity ?? 'Unknown',
      }
    }
    return {
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
    }
  })
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

export function EquipmentBlock({ character, derived, onSave, catalog }: Props) {
  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false)
  const [armorPickerOpen, setArmorPickerOpen] = useState(false)
  const [gearPickerOpen, setGearPickerOpen] = useState(false)
  const [showSpellBonusPrompt, setShowSpellBonusPrompt] = useState(false)

  const weaponByName = useMemo(
    () => new Map((catalog?.weapons ?? []).map(w => [w.name.toLowerCase(), w])),
    [catalog?.weapons],
  )
  const armorByName = useMemo(
    () => new Map((catalog?.armor ?? []).map(a => [a.name.toLowerCase(), a])),
    [catalog?.armor],
  )
  const wondrousItemByName = useMemo(
    () => new Map((catalog?.wondrous_items ?? []).map(w => [w.name.toLowerCase(), w])),
    [catalog?.wondrous_items],
  )

  const weaponEntries = useMemo(() => buildWeaponEntries(catalog?.weapons ?? []), [catalog?.weapons])
  const armorEntries = useMemo(() => buildArmorEntries(catalog?.armor ?? []), [catalog?.armor])
  const gearEntries = useMemo(() => buildGearEntries(catalog?.adventuring_gear ?? []), [catalog?.adventuring_gear])
  const wondrousEntries = useMemo(() => buildWondrousEntries(catalog?.wondrous_items ?? []), [catalog?.wondrous_items])

  const weaponTabs = useMemo((): TabConfig[] => [
    { label: 'Simple', entries: weaponEntries.filter(e => e.group === 'Simple Weapons') },
    { label: 'Martial', entries: weaponEntries.filter(e => e.group === 'Martial Weapons') },
    ...RARITY_ORDER
      .map(r => ({ label: r, entries: weaponEntries.filter(e => e.group === r) }))
      .filter(t => t.entries.length > 0),
  ], [weaponEntries])

  const armorTabs = useMemo((): TabConfig[] => [
    { label: 'Light', entries: armorEntries.filter(e => e.group === 'Light Armor') },
    { label: 'Medium', entries: armorEntries.filter(e => e.group === 'Medium Armor') },
    { label: 'Heavy', entries: armorEntries.filter(e => e.group === 'Heavy Armor') },
    { label: 'Shield', entries: armorEntries.filter(e => e.group === 'Shield Armor') },
    ...RARITY_ORDER
      .map(r => ({ label: r, entries: armorEntries.filter(e => e.group === r) }))
      .filter(t => t.entries.length > 0),
  ].filter(t => t.entries.length > 0), [armorEntries])

  const itemsTabs = useMemo((): TabConfig[] => {
    const typeTabs = ITEM_TYPE_ORDER
      .map(type => ({
        label: type,
        entries: wondrousEntries.filter(e => getWondrousItemType(e.slug) === type),
        groupOrder: [...WONDROUS_RARITY_ORDER],
      }))
      .filter(t => t.entries.length > 0)
    return [{ label: 'Gear', entries: gearEntries }, ...typeTabs]
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
    const removed = character.equipment.find(e => e.id === id)
    onSave({ equipment: character.equipment.filter(e => e.id !== id) })
    // Removing a spell-focus item: re-open the prompt so the player can lower or
    // clear the now-stale bonus (BUG-21) — otherwise it inflates forever
    if (removed && SPELL_BONUS_ITEM_NAMES.has(removed.name.toLowerCase()) && character.spellBonusModifier) {
      setShowSpellBonusPrompt(true)
    }
  }
  function addItem(name: string, displayCategory?: 'weapon' | 'armor' | 'item') {
    const newItem: EquipmentItem = { id: generateId(), name, quantity: 1 }
    if (displayCategory) newItem.displayCategory = displayCategory
    onSave({ equipment: [...character.equipment, newItem] })
    // Always prompt when a spell-focus item is added so stacking bonuses can be
    // updated, not only when the modifier was previously unset (BUG-09)
    if (SPELL_BONUS_ITEM_NAMES.has(name.toLowerCase())) {
      setShowSpellBonusPrompt(true)
    }
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
                    derived={derived}
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
                return armor.magical
                  ? <MagicArmorRow key={item.id} item={item} armor={armor} onRemove={() => removeItem(item.id)} />
                  : <ArmorRow key={item.id} item={item} armor={armor} onRemove={() => removeItem(item.id)} />
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
          addItem(name)
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
          addItem(name)
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
      <InfoPopup
        open={showSpellBonusPrompt}
        onClose={() => setShowSpellBonusPrompt(false)}
        title="Spell Bonus Modifier"
        description="This item adds a flat bonus to your spell attack rolls and spell save DC. Enter only the item's bonus value — the app calculates your base values automatically. Clear this if you lose the item or break attunement."
      >
        <StepperField
          value={character.spellBonusModifier ?? 0}
          onSave={v => onSave({ spellBonusModifier: Math.max(0, v) })}
          min={0}
          max={5}
          size="sm"
        />
        <Button onClick={() => setShowSpellBonusPrompt(false)}>Done</Button>
      </InfoPopup>
    </section>
  )
}
