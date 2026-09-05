// Dependency-free validation for user-authored catalog items. This module is used
// on both sides of the campaign-item boundary, before an item can reach a sheet.

const ABILITIES = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha'])
const SKILLS = new Set(['acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival'])
const WEAPON_TYPES = new Set(['Simple Melee', 'Simple Ranged', 'Martial Melee', 'Martial Ranged', 'Varies'])
const ARMOR_TYPES = new Set(['Light', 'Medium', 'Heavy', 'Shield', 'Varies'])
const RARITIES = new Set(['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'])
const RECHARGES = new Set(['dawn', 'dusk', 'long_rest', 'short_rest'])

export type ItemValidationResult = { ok: true } | { ok: false; reason: string }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const strings = (value: unknown) => Array.isArray(value) && value.every(v => typeof v === 'string')

/**
 * Validate the effect payload before it reaches any render-time derivation path.
 * Exported for the per-character custom-content import boundary as well as
 * campaign items.
 */
export function validateItemEffects(value: unknown): ItemValidationResult {
  if (value === undefined) return { ok: true }
  if (!Array.isArray(value)) return { ok: false, reason: 'effects must be an array' }
  for (const raw of value) {
    const e = record(raw)
    if (!e || typeof e.type !== 'string') return { ok: false, reason: 'each effect needs a type' }
    if (['speed', 'initiative', 'damage', 'attack', 'spell_attack', 'spell_save_dc', 'spell_damage'].includes(e.type)) {
      if (!finite(e.amount)) return { ok: false, reason: `${e.type} needs amount` }
    } else if (e.type === 'speed_set' || e.type === 'ac_floor') {
      if (!finite(e.value)) return { ok: false, reason: `${e.type} needs value` }
    } else if (e.type === 'speed_multiplier') {
      if (!finite(e.factor)) return { ok: false, reason: 'speed_multiplier needs factor' }
    } else if (e.type === 'ac') {
      if (!finite(e.amount) || (e.condition !== undefined && e.condition !== 'unarmored')) return { ok: false, reason: 'invalid ac effect' }
    } else if (e.type === 'unarmored_ac') {
      if (!finite(e.base)) return { ok: false, reason: 'unarmored_ac needs base' }
    } else if (e.type === 'max_hp') {
      if ((e.amount === undefined && e.perLevel === undefined) || (e.amount !== undefined && !finite(e.amount)) || (e.perLevel !== undefined && !finite(e.perLevel))) return { ok: false, reason: 'invalid max_hp effect' }
    } else if (e.type === 'resistance' || e.type === 'immunity') {
      if (typeof e.damageType !== 'string' || !e.damageType.trim()) return { ok: false, reason: `${e.type} needs damageType` }
    } else if (e.type === 'damage_dice') {
      if (typeof e.dice !== 'string' || !/^\d+d\d+$/.test(e.dice) || typeof e.damageType !== 'string' || !e.damageType.trim()) return { ok: false, reason: 'invalid damage_dice effect' }
    } else if (e.type === 'save') {
      if ((e.ability !== 'all' && (typeof e.ability !== 'string' || !ABILITIES.has(e.ability))) || !finite(e.amount)) return { ok: false, reason: 'invalid save effect' }
    } else if (e.type === 'ability_bonus' || e.type === 'ability_set') {
      const key = e.type === 'ability_bonus' ? 'amount' : 'value'
      if (typeof e.ability !== 'string' || !ABILITIES.has(e.ability) || !finite(e[key]) || (e.cap !== undefined && !finite(e.cap))) return { ok: false, reason: `invalid ${e.type} effect` }
    } else if (e.type === 'skill') {
      if (typeof e.skill !== 'string' || !SKILLS.has(e.skill) || !finite(e.amount)) return { ok: false, reason: 'invalid skill effect' }
    } else if (e.type === 'language') {
      if (typeof e.name !== 'string' || !e.name.trim()) return { ok: false, reason: 'language needs name' }
    } else if (e.type === 'advantage' || e.type === 'disadvantage') {
      if (e.target !== 'save' && e.target !== 'skill') return { ok: false, reason: `invalid ${e.type} target` }
      if (e.target === 'save' && e.ability !== 'all' && (typeof e.ability !== 'string' || !ABILITIES.has(e.ability))) return { ok: false, reason: `invalid ${e.type} save` }
      if (e.target === 'skill' && (typeof e.skill !== 'string' || !SKILLS.has(e.skill))) return { ok: false, reason: `invalid ${e.type} skill` }
      if (e.condition !== undefined && (typeof e.condition !== 'string' || !e.condition.trim())) return { ok: false, reason: `invalid ${e.type} condition` }
    } else if (e.type === 'unarmed') {
      if ((e.dice !== undefined && typeof e.dice !== 'string') || (e.damageType !== undefined && typeof e.damageType !== 'string') || (e.attackBonus !== undefined && !finite(e.attackBonus)) || (e.damageBonus !== undefined && !finite(e.damageBonus))) return { ok: false, reason: 'invalid unarmed effect' }
    } else return { ok: false, reason: `unknown effect type ${e.type}` }
  }
  return { ok: true }
}

export function validateCampaignItem(category: unknown, value: unknown): ItemValidationResult {
  if (category !== 'weapon' && category !== 'armor' && category !== 'shield' && category !== 'wondrous_item') return { ok: false, reason: 'unsupported category' }
  const item = record(value)
  if (!item || item.category !== category || typeof item.name !== 'string' || !item.name.trim()) return { ok: false, reason: 'item needs category and name' }
  for (const key of ['description', 'source', 'rarity', 'attunement_note']) {
    if (item[key] !== undefined && typeof item[key] !== 'string') return { ok: false, reason: `${key} must be text` }
  }
  for (const key of ['cost', 'weight', 'base_weapon_type', 'base_armor_type']) {
    if (item[key] !== undefined && item[key] !== null && typeof item[key] !== 'string') return { ok: false, reason: `${key} must be text or null` }
  }
  for (const key of ['magical', 'attunement']) {
    if (item[key] !== undefined && typeof item[key] !== 'boolean') return { ok: false, reason: `${key} must be boolean` }
  }
  if (item.bonus !== undefined && item.bonus !== null && !finite(item.bonus)) return { ok: false, reason: 'bonus must be numeric or null' }
  if (item.special_properties !== undefined && !strings(item.special_properties)) return { ok: false, reason: 'special_properties must contain text' }
  if (category === 'weapon' && (typeof item.weapon_type !== 'string' || !WEAPON_TYPES.has(item.weapon_type) || (item.damage_dice !== null && typeof item.damage_dice !== 'string') || (item.damage_type !== null && typeof item.damage_type !== 'string') || !strings(item.properties))) return { ok: false, reason: 'invalid weapon fields' }
  if ((category === 'armor' || category === 'shield') && (typeof item.armor_type !== 'string' || !ARMOR_TYPES.has(item.armor_type) || typeof item.ac_formula !== 'string' || typeof item.stealth_disadvantage !== 'boolean' || (item.strength_requirement !== null && !finite(item.strength_requirement)))) return { ok: false, reason: 'invalid armor fields' }
  if (category === 'wondrous_item' && (typeof item.rarity !== 'string' || !RARITIES.has(item.rarity) || typeof item.attunement !== 'boolean')) return { ok: false, reason: 'invalid wondrous item fields' }
  const effects = validateItemEffects(item.effects)
  if (!effects.ok) return effects
  if (item.charges !== undefined) {
    const charges = record(item.charges)
    if (!charges || !finite(charges.max) || (charges.recharge !== undefined && (typeof charges.recharge !== 'string' || !RECHARGES.has(charges.recharge))) || (charges.regain !== undefined && typeof charges.regain !== 'string')) return { ok: false, reason: 'invalid charges' }
  }
  return { ok: true }
}
