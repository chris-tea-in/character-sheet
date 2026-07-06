// Session-only turn queue + combat history (mirrors src/store/dice.ts: in-memory
// Zustand, never flushed to SQLite/IndexedDB — lost on refresh by design).
//
// The store holds STATE only. Committing a turn — spending slots/uses in ONE
// atomic character write — lives in the Combat tab component, which owns the
// character and onSave; the store just records what happened. The queue is
// global to the session (like dice history); the Combat tab clears it when the
// viewed character changes so a queued cost can never cross characters.
import { create } from 'zustand'
import { generateId } from '../lib/uuid'

const MAX_TURNS = 50

export type QueueSlotKey = 'action' | 'bonusAction'

export type QueuedCost =
  | { type: 'spell-slot'; level: number; label: string }        // level -1 (PACT_SLOT_KEY) = pact slot
  | { type: 'ability'; key: string; amount: number; label: string }

export interface QueuedEntry {
  kind: 'weapon' | 'spell' | 'ability' | 'generic'
  label: string
  cost?: QueuedCost
  leveledSpell?: boolean   // drives the soft two-leveled-spells RAW warning
}

export interface TurnEntry {
  id: string
  labels: string[]   // e.g. ["Longsword", "Healing Word (1st slot)"]
  costs: string[]    // e.g. ["1st-level slot", "1 ki point"]
  timestamp: number
}

interface CombatLogState {
  queue: Partial<Record<QueueSlotKey, QueuedEntry>>
  history: TurnEntry[]
  /** Fill (or clear with undefined) a queue slot — re-queueing replaces. */
  setSlot(slot: QueueSlotKey, entry: QueuedEntry | undefined): void
  clearQueue(): void
  /** Append a committed turn to the history (capped) and clear the queue. */
  recordTurn(labels: string[], costs: string[]): void
  clearHistory(): void
}

export const useCombatLogStore = create<CombatLogState>(set => ({
  queue: {},
  history: [],
  setSlot: (slot, entry) => set(s => ({ queue: { ...s.queue, [slot]: entry } })),
  clearQueue: () => set({ queue: {} }),
  recordTurn: (labels, costs) => set(s => ({
    history: [{ id: generateId(), labels, costs, timestamp: Date.now() }, ...s.history].slice(0, MAX_TURNS),
    queue: {},
  })),
  clearHistory: () => set({ history: [] }),
}))
