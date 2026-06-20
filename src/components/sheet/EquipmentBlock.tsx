import { useMemo, useState } from 'react'
import { Plus, X, Pencil, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import { InfoPopup } from '@/components/InfoPopup'
import { StepperField } from './StepperField'
import { EditableField } from './EditableField'
import { ToolsSection } from './ToolsSection'
import { ValueAdjustModal } from './ValueAdjustModal'
import { CustomItemDialog } from './CustomItemDialog'
import { generateId } from '@/lib/uuid'
import { mergeCustomEquipment } from '@/lib/customContent'
import { computeWeaponBonus, summarizeItemEffects, isVariableBaseArmor } from '@/lib/characterStats'
import { abilityModifier } from '@/lib/dice'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { RollButton } from '@/components/sheet/RollButton'
import type { Character, EquipmentItem, NewCharacter, Currency } from '@/types/character'
import type { WeaponItem, ArmorItem, AdventuringGearItem, WondrousItem, EquipmentData, ItemCharges, ClassData } from '@/types/data'
import type { SelectionEntry, TabConfig } from '@/components/SelectionList'
import type { DerivedStats } from '@/lib/characterStats'

interface Props {
  character: Character
  derived: DerivedStats
  onSave: (changes: Partial<NewCharacter>) => void
  catalog: EquipmentData | null
  // Primary class record — used by the relocated Tools section to flag
  // class-granted tool proficiencies.
  classRecord: ClassData | null
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

// A magic weapon built on "any sword / any weapon / …" has no fixed base — the
// player chooses the mundane weapon it's forged from (EquipmentItem.baseWeapon).
function isVariableBaseWeapon(w: WeaponItem): boolean {
  if (!w.magical) return false
  if (w.weapon_type === 'Varies') return true
  return /\bany\b/i.test(w.base_weapon_type ?? '')
}

// Mundane weapons the player may pick as the base, narrowed from the item's
// `base_weapon_type` hint (category words like simple/martial/melee/ranged and a
// weapon-class keyword like "sword"). Falls back to all mundane weapons.
const WEAPON_CLASS_KEYWORDS = [
  'sword', 'axe', 'bow', 'hammer', 'mace', 'dagger', 'spear', 'flail', 'glaive',
  'halberd', 'club', 'whip', 'sickle', 'trident', 'lance', 'pike', 'maul',
  'crossbow', 'sling', 'dart', 'javelin', 'morningstar', 'quarterstaff', 'scimitar',
  'rapier', 'pick',
]
const SWORD_NAMES = ['sword', 'scimitar', 'rapier']

// Mundane armors the player may pick as the base for an "any armor / Varies" magic
// armor, narrowed from the `base_armor_type` hint (light/medium/heavy/plate, and a
// "(not hide)" exclusion). Falls back to all mundane body armor.
function baseArmorCandidates(baseType: string | null | undefined, armorList: ArmorItem[]): ArmorItem[] {
  const t = (baseType ?? '').toLowerCase()
  let pool = armorList.filter(
    a => !a.magical && a.armor_type !== 'Shield' && !a.ac_formula.trim().toLowerCase().startsWith('varies'),
  )
  const wantsLight = t.includes('light')
  const wantsMedium = t.includes('medium')
  const wantsHeavy = t.includes('heavy')
  if (wantsLight || wantsMedium || wantsHeavy) {
    pool = pool.filter(a =>
      (wantsLight && a.armor_type === 'Light') ||
      (wantsMedium && a.armor_type === 'Medium') ||
      (wantsHeavy && a.armor_type === 'Heavy'),
    )
  } else if (t.includes('plate')) {
    // "any plate armor" / "breastplate, half plate, or plate"
    const narrowed = pool.filter(a => /plate/.test(a.name.toLowerCase()))
    if (narrowed.length > 0) pool = narrowed
  }
  if (t.includes('not hide')) pool = pool.filter(a => !/hide/.test(a.name.toLowerCase()))
  return pool
}

function baseWeaponCandidates(baseType: string | null | undefined, weapons: WeaponItem[]): WeaponItem[] {
  const t = (baseType ?? '').toLowerCase()
  let pool = weapons.filter(w => !w.magical && w.damage_dice)
  if (t.includes('simple')) pool = pool.filter(w => w.weapon_type.toLowerCase().includes('simple'))
  if (t.includes('martial')) pool = pool.filter(w => w.weapon_type.toLowerCase().includes('martial'))
  if (t.includes('melee')) pool = pool.filter(w => w.weapon_type.toLowerCase().includes('melee'))
  if (t.includes('ranged')) pool = pool.filter(w => w.weapon_type.toLowerCase().includes('ranged'))
  const kw = WEAPON_CLASS_KEYWORDS.find(k => t.includes(k))
  if (kw) {
    const names = kw === 'sword' ? SWORD_NAMES : [kw]
    const narrowed = pool.filter(w => names.some(n => w.name.toLowerCase().includes(n)))
    if (narrowed.length > 0) pool = narrowed
  }
  return pool
}

// One toggle for both gates: attune-required items show Attune/Unattune, non-attune
// items show Equip/Unequip. Active (attuned or equipped) items render in gold.
function ActivateToggle({
  requiresAttunement,
  active,
  onToggle,
}: {
  requiresAttunement: boolean
  active: boolean
  onToggle?: () => void
}) {
  if (!onToggle) return null
  const label = requiresAttunement
    ? (active ? 'Unattune' : 'Attune')
    : (active ? 'Unequip' : 'Equip')
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1 hover:opacity-75 transition-opacity"
      style={active ? { color: 'var(--color-accent-gold)' } : undefined}
    >
      <Sparkles className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  )
}

// Small inline pill marking a row as worn/active in its type section (the same item
// also appears, compactly, in the Loadout block).
function ActiveTag({ requiresAttunement, active }: { requiresAttunement: boolean; active: boolean }) {
  if (!active) return null
  return (
    <span
      className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide flex-none border"
      style={{ color: 'var(--color-accent-gold)', borderColor: 'var(--color-accent-gold)' }}
    >
      {requiresAttunement ? 'Attuned' : 'Equipped'}
    </span>
  )
}

// Limited-use charge pips. Filled = remaining (max − used), drained left-to-right.
// Clicking a pip spends/restores to that point (death-saves toggle semantics); the
// app has no automatic rest, so a manual Reset refills. Usage tracker only.
function ChargesTracker({
  charges,
  used,
  onSetCharges,
}: {
  charges: ItemCharges
  used: number
  onSetCharges: (used: number) => void
}) {
  const max = charges.max
  const remaining = Math.max(0, max - Math.max(0, used))
  const rechargeLabel = charges.recharge ? charges.recharge.replace('_', ' ') : null
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-semibold text-foreground">Charges:</span>
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: max }).map((_, i) => {
          const filled = i < remaining
          return (
            <button
              key={i}
              onClick={() => onSetCharges(max - (filled ? i : i + 1))}
              className="w-3.5 h-3.5 rounded-full border-2 transition-all"
              style={{
                borderColor: 'var(--color-accent-gold)',
                background: filled ? 'var(--color-accent-gold)' : 'transparent',
              }}
              title={`${remaining}/${max} remaining`}
            />
          )
        })}
      </div>
      <span className="text-muted-foreground">{remaining}/{max}</span>
      <button onClick={() => onSetCharges(0)} className="hover:text-foreground transition-colors underline">
        Reset
      </button>
      {(rechargeLabel || charges.regain) && (
        <span className="text-[10px] text-muted-foreground">
          regains {charges.regain ? `${charges.regain} ` : ''}{rechargeLabel ? `at ${rechargeLabel}` : ''}
        </span>
      )}
    </div>
  )
}

// Always-present, unremovable unarmed strike. RAW: to-hit = STR mod + proficiency
// (every creature is proficient), damage = 1 + STR mod bludgeoning. Derived at
// render time so it tracks ability items, racial ASIs, etc.
function UnarmedRow({ derived }: { derived: DerivedStats }) {
  const { dispatch, dispatchDamage } = useRollDispatch(derived)
  const strMod = abilityModifier(derived.effectiveAbilities.str)
  const override = derived.unarmedStrike

  // An attuned item (e.g. Demon Armor) can replace the unarmed die/type and add
  // attack/damage bonuses; otherwise the base is 1 + STR bludgeoning.
  const damageDice = override.dice ?? ''
  const damageType = override.damageType ?? 'bludgeoning'
  const baseFlat = damageDice ? 0 : 1
  const toHitModifier = strMod + derived.proficiencyBonus + override.attackBonus
  const damageBonus = baseFlat + strMod + derived.itemDamageBonus + override.damageBonus
  const toHit = toHitModifier >= 0 ? `+${toHitModifier}` : `${toHitModifier}`
  const dmgBonusStr = damageBonus !== 0 ? (damageBonus > 0 ? `+${damageBonus}` : `${damageBonus}`) : ''
  const damageDisplay = damageDice
    ? `${damageDice}${dmgBonusStr} ${damageType}`
    : `${damageBonus} ${damageType}`

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 py-2">
        <span className="flex-1 text-left text-sm font-medium truncate min-w-0">
          Unarmed Strike
        </span>
        <div className="flex items-center gap-2 text-xs flex-none">
          <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
            {toHit}
          </span>
          <span className="text-muted-foreground">{damageDisplay}</span>
        </div>
        <div className="flex items-center gap-1 flex-none">
          <RollButton
            label="Hit"
            onClick={() => dispatch({ type: 'attack', label: 'Unarmed Strike', modifier: toHitModifier })}
          />
          <RollButton
            label="Dmg"
            tone="gold"
            onClick={() => dispatchDamage({ label: 'Unarmed Strike', baseDice: damageDice, damageBonus, damageType })}
          />
        </div>
      </div>
    </div>
  )
}

function WeaponRow({
  item,
  weapon,
  character,
  derived,
  onUpdate,
  onRemove,
  requiresAttunement,
  active,
  onToggleActive,
  charges,
  variableBase = false,
  onChooseBase,
}: {
  item: EquipmentItem
  weapon: WeaponItem
  character: Character
  derived: DerivedStats
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
  charges?: ItemCharges
  variableBase?: boolean
  onChooseBase?: () => void
}) {
  const { dispatch, dispatchDamage } = useRollDispatch(derived)
  const calc = computeWeaponBonus(weapon, character, derived.weaponProficiencies, derived.effectiveAbilities, derived.itemDamageBonus, derived.featureWeaponEffects)
  // Rider damage of another type (Flame Tongue → +2d6 fire) applies only while the
  // weapon is active (equipped/attuned per its requirement); crit doubles it.
  const riderDamage = active
    ? (weapon.effects ?? []).flatMap(e => e.type === 'damage_dice' ? [{ dice: e.dice, damageType: e.damageType }] : [])
    : []
  const riderSuffix = riderDamage.map(r => `+${r.dice} ${r.damageType}`).join(' ')
  const displayToHit = item.customToHit ?? calc.toHit
  const displayDamage = (item.customDamage ?? calc.damage) + (riderSuffix ? ` ${riderSuffix}` : '')
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
        <ActiveTag requiresAttunement={requiresAttunement} active={active} />
        <div className="flex items-center gap-2 text-xs flex-none">
          <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
            {displayToHit}
          </span>
          <span className="text-muted-foreground">{displayDamage}</span>
        </div>
        <div className="flex items-center gap-1 flex-none">
          <RollButton
            label="Hit"
            onClick={() => dispatch({ type: 'attack', label: item.name, modifier: rollModifier })}
          />
          <RollButton
            label="Dmg"
            tone="gold"
            onClick={() => dispatchDamage({ label: item.name, baseDice: rollDamageDice, damageBonus: rollDamageBonus, damageType: rollDamageType, extraDamage: riderDamage })}
          />
        </div>
      </div>

      {expanded && (
        <div className="pb-3 px-1 space-y-2 text-xs text-muted-foreground">
          {weapon.description && <p>{weapon.description}</p>}
          {variableBase && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">Base weapon:</span>
              {item.baseWeapon
                ? <span style={{ color: 'var(--color-accent-gold)' }}>{item.baseWeapon}</span>
                : <span className="italic">not set — using default</span>}
              <button onClick={onChooseBase} className="underline hover:text-foreground transition-colors">
                {item.baseWeapon ? 'Change' : 'Choose'}
              </button>
              {item.baseWeapon && (
                <button onClick={() => onUpdate({ baseWeapon: undefined })} className="underline hover:text-foreground transition-colors">
                  Reset
                </button>
              )}
            </div>
          )}
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

          {charges && (
            <ChargesTracker charges={charges} used={item.chargesUsed ?? 0} onSetCharges={u => onUpdate({ chargesUsed: u })} />
          )}

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
              <div className="ml-auto flex items-center gap-3">
                <ActivateToggle requiresAttunement={requiresAttunement} active={active} onToggle={onToggleActive} />
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
      )}
    </div>
  )
}

function ArmorRow({
  item,
  armor,
  onRemove,
  requiresAttunement,
  active,
  onToggleActive,
}: {
  item: EquipmentItem
  armor: ArmorItem
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
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
        <ActiveTag requiresAttunement={requiresAttunement} active={active} />
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
          {armor.description && <p>{armor.description}</p>}
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
          <div className="flex justify-end items-center gap-3">
            <ActivateToggle requiresAttunement={requiresAttunement} active={active} onToggle={onToggleActive} />
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
  requiresAttunement,
  active,
  onToggleActive,
}: {
  item: EquipmentItem
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
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
        <ActiveTag requiresAttunement={requiresAttunement} active={active} />
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
            <div className="ml-auto flex items-center gap-3 text-xs">
              <ActivateToggle requiresAttunement={requiresAttunement} active={active} onToggle={onToggleActive} />
              <button
                onClick={onRemove}
                className="flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                <span>Remove</span>
              </button>
            </div>
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
  onUpdate,
  onRemove,
  requiresAttunement,
  active,
  onToggleActive,
}: {
  item: EquipmentItem
  wondrousItem: WondrousItem
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
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
        <ActiveTag requiresAttunement={requiresAttunement} active={active} />
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
          {wondrousItem.charges && (
            <ChargesTracker charges={wondrousItem.charges} used={item.chargesUsed ?? 0} onSetCharges={u => onUpdate({ chargesUsed: u })} />
          )}
          <div className="flex justify-end items-center gap-3">
            <ActivateToggle requiresAttunement={requiresAttunement} active={active} onToggle={onToggleActive} />
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
  onUpdate,
  onRemove,
  requiresAttunement,
  active,
  onToggleActive,
  variableBase = false,
  onChooseBase,
}: {
  item: EquipmentItem
  armor: ArmorItem
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
  variableBase?: boolean
  onChooseBase?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const rarityColor = RARITY_COLORS[armor.rarity ?? ''] ?? 'var(--color-text-muted)'
  // armor is already resolved to the chosen base (renderRow), so ac_formula is real
  // unless the base hasn't been picked yet (still "Varies").
  const acUnresolved = armor.ac_formula.trim().toLowerCase().startsWith('varies')

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center gap-2 py-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex-1 text-left text-sm font-medium hover:opacity-75 transition-opacity truncate min-w-0"
        >
          {item.name}
        </button>
        <ActiveTag requiresAttunement={requiresAttunement} active={active} />
        <div className="flex items-center gap-2 text-xs flex-none">
          {!acUnresolved && (
            <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
              AC {armor.ac_formula}
            </span>
          )}
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
          {variableBase && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground">Base armor:</span>
              {item.baseArmor
                ? <span style={{ color: 'var(--color-accent-gold)' }}>{item.baseArmor}</span>
                : <span className="italic">not set — AC uses manual entry</span>}
              <button onClick={onChooseBase} className="underline hover:text-foreground transition-colors">
                {item.baseArmor ? 'Change' : 'Choose'}
              </button>
              {item.baseArmor && (
                <button onClick={() => onUpdate({ baseArmor: undefined })} className="underline hover:text-foreground transition-colors">
                  Reset
                </button>
              )}
            </div>
          )}
          {armor.charges && (
            <ChargesTracker charges={armor.charges} used={item.chargesUsed ?? 0} onSetCharges={u => onUpdate({ chargesUsed: u })} />
          )}
          <div className="flex justify-end items-center gap-3">
            <ActivateToggle requiresAttunement={requiresAttunement} active={active} onToggle={onToggleActive} />
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
        // damage_dice/damage_type are nullable on magic weapons (BUG-51) — guard
        name: w.name,
        subtitle: `${w.weapon_type}${w.damage_dice ? ` · ${w.damage_dice}${w.damage_type ? ` ${w.damage_type}` : ''}` : ''}`,
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

export function EquipmentBlock({ character, derived, onSave, catalog: baseCatalog, classRecord }: Props) {
  const [weaponPickerOpen, setWeaponPickerOpen] = useState(false)
  const [armorPickerOpen, setArmorPickerOpen] = useState(false)
  const [gearPickerOpen, setGearPickerOpen] = useState(false)
  // Custom weapon/armor creation dialog (null = closed).
  const [customDialog, setCustomDialog] = useState<'weapon' | 'armor' | null>(null)
  // Currency whose add/subtract modal is open (null = closed).
  const [currencyModal, setCurrencyModal] = useState<keyof Currency | null>(null)

  // Catalog with this character's homebrew weapons/armor folded in, so they
  // resolve by name in every row + picker exactly like built-ins (same merge the
  // derive layer uses — see lib/customContent).
  const catalog = useMemo(
    () => mergeCustomEquipment(baseCatalog, character),
    [baseCatalog, character.customWeapons, character.customArmor],
  )
  // Variable-base ("any sword/any armor") item whose base picker is open, and the
  // item being prompted to pick a base after activation. Lifted here so the equip
  // flow and the in-row "Change" control share one picker.
  const [basePickerItem, setBasePickerItem] = useState<EquipmentItem | null>(null)
  const [basePrompt, setBasePrompt] = useState<EquipmentItem | null>(null)

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

  // Does this item's catalog entry require attunement? (attune-required items gate
  // their effects on `attuned`; everything else on `equipped`.)
  function requiresAttunementFor(name: string): boolean {
    const n = name.toLowerCase()
    const w = wondrousItemByName.get(n)
    if (w) return w.attunement
    const a = armorByName.get(n)
    if (a) return a.attunement ?? false
    const wp = weaponByName.get(n)
    if (wp) return wp.attunement ?? false
    return false
  }
  // An item is "active" (its effects apply, and it shows in Active Items) when the
  // gate matching its type is set.
  function isActive(item: EquipmentItem): boolean {
    return requiresAttunementFor(item.name) ? !!item.attuned : !!item.equipped
  }

  // For "any sword / any armor" magic items: which base must be chosen, and whether
  // one is still missing.
  function baseKind(item: EquipmentItem): 'weapon' | 'armor' | null {
    const n = item.name.toLowerCase()
    const w = weaponByName.get(n)
    if (w && isVariableBaseWeapon(w)) return 'weapon'
    const a = armorByName.get(n)
    if (a && isVariableBaseArmor(a)) return 'armor'
    return null
  }
  function needsBase(item: EquipmentItem): boolean {
    const kind = baseKind(item)
    if (kind === 'weapon') return !item.baseWeapon
    if (kind === 'armor') return !item.baseArmor
    return false
  }

  // Active items (worn armor / equipped weapons / attuned or equipped magic items) are
  // pulled out of their type sections and shown ONLY in the Loadout block below.
  const activeItems = character.equipment.filter(isActive)
  // The 3-item cap applies only to attune-required items; equipping costs nothing.
  const attunedCount = activeItems.filter(e => requiresAttunementFor(e.name)).length

  const weaponItems = character.equipment.filter(
    e => !isActive(e) && (weaponByName.has(e.name.toLowerCase()) ||
      (wondrousItemByName.has(e.name.toLowerCase()) && e.displayCategory === 'weapon')),
  )
  const armorItems = character.equipment.filter(
    e => !isActive(e) && (armorByName.has(e.name.toLowerCase()) ||
      (wondrousItemByName.has(e.name.toLowerCase()) && e.displayCategory === 'armor')),
  )
  const wondrousInItems = character.equipment.filter(
    e => !isActive(e) && wondrousItemByName.has(e.name.toLowerCase()) &&
      (e.displayCategory === 'item' || e.displayCategory === undefined),
  )
  const gearItems = character.equipment.filter(
    e => !isActive(e) && !weaponByName.has(e.name.toLowerCase()) &&
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
  // A homebrew weapon/armor: store the definition (so its stats resolve by name via
  // the merged catalog) AND drop a loadout instance referencing it in one write.
  function createCustomDef(def: WeaponItem | ArmorItem) {
    const isWeapon = def.category === 'weapon'
    const changes: Partial<NewCharacter> = isWeapon
      ? { customWeapons: [...(character.customWeapons ?? []), def as WeaponItem] }
      : { customArmor: [...(character.customArmor ?? []), def as ArmorItem] }
    changes.equipment = [...character.equipment, { id: generateId(), name: def.name, quantity: 1 }]
    onSave(changes)
  }
  function setCurrency(key: keyof Currency, value: number) {
    onSave({ currency: { ...character.currency, [key]: value } })
  }
  // Flip the gate matching the item's type: attune-required → `attuned`, else
  // `equipped`. Wearing a body armor (or a shield) is exclusive: activating one
  // unwears any other body armor (resp. shield) so the AC source is unambiguous.
  function toggleActive(item: EquipmentItem) {
    const reqAtt = requiresAttunementFor(item.name)
    const field: 'attuned' | 'equipped' = reqAtt ? 'attuned' : 'equipped'
    const turningOn = !item[field]

    const thisArmor = armorByName.get(item.name.toLowerCase())
    const thisSlot = thisArmor
      ? (thisArmor.armor_type === 'Shield' ? 'shield' : 'body')
      : null

    const next = character.equipment.map(e => {
      if (e.id === item.id) return { ...e, [field]: turningOn }
      // Exclusivity: only when turning a body/shield piece ON, unwear the same slot
      if (turningOn && thisSlot) {
        const a = armorByName.get(e.name.toLowerCase())
        if (a && (a.armor_type === 'Shield' ? 'shield' : 'body') === thisSlot && (e.equipped || e.attuned)) {
          return { ...e, equipped: false, attuned: false }
        }
      }
      return e
    })
    onSave({ equipment: next })

    // Activating a variable-base item with no base chosen → prompt the user to pick
    // one (and then redirect into the picker), so stats actually apply.
    if (turningOn && needsBase(item)) setBasePrompt(item)
  }

  // Look up a catalog item's effects (for the Loadout summary line)
  function itemEffectsFor(name: string) {
    const n = name.toLowerCase()
    return weaponByName.get(n)?.effects ?? armorByName.get(n)?.effects ?? wondrousItemByName.get(n)?.effects
  }


  // Dispatch an equipment item to the right row component by catalog type. Active
  // items render here in the Loadout block; inactive ones in their type section.
  function renderRow(item: EquipmentItem) {
    const n = item.name.toLowerCase()
    const reqAtt = requiresAttunementFor(item.name)
    const active = isActive(item)
    const onToggleActive = () => toggleActive(item)
    const weapon = weaponByName.get(n)
    if (weapon) {
      // "Any sword / any weapon" magic weapons: the chosen mundane base drives
      // damage/type/properties; the magic entry's bonus + effects (rider) stay.
      const variableBase = isVariableBaseWeapon(weapon)
      let effWeapon = weapon
      if (variableBase && item.baseWeapon) {
        const base = weaponByName.get(item.baseWeapon.toLowerCase())
        if (base) {
          effWeapon = {
            ...weapon,
            damage_dice: base.damage_dice,
            damage_type: base.damage_type,
            properties: base.properties,
            weapon_type: base.weapon_type,
          }
        }
      }
      return (
        <WeaponRow
          key={item.id}
          item={item}
          weapon={effWeapon}
          character={character}
          derived={derived}
          onUpdate={changes => updateItem(item.id, changes)}
          onRemove={() => removeItem(item.id)}
          requiresAttunement={reqAtt}
          active={active}
          onToggleActive={onToggleActive}
          charges={weapon.charges}
          variableBase={variableBase}
          onChooseBase={() => setBasePickerItem(item)}
        />
      )
    }
    const armor = armorByName.get(n)
    if (armor) {
      if (!armor.magical) {
        return <ArmorRow key={item.id} item={item} armor={armor} onRemove={() => removeItem(item.id)} requiresAttunement={reqAtt} active={active} onToggleActive={onToggleActive} />
      }
      // "Any armor / Varies" magic armor: resolve the chosen mundane base so the row
      // shows a real AC formula; the AC derivation does the same resolution.
      const variableBase = isVariableBaseArmor(armor)
      let effArmor = armor
      if (variableBase && item.baseArmor) {
        const base = armorByName.get(item.baseArmor.toLowerCase())
        if (base) {
          effArmor = {
            ...armor,
            ac_formula: base.ac_formula,
            armor_type: base.armor_type,
            stealth_disadvantage: base.stealth_disadvantage,
            strength_requirement: base.strength_requirement,
          }
        }
      }
      return (
        <MagicArmorRow
          key={item.id}
          item={item}
          armor={effArmor}
          onUpdate={changes => updateItem(item.id, changes)}
          onRemove={() => removeItem(item.id)}
          requiresAttunement={reqAtt}
          active={active}
          onToggleActive={onToggleActive}
          variableBase={variableBase}
          onChooseBase={() => setBasePickerItem(item)}
        />
      )
    }
    const wondrousItem = wondrousItemByName.get(n)
    if (wondrousItem) {
      return (
        <MagicItemRow
          key={item.id}
          item={item}
          wondrousItem={wondrousItem}
          onUpdate={changes => updateItem(item.id, changes)}
          onRemove={() => removeItem(item.id)}
          requiresAttunement={reqAtt}
          active={active}
          onToggleActive={onToggleActive}
        />
      )
    }
    return (
      <ItemRow
        key={item.id}
        item={item}
        onUpdate={changes => updateItem(item.id, changes)}
        onRemove={() => removeItem(item.id)}
        requiresAttunement={reqAtt}
        active={active}
        onToggleActive={onToggleActive}
      />
    )
  }

  // Centralized base picker — opened by the activation prompt, the Loadout "set base"
  // pill, or a row's Choose/Change button (all set basePickerItem).
  const bpKind = basePickerItem ? baseKind(basePickerItem) : null
  const basePickerEntries: SelectionEntry[] = !basePickerItem
    ? []
    : bpKind === 'weapon'
    ? buildWeaponEntries(baseWeaponCandidates(weaponByName.get(basePickerItem.name.toLowerCase())?.base_weapon_type, catalog?.weapons ?? []))
    : bpKind === 'armor'
    ? buildArmorEntries(baseArmorCandidates(armorByName.get(basePickerItem.name.toLowerCase())?.base_armor_type, catalog?.armor ?? []))
    : []
  const promptKind = basePrompt ? baseKind(basePrompt) : null

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Equipment
      </h2>

      {/* Loadout — everything currently worn/wielded/attuned, pulled out of the type
          sections below. Full controls (expand for base/charges/edit/remove) live here. */}
      {activeItems.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Loadout
            </p>
            <span
              className="text-xs font-semibold"
              style={{ color: attunedCount > 3 ? 'var(--color-accent-gold)' : 'var(--color-text-muted)' }}
            >
              {attunedCount}/3 attuned
            </span>
          </div>
          {attunedCount > 3 && (
            <p className="text-xs mb-2" style={{ color: 'var(--color-accent-gold)' }}>
              Attuned to more than 3 items — a character can normally attune to at most 3.
            </p>
          )}
          <div>
            {activeItems.map(item => {
              const summary = summarizeItemEffects(itemEffectsFor(item.name))
              return (
                <div key={item.id}>
                  {renderRow(item)}
                  {needsBase(item) && (
                    <button
                      onClick={() => setBasePickerItem(item)}
                      className="text-[11px] px-1 pb-1.5 -mt-1 underline hover:opacity-75 transition-opacity"
                      style={{ color: 'var(--color-accent-gold)' }}
                    >
                      ⚠ Set base {baseKind(item) === 'armor' ? 'armor' : 'weapon'} — stats inactive until you do
                    </button>
                  )}
                  {summary && (
                    <p className="text-[11px] px-1 pb-1.5 -mt-1" style={{ color: 'var(--color-accent-gold)' }}>
                      {summary}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Weapons */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Weapons
          </p>
          <label
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none"
            title="Homebrew: add your proficiency bonus to every weapon's attack roll, even weapons your class isn't proficient with."
          >
            <input
              type="checkbox"
              checked={character.homebrewAllWeaponsProficient}
              onChange={() => onSave({ homebrewAllWeaponsProficient: !character.homebrewAllWeaponsProficient })}
              className="h-3.5 w-3.5 accent-[var(--color-accent-gold)] cursor-pointer"
            />
            Homebrew: all proficient
          </label>
        </div>
        <div>
          <UnarmedRow derived={derived} />
          {weaponItems.map(renderRow)}
        </div>
        <div className="flex gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeaponPickerOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Weapon
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCustomDialog('weapon')}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Custom
          </Button>
        </div>
      </div>

      {/* Armor */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Armor
        </p>
        {armorItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No armor.</p>
        ) : (
          <div>{armorItems.map(renderRow)}</div>
        )}
        <div className="flex gap-2 mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setArmorPickerOpen(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Armor
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCustomDialog('armor')}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Custom
          </Button>
        </div>
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
            {gearItems.map(renderRow)}
            {wondrousInItems.map(renderRow)}
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

      {/* Tools — relocated from the Proficiencies block (below Items, above Currency) */}
      <ToolsSection
        character={character}
        catalog={catalog}
        classRecord={classRecord}
        onSave={onSave}
      />

      {/* Currency */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Currency
        </p>
        <div className="flex gap-4 flex-wrap">
          {CURRENCY_KEYS.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              <div className="flex items-center gap-1.5">
                <EditableField
                  type="number"
                  min={0}
                  value={String(character.currency[key])}
                  onSave={v => setCurrency(key, Math.max(0, Math.floor(Number(v) || 0)))}
                  className="text-sm font-bold tabular-nums min-w-[2ch] text-center"
                  inputClassName="text-sm font-bold tabular-nums w-14 text-center"
                />
                <button
                  onClick={() => setCurrencyModal(key)}
                  aria-label={`Adjust ${label}`}
                  className="w-5 h-5 rounded border border-border hover:bg-secondary flex items-center justify-center transition-colors"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ValueAdjustModal
        open={currencyModal !== null}
        label={currencyModal ? (CURRENCY_KEYS.find(c => c.key === currencyModal)?.label ?? '') : ''}
        onClose={() => setCurrencyModal(null)}
        onApply={delta => {
          if (currencyModal) setCurrency(currencyModal, Math.max(0, character.currency[currencyModal] + delta))
        }}
      />

      <CustomItemDialog
        open={customDialog !== null}
        kind={customDialog ?? 'weapon'}
        onClose={() => setCustomDialog(null)}
        onCreate={createCustomDef}
      />

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

      {/* Centralized base picker for variable-base ("any sword / any armor") items */}
      <SelectionList
        entries={basePickerEntries}
        value={(bpKind === 'weapon' ? basePickerItem?.baseWeapon : basePickerItem?.baseArmor) ?? ''}
        title={bpKind === 'armor' ? 'Choose Base Armor' : 'Choose Base Weapon'}
        open={!!basePickerItem}
        onClose={() => setBasePickerItem(null)}
        onSelect={name => {
          if (basePickerItem) updateItem(basePickerItem.id, bpKind === 'weapon' ? { baseWeapon: name } : { baseArmor: name })
          setBasePickerItem(null)
        }}
      />

      {/* Prompt shown when a variable-base item is activated without a base chosen */}
      <InfoPopup
        open={!!basePrompt}
        onClose={() => setBasePrompt(null)}
        title={`Choose a base ${promptKind === 'armor' ? 'armor' : 'weapon'}`}
        description={basePrompt
          ? `"${basePrompt.name}" is forged from any ${promptKind === 'armor' ? 'armor' : 'weapon'} — pick the base it's built on so its ${promptKind === 'armor' ? 'AC' : 'damage'} applies. Until you do, it falls back to ${promptKind === 'armor' ? 'your manual AC entry' : 'the default damage'}.`
          : ''}
      >
        <Button onClick={() => { setBasePickerItem(basePrompt); setBasePrompt(null) }}>
          Choose base
        </Button>
        <Button variant="outline" onClick={() => setBasePrompt(null)}>
          Later
        </Button>
      </InfoPopup>
    </section>
  )
}
