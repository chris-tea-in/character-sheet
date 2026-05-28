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

const feats = buildKeyed('feats', ['name', 'slug', 'description'])

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
      if (item._review?.length) warnings.push(`${label}: has ${item._review.length} _review note(s)`)
    }
    out[type] = entries
  }
  return out
})()

const rules = readJson('data/rules.json')

if (warnings.length) {
  console.warn(`\n${warnings.length} warning(s):`)
  for (const w of warnings) console.warn(`  ⚠  ${w}`)
}

if (errors.length) {
  console.error(`\n${errors.length} error(s) — public/data not updated:`)
  for (const e of errors) console.error(`  ✗  ${e}`)
  process.exit(1)
}

const outputs = { races, spells, classes, subclasses, feats, backgrounds, equipment }
for (const [name, data] of Object.entries(outputs)) {
  writeFileSync(`public/data/${name}.json`, JSON.stringify(data, null, 2))
}
if (rules) writeFileSync('public/data/rules.json', JSON.stringify(rules, null, 2))

const entryCount = [races, spells, classes, subclasses, feats, backgrounds]
  .reduce((n, d) => n + Object.keys(d).length, 0)
const equipmentCount = Object.values(equipment).reduce((n, arr) => n + arr.length, 0)
console.log(`\n✓ Built ${entryCount} entries across 6 categories + ${equipmentCount} equipment items across ${Object.keys(equipment).length} equipment categories + rules`)
