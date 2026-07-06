import { readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs'
import { join, basename } from 'path'

// Copy sql.js WASM so it's available at /sql-wasm.wasm at runtime
const wasmSrc = 'node_modules/sql.js/dist/sql-wasm.wasm'
const wasmDst = 'public/sql-wasm.wasm'
if (existsSync(wasmSrc)) {
  if (!existsSync('public')) mkdirSync('public')
  copyFileSync(wasmSrc, wasmDst)
}

const errors = []
const warnings = []

function requireFields(entry, fields, label) {
  for (const f of fields) {
    if (entry[f] === undefined || entry[f] === null) {
      errors.push(`${label}: missing required field "${f}"`)
    }
  }
}

// ── ItemEffect validation (mirrors the ItemEffect union in src/types/data.ts) ──
const EFFECT_ABILITIES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha'])
const EFFECT_SKILLS = new Set([
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival',
])
const isNum = v => typeof v === 'number' && !Number.isNaN(v)

function validateEffects(item, label) {
  if (item.effects === undefined) return
  if (!Array.isArray(item.effects)) {
    errors.push(`${label}: "effects" must be an array`)
    return
  }
  item.effects.forEach((e, i) => {
    const at = `${label}: effects[${i}]`
    switch (e?.type) {
      case 'speed': case 'initiative': case 'damage': case 'attack': case 'spell_attack': case 'spell_save_dc': case 'spell_damage':
        if (!isNum(e.amount)) errors.push(`${at} (${e.type}): "amount" must be a number`)
        break
      case 'speed_set':
        if (!isNum(e.value)) errors.push(`${at} (speed_set): "value" must be a number`)
        break
      case 'speed_multiplier':
        if (!isNum(e.factor)) errors.push(`${at} (speed_multiplier): "factor" must be a number`)
        break
      case 'ac':
        if (!isNum(e.amount)) errors.push(`${at} (ac): "amount" must be a number`)
        if (e.condition !== undefined && e.condition !== 'unarmored') errors.push(`${at} (ac): invalid condition "${e.condition}"`)
        break
      case 'ac_floor':
        if (!isNum(e.value)) errors.push(`${at} (ac_floor): "value" must be a number`)
        break
      case 'unarmored_ac':
        if (!isNum(e.base)) errors.push(`${at} (unarmored_ac): "base" must be a number`)
        break
      case 'max_hp':
        if (e.amount === undefined && e.perLevel === undefined) errors.push(`${at} (max_hp): needs "amount" or "perLevel"`)
        if (e.amount !== undefined && !isNum(e.amount)) errors.push(`${at} (max_hp): "amount" must be a number`)
        if (e.perLevel !== undefined && !isNum(e.perLevel)) errors.push(`${at} (max_hp): "perLevel" must be a number`)
        break
      case 'resistance': case 'immunity':
        if (typeof e.damageType !== 'string' || e.damageType.trim() === '') errors.push(`${at} (${e.type}): "damageType" must be a non-empty string`)
        break
      case 'damage_dice':
        if (typeof e.dice !== 'string' || !/^\d+d\d+$/.test(e.dice)) errors.push(`${at} (damage_dice): "dice" must match NdM (e.g. "2d6")`)
        if (typeof e.damageType !== 'string' || e.damageType.trim() === '') errors.push(`${at} (damage_dice): "damageType" must be a non-empty string`)
        break
      case 'save':
        if (e.ability !== 'all' && !EFFECT_ABILITIES.has(e.ability))
          errors.push(`${at} (save): invalid ability "${e.ability}"`)
        if (!isNum(e.amount)) errors.push(`${at} (save): "amount" must be a number`)
        break
      case 'ability_bonus':
        if (!EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (ability_bonus): invalid ability "${e.ability}"`)
        if (!isNum(e.amount)) errors.push(`${at} (ability_bonus): "amount" must be a number`)
        if (e.cap !== undefined && !isNum(e.cap)) errors.push(`${at} (ability_bonus): "cap" must be a number`)
        break
      case 'ability_set':
        if (!EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (ability_set): invalid ability "${e.ability}"`)
        if (!isNum(e.value)) errors.push(`${at} (ability_set): "value" must be a number`)
        if (e.cap !== undefined && !isNum(e.cap)) errors.push(`${at} (ability_set): "cap" must be a number`)
        break
      case 'skill':
        if (!EFFECT_SKILLS.has(e.skill)) errors.push(`${at} (skill): invalid skill "${e.skill}"`)
        if (!isNum(e.amount)) errors.push(`${at} (skill): "amount" must be a number`)
        break
      case 'language':
        if (typeof e.name !== 'string' || e.name.trim() === '') errors.push(`${at} (language): "name" must be a non-empty string`)
        break
      case 'advantage': case 'disadvantage':
        if (e.target !== 'save' && e.target !== 'skill') errors.push(`${at} (${e.type}): "target" must be "save" or "skill"`)
        if (e.target === 'save' && e.ability !== 'all' && !EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (${e.type}): invalid save ability "${e.ability}"`)
        if (e.target === 'skill' && !EFFECT_SKILLS.has(e.skill)) errors.push(`${at} (${e.type}): invalid skill "${e.skill}"`)
        if (e.condition !== undefined && (typeof e.condition !== 'string' || e.condition.trim() === '')) errors.push(`${at} (${e.type}): "condition" must be a non-empty string when present`)
        break
      case 'unarmed':
        if (e.dice !== undefined && typeof e.dice !== 'string') errors.push(`${at} (unarmed): "dice" must be a string`)
        if (e.damageType !== undefined && typeof e.damageType !== 'string') errors.push(`${at} (unarmed): "damageType" must be a string`)
        if (e.attackBonus !== undefined && !isNum(e.attackBonus)) errors.push(`${at} (unarmed): "attackBonus" must be a number`)
        if (e.damageBonus !== undefined && !isNum(e.damageBonus)) errors.push(`${at} (unarmed): "damageBonus" must be a number`)
        break
      default:
        errors.push(`${at}: unknown effect type "${e?.type}"`)
    }
  })
}

// ── RaceEffect validation (mirrors RaceEffect union in src/types/data.ts) ──
const RACE_ARMOR_CLASSES = new Set(['light', 'medium', 'heavy', 'shield'])

function validateRaceEffects(effects, label) {
  if (effects === undefined) return
  if (!Array.isArray(effects)) {
    errors.push(`${label}: "effects" must be an array`)
    return
  }
  const isStrArr = a => Array.isArray(a) && a.length > 0 && a.every(s => typeof s === 'string' && s.trim() !== '')
  effects.forEach((e, i) => {
    const at = `${label}: effects[${i}]`
    switch (e?.type) {
      case 'skill_proficiency':
        if (!EFFECT_SKILLS.has(e.skill)) errors.push(`${at} (skill_proficiency): invalid skill "${e.skill}"`)
        break
      case 'weapon_proficiency':
        if (!isStrArr(e.weapons)) errors.push(`${at} (weapon_proficiency): "weapons" must be a non-empty string array`)
        break
      case 'tool_proficiency':
        if (!isStrArr(e.tools)) errors.push(`${at} (tool_proficiency): "tools" must be a non-empty string array`)
        break
      case 'armor_proficiency':
        if (!isStrArr(e.armor) || !e.armor.every(a => RACE_ARMOR_CLASSES.has(a)))
          errors.push(`${at} (armor_proficiency): "armor" must be a non-empty array of light|medium|heavy|shield`)
        break
      case 'resistance': case 'immunity':
        if (typeof e.damageType !== 'string' || e.damageType.trim() === '') errors.push(`${at} (${e.type}): "damageType" must be a non-empty string`)
        break
      case 'natural_armor':
        if (!isNum(e.base)) errors.push(`${at} (natural_armor): "base" must be a number`)
        if (e.addDex !== undefined && typeof e.addDex !== 'boolean') errors.push(`${at} (natural_armor): "addDex" must be a boolean`)
        if (e.maxDex !== undefined && !isNum(e.maxDex)) errors.push(`${at} (natural_armor): "maxDex" must be a number`)
        break
      case 'advantage': case 'disadvantage':
        if (e.target !== 'save' && e.target !== 'skill') errors.push(`${at} (${e.type}): "target" must be "save" or "skill"`)
        if (e.target === 'save' && e.ability !== 'all' && !EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (${e.type}): invalid save ability "${e.ability}"`)
        if (e.target === 'skill' && !EFFECT_SKILLS.has(e.skill)) errors.push(`${at} (${e.type}): invalid skill "${e.skill}"`)
        if (typeof e.label !== 'string' || e.label.trim() === '') errors.push(`${at} (${e.type}): "label" (the trait name) is required`)
        if (e.condition !== undefined && (typeof e.condition !== 'string' || e.condition.trim() === '')) errors.push(`${at} (${e.type}): "condition" must be a non-empty string when present`)
        break
      default:
        errors.push(`${at}: unknown race effect type "${e?.type}"`)
    }
  })
}

// ── FeatEffect validation (mirrors FeatEffect union in src/types/data.ts) ──
// Feat effects were previously entirely unvalidated — this closes that hole.
function validateFeatEffects(effects, label) {
  if (effects === undefined) return
  if (!Array.isArray(effects)) {
    errors.push(`${label}: "effects" must be an array`)
    return
  }
  const isStrArr = a => Array.isArray(a) && a.length > 0 && a.every(s => typeof s === 'string' && s.trim() !== '')
  effects.forEach((e, i) => {
    const at = `${label}: effects[${i}]`
    switch (e?.type) {
      case 'asi':
        if (e.subtype === 'fixed') {
          if (typeof e.ability !== 'string' || e.ability.trim() === '') errors.push(`${at} (asi fixed): "ability" must be a string`)
          if (!isNum(e.amount)) errors.push(`${at} (asi fixed): "amount" must be a number`)
        } else if (e.subtype === 'choice') {
          if (!isStrArr(e.options)) errors.push(`${at} (asi choice): "options" must be a non-empty string array`)
          if (!isNum(e.amount)) errors.push(`${at} (asi choice): "amount" must be a number`)
        } else {
          errors.push(`${at} (asi): "subtype" must be "fixed" or "choice"`)
        }
        break
      case 'initiative': case 'speed':
        if (!isNum(e.amount)) errors.push(`${at} (${e.type}): "amount" must be a number`)
        break
      case 'save_proficiency':
        if (typeof e.ability !== 'string' || e.ability.trim() === '') errors.push(`${at} (save_proficiency): "ability" must be a string`)
        break
      case 'skill_proficiency': case 'expertise':
        if (!isNum(e.count)) errors.push(`${at} (${e.type}): "count" must be a number`)
        break
      case 'max_hp':
        if (e.amount !== undefined && !isNum(e.amount)) errors.push(`${at} (max_hp): "amount" must be a number`)
        if (e.perLevel !== undefined && !isNum(e.perLevel)) errors.push(`${at} (max_hp): "perLevel" must be a number`)
        break
      case 'resistance': case 'immunity':
        if (typeof e.damageType !== 'string' || e.damageType.trim() === '') errors.push(`${at} (${e.type}): "damageType" must be a non-empty string`)
        break
      case 'language':
        if (typeof e.name !== 'string' || e.name.trim() === '') errors.push(`${at} (language): "name" must be a non-empty string`)
        break
      case 'weapon_proficiency':
        if (!isStrArr(e.weapons)) errors.push(`${at} (weapon_proficiency): "weapons" must be a non-empty string array`)
        break
      case 'armor_proficiency':
        if (!isStrArr(e.armor)) errors.push(`${at} (armor_proficiency): "armor" must be a non-empty string array`)
        break
      case 'tool_proficiency':
        if (!isStrArr(e.tools)) errors.push(`${at} (tool_proficiency): "tools" must be a non-empty string array`)
        break
      case 'advantage': case 'disadvantage':
        if (e.target !== 'save' && e.target !== 'skill') errors.push(`${at} (${e.type}): "target" must be "save" or "skill"`)
        if (e.target === 'save' && e.ability !== 'all' && !EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (${e.type}): invalid save ability "${e.ability}"`)
        if (e.target === 'skill' && !EFFECT_SKILLS.has(e.skill)) errors.push(`${at} (${e.type}): invalid skill "${e.skill}"`)
        if (e.condition !== undefined && (typeof e.condition !== 'string' || e.condition.trim() === '')) errors.push(`${at} (${e.type}): "condition" must be a non-empty string when present`)
        break
      default:
        errors.push(`${at}: unknown feat effect type "${e?.type}"`)
    }
  })
}

// ── Item charges validation (mirrors ItemCharges in src/types/data.ts) ──
const CHARGE_RECHARGES = new Set(['dawn', 'dusk', 'long_rest', 'short_rest'])

function validateCharges(item, label) {
  if (item.charges === undefined) return
  const c = item.charges
  if (typeof c !== 'object' || c === null) {
    errors.push(`${label}: "charges" must be an object`)
    return
  }
  if (!Number.isInteger(c.max) || c.max <= 0) errors.push(`${label} (charges): "max" must be a positive integer`)
  if (c.recharge !== undefined && !CHARGE_RECHARGES.has(c.recharge)) errors.push(`${label} (charges): invalid recharge "${c.recharge}"`)
  if (c.regain !== undefined && typeof c.regain !== 'string') errors.push(`${label} (charges): "regain" must be a string`)
}

// ── FeatureEffect validation (mirrors FeatureEffect union in src/types/data.ts) ──
function validateFeatureEffects(effects, label) {
  if (effects === undefined) return
  if (!Array.isArray(effects)) {
    errors.push(`${label}: "effects" must be an array`)
    return
  }
  effects.forEach((e, i) => {
    const at = `${label}: effects[${i}]`
    switch (e?.type) {
      case 'ac':
        if (!isNum(e.amount)) errors.push(`${at} (ac): "amount" must be a number`)
        if (e.condition !== undefined && e.condition !== 'armored' && e.condition !== 'unarmored')
          errors.push(`${at} (ac): invalid condition "${e.condition}"`)
        break
      case 'ac_floor':
        if (!isNum(e.value)) errors.push(`${at} (ac_floor): "value" must be a number`)
        break
      case 'weapon_attack':
        if (e.weaponClass !== 'ranged' && e.weaponClass !== 'melee')
          errors.push(`${at} (weapon_attack): invalid weaponClass "${e.weaponClass}"`)
        if (!isNum(e.amount)) errors.push(`${at} (weapon_attack): "amount" must be a number`)
        break
      case 'weapon_damage':
        if (e.weaponClass !== 'ranged' && e.weaponClass !== 'melee')
          errors.push(`${at} (weapon_damage): invalid weaponClass "${e.weaponClass}"`)
        if (e.handed !== undefined && e.handed !== 'one-handed' && e.handed !== 'two-handed')
          errors.push(`${at} (weapon_damage): invalid handed "${e.handed}"`)
        if (!isNum(e.amount)) errors.push(`${at} (weapon_damage): "amount" must be a number`)
        break
      case 'save_proficiency':
        if (e.ability !== 'all' && !EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (save_proficiency): invalid ability "${e.ability}"`)
        break
      case 'save_bonus':
        if (e.ability !== 'all' && !EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (save_bonus): invalid ability "${e.ability}"`)
        if (!isNum(e.amount)) errors.push(`${at} (save_bonus): "amount" must be a number`)
        break
      case 'derived_save':
        if (e.ability !== 'all' && !EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (derived_save): invalid ability "${e.ability}"`)
        if (!EFFECT_ABILITIES.has(e.from)) errors.push(`${at} (derived_save): invalid "from" ability "${e.from}"`)
        if (e.min !== undefined && !isNum(e.min)) errors.push(`${at} (derived_save): "min" must be a number`)
        if (e.whileNot !== undefined && e.whileNot !== 'heavy-armor' && e.whileNot !== 'incapacitated') errors.push(`${at} (derived_save): "whileNot" must be "heavy-armor" or "incapacitated"`)
        break
      case 'resistance': case 'immunity':
        if (typeof e.damageType !== 'string' || e.damageType.trim() === '') errors.push(`${at} (${e.type}): "damageType" must be a non-empty string`)
        break
      case 'speed':
        if (!isNum(e.amount)) errors.push(`${at} (speed): "amount" must be a number`)
        if (e.whileNot !== undefined && e.whileNot !== 'heavy-armor' && e.whileNot !== 'incapacitated') errors.push(`${at} (speed): "whileNot" must be "heavy-armor" or "incapacitated"`)
        break
      case 'speed_set':
        if (!isNum(e.value)) errors.push(`${at} (speed_set): "value" must be a number`)
        break
      case 'speed_multiplier':
        if (!isNum(e.factor)) errors.push(`${at} (speed_multiplier): "factor" must be a number`)
        break
      case 'max_hp':
        if (e.amount === undefined && e.perLevel === undefined) errors.push(`${at} (max_hp): needs "amount" or "perLevel"`)
        if (e.amount !== undefined && !isNum(e.amount)) errors.push(`${at} (max_hp): "amount" must be a number`)
        if (e.perLevel !== undefined && !isNum(e.perLevel)) errors.push(`${at} (max_hp): "perLevel" must be a number`)
        break
      case 'skill_proficiency':
        if (!EFFECT_SKILLS.has(e.skill)) errors.push(`${at} (skill_proficiency): invalid skill "${e.skill}"`)
        break
      case 'weapon_proficiency':
        if (!Array.isArray(e.weapons) || !e.weapons.length) errors.push(`${at} (weapon_proficiency): "weapons" must be a non-empty array`)
        break
      case 'tool_proficiency':
        if (!Array.isArray(e.tools) || !e.tools.length) errors.push(`${at} (tool_proficiency): "tools" must be a non-empty array`)
        break
      case 'armor_proficiency':
        if (!Array.isArray(e.armor) || !e.armor.every(a => RACE_ARMOR_CLASSES.has(a))) errors.push(`${at} (armor_proficiency): "armor" must be light|medium|heavy|shield values`)
        break
      case 'advantage': case 'disadvantage':
        if (e.target !== 'save' && e.target !== 'skill') errors.push(`${at} (${e.type}): "target" must be "save" or "skill"`)
        if (e.target === 'save' && e.ability !== 'all' && !EFFECT_ABILITIES.has(e.ability)) errors.push(`${at} (${e.type}): invalid save ability "${e.ability}"`)
        if (e.target === 'skill' && !EFFECT_SKILLS.has(e.skill)) errors.push(`${at} (${e.type}): invalid skill "${e.skill}"`)
        if (e.condition !== undefined && (typeof e.condition !== 'string' || e.condition.trim() === '')) errors.push(`${at} (${e.type}): "condition" must be a non-empty string when present`)
        break
      case 'half_proficiency_checks':
        if (e.roundUp !== undefined && typeof e.roundUp !== 'boolean') errors.push(`${at} (half_proficiency_checks): "roundUp" must be a boolean`)
        if (e.abilities !== undefined && (!Array.isArray(e.abilities) || e.abilities.length === 0 || !e.abilities.every(a => EFFECT_ABILITIES.has(a))))
          errors.push(`${at} (half_proficiency_checks): "abilities" must be a non-empty array of ability keys`)
        if (e.level !== undefined && !isNum(e.level)) errors.push(`${at} (half_proficiency_checks): "level" must be a number`)
        break
      default:
        errors.push(`${at}: unknown feature effect type "${e?.type}"`)
    }
  })
}

function validateFeatureOption(o, label) {
  if (!o || typeof o !== 'object') {
    errors.push(`${label}: option must be an object`)
    return
  }
  for (const f of ['slug', 'name', 'description']) {
    if (typeof o[f] !== 'string' || o[f].trim() === '')
      errors.push(`${label}: "${f}" must be a non-empty string`)
  }
  if (o.prerequisites !== undefined && !Array.isArray(o.prerequisites))
    errors.push(`${label}: "prerequisites" must be an array`)
  validateFeatureEffects(o.effects, label)
}

function validateFeatureResource(r, label) {
  if (typeof r.name !== 'string' || r.name.trim() === '')
    errors.push(`${label} (resource): "name" must be a non-empty string`)
  if (r.die !== undefined && (typeof r.die !== 'string' || !/^d\d+$/.test(r.die)))
    errors.push(`${label} (resource): "die" must match dN (e.g. "d8")`)
  if (!Array.isArray(r.by) || r.by.length === 0)
    errors.push(`${label} (resource): "by" must be a non-empty array`)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    errors.push(`${path}: invalid JSON — ${e.message}`)
    return null
  }
}

function buildKeyed(category, requiredFields, extraValidate) {
  const out = {}
  for (const file of readdirSync(`data/${category}`).sort()) {
    if (!file.endsWith('.json')) continue
    const slug = basename(file, '.json')
    const label = `${category}/${file}`
    const entry = readJson(join('data', category, file))
    if (!entry) continue
    requireFields(entry, requiredFields, label)
    if (extraValidate) extraValidate(entry, slug, label)
    if (entry._review?.length) warnings.push(`${label}: has ${entry._review.length} _review note(s)`)
    out[slug] = entry
  }
  return out
}

const races = buildKeyed('races', ['name', 'slug', 'description', 'base', 'subraces'],
  (entry, slug, label) => {
    if (entry.slug && entry.slug !== slug)
      warnings.push(`${label}: slug "${entry.slug}" doesn't match filename "${slug}"`)
    if (entry.base) validateRaceEffects(entry.base.effects, `${label} base`)
    for (const sr of (entry.subraces ?? []))
      validateRaceEffects(sr.effects, `${label} subrace "${sr.name}"`)
  }
)

const spells = buildKeyed('spells', ['name', 'slug', 'level', 'school', 'casting_time', 'range', 'components', 'duration', 'concentration', 'ritual', 'description', 'classes'],
  (entry, _slug, label) => {
    if (entry.level !== undefined && (entry.level < 0 || entry.level > 9))
      errors.push(`${label}: level ${entry.level} out of range 0-9`)
    if (Array.isArray(entry.classes) && entry.classes.length === 0 && !entry._explicitlyNoClass)
      warnings.push(`${label}: no classes listed`)
  }
)

const classes = buildKeyed('classes', ['name', 'slug', 'description', 'hit_die', 'saving_throw_proficiencies', 'levels', 'features'],
  (entry, _slug, label) => {
    if (entry.levels) {
      const count = Object.keys(entry.levels).length
      if (count !== 20) warnings.push(`${label}: has ${count} levels, expected 20`)
    }
  }
)

const subclasses = (() => {
  const out = {}
  for (const file of readdirSync('data/subclasses').sort()) {
    if (!file.endsWith('.json')) continue
    const label = `subclasses/${file}`
    const entry = readJson(join('data', 'subclasses', file))
    if (!entry) continue
    requireFields(entry, ['name', 'classSlug', 'subclassSlug', 'key', 'choiceLevel', 'description', 'features'], label)
    if (entry.classSlug && entry.subclassSlug) {
      const expected = `${entry.classSlug}:${entry.subclassSlug}`
      if (entry.key && entry.key !== expected)
        errors.push(`${label}: key "${entry.key}" doesn't match expected "${expected}"`)
    }
    if (entry.features) {
      const count = Object.keys(entry.features).length
      if (count < 2) warnings.push(`${label}: only ${count} level(s) with features`)
    }
    if (entry._review?.length) warnings.push(`${label}: has ${entry._review.length} _review note(s)`)
    out[entry.key ?? basename(file, '.json')] = entry
  }
  return out
})()

const feats = buildKeyed('feats', ['name', 'slug', 'description'],
  (entry, _slug, label) => validateFeatEffects(entry.effects, label))

const backgrounds = buildKeyed('backgrounds',
  ['name', 'slug', 'description', 'skill_proficiencies', 'feature', 'starting_equipment', 'personality_traits', 'ideals', 'bonds', 'flaws']
)

// damage_dice/damage_type are nullable for special weapons (Net) and ammunition entries
const EQUIPMENT_CATEGORIES = [
  { type: 'weapons',          required: ['name', 'weapon_type'] },
  { type: 'armor',            required: ['name', 'armor_type', 'ac_formula'] },
  { type: 'adventuring_gear', required: ['name', 'subcategory'] },
  { type: 'trinkets',         required: ['name', 'source'] },
  { type: 'firearms',         required: ['name', 'era', 'weapon_type'] },
  { type: 'explosives',       required: ['name', 'era'] },
  { type: 'wondrous_items',   required: ['name', 'rarity'] },
  { type: 'currency',         required: ['name', 'abbreviation', 'value_in_cp'] },
  { type: 'poisons',          required: ['name', 'poison_type', 'cost'] },
  { type: 'tools',            required: ['name', 'tool_category'] },
  { type: 'siege_equipment',  required: ['name'] },
]

const equipment = (() => {
  const out = {}
  for (const { type, required } of EQUIPMENT_CATEGORIES) {
    const path = `data/equipment/${type}.json`
    if (!existsSync(path)) {
      warnings.push(`equipment/${type}.json: file not found — skipping`)
      continue
    }
    const entries = readJson(path)
    if (!entries) continue
    if (!Array.isArray(entries)) {
      errors.push(`${path}: expected top-level array`)
      continue
    }
    for (const [i, item] of entries.entries()) {
      const label = `equipment/${type}.json[${i}] (${item.name ?? '?'})`
      for (const f of required) {
        if (item[f] === undefined || item[f] === null)
          errors.push(`${label}: missing required field "${f}"`)
      }
      if (type === 'weapons' || type === 'armor' || type === 'wondrous_items') {
        validateEffects(item, label)
        validateCharges(item, label)
      }
      if (item._review?.length) warnings.push(`${label}: has ${item._review.length} _review note(s)`)
    }
    out[type] = entries
  }
  return out
})()

// Warn on equipment files outside the allowlist so staging files can't silently strand
const allowedEquipment = new Set(EQUIPMENT_CATEGORIES.map(c => `${c.type}.json`))
for (const f of readdirSync('data/equipment')) {
  if (f.endsWith('.json') && !allowedEquipment.has(f))
    warnings.push(`equipment/${f}: not in EQUIPMENT_CATEGORIES — ignored`)
}

// ── Selectable class features (maneuvers, fighting styles, invocations, …) ─────
// Each non-pools file is a top-level array of feature-choice groups; pools.json is
// an object of shared option pools that groups reference via "optionsRef". Output
// is keyed by group key → group (with optionsRef resolved to inline options).
const classFeatures = (() => {
  const out = {}
  const dir = 'data/class-features'
  if (!existsSync(dir)) return out
  const POOLS_FILE = 'pools.json'

  let pools = {}
  if (existsSync(join(dir, POOLS_FILE))) {
    const raw = readJson(join(dir, POOLS_FILE))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      pools = raw
      for (const [poolName, opts] of Object.entries(pools)) {
        const label = `class-features/${POOLS_FILE} (${poolName})`
        if (!Array.isArray(opts)) { errors.push(`${label}: pool must be an array`); continue }
        opts.forEach((o, i) => validateFeatureOption(o, `${label}[${i}]`))
      }
    } else {
      errors.push(`class-features/${POOLS_FILE}: expected a top-level object of pools`)
    }
  }

  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json') || file === POOLS_FILE) continue
    const label = `class-features/${file}`
    const groups = readJson(join(dir, file))
    if (!groups) continue
    if (!Array.isArray(groups)) { errors.push(`${label}: expected a top-level array of groups`); continue }
    for (const [i, g] of groups.entries()) {
      const glabel = `${label}[${i}] (${g.key ?? '?'})`
      requireFields(g, ['key', 'label', 'source', 'known'], glabel)
      if (g.source && typeof g.source.classSlug !== 'string')
        errors.push(`${glabel}: source.classSlug must be a string`)
      if (g.known !== undefined && (!Array.isArray(g.known) || g.known.length === 0))
        errors.push(`${glabel}: "known" must be a non-empty array`)

      let options = g.options
      if (g.optionsRef) {
        if (!pools[g.optionsRef]) {
          errors.push(`${glabel}: optionsRef "${g.optionsRef}" not found in ${POOLS_FILE}`)
          continue
        }
        options = pools[g.optionsRef]
      }
      if (!Array.isArray(options) || options.length === 0) {
        errors.push(`${glabel}: needs "options" or a valid "optionsRef"`)
        continue
      }
      options.forEach((o, j) => validateFeatureOption(o, `${glabel}.options[${j}]`))
      if (g.resource) validateFeatureResource(g.resource, glabel)
      if (g.key && out[g.key]) errors.push(`${glabel}: duplicate group key "${g.key}"`)

      const { optionsRef, ...rest } = g
      void optionsRef
      if (g.key) out[g.key] = { ...rest, options }
    }
  }
  return out
})()

const rules = readJson('data/rules.json')
// Class-feature description glossary (flat object: { _shared: {name:desc}, classSlug: {name:desc} }).
// Surfaced in the Features & Traits block; missing file is fine (rows fall back to a stub).
const featureDescriptions = readJson('data/feature-descriptions.json')
// Feature category map ({ "<feature name>": "<category key>" }); missing file is fine
// (the Features block falls back to its keyword heuristic).
const featureCategories = readJson('data/feature-categories.json')
// Always-on class-feature effects ({ classSlug: { "Feature Name": FeatureEffect[] } }).
const classFeatureEffects = readJson('data/class-feature-effects.json')
if (classFeatureEffects) {
  for (const [cls, feats] of Object.entries(classFeatureEffects)) {
    if (typeof feats !== 'object' || feats === null) { errors.push(`class-feature-effects: "${cls}" must be an object`); continue }
    // Subclass-keyed entries ("fighter:champion") aren't in the class level table, so
    // every effect must carry its own numeric `level` gate.
    const subclassKeyed = cls.includes(':')
    for (const [fname, effs] of Object.entries(feats)) {
      validateFeatureEffects(effs, `class-feature-effects ${cls} "${fname}"`)
      if (subclassKeyed && Array.isArray(effs)) {
        effs.forEach((e, i) => {
          if (!isNum(e?.level)) errors.push(`class-feature-effects ${cls} "${fname}" effects[${i}]: subclass-keyed entries require a numeric "level" gate`)
        })
      }
    }
  }
}

// ── Class abilities (resource-backed, action-typed — Lay on Hands, Rage, Ki …) ──
// Top-level array, compiled verbatim. Keys are namespaced "ability:…" so they can
// never collide with feature-choice group keys in the shared featureResourcesUsed
// record. `cost` entries must reference another ability that carries a resource.
const classAbilities = readJson('data/class-abilities.json')
if (classAbilities) {
  if (!Array.isArray(classAbilities)) {
    errors.push('class-abilities: expected a top-level array')
  } else {
    const ACTIONS = new Set(['action', 'bonus_action', 'reaction', 'other'])
    const RESTS = new Set(['short', 'long'])
    const seen = new Set()
    const resourceKeys = new Set(classAbilities.filter(a => a?.resource).map(a => a.key))
    classAbilities.forEach((a, i) => {
      const label = `class-abilities[${i}] (${a?.key ?? '?'})`
      requireFields(a, ['key', 'source', 'level', 'name', 'action'], label)
      if (typeof a.key === 'string' && !a.key.startsWith('ability:'))
        errors.push(`${label}: key must be namespaced "ability:…"`)
      if (a.key) {
        if (seen.has(a.key)) errors.push(`${label}: duplicate key`)
        seen.add(a.key)
      }
      if (a.source && typeof a.source.classSlug !== 'string')
        errors.push(`${label}: source.classSlug must be a string`)
      if (a.level !== undefined && !isNum(a.level)) errors.push(`${label}: "level" must be a number`)
      if (a.action !== undefined && !ACTIONS.has(a.action))
        errors.push(`${label}: invalid action "${a.action}"`)
      if (a.resource) {
        const r = a.resource
        if (typeof r.label !== 'string' || r.label.trim() === '')
          errors.push(`${label}: resource.label must be a non-empty string`)
        if (r.kind !== 'pool' && r.kind !== 'uses')
          errors.push(`${label}: resource.kind must be "pool" or "uses"`)
        const sizings = ['perLevel', 'by', 'abilityMod'].filter(k => r[k] !== undefined)
        if (sizings.length !== 1)
          errors.push(`${label}: resource needs exactly one of perLevel/by/abilityMod (got ${sizings.join('+') || 'none'})`)
        if (r.perLevel !== undefined && !isNum(r.perLevel))
          errors.push(`${label}: resource.perLevel must be a number`)
        if (r.by !== undefined && (!Array.isArray(r.by) || r.by.length === 0 || r.by.some(s => !isNum(s?.level) || !isNum(s?.n))))
          errors.push(`${label}: resource.by must be a non-empty array of {level, n} numbers`)
        if (r.abilityMod !== undefined && !EFFECT_ABILITIES.has(r.abilityMod))
          errors.push(`${label}: invalid resource.abilityMod "${r.abilityMod}"`)
        if (r.plus !== undefined && (!isNum(r.plus) || r.abilityMod === undefined))
          errors.push(`${label}: resource.plus must be a number and requires abilityMod`)
        if (r.rest !== undefined && !RESTS.has(r.rest))
          errors.push(`${label}: invalid resource.rest "${r.rest}"`)
      }
      if (a.cost) {
        if (!isNum(a.cost.amount) || a.cost.amount < 1)
          errors.push(`${label}: cost.amount must be a number ≥ 1`)
        if (!resourceKeys.has(a.cost.key))
          errors.push(`${label}: cost.key "${a.cost.key}" does not reference an ability with a resource`)
      }
      if (a.effect && a.effect.kind !== 'heal-pool')
        errors.push(`${label}: unknown effect kind "${a.effect?.kind}"`)
    })
  }
}

if (warnings.length) {
  console.warn(`\n${warnings.length} warning(s):`)
  for (const w of warnings) console.warn(`  ⚠  ${w}`)
}

if (errors.length) {
  console.error(`\n${errors.length} error(s) — public/data not updated:`)
  for (const e of errors) console.error(`  ✗  ${e}`)
  process.exit(1)
}

mkdirSync('public/data', { recursive: true })
const outputs = { races, spells, classes, subclasses, feats, backgrounds, equipment, 'class-features': classFeatures }
for (const [name, data] of Object.entries(outputs)) {
  writeFileSync(`public/data/${name}.json`, JSON.stringify(data, null, 2))
}
if (rules) writeFileSync('public/data/rules.json', JSON.stringify(rules, null, 2))
if (featureDescriptions) writeFileSync('public/data/feature-descriptions.json', JSON.stringify(featureDescriptions, null, 2))
if (featureCategories) writeFileSync('public/data/feature-categories.json', JSON.stringify(featureCategories, null, 2))
if (classFeatureEffects) writeFileSync('public/data/class-feature-effects.json', JSON.stringify(classFeatureEffects, null, 2))
if (classAbilities) writeFileSync('public/data/class-abilities.json', JSON.stringify(classAbilities, null, 2))

const entryCount = [races, spells, classes, subclasses, feats, backgrounds]
  .reduce((n, d) => n + Object.keys(d).length, 0)
const equipmentCount = Object.values(equipment).reduce((n, arr) => n + arr.length, 0)
const featureGroupCount = Object.keys(classFeatures).length
console.log(`\n✓ Built ${entryCount} entries across 6 categories + ${equipmentCount} equipment items across ${Object.keys(equipment).length} equipment categories + ${featureGroupCount} class-feature groups + rules`)
