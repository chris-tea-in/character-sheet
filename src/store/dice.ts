import { create } from 'zustand'
import { generateId } from '../lib/uuid'
import { rollDie, abilityModifier, SKILL_DISPLAY_MAP, SKILL_ABILITY_MAP } from '../lib/dice'
import { computeDamageGroups, rollDamageGroups } from '../lib/damage'
import type { DerivedStats } from '../lib/characterStats'
import type { RollKind, RollEntry, ExtraDamage, ExtraDamageResult, DamageSpec } from '../types/dice'

const MAX_ROLLS = 50

function buildLabel(kind: RollKind, modifier: number): string {
  const sign = modifier >= 0 ? '+' : ''
  const adv = 'advantage' in kind && kind.advantage === true ? ' [Adv]' : 'advantage' in kind && kind.advantage === false ? ' [Dis]' : ''
  switch (kind.type) {
    case 'raw':
      return (kind.count ?? 1) > 1 ? `${kind.count}d${kind.die}` : `d${kind.die}`
    case 'skill':
      return `${SKILL_DISPLAY_MAP[kind.skill]} (${SKILL_ABILITY_MAP[kind.skill].toUpperCase()} ${sign}${modifier})${adv}`
    case 'save':
      return `${kind.ability.toUpperCase()} save (${sign}${modifier})${adv}`
    case 'ability':
      return `${kind.ability.toUpperCase()} check (${sign}${modifier})${adv}`
    case 'attack':
      return `${kind.label} (${sign}${modifier})${adv}`
    case 'damage':
      return `${kind.label} damage`
    case 'heal':
      return `${kind.label} (${sign}${modifier})`
  }
}

export interface ModalState {
  entry: RollEntry
  phase: 'result' | 'hit' | 'damage'
  damageDice?: string
  damageBonus?: number
  damageType?: string
  extraDamage?: ExtraDamage[]   // rider damage of other types (Flame Tongue → +2d6 fire)
  isCrit: boolean
  // ── Dmg-button (standalone damage) state ───────────────────────────────────
  // When `damageSpec` is set and `damageRolls` is still undefined, the modal is in
  // the damage-SETUP state: it shows the (optional) upcast level stepper and the
  // Roll Damage / Crit buttons. Rolling fills the result fields below.
  damageSpec?: DamageSpec
  castLevel?: number            // chosen slot level for a leveled spell
  // damage phase result — populated after the player rolls damage
  damageRolls?: number[]
  damageTotal?: number
  extraDamageResults?: ExtraDamageResult[]
}

interface DiceState {
  rolls: RollEntry[]
  roll: (kind: RollKind, derived: DerivedStats) => RollEntry
  clear: () => void
  modal: ModalState | null
  // Re-roll the current d20 result (attack/skill/save/ability), keeping the best
  // (advantage) or worst (disadvantage) of `count` d20s — count 2 = normal adv/dis,
  // 3 = Elven Accuracy, etc. Closes audit #19/#20. Reuses the computed modifier.
  rerollWithMode: (mode: 'adv' | 'dis', count?: number) => void
  // Roll the current check `count` independent times (no keep-best), showing all totals.
  rollIndependent: (count: number) => void
  openModal: (state: ModalState) => void
  openDamage: (spec: DamageSpec) => void
  setCastLevel: (level: number) => void
  rollModalDamage: (crit: boolean) => void
  closeModal: () => void
  setModalDamage: (rolls: number[], total: number, extraResults?: ExtraDamageResult[]) => void
}

function synthEntry(label: string): RollEntry {
  return {
    id: generateId(),
    kind: { type: 'damage', label },
    result: { natural: 0, modifier: 0, total: 0 },
    label,
    timestamp: Date.now(),
  }
}

export const useDiceStore = create<DiceState>()((set) => ({
  rolls: [],
  modal: null,

  roll: (kind, derived) => {
    // Multi-die raw roll (freestyle NdX): roll `count` dice and sum them.
    if (kind.type === 'raw' && (kind.count ?? 1) > 1) {
      const dice = Array.from({ length: kind.count! }, () => rollDie(kind.die))
      const total = dice.reduce((a, b) => a + b, 0)
      const entry: RollEntry = {
        id: generateId(), kind,
        result: { natural: total, dice, modifier: 0, total },
        label: buildLabel(kind, 0), timestamp: Date.now(),
      }
      set(s => ({ rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS) }))
      return entry
    }
    const d1 = kind.type === 'raw' || kind.type === 'heal' ? rollDie(kind.die) : rollDie(20)
    const hasAdvantage = 'advantage' in kind && kind.advantage === true
    const hasDisadvantage = 'advantage' in kind && kind.advantage === false
    const d2 = (hasAdvantage || hasDisadvantage) ? rollDie(20) : undefined
    const natural = d2 !== undefined ? (hasAdvantage ? Math.max(d1, d2) : Math.min(d1, d2)) : d1
    const natural2 = d2 !== undefined ? (hasAdvantage ? Math.min(d1, d2) : Math.max(d1, d2)) : undefined

    let modifier = 0
    if (kind.type === 'skill') {
      modifier = derived.skillModifiers[kind.skill]
    } else if (kind.type === 'save') {
      modifier = derived.saveModifiers[kind.ability]
    } else if (kind.type === 'ability') {
      modifier = abilityModifier(derived.effectiveAbilities[kind.ability])
    } else if (kind.type === 'attack' || kind.type === 'heal') {
      modifier = kind.modifier
    }

    const entry: RollEntry = {
      id:        generateId(),
      kind,
      result:    { natural, natural2, modifier, total: natural + modifier },
      label:     buildLabel(kind, modifier),
      timestamp: Date.now(),
    }

    set(s => ({ rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS) }))
    return entry
  },

  clear: () => set({ rolls: [] }),

  rerollWithMode: (mode, count = 2) => set(s => {
    const m = s.modal
    if (!m) return {}
    const kt = m.entry.kind.type
    if (kt !== 'attack' && kt !== 'skill' && kt !== 'save' && kt !== 'ability') return {}
    const n = Math.max(2, count)
    const adv = mode === 'adv'
    const dice = Array.from({ length: n }, () => rollDie(20))
    const natural = adv ? Math.max(...dice) : Math.min(...dice)
    const natural2 = n === 2 ? (adv ? Math.min(...dice) : Math.max(...dice)) : undefined
    const modifier = m.entry.result.modifier
    const kind = { ...m.entry.kind, advantage: adv } as RollKind
    const entry: RollEntry = {
      id: generateId(), kind,
      result: { natural, natural2, dice: n > 2 ? dice : undefined, modifier, total: natural + modifier },
      label: buildLabel(kind, modifier) + (n > 2 ? ` [${n}d20]` : ''),
      timestamp: Date.now(),
    }
    return {
      rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS),
      modal: { ...m, entry, isCrit: kt === 'attack' && natural === 20 },
    }
  }),

  rollIndependent: (count) => set(s => {
    const m = s.modal
    if (!m) return {}
    const kt = m.entry.kind.type
    if (kt !== 'attack' && kt !== 'skill' && kt !== 'save' && kt !== 'ability') return {}
    const n = Math.max(2, count)
    const modifier = m.entry.result.modifier
    const multi = Array.from({ length: n }, () => rollDie(20) + modifier)
    const kind = { ...m.entry.kind, advantage: undefined } as RollKind
    const entry: RollEntry = {
      id: generateId(), kind,
      result: { natural: multi[0] - modifier, multi, modifier, total: multi[0] },
      label: buildLabel(kind, modifier) + ` ×${n}`,
      timestamp: Date.now(),
    }
    return {
      rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS),
      modal: { ...m, entry, isCrit: false },
    }
  }),

  openModal: (state) => set({ modal: state }),

  // Open the modal straight into the damage-setup state (no preceding hit roll).
  openDamage: (spec) => set({
    modal: {
      entry: synthEntry(spec.label),
      phase: 'damage',
      damageType: spec.damageType,
      damageBonus: spec.damageBonus,
      extraDamage: spec.extraDamage,
      damageSpec: spec,
      castLevel: spec.scaling?.kind === 'leveled' ? spec.scaling.baseLevel : undefined,
      isCrit: false,
    },
  }),

  setCastLevel: (level) => set(s => (s.modal ? { modal: { ...s.modal, castLevel: level } } : {})),

  rollModalDamage: (crit) => set(s => {
    const spec = s.modal?.damageSpec
    if (!s.modal || !spec) return {}
    const groups = computeDamageGroups(spec.baseDice, spec.scaling, s.modal.castLevel)
    const main = rollDamageGroups(groups, crit)
    const mainTotal = main.total + spec.damageBonus
    const extraResults = (spec.extraDamage ?? []).map(ed => {
      const r = rollDamageGroups(computeDamageGroups(ed.dice, undefined, undefined), crit)
      return { damageType: ed.damageType, rolls: r.rolls, total: r.total }
    })
    const grand = mainTotal + extraResults.reduce((a, e) => a + e.total, 0)
    const isHeal = spec.mode === 'heal'
    const entry: RollEntry = {
      id: generateId(),
      kind: { type: 'damage', label: spec.label },
      result: { natural: grand, modifier: 0, total: grand },
      label: isHeal
        ? `${spec.label} healing = ${grand} HP`
        : `${spec.label} damage = ${grand}${crit ? ' (crit)' : ''}`,
      timestamp: Date.now(),
    }
    return {
      rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS),
      modal: {
        ...s.modal,
        phase: 'damage',
        isCrit: crit,
        damageRolls: main.rolls,
        damageTotal: mainTotal,
        extraDamageResults: extraResults,
      },
    }
  }),

  closeModal: () => set({ modal: null }),

  setModalDamage: (rolls, total, extraResults) =>
    set(s => s.modal ? { modal: { ...s.modal, phase: 'damage', damageRolls: rolls, damageTotal: total, extraDamageResults: extraResults } } : {}),
}))
