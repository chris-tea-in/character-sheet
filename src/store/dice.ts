import { create } from 'zustand'
import { generateId } from '../lib/uuid'
import { rollDie, abilityModifier, SKILL_DISPLAY_MAP, SKILL_ABILITY_MAP } from '../lib/dice'
import { computeDamageGroups, rollDamageGroups } from '../lib/damage'
import { netModes, type SituationalOption } from '../lib/rollSituational'
import type { RollStats } from '../lib/characterStats'
import type { RollKind, RollEntry, ExtraDamage, ExtraDamageResult, DamageSpec, RollBonus, AddedBonus } from '../types/dice'

const MAX_ROLLS = 50

function buildLabel(kind: RollKind, modifier: number): string {
  const sign = modifier >= 0 ? '+' : ''
  const adv = 'advantage' in kind && kind.advantage === true ? ' [Adv]' : 'advantage' in kind && kind.advantage === false ? ' [Dis]' : ''
  switch (kind.type) {
    case 'raw':
      return (kind.count ?? 1) > 1 ? `${kind.count}d${kind.die}` : `d${kind.die}`
    case 'pool':
      return kind.groups.filter(g => g.count > 0).map(g => `${g.count}d${g.die}`).join(' + ') || 'dice'
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
  rerollBelow?: number          // Great Weapon Fighting: reroll the weapon's damage dice ≤ this once
  isCrit: boolean
  // Reliable Talent eligibility for THIS roll (proficient skill check + Rogue 11+), so
  // rerolls keep flooring the kept d20 at 10.
  reliableTalent?: boolean
  // Character has the Lucky feat → show the "🍀 Lucky" reroll button on this d20 roll.
  hasLuckyFeat?: boolean
  // Situational opt-in chips for THIS roll: the target's condition-bearing adv/dis
  // sources, grouped by condition. Per-roll only — never stored (mirrors addedBonuses).
  situational?: SituationalOption[]
  // The standing netted mode at dispatch (undefined = normal). Chip toggles net
  // against this snapshot, not against whatever the dice currently show.
  baseMode?: 'adv' | 'dis'
  // Itemized contributors to this roll's modifier (DEX mod, proficiency, …) — shown
  // under the die. Sums to entry.result.modifier. Empty/absent for plain dice rolls.
  bonuses?: RollBonus[]
  // Per-roll extras the player adds in the modal (Guidance/Bless +1d4, flat, …) that
  // stack onto the to-hit / check total. Never stored.
  addedBonuses?: AddedBonus[]
  // Per-roll extras added to the DAMAGE total (Sneak Attack, Smite, Hunter's Mark, …).
  addedDamage?: AddedBonus[]
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
  gwfRerolled?: number   // Great Weapon Fighting: how many damage dice were rerolled (≥0 when GWF applied)
}

interface DiceState {
  rolls: RollEntry[]
  roll: (kind: RollKind, derived: RollStats) => RollEntry
  clear: () => void
  modal: ModalState | null
  // Re-roll the current d20 result (attack/skill/save/ability), keeping the best
  // (advantage) or worst (disadvantage) of `count` d20s — count 2 = normal adv/dis,
  // 3 = Elven Accuracy, etc. Closes audit #19/#20. Reuses the computed modifier.
  rerollWithMode: (mode: 'adv' | 'dis', count?: number) => void
  // Roll the current check `count` independent times (no keep-best), showing all totals.
  rollIndependent: (count: number) => void
  // Lucky (feat): roll one extra d20 for the current d20 roll and keep the better result.
  luckyReroll: () => void
  // Toggle a situational chip: re-resolves the roll when the netted mode changes
  // (fresh dice per RAW); relabels in place when it can't (redundant same-mode chip).
  toggleSituational: (key: string) => void
  openModal: (state: ModalState) => void
  openDamage: (spec: DamageSpec) => void
  setCastLevel: (level: number) => void
  rollModalDamage: (crit: boolean) => void
  closeModal: () => void
  setModalDamage: (rolls: number[], total: number, extraResults?: ExtraDamageResult[], gwfRerolled?: number) => void
  // Add a player-chosen extra to the current roll (Guidance/Bless die or flat) or to the
  // current damage (Sneak Attack / Smite / …). Per-roll only; recomputes the shown total.
  addModalBonus: (bonus: AddedBonus, target: 'roll' | 'damage') => void
  removeModalBonus: (id: string, target: 'roll' | 'damage') => void
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
    // Mixed-dice pool (freestyle roller): roll each die-type group, keep per-group
    // results, and sum everything (no modifier).
    if (kind.type === 'pool') {
      const pool = kind.groups
        .filter(g => g.count > 0)
        .map(g => ({ die: g.die as number, rolls: Array.from({ length: g.count }, () => rollDie(g.die)) }))
      const total = pool.reduce((s, g) => s + g.rolls.reduce((a, b) => a + b, 0), 0)
      const entry: RollEntry = {
        id: generateId(), kind,
        result: { natural: total, pool, modifier: 0, total },
        label: buildLabel(kind, 0), timestamp: Date.now(),
      }
      set(s => ({ rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS) }))
      return entry
    }
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
    let natural = d2 !== undefined ? (hasAdvantage ? Math.max(d1, d2) : Math.min(d1, d2)) : d1
    const natural2 = d2 !== undefined ? (hasAdvantage ? Math.min(d1, d2) : Math.max(d1, d2)) : undefined

    let modifier = 0
    if (kind.type === 'skill') {
      modifier = derived.skillModifiers[kind.skill]
    } else if (kind.type === 'save') {
      modifier = derived.saveModifiers[kind.ability]
    } else if (kind.type === 'ability') {
      // Raw ability checks add the half-proficiency grant (Jack of All Trades /
      // Remarkable Athlete) — mirrored in useRollDispatch's bonus itemization.
      modifier = abilityModifier(derived.effectiveAbilities[kind.ability])
        + (derived.abilityCheckBonuses[kind.ability]?.amount ?? 0)
    } else if (kind.type === 'attack' || kind.type === 'heal') {
      modifier = kind.modifier
    }

    // Reliable Talent (Rogue 11+): a proficient skill check treats a natural d20 ≤ 9 as 10.
    const reliable = kind.type === 'skill' && derived.reliableTalent && !!derived.effectiveSkillProficiencies[kind.skill]
    let reliableNote = ''
    if (reliable && natural < 10) { natural = 10; reliableNote = ' [Reliable Talent]' }

    const entry: RollEntry = {
      id:        generateId(),
      kind,
      result:    { natural, natural2, modifier, total: natural + modifier },
      label:     buildLabel(kind, modifier) + reliableNote,
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
    let natural = adv ? Math.max(...dice) : Math.min(...dice)
    const natural2 = n === 2 ? (adv ? Math.min(...dice) : Math.max(...dice)) : undefined
    // Reliable Talent floors the kept d20 at 10 (treating each ≤9 as 10 nets to this).
    let reliableNote = ''
    if (m.reliableTalent && natural < 10) { natural = 10; reliableNote = ' [Reliable Talent]' }
    const modifier = m.entry.result.modifier
    const kind = { ...m.entry.kind, advantage: adv } as RollKind
    const entry: RollEntry = {
      id: generateId(), kind,
      result: { natural, natural2, dice: n > 2 ? dice : undefined, modifier, total: natural + modifier },
      label: buildLabel(kind, modifier) + (n > 2 ? ` [${n}d20]` : '') + reliableNote,
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
    const rollOne = () => { const d = rollDie(20); return (m.reliableTalent && d < 10 ? 10 : d) + modifier }
    const multi = Array.from({ length: n }, rollOne)
    const kind = { ...m.entry.kind, advantage: undefined } as RollKind
    const entry: RollEntry = {
      id: generateId(), kind,
      result: { natural: multi[0] - modifier, multi, modifier, total: multi[0] },
      label: buildLabel(kind, modifier) + ` ×${n}` + (m.reliableTalent ? ' [Reliable Talent]' : ''),
      timestamp: Date.now(),
    }
    return {
      rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS),
      modal: { ...m, entry, isCrit: false },
    }
  }),

  luckyReroll: () => set(s => {
    const m = s.modal
    if (!m) return {}
    const kt = m.entry.kind.type
    if (kt !== 'attack' && kt !== 'skill' && kt !== 'save' && kt !== 'ability') return {}
    const current = m.entry.result.natural
    const rawLucky = rollDie(20)
    const lucky = m.reliableTalent && rawLucky < 10 ? 10 : rawLucky  // Reliable Talent floors the lucky die too
    const natural = Math.max(current, lucky)
    const modifier = m.entry.result.modifier
    const kind = m.entry.kind
    const entry: RollEntry = {
      id: generateId(), kind,
      result: { natural, modifier, total: natural + modifier },
      label: buildLabel(kind, modifier) + ` [Lucky: ${current}→${lucky}]`,
      timestamp: Date.now(),
    }
    return {
      rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS),
      modal: { ...m, entry, isCrit: kt === 'attack' && natural === 20 },
    }
  }),

  toggleSituational: (key) => set(s => {
    const m = s.modal
    if (!m || !m.situational?.length) return {}
    const kt = m.entry.kind.type
    if (kt !== 'attack' && kt !== 'skill' && kt !== 'save' && kt !== 'ability') return {}
    const situational = m.situational.map(o => o.key === key ? { ...o, active: !o.active } : o)
    const activeModes = (opts: SituationalOption[]) => opts.filter(o => o.active).map(o => o.mode)
    const before = netModes([m.baseMode, ...activeModes(m.situational)])
    const after = netModes([m.baseMode, ...activeModes(situational)])
    const notes = situational.filter(o => o.active).map(o => ` [${o.sources.join(' + ')}: ${o.short}]`).join('')
    const modifier = m.entry.result.modifier
    // Preserve a Reliable Talent annotation across relabels (the floor already applied).
    const priorReliable = m.entry.label.includes(' [Reliable Talent]') ? ' [Reliable Talent]' : ''

    if (after === before) {
      // Net unchanged (redundant same-mode chip, or adv+dis toggles canceling) —
      // annotate the existing roll, keep the dice.
      const entry: RollEntry = { ...m.entry, label: buildLabel(m.entry.kind, modifier) + notes + priorReliable }
      return {
        rolls: s.rolls.map(r => (r.id === entry.id ? entry : r)),
        modal: { ...m, situational, entry },
      }
    }

    // Net changed — re-resolve fresh at the new mode (2d20 keep best/worst, or a
    // single d20 when advantage and disadvantage cancel to normal).
    const adv = after === 'adv'
    const d1 = rollDie(20)
    const d2 = after !== undefined ? rollDie(20) : undefined
    let natural = d2 !== undefined ? (adv ? Math.max(d1, d2) : Math.min(d1, d2)) : d1
    const natural2 = d2 !== undefined ? (adv ? Math.min(d1, d2) : Math.max(d1, d2)) : undefined
    let reliableNote = ''
    if (m.reliableTalent && natural < 10) { natural = 10; reliableNote = ' [Reliable Talent]' }
    const kind = { ...m.entry.kind, advantage: after === undefined ? undefined : adv } as RollKind
    const entry: RollEntry = {
      id: generateId(), kind,
      result: { natural, natural2, modifier, total: natural + modifier },
      label: buildLabel(kind, modifier) + notes + reliableNote,
      timestamp: Date.now(),
    }
    return {
      rolls: [entry, ...s.rolls].slice(0, MAX_ROLLS),
      modal: { ...m, situational, entry, isCrit: kt === 'attack' && natural === 20 },
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
    // A bare-integer base (Blowgun "1") has no dice group — add it as flat damage.
    const flatBase = /^\d+$/.test((spec.baseDice ?? '').trim()) ? parseInt(spec.baseDice.trim(), 10) : 0
    const main = rollDamageGroups(groups, crit, spec.rerollBelow)
    const mainTotal = main.total + spec.damageBonus + flatBase
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
        gwfRerolled: spec.rerollBelow ? main.rerolled : undefined,
      },
    }
  }),

  closeModal: () => set({ modal: null }),

  setModalDamage: (rolls, total, extraResults, gwfRerolled) =>
    set(s => s.modal ? { modal: { ...s.modal, phase: 'damage', damageRolls: rolls, damageTotal: total, extraDamageResults: extraResults, gwfRerolled } } : {}),

  addModalBonus: (bonus, target) => set(s => {
    if (!s.modal) return {}
    const key = target === 'damage' ? 'addedDamage' : 'addedBonuses'
    return { modal: { ...s.modal, [key]: [...(s.modal[key] ?? []), bonus] } }
  }),

  removeModalBonus: (id, target) => set(s => {
    if (!s.modal) return {}
    const key = target === 'damage' ? 'addedDamage' : 'addedBonuses'
    return { modal: { ...s.modal, [key]: (s.modal[key] ?? []).filter(b => b.id !== id) } }
  }),
}))
