import { create } from 'zustand'
import { generateId } from '../lib/uuid'
import { rollDie, abilityModifier, proficiencyBonus, SKILL_ABILITY_MAP, SKILL_DISPLAY_MAP } from '../lib/dice'
import type { Character } from '../types/character'
import type { RollKind, RollEntry } from '../types/dice'

const MAX_ROLLS = 50

function buildLabel(kind: RollKind, modifier: number): string {
  const sign = modifier >= 0 ? '+' : ''
  const adv = 'advantage' in kind && kind.advantage === true ? ' [Adv]' : 'advantage' in kind && kind.advantage === false ? ' [Dis]' : ''
  switch (kind.type) {
    case 'raw':
      return `d${kind.die}`
    case 'skill':
      return `${SKILL_DISPLAY_MAP[kind.skill]} (${SKILL_ABILITY_MAP[kind.skill].toUpperCase()} ${sign}${modifier})${adv}`
    case 'save':
      return `${kind.ability.toUpperCase()} save (${sign}${modifier})${adv}`
    case 'ability':
      return `${kind.ability.toUpperCase()} check (${sign}${modifier})${adv}`
    case 'attack':
      return `${kind.label} (${sign}${modifier})`
  }
}

export interface ModalState {
  entry: RollEntry
  phase: 'result' | 'hit' | 'damage'
  damageDice?: string
  damageBonus?: number
  damageType?: string
  isCrit: boolean
  // damage phase result — populated after the player rolls damage
  damageRolls?: number[]
  damageTotal?: number
}

interface DiceState {
  rolls: RollEntry[]
  roll: (kind: RollKind, character: Character) => RollEntry
  clear: () => void
  modal: ModalState | null
  openModal: (state: ModalState) => void
  closeModal: () => void
  setModalDamage: (rolls: number[], total: number) => void
}

export const useDiceStore = create<DiceState>()((set) => ({
  rolls: [],
  modal: null,

  roll: (kind, character) => {
    const d1 = kind.type === 'raw' ? rollDie(kind.die) : rollDie(20)
    const hasAdvantage = kind.type !== 'raw' && kind.type !== 'attack' && kind.advantage === true
    const hasDisadvantage = kind.type !== 'raw' && kind.type !== 'attack' && kind.advantage === false
    const d2 = (hasAdvantage || hasDisadvantage) ? rollDie(20) : undefined
    const natural = d2 !== undefined ? (hasAdvantage ? Math.max(d1, d2) : Math.min(d1, d2)) : d1
    const natural2 = d2 !== undefined ? (hasAdvantage ? Math.min(d1, d2) : Math.max(d1, d2)) : undefined

    let modifier = 0
    if (kind.type === 'skill') {
      const ability = SKILL_ABILITY_MAP[kind.skill]
      modifier = abilityModifier(character.abilities[ability])
      const prof = character.skillProficiencies[kind.skill]
      if (prof) {
        modifier += proficiencyBonus(character.level) * (prof === 'expertise' ? 2 : 1)
      }
    } else if (kind.type === 'save') {
      modifier = abilityModifier(character.abilities[kind.ability])
      if (character.savingThrowProficiencies.includes(kind.ability)) {
        modifier += proficiencyBonus(character.level)
      }
    } else if (kind.type === 'ability') {
      modifier = abilityModifier(character.abilities[kind.ability])
    } else if (kind.type === 'attack') {
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

  openModal: (state) => set({ modal: state }),

  closeModal: () => set({ modal: null }),

  setModalDamage: (rolls, total) =>
    set(s => s.modal ? { modal: { ...s.modal, phase: 'damage', damageRolls: rolls, damageTotal: total } } : {}),
}))
