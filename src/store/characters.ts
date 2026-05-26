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
    const character = insertCharacter(getDb(), data)
    await tryFlush(set)
    set(s => ({ characters: [character, ...s.characters] }))
    return character
  },

  update: async (id, changes) => {
    const updated = updateCharacter(getDb(), id, changes)
    await tryFlush(set)
    set(s => ({ characters: s.characters.map(c => c.id === id ? updated : c) }))
  },

  remove: async (id) => {
    deleteCharacter(getDb(), id)
    await tryFlush(set)
    set(s => ({
      characters: s.characters.filter(c => c.id !== id),
      activeId: s.activeId === id ? null : s.activeId,
    }))
  },

  setActive: (id) => set({ activeId: id }),

  clearStorageError: () => set({ storageError: null }),
}))
