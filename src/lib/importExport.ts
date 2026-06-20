import { getDb, replaceDb } from '../storage/db'
import { insertCharacter } from '../storage/characterRepo'
import { flush } from '../storage'
import { normalizeCharacterPayload } from '../storage/normalizeStats'
import { loadSetupData, loadFeatsData } from './data'
import { validateCharacter } from '../../shared/characterValidation'
import type { Character, NewCharacter } from '../types/character'

// v1: abilities/speed/initiative stored with racial + feat bonuses baked in
// v2: abilities are BASE scores + raceAsiChoices; bonuses derived at render
const CHAR_EXPORT_VERSION = 2

interface CharacterExportFile {
  version: number
  type: 'dnd-character'
  character: NewCharacter
}

function validateCharacterPayload(c: unknown): asserts c is NewCharacter {
  // Shared required-field gate (same contract the cloud sync uses). Throw on the
  // first structural problem so the import dialog can show why.
  const result = validateCharacter(c)
  if (!result.ok) throw new Error(`Character data is invalid: ${result.reason}.`)

  // Import-specific: a real exported character must have a non-empty name (the
  // shared validator only requires the field be a string, since an empty name is
  // valid-but-unwanted, not corruption).
  const char = c as Record<string, unknown>
  if (typeof char.name !== 'string' || !char.name.trim())
    throw new Error('Character is missing a name.')
}

function todaySlug(): string {
  return new Date().toISOString().slice(0, 10)
}

async function triggerDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      // NotAllowedError or other — fall through to anchor download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

// ── Full DB export ────────────────────────────────────────────────────────────

export async function exportDb(): Promise<void> {
  const data = getDb().export()
  const blob = new Blob([data], { type: 'application/octet-stream' })
  await triggerDownload(blob, `dnd-characters-${todaySlug()}.sqlite`)
}

// ── Full DB import ────────────────────────────────────────────────────────────

export async function importDb(file: File): Promise<void> {
  const buffer = await file.arrayBuffer()
  await replaceDb(new Uint8Array(buffer))
  // replaceDb() calls window.location.reload() — nothing executes after this
}

// ── Single character export ───────────────────────────────────────────────────

export async function exportCharacter(character: Character): Promise<void> {
  // Strip id/createdAt/updatedAt so the file is a clean NewCharacter payload
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = character
  const payload: CharacterExportFile = {
    version: CHAR_EXPORT_VERSION,
    type: 'dnd-character',
    character: rest as NewCharacter,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const slug = character.name.trim().replace(/\s+/g, '-').toLowerCase() || 'character'
  await triggerDownload(blob, `${slug}-${todaySlug()}.json`)
}

// ── Single character import ───────────────────────────────────────────────────

export async function importCharacter(file: File): Promise<Character> {
  const text = await file.text()
  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('File is not valid JSON.')
  }

  if (typeof payload !== 'object' || payload === null)
    throw new Error('File does not look like a character export.')

  const doc = payload as Record<string, unknown>

  if (doc.type !== 'dnd-character')
    throw new Error('File does not look like a character export. Expected type "dnd-character".')

  const version = doc.version
  if (typeof version !== 'number')
    throw new Error('File is missing a version field.')
  if (version > CHAR_EXPORT_VERSION)
    throw new Error(
      `This file was exported from a newer version of the app (v${version}). ` +
      `This app supports up to v${CHAR_EXPORT_VERSION}.`
    )

  validateCharacterPayload(doc.character)

  let character: NewCharacter = doc.character
  // An imported character belongs to no campaign — strip any campaignId that
  // rode along in the export so it can't claim membership it was never granted.
  character = { ...character, campaignId: null }
  if (version < 2) {
    // v1 exports have racial/feat bonuses baked into abilities/speed/initiative —
    // convert to the base-stats model before inserting
    const [setupData, featData] = await Promise.all([loadSetupData(), loadFeatsData()])
    character = {
      ...character,
      ...normalizeCharacterPayload(character, setupData, featData),
      raceAsiChoices: [],
    }
  }

  const db = getDb()
  const inserted = insertCharacter(db, character)
  await flush()
  return inserted
}
