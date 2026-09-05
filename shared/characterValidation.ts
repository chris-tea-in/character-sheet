// Shared, dependency-free character validation.
//
// Imported by BOTH sides of the sync boundary:
//   • the browser client — src/lib/importExport.ts (import gate),
//     src/store/sync.ts (adopt-over-local gate, H5);
//   • the Cloudflare Pages Functions — functions/api/characters/[id].ts
//     (server-side PUT gate, H2).
//
// It therefore MUST stay free of any browser- or node-only imports, and must be
// reachable by relative path from both tsconfigs (added to tsconfig.app.json's
// include; pulled into functions/tsconfig.json's program via its import).
//
import { validateCampaignItem } from './itemValidation'

// Keep required fields stable so older records still load. Optional structured
// fields may be absent and receive normalizeNewCharacter defaults; when present,
// validate the shapes that persistence and derivation consume without guards.

const REQUIRED_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string')

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string'

function validateAdvDisEffect(effect: Record<string, unknown>): boolean {
  return (effect.type === 'advantage' || effect.type === 'disadvantage')
    && (effect.target === 'save' || effect.target === 'skill')
    && (effect.ability === undefined || typeof effect.ability === 'string')
    && (effect.skill === undefined || typeof effect.skill === 'string')
    && (effect.condition === undefined || typeof effect.condition === 'string')
}

function validateCustomFeatEffects(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every(raw => {
    if (!isRecord(raw) || typeof raw.type !== 'string') return false
    switch (raw.type) {
      case 'asi':
        return isFiniteNumber(raw.amount)
          && ((raw.subtype === 'fixed' && typeof raw.ability === 'string')
            || (raw.subtype === 'choice' && isStringArray(raw.options)))
      case 'initiative': case 'speed':
        return isFiniteNumber(raw.amount)
      case 'save_proficiency':
        return typeof raw.ability === 'string'
      case 'skill_proficiency': case 'expertise':
        return isFiniteNumber(raw.count)
      case 'max_hp':
        return (raw.amount === undefined || isFiniteNumber(raw.amount))
          && (raw.perLevel === undefined || isFiniteNumber(raw.perLevel))
          && (raw.amount !== undefined || raw.perLevel !== undefined)
      case 'resistance': case 'immunity':
        return typeof raw.damageType === 'string'
      case 'language':
        return typeof raw.name === 'string'
      case 'weapon_proficiency':
        return isStringArray(raw.weapons)
      case 'armor_proficiency':
        return isStringArray(raw.armor)
      case 'tool_proficiency':
        return isStringArray(raw.tools)
      case 'advantage': case 'disadvantage':
        return validateAdvDisEffect(raw)
      default:
        return false
    }
  })
}

function validateCustomRaceEffects(value: unknown): boolean {
  if (value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every(raw => {
    if (!isRecord(raw) || typeof raw.type !== 'string') return false
    switch (raw.type) {
      case 'skill_proficiency': return typeof raw.skill === 'string'
      case 'weapon_proficiency': return isStringArray(raw.weapons)
      case 'tool_proficiency': return isStringArray(raw.tools)
      case 'armor_proficiency': return isStringArray(raw.armor)
      case 'resistance': case 'immunity': return typeof raw.damageType === 'string'
      case 'natural_armor':
        return isFiniteNumber(raw.base)
          && (raw.addDex === undefined || typeof raw.addDex === 'boolean')
          && (raw.maxDex === undefined || isFiniteNumber(raw.maxDex))
      case 'advantage': case 'disadvantage':
        return validateAdvDisEffect(raw) && typeof raw.label === 'string'
      default: return false
    }
  })
}

function isFiniteRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isFiniteNumber)
}

function validateAsiChoices(value: unknown): boolean {
  return Array.isArray(value) && value.every(choice => isRecord(choice)
    && isFiniteNumber(choice.count) && isFiniteNumber(choice.amount)
    && (choice.pool === 'any' || isStringArray(choice.pool)))
}

function validateRaceBase(value: unknown): boolean {
  if (!isRecord(value)) return false
  return isFiniteRecord(value.ability_score_increases)
    && validateAsiChoices(value.asi_choices)
    && isFiniteNumber(value.speed)
    && typeof value.size === 'string'
    && isStringArray(value.languages)
    && isRecord(value.senses)
    && isStringArray(value.proficiencies)
    && isRecord(value.traits)
    && Object.values(value.traits).every(trait => typeof trait === 'string')
    && validateCustomRaceEffects(value.effects)
}

function validateSubrace(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof value.name === 'string'
    && isFiniteRecord(value.ability_score_increases)
    && validateAsiChoices(value.asi_choices)
    && (value.speed === null || isFiniteNumber(value.speed))
    && (value.size === null || typeof value.size === 'string')
    && isStringArray(value.languages)
    && isRecord(value.senses)
    && isStringArray(value.proficiencies)
    && isRecord(value.traits)
    && Object.values(value.traits).every(trait => typeof trait === 'string')
    && (value.hp_bonus_per_level === undefined || isFiniteNumber(value.hp_bonus_per_level))
    && validateCustomRaceEffects(value.effects)
}

function validateCustomSpell(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.components)) return false
  const components = value.components
  return typeof value.name === 'string' && typeof value.slug === 'string'
    && isFiniteNumber(value.level) && typeof value.school === 'string'
    && typeof value.casting_time === 'string' && typeof value.range === 'string'
    && typeof components.verbal === 'boolean' && typeof components.somatic === 'boolean'
    && typeof components.material === 'boolean' && isNullableString(components.material_text)
    && typeof value.duration === 'string' && typeof value.concentration === 'boolean'
    && typeof value.ritual === 'boolean' && typeof value.description === 'string'
    && isNullableString(value.at_higher_levels) && isStringArray(value.classes)
}

function validateCustomTool(value: unknown): boolean {
  return isRecord(value) && value.category === 'tool'
    && typeof value.name === 'string' && typeof value.tool_category === 'string'
    && isNullableString(value.cost) && isNullableString(value.weight)
}

function validateLedgerOverrides(value: unknown): boolean {
  if (!isRecord(value) || !isStringArray(value.disabled) || !isFiniteRecord(value.overrides)
    || !isRecord(value.custom)) return false
  if (!Object.values(value.custom).every(rows => Array.isArray(rows) && rows.every(row =>
    isRecord(row) && typeof row.id === 'string' && typeof row.label === 'string' && isFiniteNumber(row.amount)))) return false
  if (value.customAdvDis !== undefined && (!Array.isArray(value.customAdvDis) || !value.customAdvDis.every(row =>
    isRecord(row) && typeof row.id === 'string' && typeof row.label === 'string'
      && (row.target === 'save' || row.target === 'skill') && (row.mode === 'adv' || row.mode === 'dis')
      && (row.ability === undefined || typeof row.ability === 'string')
      && (row.skill === undefined || typeof row.skill === 'string')
      && (row.condition === undefined || typeof row.condition === 'string')))) return false
  if (value.customGrants !== undefined && (!Array.isArray(value.customGrants) || !value.customGrants.every(row =>
    isRecord(row) && typeof row.id === 'string' && typeof row.label === 'string'
      && ['resistance', 'immunity', 'language', 'sense', 'skillProf', 'saveProf'].includes(String(row.target))
      && typeof row.value === 'string' && (row.amount === undefined || isFiniteNumber(row.amount))))) return false
  return true
}

function validateCustomContent(o: Record<string, unknown>): ValidationResult {
  const equipmentFields = [
    ['customWeapons', ['weapon']],
    ['customArmor', ['armor', 'shield']],
    ['customItems', ['wondrous_item']],
  ] as const
  for (const [field, categories] of equipmentFields) {
    const entries = o[field]
    if (entries === undefined) continue
    if (!Array.isArray(entries)) return { ok: false, reason: `${field} is not an array` }
    for (const entry of entries) {
      if (!isRecord(entry) || !categories.some(category => category === entry.category)
        || !validateCampaignItem(entry.category, entry).ok)
        return { ok: false, reason: `${field} has an invalid item` }
    }
  }

  if (o.customSpells !== undefined
    && (!Array.isArray(o.customSpells) || !o.customSpells.every(validateCustomSpell)))
    return { ok: false, reason: 'customSpells is malformed' }

  if (o.customTools !== undefined
    && (!Array.isArray(o.customTools) || !o.customTools.every(validateCustomTool)))
    return { ok: false, reason: 'customTools is malformed' }

  if (o.customFeats !== undefined) {
    if (!Array.isArray(o.customFeats) || !o.customFeats.every(entry =>
      isRecord(entry) && typeof entry.name === 'string' && typeof entry.slug === 'string'
        && typeof entry.description === 'string' && isStringArray(entry.prerequisites)
        && validateCustomFeatEffects(entry.effects)))
      return { ok: false, reason: 'customFeats is malformed' }
  }

  if (o.customRaces !== undefined) {
    if (!Array.isArray(o.customRaces) || !o.customRaces.every(entry => {
      if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.slug !== 'string'
        || typeof entry.description !== 'string' || !validateRaceBase(entry.base)
        || !Array.isArray(entry.subraces)) return false
      return entry.subraces.every(validateSubrace)
    })) return { ok: false, reason: 'customRaces is malformed' }
  }

  return { ok: true }
}

export type ValidationResult = { ok: true } | { ok: false; reason: string }

export function validateCharacter(c: unknown): ValidationResult {
  if (!c || typeof c !== 'object' || Array.isArray(c))
    return { ok: false, reason: 'not an object' }
  const o = c as Record<string, unknown>

  if (typeof o.name !== 'string')
    return { ok: false, reason: 'name missing or not a string' }

  if (typeof o.level !== 'number' || !Number.isFinite(o.level) || o.level < 1)
    return { ok: false, reason: 'level missing or < 1' }

  if (typeof o.maxHp !== 'number' || !Number.isFinite(o.maxHp) || o.maxHp < 0)
    return { ok: false, reason: 'maxHp missing or < 0' }

  const ab = o.abilities
  if (!ab || typeof ab !== 'object' || Array.isArray(ab))
    return { ok: false, reason: 'abilities missing or not an object' }
  const abilities = ab as Record<string, unknown>
  for (const key of REQUIRED_ABILITIES) {
    const score = abilities[key]
    if (typeof score !== 'number' || !Number.isFinite(score))
      return { ok: false, reason: `ability score "${key}" missing or not a number` }
  }

  // classes[] is the source of truth (INV-3); a bare legacy `class` string is the
  // fallback for very old records. One of the two must be present.
  if (o.classes !== undefined && !Array.isArray(o.classes))
    return { ok: false, reason: 'classes is present but not an array' }
  if (o.classes === undefined && typeof o.class !== 'string')
    return { ok: false, reason: 'no classes[] array and no legacy class string' }
  if (Array.isArray(o.classes)) {
    for (const entry of o.classes) {
      // Empty slugs represent supported quick-start/classless legacy rows.
      if (!isRecord(entry) || typeof entry.classSlug !== 'string'
        || (entry.subclassSlug !== null && typeof entry.subclassSlug !== 'string')
        || typeof entry.level !== 'number' || !Number.isInteger(entry.level) || entry.level < 1)
        return { ok: false, reason: 'a class entry is malformed' }
    }
  }

  if (!Array.isArray(o.equipment))
    return { ok: false, reason: 'equipment is not an array' }
  if (!o.equipment.every(entry => isRecord(entry) && typeof entry.name === 'string'))
    return { ok: false, reason: 'an equipment entry is malformed' }

  // spells must be an array, and every entry must carry a string slug — a gutted
  // blob commonly drops this shape.
  if (!Array.isArray(o.spells))
    return { ok: false, reason: 'spells is not an array' }
  for (const s of o.spells as unknown[]) {
    if (!s || typeof s !== 'object' || typeof (s as Record<string, unknown>).slug !== 'string')
      return { ok: false, reason: 'a spell entry is missing a string slug' }
  }

  if (o.conditions !== undefined) {
    if (!isRecord(o.conditions) || !Array.isArray(o.conditions.active)
      || !o.conditions.active.every(v => typeof v === 'string')
      || typeof o.conditions.exhaustion !== 'number' || !Number.isFinite(o.conditions.exhaustion))
      return { ok: false, reason: 'conditions are malformed' }
  }
  if (o.ledgerOverrides !== undefined) {
    if (!validateLedgerOverrides(o.ledgerOverrides))
      return { ok: false, reason: 'ledgerOverrides are malformed' }
  }
  if (o.languages !== undefined && !isStringArray(o.languages))
    return { ok: false, reason: 'languages are malformed' }
  if (o.legacyLanguages !== undefined && (!Array.isArray(o.legacyLanguages) || !o.legacyLanguages.every(v => typeof v === 'string')))
    return { ok: false, reason: 'legacyLanguages are malformed' }

  const customContent = validateCustomContent(o)
  if (!customContent.ok) return customContent

  return { ok: true }
}
