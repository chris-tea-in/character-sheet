// Shared, dependency-free companion stat-block validation.
//
// Imported by BOTH sides of the boundary (same contract as characterValidation.ts):
//   • the browser client — CompanionEditor pre-submit gate;
//   • the Cloudflare Pages Functions — companions POST/PUT gate.
// MUST stay free of any browser- or node-only imports.
//
// Unlike characters (which normalize at render time), a companion's `data` blob is
// stored verbatim and rendered as-is, so EVERY field is validated on write — a
// malformed blob must never persist and later crash a member's sheet.

export const COMPANION_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export const COMPANION_SKILLS = [
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival',
] as const

export type CompanionAbility = (typeof COMPANION_ABILITIES)[number]
export type CompanionSkill = (typeof COMPANION_SKILLS)[number]

export interface CompanionAttack {
  name: string
  toHit: number
  damageDice: string // strict NdM — must satisfy COMPANION_DICE_RE (DiceRollModal's parser)
  damageBonus: number
  damageType: string // may be ''
  notes: string // reach/range/recharge, free text
  extraDamage?: { dice: string; damageType: string }[]
}

export interface CompanionTrait {
  name: string
  description: string
}

export interface CompanionData {
  name: string
  kindLine: string // e.g. "Medium beast, unaligned"
  abilities: Record<CompanionAbility, number>
  ac: number
  acNote?: string
  maxHp: number
  currentHp: number
  tempHp: number
  speed: string
  senses: string
  languages: string
  traits: CompanionTrait[]
  attacks: CompanionAttack[]
  saveOverrides?: Partial<Record<CompanionAbility, number>> // absent key ⇒ ability modifier
  skillOverrides?: Partial<Record<CompanionSkill, number>>
  resistances: string
  immunities: string
  conditionImmunities: string
  vulnerabilities: string
  playerNotes: string
}

export const MAX_COMPANION_BYTES = 16_000
export const MAX_COMPANION_NAME = 120
export const MAX_COMPANION_ATTACKS = 20
export const MAX_COMPANION_TRAITS = 20
export const MAX_COMPANION_RIDERS = 5
export const COMPANION_DICE_RE = /^\d+d\d+$/

export type CompanionValidation = { ok: true } | { ok: false; reason: string }

const MAX_TEXT = 2_000 // per free-text field; the byte cap bounds the whole blob

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

function isText(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= max
}

function validateAttack(a: unknown, i: number): CompanionValidation {
  if (!a || typeof a !== 'object' || Array.isArray(a))
    return { ok: false, reason: `attack ${i + 1} is not an object` }
  const o = a as Record<string, unknown>
  if (!isText(o.name, MAX_COMPANION_NAME) || o.name.trim() === '')
    return { ok: false, reason: `attack ${i + 1} needs a name (≤${MAX_COMPANION_NAME} chars)` }
  if (!isInt(o.toHit, -20, 30))
    return { ok: false, reason: `attack "${o.name}": to-hit must be an integer between -20 and +30` }
  if (typeof o.damageDice !== 'string' || !COMPANION_DICE_RE.test(o.damageDice))
    return { ok: false, reason: `attack "${o.name}": damage dice must look like 2d6` }
  if (!isInt(o.damageBonus, -20, 99))
    return { ok: false, reason: `attack "${o.name}": damage bonus must be an integer between -20 and +99` }
  if (!isText(o.damageType, 40))
    return { ok: false, reason: `attack "${o.name}": damage type too long` }
  if (!isText(o.notes, 200))
    return { ok: false, reason: `attack "${o.name}": notes too long (≤200 chars)` }
  if (o.extraDamage !== undefined) {
    if (!Array.isArray(o.extraDamage) || o.extraDamage.length > MAX_COMPANION_RIDERS)
      return { ok: false, reason: `attack "${o.name}": at most ${MAX_COMPANION_RIDERS} extra-damage riders` }
    for (const r of o.extraDamage as unknown[]) {
      const rd = r as Record<string, unknown> | null
      if (!rd || typeof rd !== 'object' || typeof rd.dice !== 'string'
        || !COMPANION_DICE_RE.test(rd.dice) || !isText(rd.damageType, 40))
        return { ok: false, reason: `attack "${o.name}": a rider needs dice like 1d6 and a damage type` }
    }
  }
  return { ok: true }
}

function validateOverrides(
  v: unknown, allowed: readonly string[], label: string,
): CompanionValidation {
  if (v === undefined) return { ok: true }
  if (!v || typeof v !== 'object' || Array.isArray(v))
    return { ok: false, reason: `${label} must be an object` }
  for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
    if (!allowed.includes(key)) return { ok: false, reason: `${label}: unknown key "${key}"` }
    if (!isInt(val, -20, 30))
      return { ok: false, reason: `${label}: "${key}" must be an integer between -20 and +30` }
  }
  return { ok: true }
}

export function validateCompanionData(c: unknown): CompanionValidation {
  if (!c || typeof c !== 'object' || Array.isArray(c))
    return { ok: false, reason: 'not an object' }
  const o = c as Record<string, unknown>

  if (!isText(o.name, MAX_COMPANION_NAME) || o.name.trim() === '')
    return { ok: false, reason: `name is required (≤${MAX_COMPANION_NAME} chars)` }
  if (!isText(o.kindLine, MAX_COMPANION_NAME))
    return { ok: false, reason: 'kind line missing or too long' }

  const ab = o.abilities
  if (!ab || typeof ab !== 'object' || Array.isArray(ab))
    return { ok: false, reason: 'abilities missing' }
  for (const key of COMPANION_ABILITIES) {
    if (!isInt((ab as Record<string, unknown>)[key], 1, 40))
      return { ok: false, reason: `ability "${key}" must be an integer between 1 and 40` }
  }

  if (!isInt(o.ac, 0, 40)) return { ok: false, reason: 'AC must be an integer between 0 and 40' }
  if (o.acNote !== undefined && !isText(o.acNote, 80))
    return { ok: false, reason: 'AC note too long (≤80 chars)' }
  for (const hp of ['maxHp', 'currentHp', 'tempHp'] as const) {
    if (!isInt(o[hp], 0, 999)) return { ok: false, reason: `${hp} must be an integer between 0 and 999` }
  }

  for (const field of ['speed', 'senses', 'languages', 'resistances', 'immunities',
    'conditionImmunities', 'vulnerabilities', 'playerNotes'] as const) {
    if (!isText(o[field], MAX_TEXT))
      return { ok: false, reason: `${field} missing or too long (≤${MAX_TEXT} chars)` }
  }

  if (!Array.isArray(o.traits) || o.traits.length > MAX_COMPANION_TRAITS)
    return { ok: false, reason: `traits must be an array of at most ${MAX_COMPANION_TRAITS}` }
  for (const [i, t] of (o.traits as unknown[]).entries()) {
    const td = t as Record<string, unknown> | null
    if (!td || typeof td !== 'object' || !isText(td.name, MAX_COMPANION_NAME)
      || td.name.trim() === '' || !isText(td.description, MAX_TEXT))
      return { ok: false, reason: `trait ${i + 1} needs a name and a description (≤${MAX_TEXT} chars)` }
  }

  if (!Array.isArray(o.attacks) || o.attacks.length > MAX_COMPANION_ATTACKS)
    return { ok: false, reason: `attacks must be an array of at most ${MAX_COMPANION_ATTACKS}` }
  for (const [i, a] of (o.attacks as unknown[]).entries()) {
    const res = validateAttack(a, i)
    if (!res.ok) return res
  }

  const saves = validateOverrides(o.saveOverrides, COMPANION_ABILITIES, 'save overrides')
  if (!saves.ok) return saves
  const skills = validateOverrides(o.skillOverrides, COMPANION_SKILLS, 'skill overrides')
  if (!skills.ok) return skills

  return { ok: true }
}

export function defaultCompanion(name = ''): CompanionData {
  return {
    name,
    kindLine: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    ac: 10,
    maxHp: 1,
    currentHp: 1,
    tempHp: 0,
    speed: '30 ft.',
    senses: '',
    languages: '',
    traits: [],
    attacks: [],
    resistances: '',
    immunities: '',
    conditionImmunities: '',
    vulnerabilities: '',
    playerNotes: '',
  }
}
