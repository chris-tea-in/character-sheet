import { create } from 'zustand'
import { getDb, flush } from '../storage'
import {
  listCharacters,
  insertCharacter,
  updateCharacter,
  deleteCharacter,
} from '../storage/characterRepo'
import type { Character, NewCharacter } from '../types/character'

interface CharacterState {
  characters: Character[]
  activeId: string | null
  storageError: string | null
  load: () => void
  create: (data: NewCharacter) => Promise<Character>
  update: (id: string, changes: Partial<NewCharacter>) => Promise<void>
  remove: (id: string) => Promise<void>
  setActive: (id: string | null) => void
  clearStorageError: () => void
}

async function tryFlush(set: (s: Partial<CharacterState>) => void) {
  try {
    await flush()
  } catch {
    set({ storageError: 'Changes saved in memory but could not be written to disk — export your data now to avoid loss.' })
  }
}

export const useCharacterStore = create<CharacterState>()((set) => ({
  characters: [],
  activeId: null,
  storageError: null,

  load: () => {
    const characters = listCharacters(getDb())
    set({ characters })
  },

  create: async (data) => {
    // SQL write can throw (ROLLBACK rethrows) — surface it and rethrow so the
    // caller doesn't navigate to a character that was never inserted (BUG-40)
    let character: Character
    try {
      character = insertCharacter(getDb(), data)
    } catch (err) {
      set({ storageError: 'Character could not be created — the change was not saved. Please try again.' })
      throw err
    }
    await tryFlush(set)
    set(s => ({ characters: [character, ...s.characters] }))
    return character
  },

  update: async (id, changes) => {
    // Sheet edits are fire-and-forget; a thrown SQL write would otherwise be a
    // silent unhandled rejection with no state change and no banner (BUG-40)
    let updated: Character
    try {
      updated = updateCharacter(getDb(), id, changes)
    } catch {
      set({ storageError: 'Change could not be saved — your edit was not applied. Export your data if this keeps happening.' })
      return
    }
    await tryFlush(set)
    set(s => ({ characters: s.characters.map(c => c.id === id ? updated : c) }))
  },

  remove: async (id) => {
    try {
      deleteCharacter(getDb(), id)
    } catch {
      set({ storageError: 'Character could not be deleted — please try again.' })
      return
    }
    await tryFlush(set)
    set(s => ({
      characters: s.characters.filter(c => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }))
  },

  setActive: (id) => set({ activeId: id }),

  clearStorageError: () => set({ storageError: null }),
}))
