import { useMemo, useState, type ReactNode } from 'react'
import { Plus, X, Pencil, Check, Sparkles, PackageOpen, PackagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SelectionList } from '@/components/SelectionList'
import { InfoPopup } from '@/components/InfoPopup'
import { StepperField } from './StepperField'
import { EditableField } from './EditableField'
import { ToolsSection } from './ToolsSection'
import { ValueAdjustModal } from './ValueAdjustModal'
import { CustomItemDialog } from './CustomItemDialog'
import { ContainerInventoryDialog } from './ContainerInventoryDialog'
import { generateId } from '@/lib/uuid'
import { mergeCustomEquipment } from '@/lib/customContent'
import { isContainerName, ITEM_TYPE_ORDER, getWondrousItemType, contentsOf } from '@/lib/containers'
import { computeWeaponBonus, summarizeItemEffects, isVariableBaseArmor, applyLedger } from '@/lib/characterStats'
import { abilityModifier, formatBonus } from '@/lib/dice'
import { useRollDispatch } from '@/lib/useRollDispatch'
import { RollButton } from '@/components/sheet/RollButton'
import { StatBreakdown } from './StatBreakdown'
import { ResourcePips } from './ResourcePips'
import type { Character, EquipmentItem, NewCharacter, Currency, LedgerOverrides } from '@/types/character'
import { condenseCurrency, canCondense } from '@/lib/currency'
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

const WONDROUS_RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'] as const

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
      <ResourcePips
        size="sm"
        total={max}
        used={Math.min(max, Math.max(0, used))}
        onChange={onSetCharges}
        label="charge"
      />
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
      <div className="flex items-start gap-2 py-2">
        <div className="flex-1 min-w-0">
          <span className="block text-left text-sm font-medium">
            Unarmed Strike
          </span>
          <div className="flex items-center gap-2 text-xs mt-0.5">
            <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
              {toHit}
            </span>
            <span className="text-muted-foreground">{damageDisplay}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-none">
          <RollButton
            label="Hit"
            rollMode={derived.attackRollState}
            onClick={() => dispatch({ type: 'attack', label: 'Unarmed Strike', modifier: toHitModifier, damageDice, damageBonus, damageType, bonuses: [{ label: 'To hit', amount: toHitModifier }] })}
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
  onSaveLedger,
  onRemove,
  requiresAttunement,
  active,
  onToggleActive,
  charges,
  variableBase = false,
  onChooseBase,
  moveControl,
}: {
  item: EquipmentItem
  weapon: WeaponItem
  character: Character
  derived: DerivedStats
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onSaveLedger: (next: LedgerOverrides) => void
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
  charges?: ItemCharges
  variableBase?: boolean
  onChooseBase?: () => void
  moveControl?: ReactNode
}) {
  const { dispatch, dispatchDamage } = useRollDispatch(derived)
  const calc = computeWeaponBonus(weapon, character, derived.weaponProficiencies, derived.effectiveAbilities, derived.itemDamageBonus, derived.featureWeaponEffects, derived.itemAttackBonus, item.id)
  // Per-weapon Modifier Ledger (P4): disable/augment contributors. Applied at render
  // (INV-1) via the same pure helper as every other stat; the override cascades into
  // both the displayed value and the dice roll. The custom to-hit/damage string override
  // (Edit stats) still takes final precedence when set.
  const atkLedger = applyLedger(`weaponAttack:${item.id}`, calc.attackBreakdown, character.ledgerOverrides)
  const dmgLedger = applyLedger(`weaponDamage:${item.id}`, calc.damageBreakdown, character.ledgerOverrides)
  const ledgerToHit = atkLedger.effective
  const ledgerDamageBonus = dmgLedger.effective
  const computedToHit = formatBonus(ledgerToHit)
  const computedDamage = `${calc.damageDice || '—'}${ledgerDamageBonus ? formatBonus(ledgerDamageBonus) : ''} ${calc.damageType}`.trim()
  // Rider damage of another type (Flame Tongue → +2d6 fire) applies only while the
  // weapon is active (equipped/attuned per its requirement); crit doubles it.
  const riderDamage = active
    ? (weapon.effects ?? []).flatMap(e => e.type === 'damage_dice' ? [{ dice: e.dice, damageType: e.damageType }] : [])
    : []
  const riderSuffix = riderDamage.map(r => `+${r.dice} ${r.damageType}`).join(' ')
  const displayToHit = item.customToHit ?? computedToHit
  const displayDamage = (item.customDamage ?? computedDamage) + (riderSuffix ? ` ${riderSuffix}` : '')
  const rollModifier = item.customToHit !== undefined
    ? (parseInt(item.customToHit.replace(/^\+/, ''), 10) || 0)
    : ledgerToHit
  // Honor a custom damage override when it parses; otherwise use ledger-adjusted values (BUG-20)
  const customDmg = item.customDamage ? parseCustomDamage(item.customDamage) : null
  const rollDamageDice = customDmg?.damageDice ?? calc.damageDice
  const rollDamageBonus = customDmg?.damageBonus ?? ledgerDamageBonus
  const rollDamageType = customDmg?.damageType || calc.damageType
  // Great Weapon Fighting: reroll 1s/2s on a two-handed (or versatile) melee weapon's
  // damage dice. "Versatile used two-handed" isn't app-knowable, so versatile qualifies
  // (same simplification as the other fighting styles).
  const wProps = weapon.properties.map(p => p.toLowerCase())
  const gwfAuto = derived.greatWeaponFighting
    && weapon.weapon_type.toLowerCase().includes('melee')
    && (wProps.includes('two-handed') || wProps.includes('versatile'))
  // Homebrew per-weapon override (item.gwf) forces GWF on any weapon.
  const gwfActive = gwfAuto || !!item.gwf
  const gwfReroll = gwfActive ? 2 : undefined
  const [expanded, setExpanded] = useState(false)
  const [editingStats, setEditingStats] = useState(false)
  const [toHitDraft, setToHitDraft] = useState(displayToHit)
  const [damageDraft, setDamageDraft] = useState(displayDamage)
  const [openBreakdown, setOpenBreakdown] = useState<'attack' | 'damage' | null>(null)

  function commitEdit() {
    // Compare against the ledger-adjusted computed value so typing it back clears the override.
    onUpdate({
      customToHit: toHitDraft !== computedToHit ? toHitDraft : undefined,
      customDamage: damageDraft !== computedDamage ? damageDraft : undefined,
    })
    setEditingStats(false)
  }

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-start gap-2 py-2">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-left text-sm font-medium hover:opacity-75 transition-opacity w-full block"
          >
            {item.name}
            {item.quantity > 1 && (
              <span className="text-xs text-muted-foreground ml-1.5">×{item.quantity}</span>
            )}
          </button>
          {/* Proficiency/to-hit + damage on their own line so the name gets full width (BUG-55/65) */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs mt-0.5">
            <ActiveTag requiresAttunement={requiresAttunement} active={active} />
            <button
              onClick={() => setOpenBreakdown('attack')}
              className="font-semibold inline-flex items-center gap-0.5 hover:opacity-75 transition-opacity"
              style={{ color: 'var(--color-accent-gold)' }}
              title="What's affecting this attack roll?"
            >
              {displayToHit}
              <Pencil className="h-2.5 w-2.5 opacity-60" />
            </button>
            <button
              onClick={() => setOpenBreakdown('damage')}
              className="text-muted-foreground inline-flex items-center gap-0.5 hover:opacity-75 transition-opacity"
              title="What's affecting this weapon's damage?"
            >
              {displayDamage}
              <Pencil className="h-2.5 w-2.5 opacity-60" />
            </button>
            {gwfActive && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold border border-border"
                style={{ color: 'var(--color-accent-gold)' }}
                title={item.gwf ? 'Great Weapon Fighting (homebrew override): damage dice showing 1 or 2 are rerolled once' : 'Great Weapon Fighting: damage dice showing 1 or 2 are rerolled once'}
              >
                GWF
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-none">
          <RollButton
            label="Hit"
            rollMode={derived.attackRollState}
            onClick={() => dispatch({ type: 'attack', label: item.name, modifier: rollModifier, damageDice: rollDamageDice, damageBonus: rollDamageBonus, damageType: rollDamageType, extraDamage: riderDamage, rerollBelow: gwfReroll, bonuses: item.customToHit !== undefined ? [{ label: 'Custom to-hit', amount: rollModifier }] : atkLedger.rows.filter(r => !r.disabled).map(r => ({ label: r.label, amount: r.amount })) })}
          />
          <RollButton
            label="Dmg"
            tone="gold"
            onClick={() => dispatchDamage({ label: item.name, baseDice: rollDamageDice, damageBonus: rollDamageBonus, damageType: rollDamageType, extraDamage: riderDamage, rerollBelow: gwfReroll })}
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

          {/* Homebrew: a GWF fighter can extend Great Weapon Fighting to a melee weapon
              that doesn't auto-qualify (not two-handed/versatile). */}
          {derived.greatWeaponFighting && weapon.weapon_type.toLowerCase().includes('melee') && !gwfAuto && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!item.gwf}
                onChange={e => onUpdate({ gwf: e.target.checked || undefined })}
                className="h-3.5 w-3.5 accent-[var(--color-accent-gold)]"
              />
              <span className="text-foreground">Great Weapon Fighting (reroll 1s/2s) — homebrew</span>
            </label>
          )}

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
                {moveControl}
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

      <StatBreakdown
        open={openBreakdown === 'attack'}
        onClose={() => setOpenBreakdown(null)}
        title={`${item.name} — Attack${item.customToHit !== undefined ? ' (custom override active)' : ''}`}
        signed
        sources={atkLedger.rows}
        targetKey={`weaponAttack:${item.id}`}
        ledger={character.ledgerOverrides}
        onChange={onSaveLedger}
      />
      <StatBreakdown
        open={openBreakdown === 'damage'}
        onClose={() => setOpenBreakdown(null)}
        title={`${item.name} — Damage bonus${item.customDamage !== undefined ? ' (custom override active)' : ''}`}
        signed
        sources={dmgLedger.rows}
        targetKey={`weaponDamage:${item.id}`}
        ledger={character.ledgerOverrides}
        onChange={onSaveLedger}
      />
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
  moveControl,
}: {
  item: EquipmentItem
  armor: ArmorItem
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
  moveControl?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-start gap-2 py-2">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-left text-sm font-medium hover:opacity-75 transition-opacity w-full block"
          >
            {item.name}
          </button>
          {/* AC / type / stealth on their own line so the name gets full width (BUG-55/65) */}
          <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs mt-0.5">
            <ActiveTag requiresAttunement={requiresAttunement} active={active} />
            <span className="font-semibold" style={{ color: 'var(--color-accent-gold)' }}>
              AC {armor.ac_formula}
            </span>
            <span className="text-muted-foreground">{armor.armor_type}</span>
            {armor.stealth_disadvantage && (
              <span className="text-muted-foreground">Stealth disadv.</span>
            )}
          </div>
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
            {moveControl}
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
  moveControl,
  containerButton,
  heal,
  onDrink,
}: {
  item: EquipmentItem
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
  moveControl?: ReactNode
  containerButton?: ReactNode
  heal?: { dice: string; bonus: number }   // consumable heal (potions) → shows a Drink action
  onDrink?: () => void
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
        {onDrink && heal && (
          <button
            onClick={onDrink}
            className="flex-none text-[11px] font-semibold px-2 py-0.5 rounded-md border transition-opacity hover:opacity-75"
            style={{ color: 'var(--color-accent-gold)', borderColor: 'var(--color-accent-gold)' }}
            title={`Drink — roll ${heal.dice}${heal.bonus ? ` + ${heal.bonus}` : ''} healing (consumes one)`}
          >
            Drink
          </button>
        )}
        {containerButton}
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
              {moveControl}
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
  moveControl,
  containerButton,
}: {
  item: EquipmentItem
  wondrousItem: WondrousItem
  onUpdate: (changes: Partial<EquipmentItem>) => void
  onRemove: () => void
  requiresAttunement: boolean
  active: boolean
  onToggleActive?: () => void
  moveControl?: ReactNode
  containerButton?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const rarityColor = RARITY_COLORS[wondrousItem.rarity] ?? 'var(--color-text-muted)'

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-start gap-2 py-2">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-left text-sm font-medium hover:opacity-75 transition-opacity w-full block"
          >
            {item.name}
          </button>
          {/* Rarity / attune on their own line so the name gets full width (BUG-55/65) */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs mt-0.5">
            <ActiveTag requiresAttunement={requiresAttunement} active={active} />
            <span className="font-semibold" style={{ color: rarityColor }}>
              {wondrousItem.rarity}
            </span>
            {wondrousItem.attunement && (
              <span className="text-muted-foreground">(Attune)</span>
            )}
          </div>
        </div>
        {containerButton}
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
            {moveControl}
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
  moveControl,
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
  moveControl?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const rarityColor = RARITY_COLORS[armor.rarity ?? ''] ?? 'var(--color-text-muted)'
  // armor is already resolved to the chosen base (renderRow), so ac_formula is real
  // unless the base hasn't been picked yet (still "Varies").
  const acUnresolved = armor.ac_formula.trim().toLowerCase().startsWith('varies')

  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-start gap-2 py-2">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-left text-sm font-medium hover:opacity-75 transition-opacity w-full block"
          >
            {item.name}
          </button>
          {/* AC / rarity / bonus / attune on their own line so the name gets full width (BUG-55/65) */}
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs mt-0.5">
            <ActiveTag requiresAttunement={requiresAttunement} active={active} />
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
            {moveControl}
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
  const [customDialog, setCustomDialog] = useState<'weapon' | 'armor' | 'item' | null>(null)
  // Currency whose add/subtract modal is open (null = closed).
  const [currencyModal, setCurrencyModal] = useState<keyof Currency | null>(null)
  // Container (bag of holding etc.) whose inventory dialog is open (null = closed).
  const [openContainerId, setOpenContainerId] = useState<string | null>(null)
  // When set, the next catalog/custom add drops the item INTO this container instead
  // of onto the person (driven by the open container's "Add" buttons).
  const [addTargetContainerId, setAddTargetContainerId] = useState<string | null>(null)
  // Item awaiting a "move to which bag?" choice (only when >1 container exists).
  const [moveChooserItem, setMoveChooserItem] = useState<EquipmentItem | null>(null)
  // Consumable healing (potions) dispatches a heal roll through the shared modal.
  const { dispatchDamage } = useRollDispatch(derived)

  // Catalog with this character's homebrew weapons/armor folded in, so they
  // resolve by name in every row + picker exactly like built-ins (same merge the
  // derive layer uses — see lib/customContent).
  const catalog = useMemo(
    () => mergeCustomEquipment(baseCatalog, character),
    [baseCatalog, character.customWeapons, character.customArmor, character.customItems, character.customTools],
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
  const gearByName = useMemo(
    () => new Map((catalog?.adventuring_gear ?? []).map(g => [g.name.toLowerCase(), g])),
    [catalog?.adventuring_gear],
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

  // Items stored inside a container (bag of holding etc.) are hidden from every main
  // section — they live only inside that bag's inventory dialog. `!e.containerId`
  // guards each section below so a bagged item never double-renders or counts active.
  const onPerson = (e: EquipmentItem) => !e.containerId

  // Active items (worn armor / equipped weapons / attuned or equipped magic items) are
  // pulled out of their type sections and shown ONLY in the Loadout block below.
  const activeItems = character.equipment.filter(e => onPerson(e) && isActive(e))
  // The 3-item cap applies only to attune-required items; equipping costs nothing.
  const attunedCount = activeItems.filter(e => requiresAttunementFor(e.name)).length

  // Containers carried on the person (not themselves inside another bag — bags don't
  // nest). Each gets a "View Inventory" button and is a move-target.
  const containers = character.equipment.filter(e => onPerson(e) && isContainerName(e.name))

  const weaponItems = character.equipment.filter(
    e => onPerson(e) && !isActive(e) && (weaponByName.has(e.name.toLowerCase()) ||
      (wondrousItemByName.has(e.name.toLowerCase()) && e.displayCategory === 'weapon')),
  )
  const armorItems = character.equipment.filter(
    e => onPerson(e) && !isActive(e) && (armorByName.has(e.name.toLowerCase()) ||
      (wondrousItemByName.has(e.name.toLowerCase()) && e.displayCategory === 'armor')),
  )
  const wondrousInItems = character.equipment.filter(
    e => onPerson(e) && !isActive(e) && wondrousItemByName.has(e.name.toLowerCase()) &&
      (e.displayCategory === 'item' || e.displayCategory === undefined),
  )
  const gearItems = character.equipment.filter(
    e => onPerson(e) && !isActive(e) && !weaponByName.has(e.name.toLowerCase()) &&
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
    // When a container's "Add" button opened the picker, drop the item into the bag.
    if (addTargetContainerId) newItem.containerId = addTargetContainerId
    onSave({ equipment: [...character.equipment, newItem] })
    setAddTargetContainerId(null)
    // A variable-base ("any sword / any armor") magic item has no fixed stats until
    // the player picks the mundane base it's forged from. Prompt for that the moment
    // it's added — not just when it's later equipped/attuned (the toggleActive path).
    if (needsBase(newItem)) setBasePrompt(newItem)
  }
  // Move an item into a container: tag it and clear active flags (a stored item can't
  // be worn/wielded). Used by the per-row "Move to bag" control.
  function moveItemToContainer(itemId: string, containerId: string) {
    onSave({
      equipment: character.equipment.map(e =>
        e.id === itemId ? { ...e, containerId, equipped: false, attuned: false } : e,
      ),
    })
  }
  // The per-row "Move to bag" affordance: direct when there's one bag, a chooser when
  // there are several. Returns null when the item itself is a container (no nesting)
  // or there's nowhere to move it.
  function buildMoveControl(item: EquipmentItem): ReactNode {
    if (containers.length === 0 || isContainerName(item.name)) return null
    const onClick = () => {
      if (containers.length === 1) moveItemToContainer(item.id, containers[0].id)
      else setMoveChooserItem(item)
    }
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 hover:opacity-75 transition-opacity"
        title="Move into a bag of holding"
      >
        <PackagePlus className="h-3.5 w-3.5" />
        <span>Move to bag</span>
      </button>
    )
  }
  // A homebrew weapon/armor/item: store the definition (so its stats resolve by
  // name via the merged catalog) AND drop a loadout instance referencing it, in one
  // write. Wondrous items also set displayCategory so they file under Items.
  function createCustomDef(def: WeaponItem | ArmorItem | WondrousItem) {
    const changes: Partial<NewCharacter> =
      def.category === 'weapon' ? { customWeapons: [...(character.customWeapons ?? []), def as WeaponItem] }
      : def.category === 'wondrous_item' ? { customItems: [...(character.customItems ?? []), def as WondrousItem] }
      : { customArmor: [...(character.customArmor ?? []), def as ArmorItem] }
    const instance: EquipmentItem = { id: generateId(), name: def.name, quantity: 1 }
    if (def.category === 'wondrous_item') instance.displayCategory = 'item'
    changes.equipment = [...character.equipment, instance]
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


  // "Inventory (N)" button shown in a container item's row header.
  function buildContainerButton(item: EquipmentItem): ReactNode {
    const count = contentsOf(character.equipment, item.id).length
    return (
      <button
        onClick={() => setOpenContainerId(item.id)}
        className="flex items-center gap-1 flex-none text-[11px] px-2 py-0.5 rounded-full border hover:opacity-80 transition-opacity"
        style={{ color: 'var(--color-accent-gold)', borderColor: 'var(--color-accent-gold)' }}
        title="View this container's inventory"
      >
        <PackageOpen className="h-3 w-3" />
        Inventory{count > 0 ? ` (${count})` : ''}
      </button>
    )
  }

  // Dispatch an equipment item to the right row component by catalog type. Active
  // items render here in the Loadout block; inactive ones in their type section.
  function renderRow(item: EquipmentItem) {
    const n = item.name.toLowerCase()
    const reqAtt = requiresAttunementFor(item.name)
    const active = isActive(item)
    const onToggleActive = () => toggleActive(item)
    const moveControl = buildMoveControl(item)
    const containerButton = isContainerName(item.name) ? buildContainerButton(item) : undefined
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
      } else if (!variableBase && weapon.damage_dice == null && weapon.base_weapon_type) {
        // Specific-base magic weapons (e.g. Mace of Smiting → "mace") that ship with a
        // null damage_dice inherit the named base weapon's dice/type so they display and
        // roll correctly instead of showing "—". No player choice — the base is fixed.
        const base = weaponByName.get(weapon.base_weapon_type.toLowerCase())
        if (base?.damage_dice) {
          effWeapon = {
            ...weapon,
            damage_dice: base.damage_dice,
            damage_type: weapon.damage_type ?? base.damage_type,
            properties: weapon.properties.length ? weapon.properties : base.properties,
            weapon_type: weapon.weapon_type && weapon.weapon_type !== 'Varies' ? weapon.weapon_type : base.weapon_type,
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
          onSaveLedger={next => onSave({ ledgerOverrides: next })}
          onRemove={() => removeItem(item.id)}
          requiresAttunement={reqAtt}
          active={active}
          onToggleActive={onToggleActive}
          charges={weapon.charges}
          variableBase={variableBase}
          onChooseBase={() => setBasePickerItem(item)}
          moveControl={moveControl}
        />
      )
    }
    const armor = armorByName.get(n)
    if (armor) {
      if (!armor.magical) {
        return <ArmorRow key={item.id} item={item} armor={armor} onRemove={() => removeItem(item.id)} requiresAttunement={reqAtt} active={active} onToggleActive={onToggleActive} moveControl={moveControl} />
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
          moveControl={moveControl}
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
          moveControl={moveControl}
          containerButton={containerButton}
        />
      )
    }
    const heal = gearByName.get(n)?.heal
    return (
      <ItemRow
        key={item.id}
        item={item}
        onUpdate={changes => updateItem(item.id, changes)}
        onRemove={() => removeItem(item.id)}
        requiresAttunement={reqAtt}
        active={active}
        onToggleActive={onToggleActive}
        moveControl={moveControl}
        containerButton={containerButton}
        heal={heal}
        onDrink={heal ? () => {
          // Roll the healing (shared heal modal, no auto-HP — like Hit Dice/spells) and
          // consume one: decrement quantity, removing the item when the last is drunk.
          dispatchDamage({ label: `${item.name} (drink)`, baseDice: heal.dice, damageBonus: heal.bonus, mode: 'heal' })
          if (item.quantity > 1) updateItem(item.id, { quantity: item.quantity - 1 })
          else removeItem(item.id)
        } : undefined}
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
            onClick={() => setCustomDialog('item')}
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
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Currency
          </p>
          <button
            onClick={() => onSave({ currency: condenseCurrency(character.currency) })}
            disabled={!canCondense(character.currency)}
            className="text-[11px] px-2 py-0.5 rounded border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Convert coins up into the fewest pp/gp/sp/cp (electrum folded in)"
          >
            Condense
          </button>
        </div>
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
        onClose={() => { setWeaponPickerOpen(false); setAddTargetContainerId(null) }}
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
        onClose={() => { setArmorPickerOpen(false); setAddTargetContainerId(null) }}
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
        onClose={() => { setGearPickerOpen(false); setAddTargetContainerId(null) }}
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

      {/* Container (bag of holding etc.) inventory: contents, coin pouch, bulk import,
          and add. Catalog adds delegate back to the pickers above via addTargetContainerId. */}
      <ContainerInventoryDialog
        open={openContainerId !== null}
        container={character.equipment.find(e => e.id === openContainerId) ?? null}
        character={character}
        catalog={catalog}
        onSave={onSave}
        onClose={() => { setOpenContainerId(null); setAddTargetContainerId(null) }}
        onAddCatalog={kind => {
          setAddTargetContainerId(openContainerId)
          if (kind === 'weapon') setWeaponPickerOpen(true)
          else if (kind === 'armor') setArmorPickerOpen(true)
          else setGearPickerOpen(true)
        }}
      />

      {/* "Move to which bag?" — only shown when more than one container exists. */}
      <InfoPopup
        open={!!moveChooserItem}
        onClose={() => setMoveChooserItem(null)}
        title="Move to which bag?"
        description={moveChooserItem ? `Choose where to store "${moveChooserItem.name}".` : ''}
      >
        {containers.map(c => (
          <Button
            key={c.id}
            variant="outline"
            onClick={() => {
              if (moveChooserItem) moveItemToContainer(moveChooserItem.id, c.id)
              setMoveChooserItem(null)
            }}
          >
            {c.name}
          </Button>
        ))}
      </InfoPopup>
    </section>
  )
}
