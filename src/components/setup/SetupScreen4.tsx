import { useState, useEffect, useMemo } from 'react'
import { loadEquipmentData } from '@/lib/data'
import { SelectionList } from '@/components/SelectionList'
import { cn } from '@/lib/utils'
import type { SetupDraft, EquipmentChoices } from '@/lib/characterSetup'
import type { SetupData } from '@/lib/data'
import type {
  EquipmentGrant, EquipmentData,
  WeaponItem, ToolItem, AdventuringGearItem,
} from '@/types/data'
import type { SelectionEntry } from '@/components/SelectionList'

interface Props {
  draft: SetupDraft
  data: SetupData
  errors: string[]
  onChange: (updates: Partial<SetupDraft>) => void
}

interface ActivePick {
  grantIdx: number
  slotIdx: number
  sentinel: string
}

// ── Sentinel helpers ─────────────────────────────────────────────────────────

function sentinelLabel(sentinel: string): string {
  switch (sentinel) {
    case '@any_simple':             return 'any simple weapon'
    case '@any_simple_melee':       return 'any simple melee weapon'
    case '@any_martial':            return 'any martial weapon'
    case '@any_martial_melee':      return 'any martial melee weapon'
    case '@any_musical_instrument': return 'any musical instrument'
    case '@arcane_focus':           return 'arcane focus'
    case '@druidic_focus':          return 'druidic focus'
    case '@holy_symbol':            return 'holy symbol'
    default:                        return 'item'
  }
}

function sentinelPickerTitle(sentinel: string): string {
  switch (sentinel) {
    case '@any_simple':             return 'Choose Simple Weapon'
    case '@any_simple_melee':       return 'Choose Simple Melee Weapon'
    case '@any_martial':            return 'Choose Martial Weapon'
    case '@any_martial_melee':      return 'Choose Martial Melee Weapon'
    case '@any_musical_instrument': return 'Choose Musical Instrument'
    case '@arcane_focus':           return 'Choose Arcane Focus'
    case '@druidic_focus':          return 'Choose Druidic Focus'
    case '@holy_symbol':            return 'Choose Holy Symbol'
    default:                        return 'Choose Item'
  }
}

function weaponToEntry(w: WeaponItem): SelectionEntry {
  const props = w.properties.length ? ` · ${w.properties.join(', ')}` : ''
  return {
    slug: w.name,
    detail: {
      name: w.name,
      subtitle: w.weapon_type,
      sections: [
        { label: 'Damage', value: `${w.damage_dice} ${w.damage_type}` },
        ...(w.properties.length ? [{ label: 'Properties', value: w.properties }] : []),
        ...(w.cost ? [{ label: 'Cost', value: w.cost }] : []),
      ],
    },
  }
  void props
}

function toolToEntry(t: ToolItem): SelectionEntry {
  return {
    slug: t.name,
    detail: {
      name: t.name,
      subtitle: t.tool_category,
      sections: [
        ...(t.cost ? [{ label: 'Cost', value: t.cost }] : []),
      ],
    },
  }
}

function gearToEntry(g: AdventuringGearItem): SelectionEntry {
  return {
    slug: g.name,
    detail: {
      name: g.name,
      subtitle: g.subcategory,
      ...(g.description ? { description: g.description } : {}),
      sections: [],
    },
  }
}

function sentinelEntries(sentinel: string, catalog: EquipmentData): SelectionEntry[] {
  const weapons = catalog.weapons ?? []
  const tools   = catalog.tools ?? []
  const gear    = catalog.adventuring_gear ?? []

  switch (sentinel) {
    case '@any_simple':
      return weapons.filter(w => w.weapon_type.startsWith('Simple')).map(weaponToEntry)
    case '@any_simple_melee':
      return weapons.filter(w => w.weapon_type === 'Simple Melee').map(weaponToEntry)
    case '@any_martial':
      return weapons.filter(w => w.weapon_type.startsWith('Martial')).map(weaponToEntry)
    case '@any_martial_melee':
      return weapons.filter(w => w.weapon_type === 'Martial Melee').map(weaponToEntry)
    case '@any_musical_instrument':
      return tools.filter(t => t.tool_category === 'Musical Instrument').map(toolToEntry)
    case '@arcane_focus':
      return gear.filter(g => g.subcategory === 'Arcane Focus').map(gearToEntry)
    case '@druidic_focus':
      return gear.filter(g => g.subcategory === 'Druidic Focus').map(gearToEntry)
    case '@holy_symbol':
      return gear.filter(g => g.subcategory === 'Holy Symbol').map(gearToEntry)
    default:
      return []
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function SetupScreen4({ draft, data, onChange }: Props) {
  const cls = data.classes[draft.classSlug]
  const bg  = data.backgrounds[draft.backgroundSlug]

  const [catalog, setCatalog] = useState<EquipmentData | null>(null)
  const [activePick, setActivePick] = useState<ActivePick | null>(null)

  useEffect(() => { loadEquipmentData().then(setCatalog).catch(() => {}) }, [])

  const classGrants: EquipmentGrant[] = cls?.starting_equipment ?? []
  const bgItems: string[]             = bg?.starting_equipment ?? []
  const { optionPicks, openPicks }    = draft.equipmentChoices

  function setOptionPick(grantIdx: number, optionIdx: number) {
    const clearedOpenPicks = Object.fromEntries(
      Object.entries(openPicks).filter(([k]) => !k.startsWith(`${grantIdx}:`))
    )
    onChange({
      equipmentChoices: {
        optionPicks: { ...optionPicks, [grantIdx]: optionIdx },
        openPicks: clearedOpenPicks,
      },
    })
  }

  function resolveOpenPick(grantIdx: number, slotIdx: number, itemName: string) {
    onChange({
      equipmentChoices: {
        optionPicks,
        openPicks: { ...openPicks, [`${grantIdx}:${slotIdx}`]: itemName },
      },
    })
    setActivePick(null)
  }

  function clearOpenPick(grantIdx: number, slotIdx: number) {
    const next = { ...openPicks }
    delete next[`${grantIdx}:${slotIdx}`]
    onChange({ equipmentChoices: { optionPicks, openPicks: next } })
  }

  const pickerEntries = useMemo(() => {
    if (!activePick || !catalog) return []
    return sentinelEntries(activePick.sentinel, catalog)
  }, [activePick, catalog])

  return (
    <div className="space-y-6">
      <Section title="From Class">
        {cls ? (
          classGrants.length > 0 ? (
            <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
              {classGrants.map((grant, gi) => (
                <div key={gi} className="px-4 py-4">
                  <GrantRow
                    grant={grant}
                    grantIdx={gi}
                    choices={draft.equipmentChoices}
                    onPickOption={(oi) => setOptionPick(gi, oi)}
                    onOpenPicker={(si, sentinel) => setActivePick({ grantIdx: gi, slotIdx: si, sentinel })}
                    onClearPick={(si) => clearOpenPick(gi, si)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No equipment data available.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Select a class to see starting equipment.</p>
        )}
      </Section>

      <Section title="From Background">
        {bg ? (
          bgItems.length > 0 ? (
            <div className="rounded-lg border border-border bg-card overflow-hidden divide-y divide-border">
              {bgItems.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--color-text-muted)' }} />
                  {item}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No equipment data.</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Select a background to see starting equipment.</p>
        )}
      </Section>

      <SelectionList
        entries={pickerEntries}
        value=""
        title={activePick ? sentinelPickerTitle(activePick.sentinel) : ''}
        open={activePick !== null}
        onClose={() => setActivePick(null)}
        onSelect={(name) => {
          if (activePick) resolveOpenPick(activePick.grantIdx, activePick.slotIdx, name)
        }}
      />
    </div>
  )
}

// ── Grant row ─────────────────────────────────────────────────────────────────

function GrantRow({
  grant,
  grantIdx,
  choices,
  onPickOption,
  onOpenPicker,
  onClearPick,
}: {
  grant: EquipmentGrant
  grantIdx: number
  choices: EquipmentChoices
  onPickOption: (optionIdx: number) => void
  onOpenPicker: (slotIdx: number, sentinel: string) => void
  onClearPick: (slotIdx: number) => void
}) {
  const { optionPicks, openPicks } = choices

  if (grant.type === 'fixed') {
    return (
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Included</p>
        <ItemList
          items={grant.items}
          grantIdx={grantIdx}
          openPicks={openPicks}
          onOpenPicker={onOpenPicker}
          onClearPick={onClearPick}
        />
      </div>
    )
  }

  const selectedIdx = optionPicks[grantIdx]
  const selectedOption = selectedIdx !== undefined ? grant.options[selectedIdx] : null

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Choose one</p>
      <div className="space-y-1">
        {grant.options.map((option, oi) => (
          <button
            key={oi}
            onClick={() => onPickOption(oi)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left',
              selectedIdx === oi
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
            )}
          >
            <span
              className="w-4 h-4 rounded-full border-2 flex-none transition-colors"
              style={selectedIdx === oi
                ? { borderColor: 'var(--color-accent-gold)', background: 'var(--color-accent-gold)' }
                : { borderColor: 'var(--color-border)' }}
            />
            {option.label}
          </button>
        ))}
      </div>

      {selectedOption && (
        <div className="pl-4 border-l-2 border-border space-y-1 pt-1">
          <ItemList
            items={selectedOption.items}
            grantIdx={grantIdx}
            openPicks={openPicks}
            onOpenPicker={onOpenPicker}
            onClearPick={onClearPick}
          />
        </div>
      )}
    </div>
  )
}

// ── Item list ─────────────────────────────────────────────────────────────────

function ItemList({
  items,
  grantIdx,
  openPicks,
  onOpenPicker,
  onClearPick,
}: {
  items: string[]
  grantIdx: number
  openPicks: Record<string, string>
  onOpenPicker: (slotIdx: number, sentinel: string) => void
  onClearPick: (slotIdx: number) => void
}) {
  return (
    <div className="space-y-1">
      {items.map((item, si) => {
        if (!item.startsWith('@')) {
          return (
            <div key={si} className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--color-text-muted)' }} />
              {item}
            </div>
          )
        }

        const resolved = openPicks[`${grantIdx}:${si}`]

        if (resolved) {
          return (
            <div key={si} className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-secondary text-sm">
              <span
                className="w-4 h-4 rounded flex-none flex items-center justify-center text-xs"
                style={{ background: 'var(--color-accent-gold)', color: '#000' }}
              >
                ✓
              </span>
              <span className="flex-1">{resolved}</span>
              <button
                onClick={() => onClearPick(si)}
                className="text-muted-foreground hover:text-foreground transition-colors text-xs flex-none px-1"
                aria-label="Change"
              >
                ✕
              </button>
            </div>
          )
        }

        return (
          <button
            key={si}
            onClick={() => onOpenPicker(si, item)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors hover:bg-secondary/50"
            style={{ color: 'var(--color-accent-gold)' }}
          >
            <span
              className="w-4 h-4 rounded border-2 border-dashed flex-none"
              style={{ borderColor: 'var(--color-accent-gold)' }}
            />
            Choose {sentinelLabel(item)}
          </button>
        )
      })}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        {title}
      </h3>
      {children}
    </div>
  )
}
