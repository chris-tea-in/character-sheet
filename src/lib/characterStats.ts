import { abilityModifier, proficiencyBonus, SKILL_ABILITY_MAP, SKILL_DISPLAY_MAP, formatBonus } from './dice'
import { ABILITY_FULL_TO_SHORT, getRacialBonuses, toSubraceSlug } from './racialBonuses'
import { applicableGroups } from './classFeatures'
import type { Character, AbilityName, Abilities, SkillName, SkillProficiency, EquipmentItem, LedgerOverrides } from '../types/character'
import type { ArmorItem, WeaponItem, ClassData, FeatData, Race, WondrousItem, ItemEffect, ClassFeatureData, ClassFeatureEffects, FeatureEffect, RaceEffect } from '../types/data'

/** The weapon-conditional fighting-style effects (Archery to-hit, Dueling damage). */
export type FeatureWeaponEffect = Extract<FeatureEffect, { type: 'weapon_attack' } | { type: 'weapon_damage' }>

export interface WeaponBonus {
  toHit: string
  damage: string
  damageDice: string
  damageBonus: number
  damageType: string
  abilityLabel: string
  toHitModifier: number
}

/** One contributor to a derived stat — provenance for the Modifier Ledger (see BACKLOG).
 *  `amount` is its signed contribution to the target stat; the list sums to the effective value. */
export type ModifierKind =
  | 'base' | 'abilityMod' | 'proficiency' | 'race' | 'subrace'
  | 'feat' | 'item' | 'feature' | 'class' | 'spell' | 'manual' | 'custom' | 'condition'

// Per-roll advantage state, netted per RAW (any advantage + any disadvantage = normal).
export type RollMode = 'adv' | 'dis'

// One granted set-membership entry (resistance/immunity/…) with provenance — Step 6b.
// `disabled` = suppressed via the ledger (kept in the list, struck-through, re-enableable).
export interface SetGrantSource {
  id: string
  value: string       // the damage type (lowercased)
  label: string       // source label (Item / Racial / Feat / a feature or custom name)
  kind: ModifierKind
  disabled: boolean
}

export interface ModifierSource {
  id: string          // stable + deterministic: `${kind}:${sourceSlug}:${targetKey}`
  label: string
  amount: number
  kind: ModifierKind
  removable: boolean   // base / abilityMod are locked; feats/items/manual are toggleable (P2)
  disabled?: boolean   // P2 ledger: suppressed from the sum but still shown (struck-through), re-enableable
  rawAmount?: number   // P2 ledger: the original amount when an override replaced it ("was X")
}

// Identifies which breakdown a custom modifier attaches to (the key into
// `LedgerOverrides.custom`). Numeric stats only for 6a.
export type TargetKey =
  | 'speed' | 'initiative' | 'ac' | 'maxHp' | 'spellAttack' | 'spellSaveDC'
  | `ability:${AbilityName}` | `save:${AbilityName}` | `skill:${SkillName}`

const EMPTY_LEDGER: LedgerOverrides = { disabled: [], overrides: {}, custom: {} }

export interface LedgerResult {
  rows: ModifierSource[]  // original rows (disabled/overridden flags applied) + appended custom rows
  effective: number       // sum of non-disabled rows (using overridden amounts) + customs
  rawTotal: number        // pre-ledger sum (no disables/overrides/customs) — the "RAW" value
}

/**
 * Apply the P2 stored override layer to one stat's breakdown — the LAST derive step
 * for that stat (INV-1: no write-time baking). Disabled rows stay in the list
 * (struck-through in the UI, re-enableable) but drop out of the sum; overrides replace
 * a removable row's amount; customs append player-authored rows. Locked rows
 * (`removable:false` — base/abilityMod) are never disabled or overridden.
 */
export function applyLedger(targetKey: TargetKey, rows: ModifierSource[], ledger?: LedgerOverrides | null): LedgerResult {
  const l = ledger ?? EMPTY_LEDGER
  const disabled = new Set(l.disabled ?? [])
  const overrides = l.overrides ?? {}
  const customs = l.custom?.[targetKey] ?? []
  const rawTotal = rows.reduce((t, r) => t + r.amount, 0)

  const applied: ModifierSource[] = rows.map(r => {
    if (!r.removable) return r // base / abilityMod: locked, never disabled or overridden
    const isDisabled = disabled.has(r.id)
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, r.id)
    if (hasOverride && overrides[r.id] !== r.amount) {
      return { ...r, amount: overrides[r.id], rawAmount: r.amount, disabled: isDisabled }
    }
    return isDisabled ? { ...r, disabled: true } : r
  })
  for (const c of customs) {
    // Custom rows honor the disable set too (toggle off without deleting); their amount
    // is edited in place via ledger.custom, so there is no separate override path.
    applied.push({
      id: c.id, label: c.label, amount: c.amount, kind: 'custom', removable: true,
      ...(disabled.has(c.id) ? { disabled: true } : {}),
    })
  }
  const effective = applied.reduce((t, r) => t + (r.disabled ? 0 : r.amount), 0)
  return { rows: applied, effective, rawTotal }
}

export interface DerivedStats {
  effectiveAC: number | null
  adjustedMaxHp: number
  effectiveAbilities: Abilities
  effectiveSpeed: number
  effectiveInitiative: number
  effectiveInitiativeBonus: number
  effectiveSaveProficiencies: AbilityName[]
  proficiencyBonus: number
  skillModifiers: Record<SkillName, number>
  saveModifiers: Record<AbilityName, number>
  flatSkillBonuses: Partial<Record<SkillName, number>>
  passivePerception: number
  passiveInvestigation: number
  spellAttackBonus: number
  spellSaveDC: number
  hasStealthDisadvantage: boolean
  hitDiceType: number
  // Roll-time: Rogue 11+ Reliable Talent — a proficient ability check treats a natural
  // d20 ≤ 9 as 10. Consumed in the dice engine (skill rolls + their rerolls).
  reliableTalent: boolean
  // Roll-time: has the Lucky feat — gates the modal's "🍀 Lucky" reroll button (the
  // button performs the Lucky-feat mechanic: roll an extra d20, keep the better).
  hasLuckyFeat: boolean
  // Netted advantage/disadvantage per save/skill (RAW: adv + dis = normal). Absent
  // key = roll normally. Sources: advantage maps + armor stealth-disadvantage + data effects.
  rollStates: { saves: Partial<Record<AbilityName, RollMode>>; skills: Partial<Record<SkillName, RollMode>> }
  // Labeled adv/dis sources per save/skill — for the ledger breakdown (why adv/dis).
  rollStateSources: { saves: Partial<Record<AbilityName, RollAdvSource[]>>; skills: Partial<Record<SkillName, RollAdvSource[]>> }
  // Netted attack-roll adv/dis (from conditions) + its labeled sources; weapon/spell Hit buttons read this.
  attackRollState: RollMode | undefined
  attackRollSources: RollAdvSource[]
  // Active conditions (incl. exhaustion) for the Conditions UI + sheet display.
  activeConditions: { key: string; label: string }[]
  effectiveSkillProficiencies: Partial<Record<SkillName, SkillProficiency>>
  // Skills whose effective proficiency/expertise comes from a feat (not the
  // stored record) — the UI shows these filled but locked so a dot click can't
  // write a duplicate stored copy (BUG-30)
  featSkillGrants: { proficient: SkillName[]; expertise: SkillName[] }
  // Skills granted by the character's race — shown filled+locked like feat grants.
  raceSkillGrants: SkillName[]
  // Skills granted via the ledger's custom set-grants (Step 6b) — also filled+locked.
  customSkillGrants: SkillName[]
  weaponProficiencies: string[]
  // Armor proficiency union (class + racial), lowercased. Used for feat prereqs/display.
  armorProficiencies: string[]
  // Tool proficiencies granted by race (display) and racial languages (DescriptionBlock grid).
  raceToolGrants: string[]
  raceGrantedLanguages: string[]
  // Senses granted by race (e.g. { darkvision: 60 }) — display.
  senses: Record<string, number>
  // Flat damage bonus from attuned items — added to weapon and unarmed damage
  itemDamageBonus: number
  // Flat bonus to weapon attack rolls (to-hit) from active items
  itemAttackBonus: number
  // Flat bonus to spell damage rolls from active items
  itemSpellDamageBonus: number
  // Unarmed-strike override from attuned items (e.g. Demon Armor → 1d8 slashing)
  unarmedStrike: { dice?: string; damageType?: string; attackBonus: number; damageBonus: number }
  // Languages granted by active items (e.g. Demon Armor → Abyssal) — derived, never stored
  itemGrantedLanguages: string[]
  // Damage resistances / immunities granted by active items — derived, read-only display
  resistances: string[]
  immunities: string[]
  // Provenance for resistances/immunities (Step 6b): each granted type with its source +
  // a disabled flag. The string lists above are the EFFECTIVE (non-disabled) values.
  resistanceSources: SetGrantSource[]
  immunitySources: SetGrantSource[]
  // Weapon-conditional fighting-style effects — applied per-weapon in computeWeaponBonus
  featureWeaponEffects: FeatureWeaponEffect[]
  // Great Weapon Fighting style selected → reroll 1s/2s on a two-handed/versatile melee
  // weapon's damage dice (applied at roll time in the damage pipeline).
  greatWeaponFighting: boolean
  // Provenance for the Modifier Ledger. Each list (or per-key list) sums to its
  // effective value (dev assertions guard this); later phases add the stored
  // disable/override/custom layer. `abilities` totals reconstruct the score; the
  // feat-ASI cap and item set-to-N are recorded as realized deltas so the sum holds.
  breakdowns: {
    speed: ModifierSource[]
    initiative: ModifierSource[]
    ac: ModifierSource[]
    proficiencyBonus: ModifierSource[]
    abilities: Record<AbilityName, ModifierSource[]>
    saves: Record<AbilityName, ModifierSource[]>
    skills: Record<SkillName, ModifierSource[]>
    maxHp: ModifierSource[]
    spellAttack: ModifierSource[]
    spellSaveDC: ModifierSource[]
  }
}

// ── Feat effect registry ────────────────────────────────────────────────────

interface FeatEffect {
  maxHpBonus?: (level: number) => number
  skillBonuses?: Partial<Record<SkillName, number>>
  passivePerceptionBonus?: number
  passiveInvestigationBonus?: number
}

const FEAT_EFFECTS: Partial<Record<string, FeatEffect>> = {
  'tough':     { maxHpBonus: level => level * 2 },
  'observant': { passivePerceptionBonus: 5, passiveInvestigationBonus: 5 },
}

export interface FeatStatDelta {
  abilities: Partial<Record<AbilityName, number>>
  speed: number
  initiativeBonus: number
  saveProficiency?: AbilityName
}

export function computeFeatStatDelta(
  featSlug: string,
  feat: FeatData,
  featChoices: Record<string, { asiAbility?: AbilityName }>,
): FeatStatDelta {
  const delta: FeatStatDelta = { abilities: {}, speed: 0, initiativeBonus: 0 }
  const chosenAb = featChoices[featSlug]?.asiAbility
  for (const effect of (feat.effects ?? [])) {
    if (effect.type === 'asi') {
      if (effect.subtype === 'fixed') {
        const ab = ABILITY_FULL_TO_SHORT[effect.ability.toLowerCase()]
        if (ab) delta.abilities[ab] = (delta.abilities[ab] ?? 0) + effect.amount
      } else if (effect.subtype === 'choice') {
        if (chosenAb) delta.abilities[chosenAb] = (delta.abilities[chosenAb] ?? 0) + effect.amount
      }
    } else if (effect.type === 'initiative') {
      delta.initiativeBonus += effect.amount
    } else if (effect.type === 'speed') {
      delta.speed += effect.amount
    } else if (effect.type === 'save_proficiency') {
      const ab = effect.ability === 'asi_choice'
        ? chosenAb
        : ABILITY_FULL_TO_SHORT[effect.ability.toLowerCase()]
      if (ab) delta.saveProficiency = ab
    }
  }
  return delta
}

export function featHasChoiceAsi(feat: FeatData): boolean {
  return (feat.effects ?? []).some(e => e.type === 'asi' && e.subtype === 'choice')
}

export function featChoiceAsiOptions(feat: FeatData): string[] {
  const effect = (feat.effects ?? []).find(e => e.type === 'asi' && e.subtype === 'choice')
  return effect && effect.subtype === 'choice' ? effect.options : []
}

export function hasFeatStatEffect(feat: FeatData): boolean {
  return (feat.effects ?? []).length > 0
}

// ── Advantage / disadvantage registry ─────────────────────────────────────────
// Conditions stated in the rules (e.g. "vs poison", "vs charmed") are simplified:
// the sheet maps them to the most relevant ability and applies them broadly.
// Players retain responsibility to roll normally when inapplicable. Each entry
// carries a `label` so the source is visible in the ledger breakdown (4b).

// One advantage/disadvantage source on a roll (for ledger provenance).
export interface RollAdvSource {
  mode: 'adv' | 'dis'
  label: string
  kind: ModifierKind
  // Step 6b-3: stable id for ledger disable (absent for conditions — not disableable);
  // `disabled` = suppressed from netting but still shown struck-through.
  id?: string
  disabled?: boolean
}

type AdvantageEntry = { saves?: AbilityName[]; skills?: SkillName[]; label: string; kind: ModifierKind }

const ALL_SAVES: AbilityName[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

const FEAT_ADVANTAGES: Partial<Record<string, AdvantageEntry>> = {
  'war-caster': { saves: ['con'], label: 'War Caster (concentration)', kind: 'feat' },
  'actor':      { skills: ['deception', 'performance'], label: 'Actor', kind: 'feat' },
}

// Fey Ancestry and similar charm/fear resistances → WIS (most charm saves are WIS)
const RACE_ADVANTAGES: Partial<Record<string, AdvantageEntry>> = {
  'dwarf':      { saves: ['con'], label: 'Dwarven Resilience', kind: 'race' },
  'duergar':    { saves: ['con', 'wis'], label: 'Duergar Resilience', kind: 'race' },
  'elf':        { saves: ['wis'], label: 'Fey Ancestry', kind: 'race' },
  'eladrin':    { saves: ['wis'], label: 'Fey Ancestry', kind: 'race' },
  'sea-elf':    { saves: ['wis'], label: 'Fey Ancestry', kind: 'race' },
  'shadar-kai': { saves: ['wis'], label: 'Fey Ancestry', kind: 'race' },
  'bugbear':    { saves: ['wis'], label: 'Fey Ancestry', kind: 'race' },
  'hobgoblin':  { saves: ['wis'], label: 'Fey Ancestry', kind: 'race' },
  'half-elf':   { saves: ['wis'], label: 'Fey Ancestry', kind: 'race' },
  'gnome':      { saves: ['int', 'wis', 'cha'], label: 'Gnome Cunning', kind: 'race' },
  'deep-gnome': { saves: ['int', 'wis', 'cha'], label: 'Gnome Cunning', kind: 'race' },
  'githzerai':  { saves: ['wis'], label: 'Mental Discipline', kind: 'race' },
  'halfling':   { saves: ['wis'], label: 'Brave', kind: 'race' },
  'locathah':   { saves: ['wis', 'con'], label: 'Leviathan Will', kind: 'race' },
  'satyr':      { saves: ALL_SAVES, label: 'Magic Resistance', kind: 'race' },
  'yuan-ti':    { saves: ALL_SAVES, label: 'Magic Resistance', kind: 'race' },
  'verdan':     { saves: ['wis', 'cha'], label: 'Telepathic Insight', kind: 'race' },
}

const SUBRACE_ADVANTAGES: Partial<Record<string, AdvantageEntry>> = {
  'stout': { saves: ['con'], label: 'Stout Resilience', kind: 'subrace' },
}

const ITEM_ADV_ENTRIES: Array<{ name: string; skills?: SkillName[]; saves?: AbilityName[] }> = [
  { name: 'Boots of Elvenkind',          skills: ['stealth'] },
  { name: 'Cloak of Elvenkind',          skills: ['stealth'] },
  { name: 'Cloak of the Bat',            skills: ['stealth'] },
  { name: 'Shadowfell Brand Tattoo',     skills: ['stealth'] },
  { name: 'Piwafwi',                     skills: ['stealth'] },
  { name: 'Piwafwi of Fire Resistance',  skills: ['stealth'] },
  { name: 'Kagonesti Forest Shroud',     skills: ['stealth'] },
  { name: "Nature's Mantle",             skills: ['stealth'] },
  { name: 'Rod of Alertness',            skills: ['perception'] },
  { name: 'Sentinel Shield',             skills: ['perception'] },
  { name: 'Robe of Eyes',                skills: ['perception'] },
  { name: 'Eyes of the Eagle',           skills: ['perception'] },
  { name: 'Watchful Helm',               skills: ['perception'] },
  { name: 'Ring of Truth Telling',       skills: ['insight'] },
  { name: "Inquisitive's Goggles",       skills: ['insight'] },
  { name: 'Gavel of the Venn Rune',      skills: ['persuasion'] },
  { name: 'Crown of the Wrath Bringer',  skills: ['intimidation'] },
  { name: 'Skull Helm',                  skills: ['intimidation'] },
  { name: "Reveler's Concertina",        skills: ['performance'] },
  { name: 'Orb of the Stein Rune',       saves: ['str'] },
  { name: 'Platinum Scarf',              saves: ALL_SAVES },
]

const ITEM_ADV_MAP = new Map<string, AdvantageEntry>(
  ITEM_ADV_ENTRIES.map(({ name, skills, saves }) => [name.toLowerCase(), { skills, saves, label: name, kind: 'item' }]),
)

interface AdvSources { saves: Partial<Record<AbilityName, RollAdvSource[]>>; skills: Partial<Record<SkillName, RollAdvSource[]>> }

// Labeled advantage sources from the hardcoded registries (feats, race/subrace, items).
// Disadvantage sources (armor stealth, data effects) are merged in deriveCharacterStats.
export function getCharacterAdvantages(character: Character): AdvSources {
  const out: AdvSources = { saves: {}, skills: {} }
  const add = (entry: AdvantageEntry) => {
    const src: RollAdvSource = { mode: 'adv', label: entry.label, kind: entry.kind }
    for (const ab of (entry.saves ?? [])) (out.saves[ab] ??= []).push(src)
    for (const sk of (entry.skills ?? [])) (out.skills[sk] ??= []).push(src)
  }
  for (const slug of character.feats) { const e = FEAT_ADVANTAGES[slug]; if (e) add(e) }
  const raceEntry = RACE_ADVANTAGES[character.race]; if (raceEntry) add(raceEntry)
  if (character.subrace) { const s = SUBRACE_ADVANTAGES[character.subrace.toLowerCase()]; if (s) add(s) }
  for (const item of character.equipment) { const e = ITEM_ADV_MAP.get(item.name.toLowerCase()); if (e) add(e) }
  return out
}

// ── Conditions ─────────────────────────────────────────────────────────────
// Runtime conditions (character.conditions) that mechanically affect the player's
// own rolls / speed / max-HP. Applied at render time alongside the advantage system.
// Effects on "attacks against you" (the DM's concern) are intentionally not modeled.
interface ConditionDef { label: string; attack?: 'adv' | 'dis'; checks?: boolean; saves?: AbilityName | 'all'; speed?: 'zero' | 'half' }

export const CONDITION_DEFS: Record<string, ConditionDef> = {
  blinded:       { label: 'Blinded', attack: 'dis' },
  charmed:       { label: 'Charmed' },
  deafened:      { label: 'Deafened' },
  frightened:    { label: 'Frightened', attack: 'dis', checks: true },
  grappled:      { label: 'Grappled', speed: 'zero' },
  incapacitated: { label: 'Incapacitated' },
  invisible:     { label: 'Invisible', attack: 'adv' },
  paralyzed:     { label: 'Paralyzed', speed: 'zero' },
  petrified:     { label: 'Petrified', speed: 'zero' },
  poisoned:      { label: 'Poisoned', attack: 'dis', checks: true },
  prone:         { label: 'Prone', attack: 'dis', speed: 'half' },
  restrained:    { label: 'Restrained', attack: 'dis', saves: 'dex', speed: 'zero' },
  stunned:       { label: 'Stunned', speed: 'zero' },
  unconscious:   { label: 'Unconscious', speed: 'zero' },
}
export const CONDITION_ORDER = Object.keys(CONDITION_DEFS)

export interface ConditionEffects {
  skillDis: RollAdvSource[]   // disadvantage on every ability check
  saveDis: { ability: AbilityName | 'all'; src: RollAdvSource }[]  // disadvantage on save(s)
  attack: RollAdvSource[]     // adv/dis sources on attack rolls (netted later)
  speed?: { mode: 'zero' | 'half'; label: string }
  maxHpHalf?: { label: string }
  active: { key: string; label: string }[]
}

export function computeConditionEffects(character: Character): ConditionEffects {
  const out: ConditionEffects = { skillDis: [], saveDis: [], attack: [], active: [] }
  let speedZero: string | null = null
  let speedHalf: string | null = null
  for (const key of (character.conditions?.active ?? [])) {
    const def = CONDITION_DEFS[key]
    if (!def) continue
    out.active.push({ key, label: def.label })
    if (def.attack) out.attack.push({ mode: def.attack, label: def.label, kind: 'condition' })
    if (def.checks) out.skillDis.push({ mode: 'dis', label: def.label, kind: 'condition' })
    if (def.saves) out.saveDis.push({ ability: def.saves, src: { mode: 'dis', label: def.label, kind: 'condition' } })
    if (def.speed === 'zero') speedZero = def.label
    else if (def.speed === 'half') speedHalf = def.label
  }
  // Exhaustion (cumulative levels 1–6).
  const ex = character.conditions?.exhaustion ?? 0
  if (ex > 0) {
    const lbl = `Exhaustion ${ex}`
    out.active.push({ key: 'exhaustion', label: `Exhaustion (level ${ex})` })
    out.skillDis.push({ mode: 'dis', label: lbl, kind: 'condition' })            // L1
    if (ex >= 2) speedHalf = speedHalf ?? lbl                                     // L2
    if (ex >= 3) {                                                                // L3
      out.attack.push({ mode: 'dis', label: lbl, kind: 'condition' })
      out.saveDis.push({ ability: 'all', src: { mode: 'dis', label: lbl, kind: 'condition' } })
    }
    if (ex >= 4) out.maxHpHalf = { label: lbl }                                   // L4
    if (ex >= 5) speedZero = lbl                                                  // L5
  }
  if (speedZero) out.speed = { mode: 'zero', label: speedZero }
  else if (speedHalf) out.speed = { mode: 'half', label: speedHalf }
  return out
}

// ── Feat prerequisite evaluation ────────────────────────────────────────────

export interface FeatPrereqContext {
  level: number
  classSlugs: string[]
  raceSlug: string
  abilities: Abilities
  knownFeatSlugs: string[]
  hasSpellcasting: boolean
  hasPactMagic: boolean
  armorProficiencies: string[]
  weaponProficiencies: string[]
  backgroundSlug?: string
}

const CLASS_PREREQ_MAP: Record<string, string> = {
  barbarian: 'barbarian', bard: 'bard', cleric: 'cleric', druid: 'druid',
  fighter: 'fighter', monk: 'monk', paladin: 'paladin', 'paladin class': 'paladin',
  ranger: 'ranger', rogue: 'rogue', sorcerer: 'sorcerer', warlock: 'warlock',
  wizard: 'wizard', 'wizard class': 'wizard',
  artificer: 'artificer', 'blood-hunter': 'blood-hunter',
}

export function meetsFeatPrerequisite(prereq: string, ctx: FeatPrereqContext): boolean {
  const p = prereq.trim()
  const pl = p.toLowerCase()

  // Spellcasting ability
  if (/^(the ability to cast at least one spell|spellcasting(?: feature)?)/i.test(p))
    return ctx.hasSpellcasting
  if (/^pact magic feature$/i.test(p))
    return ctx.hasPactMagic

  // Ability score threshold: "Strength 13", "Wisdom of 13"
  const abilityMatch = p.match(/^(strength|dexterity|constitution|intelligence|wisdom|charisma)(?: of)? (\d+)$/i)
  if (abilityMatch) {
    const ab = ABILITY_FULL_TO_SHORT[abilityMatch[1].toLowerCase()]
    if (ab) return (ctx.abilities[ab] ?? 10) >= parseInt(abilityMatch[2])
  }

  // Level: "4th Level"
  const levelMatch = p.match(/^(\d+)(?:st|nd|rd|th) level$/i)
  if (levelMatch) return ctx.level >= parseInt(levelMatch[1])

  // Armor proficiency
  if (/proficiency with light armor/i.test(p))
    return ctx.armorProficiencies.some(a => /light/i.test(a))
  if (/proficiency with medium armor/i.test(p))
    return ctx.armorProficiencies.some(a => /medium/i.test(a))
  if (/proficiency with heavy armor/i.test(p))
    return ctx.armorProficiencies.some(a => /heavy/i.test(a))

  // Weapon proficiency
  if (/martial weapon proficiency|proficiency with a martial weapon/i.test(p))
    return ctx.weaponProficiencies.some(w => /martial/i.test(w))

  // Class
  if (CLASS_PREREQ_MAP[pl]) return ctx.classSlugs.includes(CLASS_PREREQ_MAP[pl])

  // Race
  const r = ctx.raceSlug.toLowerCase()
  if (/^dragonborn$/i.test(p)) return r === 'dragonborn'
  if (/^dwarf$/i.test(p)) return r === 'dwarf' || r.includes('dwarf')
  if (/^elf$/i.test(p)) return r === 'elf' || r.includes('elf')
  if (/^gnome$/i.test(p)) return r === 'gnome' || r.includes('gnome')
  if (/^halfling$/i.test(p)) return r === 'halfling' || r.includes('halfling')
  if (/^half-elf$/i.test(p)) return r.includes('half-elf')
  if (/^half-orc$/i.test(p)) return r.includes('half-orc')
  if (/^tiefling$/i.test(p)) return r.includes('tiefling')
  if (/^elf or half-elf$/i.test(p)) return r.includes('elf')
  if (/^half-elf, half-orc, or human$/i.test(p)) return r === 'half-elf' || r === 'half-orc' || r === 'human'
  if (/^elf \(dark elf\)$/i.test(p)) return r.includes('dark-elf') || r.includes('drow')
  if (/^elf \(high elf\)$/i.test(p)) return r === 'high-elf' || r === 'elf'
  if (/^elf \(wood elf\)$/i.test(p)) return r === 'wood-elf'
  if (/^gnome \(deep gnome\)$/i.test(p)) return r.includes('deep-gnome') || r.includes('svirfneblin')
  if (/^dwarf or a small race$/i.test(p)) return r.includes('dwarf') || r.includes('gnome') || r.includes('halfling')

  // Background: "Knight of Solamnia Background"
  if (/background$/i.test(p) && ctx.backgroundSlug) {
    const bgSlug = pl.replace(/ background$/, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const bg = ctx.backgroundSlug.toLowerCase()
    return bg === bgSlug || bg.includes(bgSlug) || bgSlug.includes(bg)
  }

  // Feat prerequisites: "Initiate of High Sorcery Feat", "Strike of the Giants (Fire Strike) Feat"
  if (/feat[.]?$/i.test(p)) {
    const featName = pl
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/ feat[.]?$/, '')
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    return ctx.knownFeatSlugs.some(slug => slug === featName || slug.startsWith(featName))
  }

  // Campaign settings, "No other dragonmark", unrecognised — assume met
  return true
}

export function meetsFeatPrerequisites(feat: FeatData, ctx: FeatPrereqContext): boolean {
  return feat.prerequisites.every(p => meetsFeatPrerequisite(p, ctx))
}

// ── AC formula parser ────────────────────────────────────────────────────────
// Handles the mundane and magic-armor shapes seen in the data (BUG-49):
//   "18", "+2", "11 + DEX modifier", "13 + DEX modifier (max 2)",
//   "12 + Dex + 1", "14 + Dex (max 2) + 1", "14 + Dex (max 2)", "16 + 3", "18 + 1"
// "Varies"/"Varies + N" is handled by the caller (manual-AC fallback), not here.

function parseArmorAC(formula: string, dexMod: number): number {
  const trimmed = formula.trim()

  // Pure flat/shield bonus: "+2", "+2 vs ranged (...)"
  if (trimmed.startsWith('+')) {
    return parseInt(trimmed.slice(1), 10) || 0
  }

  // base [+ Dex [(max C)]] [+ flat]; "Dex", "DEX modifier", "Dexterity modifier" all accepted
  const m = trimmed.match(
    /^(\d+)(\s*\+\s*dex(?:terity)?(?:\s*modifier)?)?(\s*\(\s*max\s*(\d+)\s*\))?(\s*\+\s*(\d+))?$/i,
  )
  if (m) {
    const base = parseInt(m[1], 10)
    const hasDex = m[2] !== undefined
    const cap = m[4] !== undefined ? parseInt(m[4], 10) : Infinity
    const flat = m[6] !== undefined ? parseInt(m[6], 10) : 0
    return base + (hasDex ? Math.min(dexMod, cap) : 0) + flat
  }

  // Plain number fallback
  return parseInt(trimmed, 10) || 0
}

// ── Variable-base armor resolution ───────────────────────────────────────────
// "Armor of Resistance / +1 Plate / Adamantine Armor" etc. are forged from any
// armor ("Varies" formula). The player picks the mundane base (EquipmentItem.
// baseArmor); its ac_formula/type/stealth/STR replace the unresolvable "Varies"
// while the magic entry's bonus + effects stay. This is the single resolution
// point — feeds the SAME parseArmorAC path, no data mutation.

export function isVariableBaseArmor(a: ArmorItem): boolean {
  return a.ac_formula.trim().toLowerCase().startsWith('varies') || /\bany\b/i.test(a.base_armor_type ?? '')
}

function resolveArmor(item: EquipmentItem, rec: ArmorItem, armorByName: Map<string, ArmorItem>): ArmorItem {
  if (isVariableBaseArmor(rec) && item.baseArmor) {
    const base = armorByName.get(item.baseArmor.toLowerCase())
    if (base) {
      return {
        ...rec,
        ac_formula: base.ac_formula,
        armor_type: base.armor_type,
        stealth_disadvantage: base.stealth_disadvantage,
        strength_requirement: base.strength_requirement,
      }
    }
  }
  return rec
}

// ── Weapon proficiency check ─────────────────────────────────────────────────

// `weaponProficiencies` is the lowercased union across all the character's
// classes (DerivedStats.weaponProficiencies)
function isWeaponProficient(weapon: WeaponItem, weaponProficiencies: string[]): boolean {
  const profs = weaponProficiencies
  const wtype = weapon.weapon_type.toLowerCase()
  if (wtype.includes('simple') && profs.some(p => p === 'simple weapons')) return true
  if (wtype.includes('martial') && (profs.includes('martial weapons') || profs.includes('all weapons'))) return true
  if (profs.includes(weapon.name.toLowerCase())) return true
  return false
}

// ── Public API ───────────────────────────────────────────────────────────────

export function computeWeaponBonus(
  weapon: WeaponItem,
  character: Character,
  weaponProficiencies: string[],
  effectiveAbilities?: Abilities,
  itemDamageBonus = 0,
  featureWeaponEffects: FeatureWeaponEffect[] = [],
  itemAttackBonus = 0,
): WeaponBonus {
  const abilities = effectiveAbilities ?? character.abilities
  const strMod = abilityModifier(abilities.str)
  const dexMod = abilityModifier(abilities.dex)
  const isFinesse = weapon.properties.some(p => p.toLowerCase().includes('finesse'))
  const isRanged = weapon.weapon_type.toLowerCase().includes('ranged')
  const mod = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod
  const abilityLabel = isFinesse ? (dexMod > strMod ? 'DEX' : 'STR') : isRanged ? 'DEX' : 'STR'
  // Homebrew: `homebrewAllWeaponsProficient` forces the proficiency bonus onto
  // every weapon regardless of class/race proficiency (single application point).
  const pb = (character.homebrewAllWeaponsProficient || isWeaponProficient(weapon, weaponProficiencies))
    ? proficiencyBonus(character.level)
    : 0
  const magicBonus = weapon.bonus ?? 0
  // Fighting-style weapon bonuses (Archery to-hit, Dueling damage)
  const featureBonus = computeFeatureWeaponBonus(weapon, featureWeaponEffects)
  const toHitModifier = mod + pb + magicBonus + featureBonus.toHit + itemAttackBonus
  // Flat item damage bonus adds to damage only, not to-hit
  const damageBonus = mod + magicBonus + itemDamageBonus + featureBonus.damage
  const dmgBonusStr = damageBonus !== 0 ? (damageBonus > 0 ? `+${damageBonus}` : `${damageBonus}`) : ''

  return {
    toHit: toHitModifier >= 0 ? `+${toHitModifier}` : `${toHitModifier}`,
    damage: `${weapon.damage_dice ?? '—'}${dmgBonusStr} ${weapon.damage_type ?? ''}`.trim(),
    damageDice: weapon.damage_dice ?? '',
    damageBonus,
    damageType: weapon.damage_type ?? '',
    abilityLabel,
    toHitModifier,
  }
}

export function computeFeatHpBonus(feats: string[], level: number): number {
  let bonus = 0
  for (const slug of feats) {
    const effect = FEAT_EFFECTS[slug]
    if (effect?.maxHpBonus) bonus += effect.maxHpBonus(level)
  }
  return bonus
}

const ALL_ABILITIES: AbilityName[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

// ── Active magic-item effects ─────────────────────────────────────────────────
// Magic items contribute their catalog `effects` only while *active*: an
// attune-required item when `attuned`, a non-attune item when `equipped`. This is
// the single application point (INV-1 / feature-effect-system). Unlike feat ASIs,
// item ability changes are NOT capped at 20: `ability_set` takes the max of the
// current score vs. the target (Amulet of Health → CON 19, Belt → STR 29);
// `ability_bonus` is additive and uncapped.

interface ActiveItemEffects {
  acBonus: number               // unconditional flat AC (Ring/Cloak of Protection)
  acFloor: { name: string; value: number }[]  // floors total AC at value (Barkskin → 16)
  unarmoredAcBonus: number      // flat AC that applies only when no body armor (Bracers of Defense)
  unarmoredAcBase: number | null // sets unarmored AC base (Robe of the Archmagi → 15)
  saveBonuses: Partial<Record<AbilityName, number>>
  saveBonusSources: { name: string; ability: AbilityName | 'all'; amount: number }[]
  abilitySets: Partial<Record<AbilityName, number>>
  abilityBonuses: Partial<Record<AbilityName, number>>
  abilityBonusSources: { name: string; ability: AbilityName; amount: number; cap?: number }[]
  abilitySetSources: { name: string; ability: AbilityName; value: number; cap?: number }[]
  skillBonuses: Partial<Record<SkillName, number>>
  skillBonusSources: { name: string; skill: SkillName; amount: number }[]
  attack: number                // flat bonus to weapon attack rolls (to-hit)
  speed: number
  speedSources: { name: string; amount: number }[]
  speedSet: { name: string; value: number }[]      // floor: set speed to value if higher (Boots of Striding)
  speedMult: { name: string; factor: number }[]    // multiply post-floor speed (Boots of Speed / Haste)
  initiative: number
  initiativeSources: { name: string; amount: number }[]
  damage: number
  maxHp: number
  maxHpSources: { name: string; amount: number }[]
  resistances: string[]
  immunities: string[]
  spellAttack: number
  spellAttackSources: { name: string; amount: number }[]
  spellSaveDC: number
  spellSaveDCSources: { name: string; amount: number }[]
  spellDamage: number           // flat bonus to spell damage rolls
  advDis: { mode: 'adv' | 'dis'; target: 'save' | 'skill'; ability?: AbilityName | 'all'; skill?: SkillName; label: string }[]
  languages: string[]
  unarmed: { dice?: string; damageType?: string; attackBonus: number; damageBonus: number }
}

function computeActiveItemEffects(
  character: Character,
  catalog?: { weapons?: WeaponItem[]; armor?: ArmorItem[]; wondrous_items?: WondrousItem[] } | null,
): ActiveItemEffects {
  const acc: ActiveItemEffects = {
    acBonus: 0, acFloor: [], unarmoredAcBonus: 0, unarmoredAcBase: null,
    saveBonuses: {}, saveBonusSources: [], abilitySets: {}, abilityBonuses: {},
    abilityBonusSources: [], abilitySetSources: [],
    skillBonuses: {}, skillBonusSources: [], attack: 0, speed: 0, speedSources: [], speedSet: [], speedMult: [], initiative: 0, initiativeSources: [],
    damage: 0, maxHp: 0, maxHpSources: [],
    resistances: [], immunities: [], spellAttack: 0, spellAttackSources: [], spellSaveDC: 0, spellSaveDCSources: [],
    spellDamage: 0, advDis: [], languages: [], unarmed: { attackBonus: 0, damageBonus: 0 },
  }
  if (!catalog) return acc

  // name → { effects, requiresAttunement }. Attune-required items gate on
  // `attuned`; non-attune items gate on `equipped`.
  const byName = new Map<string, { effects: ItemEffect[]; requiresAttunement: boolean }>()
  for (const list of [catalog.wondrous_items, catalog.armor, catalog.weapons]) {
    for (const entry of (list ?? [])) {
      if (entry.effects?.length) {
        byName.set(entry.name.toLowerCase(), {
          effects: entry.effects,
          requiresAttunement: entry.attunement ?? false,
        })
      }
    }
  }
  if (byName.size === 0) return acc

  for (const item of character.equipment) {
    const entry = byName.get(item.name.toLowerCase())
    if (!entry) continue
    const active = entry.requiresAttunement ? !!item.attuned : !!item.equipped
    if (!active) continue
    for (const e of entry.effects) {
      switch (e.type) {
        case 'ac':
          if (e.condition === 'unarmored') acc.unarmoredAcBonus += e.amount
          else acc.acBonus += e.amount
          break
        case 'ac_floor':
          acc.acFloor.push({ name: item.name, value: e.value })
          break
        case 'unarmored_ac':
          acc.unarmoredAcBase = Math.max(acc.unarmoredAcBase ?? 0, e.base)
          break
        case 'max_hp': {
          const hp = (e.amount ?? 0) + (e.perLevel ?? 0) * character.level
          acc.maxHp += hp
          if (hp) acc.maxHpSources.push({ name: item.name, amount: hp })
          break
        }
        case 'resistance':
          if (!acc.resistances.includes(e.damageType.toLowerCase())) acc.resistances.push(e.damageType.toLowerCase())
          break
        case 'immunity':
          if (!acc.immunities.includes(e.damageType.toLowerCase())) acc.immunities.push(e.damageType.toLowerCase())
          break
        case 'save':
          if (e.ability === 'all') {
            for (const ab of ALL_ABILITIES) acc.saveBonuses[ab] = (acc.saveBonuses[ab] ?? 0) + e.amount
          } else {
            acc.saveBonuses[e.ability] = (acc.saveBonuses[e.ability] ?? 0) + e.amount
          }
          acc.saveBonusSources.push({ name: item.name, ability: e.ability, amount: e.amount })
          break
        case 'ability_bonus':
          acc.abilityBonuses[e.ability] = (acc.abilityBonuses[e.ability] ?? 0) + e.amount
          acc.abilityBonusSources.push({ name: item.name, ability: e.ability, amount: e.amount, cap: e.cap })
          break
        case 'ability_set':
          // Multiple setters on one ability: keep the highest target (RAW: a set never lowers a score)
          acc.abilitySets[e.ability] = Math.max(acc.abilitySets[e.ability] ?? 0, e.value)
          acc.abilitySetSources.push({ name: item.name, ability: e.ability, value: e.value, cap: e.cap })
          break
        case 'skill':
          acc.skillBonuses[e.skill] = (acc.skillBonuses[e.skill] ?? 0) + e.amount
          acc.skillBonusSources.push({ name: item.name, skill: e.skill, amount: e.amount })
          break
        case 'speed':
          acc.speed += e.amount
          acc.speedSources.push({ name: item.name, amount: e.amount })
          break
        case 'speed_set':
          acc.speedSet.push({ name: item.name, value: e.value })
          break
        case 'speed_multiplier':
          acc.speedMult.push({ name: item.name, factor: e.factor })
          break
        case 'initiative':
          acc.initiative += e.amount
          acc.initiativeSources.push({ name: item.name, amount: e.amount })
          break
        case 'damage':
          acc.damage += e.amount
          break
        case 'attack':
          acc.attack += e.amount
          break
        case 'language':
          if (!acc.languages.includes(e.name)) acc.languages.push(e.name)
          break
        case 'unarmed':
          // dice/type: last attuned override wins; bonuses stack
          if (e.dice) acc.unarmed.dice = e.dice
          if (e.damageType) acc.unarmed.damageType = e.damageType
          acc.unarmed.attackBonus += e.attackBonus ?? 0
          acc.unarmed.damageBonus += e.damageBonus ?? 0
          break
        case 'spell_attack':
          acc.spellAttack += e.amount
          acc.spellAttackSources.push({ name: item.name, amount: e.amount })
          break
        case 'spell_save_dc':
          acc.spellSaveDC += e.amount
          acc.spellSaveDCSources.push({ name: item.name, amount: e.amount })
          break
        case 'spell_damage':
          acc.spellDamage += e.amount
          break
        case 'advantage':
          acc.advDis.push({ mode: 'adv', target: e.target, ability: e.ability, skill: e.skill, label: item.name })
          break
        case 'disadvantage':
          acc.advDis.push({ mode: 'dis', target: e.target, ability: e.ability, skill: e.skill, label: item.name })
          break
      }
    }
  }
  return acc
}

const ABILITY_ABBR: Record<AbilityName, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
}

// One-line human summary of an item's effects, for the Attuned section UI.
export function summarizeItemEffects(effects: ItemEffect[] | undefined): string {
  if (!effects?.length) return ''
  const parts: string[] = []
  for (const e of effects) {
    switch (e.type) {
      case 'ac':           parts.push(`${formatBonus(e.amount)} AC${e.condition === 'unarmored' ? ' (unarmored)' : ''}`); break
      case 'ac_floor':     parts.push(`AC ≥ ${e.value}`); break
      case 'unarmored_ac': parts.push(`AC ${e.base} + DEX (unarmored)`); break
      case 'max_hp': {
        const hp: string[] = []
        if (e.amount) hp.push(`${formatBonus(e.amount)} HP`)
        if (e.perLevel) hp.push(`${formatBonus(e.perLevel)} HP/lvl`)
        parts.push(hp.join(' ') || 'HP')
        break
      }
      case 'resistance':   parts.push(`resist ${e.damageType}`); break
      case 'immunity':     parts.push(`immune ${e.damageType}`); break
      case 'save':         parts.push(`${formatBonus(e.amount)} ${e.ability === 'all' ? 'all saves' : `${ABILITY_ABBR[e.ability]} save`}`); break
      case 'ability_set':  parts.push(`${ABILITY_ABBR[e.ability]} ${e.value}`); break
      case 'ability_bonus':parts.push(`${formatBonus(e.amount)} ${ABILITY_ABBR[e.ability]}`); break
      case 'skill':        parts.push(`${formatBonus(e.amount)} ${SKILL_DISPLAY_MAP[e.skill]}`); break
      case 'speed':        parts.push(`${formatBonus(e.amount)} ft speed`); break
      case 'speed_set':    parts.push(`speed ${e.value} ft (min)`); break
      case 'speed_multiplier': parts.push(`×${e.factor} speed`); break
      case 'initiative':   parts.push(`${formatBonus(e.amount)} initiative`); break
      case 'damage':       parts.push(`${formatBonus(e.amount)} damage`); break
      case 'attack':       parts.push(`${formatBonus(e.amount)} attack`); break
      case 'damage_dice':  parts.push(`+${e.dice} ${e.damageType}`); break
      case 'language':     parts.push(e.name); break
      case 'unarmed':      parts.push(`unarmed ${[e.dice, e.damageType].filter(Boolean).join(' ') || 'override'}`); break
      case 'spell_attack': parts.push(`${formatBonus(e.amount)} spell atk`); break
      case 'spell_save_dc':parts.push(`${formatBonus(e.amount)} spell DC`); break
      case 'spell_damage': parts.push(`${formatBonus(e.amount)} spell dmg`); break
      case 'advantage':    parts.push(`adv ${e.target === 'save' ? `${e.ability === 'all' ? 'all' : e.ability?.toUpperCase()} save` : SKILL_DISPLAY_MAP[e.skill!]}`); break
      case 'disadvantage': parts.push(`dis ${e.target === 'save' ? `${e.ability === 'all' ? 'all' : e.ability?.toUpperCase()} save` : SKILL_DISPLAY_MAP[e.skill!]}`); break
    }
  }
  return parts.join(' · ')
}

// ── Selected class-feature effects ────────────────────────────────────────────
// Passive, app-knowable effects from chosen feature options (Fighting Style:
// Defense → +1 AC while armored). Single render-time application point (INV-1),
// parallel to computeActiveItemEffects. Counts/applicability are resolved by the
// shared classFeatures helpers (owning-class level, not total level — INV-2).
// Weapon-conditional effects (archery/dueling/great-weapon/two-weapon) are carried
// in the data but NOT accumulated here yet — they need weapon context in
// computeWeaponBonus (Phase C follow-up).

interface FeatureEffectAccum {
  acAlways: number    // unconditional AC bonus
  acArmored: number   // applies only when body armor is worn (Defense)
  acUnarmored: number // applies only when no body armor is worn
  acFloor: { label: string; value: number }[] // floors total AC at value (Barkskin → 16)
  weaponEffects: FeatureWeaponEffect[] // per-weapon to-hit/damage (Archery, Dueling)
  // Step 3 — labeled so the ledger breakdowns can show the granting feature.
  saveProf: { label: string; ability: AbilityName | 'all' }[]
  saveBonus: { label: string; ability: AbilityName | 'all'; amount: number }[]
  derivedSave: { label: string; ability: AbilityName | 'all'; from: AbilityName; min: number }[]
  resistances: { label: string; damageType: string }[]
  immunities: { label: string; damageType: string }[]
  speed: { label: string; amount: number }[]
  speedSet: { label: string; value: number }[]    // floor: set speed to value if higher
  speedMult: { label: string; factor: number }[]  // multiply post-floor speed
  maxHp: { label: string; amount: number }[]
  skillProf: { label: string; skill: SkillName }[]
  weaponProf: string[]
  armorProf: string[]
  toolProf: string[]
  advDis: { mode: 'adv' | 'dis'; target: 'save' | 'skill'; ability?: AbilityName | 'all'; skill?: SkillName; label: string }[]
  greatWeaponFighting: boolean   // selected the Great Weapon Fighting style (reroll 1s/2s)
}

function newFeatureAccum(): FeatureEffectAccum {
  return {
    acAlways: 0, acArmored: 0, acUnarmored: 0, acFloor: [], weaponEffects: [],
    saveProf: [], saveBonus: [], derivedSave: [], resistances: [], immunities: [],
    speed: [], speedSet: [], speedMult: [], maxHp: [], skillProf: [], weaponProf: [], armorProf: [], toolProf: [], advDis: [],
    greatWeaponFighting: false,
  }
}

// Apply one FeatureEffect into the shared accumulator (single application point for
// both selected feature options AND always-on class features). `level` scales max_hp.
function applyFeatureEffect(e: FeatureEffect, label: string, acc: FeatureEffectAccum, level: number) {
  switch (e.type) {
    case 'ac':
      if (e.condition === 'armored') acc.acArmored += e.amount
      else if (e.condition === 'unarmored') acc.acUnarmored += e.amount
      else acc.acAlways += e.amount
      break
    case 'ac_floor': acc.acFloor.push({ label, value: e.value }); break
    case 'weapon_attack': case 'weapon_damage': acc.weaponEffects.push(e); break
    case 'save_proficiency': acc.saveProf.push({ label, ability: e.ability }); break
    case 'save_bonus': acc.saveBonus.push({ label, ability: e.ability, amount: e.amount }); break
    case 'derived_save': acc.derivedSave.push({ label, ability: e.ability, from: e.from, min: e.min ?? 0 }); break
    case 'resistance': acc.resistances.push({ label, damageType: e.damageType.toLowerCase() }); break
    case 'immunity': acc.immunities.push({ label, damageType: e.damageType.toLowerCase() }); break
    case 'speed': acc.speed.push({ label, amount: e.amount }); break
    case 'speed_set': acc.speedSet.push({ label, value: e.value }); break
    case 'speed_multiplier': acc.speedMult.push({ label, factor: e.factor }); break
    case 'max_hp': { const hp = (e.amount ?? 0) + (e.perLevel ?? 0) * level; if (hp) acc.maxHp.push({ label, amount: hp }); break }
    case 'skill_proficiency': acc.skillProf.push({ label, skill: e.skill }); break
    case 'weapon_proficiency': for (const w of e.weapons) acc.weaponProf.push(w.toLowerCase()); break
    case 'armor_proficiency': for (const a of e.armor) acc.armorProf.push(a); break
    case 'tool_proficiency': for (const t of e.tools) acc.toolProf.push(t); break
    case 'advantage': acc.advDis.push({ mode: 'adv', target: e.target, ability: e.ability, skill: e.skill, label }); break
    case 'disadvantage': acc.advDis.push({ mode: 'dis', target: e.target, ability: e.ability, skill: e.skill, label }); break
  }
}

// Collect every passive feature effect: chosen feature options (Fighting Style …) PLUS
// always-on earned class-level features (Aura of Protection, Diamond Soul …) via the
// class-feature-effects data. Single render-time application point (INV-1); owning-class
// level gates the always-on scan (INV-2).
function collectFeatureEffects(
  character: Character,
  classRecords: (ClassData | null)[],
  classFeatures?: ClassFeatureData | null,
  classFeatureEffects?: ClassFeatureEffects | null,
): FeatureEffectAccum {
  const acc = newFeatureAccum()

  if (classFeatures) {
    for (const { group } of applicableGroups(character, classFeatures)) {
      const selected = character.classFeatureChoices?.[group.key] ?? []
      if (!selected.length) continue
      const bySlug = new Map(group.options.map(o => [o.slug, o]))
      for (const slug of selected) {
        if (slug === 'great-weapon-fighting') acc.greatWeaponFighting = true
        const opt = bySlug.get(slug)
        if (opt) for (const e of (opt.effects ?? [])) applyFeatureEffect(e, opt.name, acc, character.level)
      }
    }
  }

  if (classFeatureEffects) {
    const entries = character.classes?.length
      ? character.classes
      : [{ classSlug: character.class, subclassSlug: character.subclass, level: character.level }]
    entries.forEach((ce, i) => {
      const byFeature = classFeatureEffects[ce.classSlug]
      const rec = classRecords[i] ?? null
      if (!byFeature || !rec) return
      for (let lvl = 1; lvl <= ce.level; lvl++) {
        for (const name of (rec.levels[String(lvl)]?.features ?? [])) {
          const effs = byFeature[name]
          if (effs) for (const e of effs) applyFeatureEffect(e, name, acc, ce.level)
        }
      }
    })
  }

  return acc
}

/**
 * Per-weapon to-hit / damage from the character's fighting-style weapon effects.
 * Archery (+2 ranged to-hit), Dueling (+2 one-handed melee damage). The "no other
 * weapon" clause of Dueling isn't app-knowable, so it is approximated as "melee
 * weapon without the Two-Handed property" (same simplification policy as advantages).
 */
export function computeFeatureWeaponBonus(
  weapon: WeaponItem,
  effects: FeatureWeaponEffect[] = [],
): { toHit: number; damage: number } {
  if (!effects.length) return { toHit: 0, damage: 0 }
  const isRanged = weapon.weapon_type.toLowerCase().includes('ranged')
  const isTwoHanded = weapon.properties.some(p => p.toLowerCase().includes('two-handed'))
  let toHit = 0
  let damage = 0
  for (const e of effects) {
    const matchesClass = e.weaponClass === 'ranged' ? isRanged : !isRanged
    if (!matchesClass) continue
    if (e.type === 'weapon_attack') {
      toHit += e.amount
    } else {
      if (e.handed === 'one-handed' && isTwoHanded) continue
      if (e.handed === 'two-handed' && !isTwoHanded) continue
      damage += e.amount
    }
  }
  return { toHit, damage }
}

// ── Racial trait effects ───────────────────────────────────────────────────
// Single render-time application point (INV-1) for structured racial grants —
// parallel to computeActiveItemEffects. Reads the new RaceEffect[] (skill/weapon/
// tool/armor proficiencies, resistances/immunities, natural armor) PLUS the clean
// structured fields (languages, senses, hp_bonus_per_level). Save/skill advantages
// are intentionally excluded here (still applied by getCharacterAdvantages).

interface RaceEffects {
  skillProficiencies: SkillName[]
  weaponProficiencies: string[]   // lowercased weapon names
  toolProficiencies: string[]
  armorProficiencies: string[]    // 'light' | 'medium' | 'heavy' | 'shield'
  resistances: string[]           // lowercased damage types
  immunities: string[]
  naturalArmor: { base: number; addDex: boolean; maxDex: number } | null
  languages: string[]
  senses: Record<string, number>  // e.g. { darkvision: 60 }
  hpPerLevel: number
}

function computeRaceEffects(race: Race | null | undefined, subraceSlug?: string | null): RaceEffects {
  const acc: RaceEffects = {
    skillProficiencies: [], weaponProficiencies: [], toolProficiencies: [], armorProficiencies: [],
    resistances: [], immunities: [], naturalArmor: null, languages: [], senses: {}, hpPerLevel: 0,
  }
  if (!race) return acc

  const subrace = subraceSlug ? race.subraces.find(s => toSubraceSlug(s.name) === subraceSlug) : undefined
  const pushUniq = (arr: string[], v: string) => { if (!arr.includes(v)) arr.push(v) }
  const addSenses = (obj: Record<string, unknown> | undefined) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (typeof v === 'number') acc.senses[k] = Math.max(acc.senses[k] ?? 0, v)
    }
  }
  const applyEffects = (effects: RaceEffect[] | undefined) => {
    for (const e of (effects ?? [])) {
      switch (e.type) {
        case 'skill_proficiency':  if (!acc.skillProficiencies.includes(e.skill)) acc.skillProficiencies.push(e.skill); break
        case 'weapon_proficiency': for (const w of e.weapons) pushUniq(acc.weaponProficiencies, w.toLowerCase()); break
        case 'tool_proficiency':   for (const t of e.tools) pushUniq(acc.toolProficiencies, t); break
        case 'armor_proficiency':  for (const a of e.armor) pushUniq(acc.armorProficiencies, a); break
        case 'resistance':         pushUniq(acc.resistances, e.damageType.toLowerCase()); break
        case 'immunity':           pushUniq(acc.immunities, e.damageType.toLowerCase()); break
        case 'natural_armor':      acc.naturalArmor = { base: e.base, addDex: e.addDex ?? false, maxDex: e.maxDex ?? Infinity }; break
      }
    }
  }

  for (const l of race.base.languages) pushUniq(acc.languages, l)
  addSenses(race.base.senses)
  applyEffects(race.base.effects)
  if (subrace) {
    for (const l of subrace.languages) pushUniq(acc.languages, l)
    addSenses(subrace.senses)
    applyEffects(subrace.effects)
    acc.hpPerLevel += subrace.hp_bonus_per_level ?? 0
  }
  return acc
}

export interface DeriveContext {
  // All class records, ordered to match character.classes; [0] = primary
  classes?: (ClassData | null)[] | null
  race?: Race | null
  catalog?: { weapons?: WeaponItem[]; armor?: ArmorItem[]; wondrous_items?: WondrousItem[] } | null
  featData?: Record<string, FeatData> | null
  // Selectable class-feature groups (public/data/class-features.json)
  classFeatures?: ClassFeatureData | null
  // Always-on class-feature effects (public/data/class-feature-effects.json)
  classFeatureEffects?: ClassFeatureEffects | null
}

export function deriveCharacterStats(
  character: Character,
  ctx: DeriveContext = {},
): DerivedStats {
  const { race, catalog, featData, classFeatures } = ctx
  const classRecords = (ctx.classes ?? []).filter((c): c is ClassData => c != null)
  const classData = ctx.classes?.[0] ?? null
  const pb = proficiencyBonus(character.level)
  // Selected feature options + always-on class features, in one accumulator.
  const featureFx = collectFeatureEffects(character, ctx.classes ?? [], classFeatures, ctx.classFeatureEffects)

  // Stable, deterministic source IDs for the ledger (`${kind}:${sourceSlug}:${targetKey}`).
  const slugifyName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

  // ── Effective Abilities (base + racial ASIs + all feat ASIs) ─────────────
  // Built with per-ability provenance: each contributor records its *realized*
  // delta (so the feat-ASI cap at 20 and item set-to-N reconstruct the score
  // exactly — see breakdowns.abilities). Application order is unchanged:
  // base → racial → feats (capped) → item bonuses → item sets (max).
  const effectiveAbilities = { ...character.abilities }
  const abilityBreakdowns = {} as Record<AbilityName, ModifierSource[]>
  for (const ab of ALL_ABILITIES) {
    abilityBreakdowns[ab] = [
      { id: `base:score:${ab}`, label: 'Base score', amount: character.abilities[ab], kind: 'base', removable: false },
    ]
  }
  const racialBonuses = getRacialBonuses(race, character.raceAsiChoices ?? [], character.subrace ?? undefined)
  for (const [ab, amount] of Object.entries(racialBonuses) as [AbilityName, number][]) {
    effectiveAbilities[ab] = effectiveAbilities[ab] + amount
    if (amount) abilityBreakdowns[ab].push({ id: `race:${slugifyName(character.race || 'race')}:${ab}`, label: 'Racial bonus', amount, kind: 'race', removable: true })
  }

  // Structured racial trait grants (proficiencies, resistances, natural armor,
  // languages, senses, per-level HP) — single application point, INV-1.
  const raceEffects = computeRaceEffects(race, character.subrace)
  // Runtime conditions (adv/dis on rolls, speed, max-HP) — applied below.
  const conditionEffects = computeConditionEffects(character)
  let featSpeedBonus = 0
  let featInitiativeBonus = 0
  const featSpeedSources: { slug: string; name: string; amount: number }[] = []
  const featInitSources: { slug: string; name: string; amount: number }[] = []
  const featDerivedSaves: AbilityName[] = []
  const flatSkillBonuses: Partial<Record<SkillName, number>> = {}
  // Provenance for flat skill bonuses (feats + items), filtered per skill below.
  const flatSkillBonusSources: { skill: SkillName; id: string; label: string; kind: ModifierKind; amount: number }[] = []
  // Data-driven feat effects (Step 3 — max_hp/resistance/language/proficiency).
  const featMaxHpSources: { slug: string; name: string; amount: number }[] = []
  const featResistances: string[] = []
  const featLanguages: string[] = []
  const featWeaponProf: string[] = []
  const featArmorProf: string[] = []
  const featToolProf: string[] = []

  if (featData) {
    for (const slug of character.feats) {
      const feat = featData[slug]
      if (!feat) continue

      const delta = computeFeatStatDelta(slug, feat, character.featChoices)
      for (const [ab, amount] of Object.entries(delta.abilities) as [AbilityName, number][]) {
        const before = effectiveAbilities[ab]
        effectiveAbilities[ab] = Math.min(20, before + amount)
        const realized = effectiveAbilities[ab] - before
        abilityBreakdowns[ab].push({
          id: `feat:${slug}:${ab}`,
          label: realized < amount ? `${feat.name} (capped at 20)` : feat.name,
          amount: realized, kind: 'feat', removable: true,
        })
      }
      featSpeedBonus += delta.speed
      featInitiativeBonus += delta.initiativeBonus
      if (delta.speed) featSpeedSources.push({ slug, name: feat.name, amount: delta.speed })
      if (delta.initiativeBonus) featInitSources.push({ slug, name: feat.name, amount: delta.initiativeBonus })
      if (delta.saveProficiency && !character.savingThrowProficiencies.includes(delta.saveProficiency)) {
        featDerivedSaves.push(delta.saveProficiency)
      }

      const registryEffect = FEAT_EFFECTS[slug]
      if (registryEffect?.skillBonuses) {
        for (const [sk, bonus] of Object.entries(registryEffect.skillBonuses) as [SkillName, number][]) {
          flatSkillBonuses[sk] = (flatSkillBonuses[sk] ?? 0) + bonus
          flatSkillBonusSources.push({ skill: sk, id: `feat:${slug}:skill-${sk}`, label: feat.name, kind: 'feat', amount: bonus })
        }
      }

      // Data-driven feat effects (the new FeatEffect variants). max_hp here replaces
      // the hardcoded registry once a feat carries it (Tough → perLevel 2).
      for (const e of (feat.effects ?? [])) {
        if (e.type === 'max_hp') {
          const amt = (e.amount ?? 0) + (e.perLevel ?? 0) * character.level
          if (amt) featMaxHpSources.push({ slug, name: feat.name, amount: amt })
        } else if (e.type === 'resistance') featResistances.push(e.damageType.toLowerCase())
        else if (e.type === 'language') featLanguages.push(e.name)
        else if (e.type === 'weapon_proficiency') for (const w of e.weapons) featWeaponProf.push(w.toLowerCase())
        else if (e.type === 'armor_proficiency') for (const a of e.armor) featArmorProf.push(a)
        else if (e.type === 'tool_proficiency') for (const t of e.tools) featToolProf.push(t)
      }
    }
  }

  // ── Effective skill proficiencies (base + feat-granted choices) ───────────
  const effectiveSkillProficiencies: Partial<Record<SkillName, SkillProficiency>> = {
    ...character.skillProficiencies,
  }
  const featSkillGrants: { proficient: SkillName[]; expertise: SkillName[] } = { proficient: [], expertise: [] }
  if (featData) {
    for (const slug of character.feats) {
      const feat = featData[slug]
      if (!feat) continue
      const choices = character.featChoices[slug]
      const hasSkillProf = (feat.effects ?? []).some(e => e.type === 'skill_proficiency')
      const hasExpertise = (feat.effects ?? []).some(e => e.type === 'expertise')
      if (hasSkillProf && choices?.skillChoices) {
        for (const sk of choices.skillChoices) {
          if (!effectiveSkillProficiencies[sk]) {
            effectiveSkillProficiencies[sk] = 'proficient'
            featSkillGrants.proficient.push(sk)
          }
        }
      }
      if (hasExpertise && choices?.expertiseSkill) {
        effectiveSkillProficiencies[choices.expertiseSkill] = 'expertise'
        featSkillGrants.expertise.push(choices.expertiseSkill)
      }
    }
  }
  // Racial + always-on-feature skill proficiencies — granted at render time and shown
  // filled+locked in the UI (the BUG-30 pattern) so a dot click can't write a duplicate.
  const raceSkillGrants: SkillName[] = []
  for (const sk of [...raceEffects.skillProficiencies, ...featureFx.skillProf.map(s => s.skill)]) {
    if (!effectiveSkillProficiencies[sk]) {
      effectiveSkillProficiencies[sk] = 'proficient'
      raceSkillGrants.push(sk)
    }
  }

  // ── Modifier Ledger set-membership grants (Step 6b), computed once ─────────
  // Always-on custom grants (resistance/immunity/language/sense/skill+save prof),
  // minus any the player disabled. Skill/save prof grants fold into the effective
  // proficiencies (locked in the UI like racial grants); the rest apply below.
  const ledgerDisabled = new Set(character.ledgerOverrides?.disabled ?? [])
  const allSetGrants = character.ledgerOverrides?.customGrants ?? []
  const activeSetGrants = allSetGrants.filter(g => !ledgerDisabled.has(g.id))
  const customSenseGrants = activeSetGrants.filter(g => g.target === 'sense')
  const customLangs = activeSetGrants.filter(g => g.target === 'language').map(g => g.value)
  const customSkillGrants: SkillName[] = []
  for (const g of activeSetGrants.filter(g => g.target === 'skillProf')) {
    const sk = g.value as SkillName
    if (!effectiveSkillProficiencies[sk]) effectiveSkillProficiencies[sk] = 'proficient'
    customSkillGrants.push(sk)
  }

  // ── Active magic-item effects ──────────────────────────────────────────────
  // Applied on top of base + racial + feat. Item ability changes are uncapped
  // (RAW: items can raise a score above 20). Skill bonuses reuse the feat channel.
  const itemEffects = computeActiveItemEffects(character, catalog)
  // Item ability bonuses (additive, uncapped) then sets (max), applied per source
  // so each carries provenance. Order matches RAW + the prior merged application.
  // 5c — optional per-source `cap` clamps THIS effect's result (Belt of Dwarvenkind →
  // +2 CON to max 20) without ever lowering an already-higher score: max(before, min(target, cap)).
  for (const s of itemEffects.abilityBonusSources) {
    const before = effectiveAbilities[s.ability]
    const target = before + s.amount
    effectiveAbilities[s.ability] = s.cap != null ? Math.max(before, Math.min(target, s.cap)) : target
    const realized = effectiveAbilities[s.ability] - before
    if (realized) abilityBreakdowns[s.ability].push({ id: `item:${slugifyName(s.name)}:${s.ability}`, label: s.cap != null ? `${s.name} (max ${s.cap})` : s.name, amount: realized, kind: 'item', removable: true })
  }
  for (const s of itemEffects.abilitySetSources) {
    const before = effectiveAbilities[s.ability]
    const target = Math.max(before, s.value)
    effectiveAbilities[s.ability] = s.cap != null ? Math.max(before, Math.min(target, s.cap)) : target
    const realized = effectiveAbilities[s.ability] - before
    if (realized) abilityBreakdowns[s.ability].push({ id: `item:${slugifyName(s.name)}:${s.ability}-set`, label: `${s.name} (sets to ${s.value}${s.cap != null ? `, max ${s.cap}` : ''})`, amount: realized, kind: 'item', removable: true })
  }
  for (const [sk, bonus] of Object.entries(itemEffects.skillBonuses) as [SkillName, number][]) {
    flatSkillBonuses[sk] = (flatSkillBonuses[sk] ?? 0) + bonus
  }
  for (const s of itemEffects.skillBonusSources) {
    flatSkillBonusSources.push({ skill: s.skill, id: `item:${slugifyName(s.name)}:skill-${s.skill}`, label: s.name, kind: 'item', amount: s.amount })
  }
  // Dev guard: each ability breakdown reconstructs the effective score exactly.
  for (const ab of ALL_ABILITIES) {
    console.assert(abilityBreakdowns[ab].reduce((t, c) => t + c.amount, 0) === effectiveAbilities[ab], `[ledger] ${ab} breakdown ≠ effective score`)
  }
  // 6a — apply the ledger override layer to ability scores EARLY: they cascade into
  // every dependent stat (mods, saves, skills, AC, HP, init, spell DC), so the
  // disable/override/custom must land before those are read below.
  for (const ab of ALL_ABILITIES) {
    const r = applyLedger(`ability:${ab}`, abilityBreakdowns[ab], character.ledgerOverrides)
    abilityBreakdowns[ab] = r.rows
    effectiveAbilities[ab] = r.effective
  }

  // ── Combat stats ──────────────────────────────────────────────────────────
  const dexMod = abilityModifier(effectiveAbilities.dex)
  const featureSpeed = featureFx.speed.reduce((t, s) => t + s.amount, 0)
  const additiveSpeed = character.speed + featSpeedBonus + itemEffects.speed + featureSpeed
  // 5a — non-additive speed semantics, applied in RAW order AFTER the additive sum:
  // floor/set (max) → multiplier → condition (half/zero). Each non-additive step lands
  // as a realized-delta row so speedBreakdown still sums to effectiveSpeed.
  const speedFloors = [
    ...itemEffects.speedSet.map(s => ({ id: `item:${slugifyName(s.name)}:speed-set`, label: `${s.name} (item)`, value: s.value, kind: 'item' as const })),
    ...featureFx.speedSet.map(s => ({ id: `feature:${slugifyName(s.label)}:speed-set`, label: `${s.label} (feature)`, value: s.value, kind: 'feature' as const })),
  ]
  const speedMults = [
    ...itemEffects.speedMult.map(s => ({ id: `item:${slugifyName(s.name)}:speed-mult`, label: `${s.name} (item)`, factor: s.factor, kind: 'item' as const })),
    ...featureFx.speedMult.map(s => ({ id: `feature:${slugifyName(s.label)}:speed-mult`, label: `${s.label} (feature)`, factor: s.factor, kind: 'feature' as const })),
  ]
  let runningSpeed = additiveSpeed
  const speedExtraRows: ModifierSource[] = []
  // Floor/set: only the single highest floor that exceeds current speed has any effect.
  const winningFloor = speedFloors.filter(f => f.value > runningSpeed).sort((a, b) => b.value - a.value)[0]
  if (winningFloor) {
    speedExtraRows.push({ id: winningFloor.id, label: `${winningFloor.label} — speed ≥ ${winningFloor.value}`, amount: winningFloor.value - runningSpeed, kind: winningFloor.kind, removable: true })
    runningSpeed = winningFloor.value
  }
  // Multipliers compound; each lands its own incremental delta (RAW floors fractional feet).
  for (const m of speedMults) {
    const after = Math.floor(runningSpeed * m.factor)
    if (after !== runningSpeed) speedExtraRows.push({ id: m.id, label: `${m.label} — ×${m.factor} speed`, amount: after - runningSpeed, kind: m.kind, removable: true })
    runningSpeed = after
  }
  // Condition speed (Grappled/Restrained → 0; Prone/Exhaustion 2+ → half) applies LAST,
  // as a realized delta off the post-multiplier speed.
  let effectiveSpeed = runningSpeed
  let conditionSpeedDelta = 0
  if (conditionEffects.speed) {
    effectiveSpeed = conditionEffects.speed.mode === 'zero' ? 0 : Math.floor(runningSpeed / 2)
    conditionSpeedDelta = effectiveSpeed - runningSpeed
  }
  const effectiveInitiativeBonus = (character.initiativeBonus ?? 0) + featInitiativeBonus + itemEffects.initiative
  const effectiveInitiative = dexMod + effectiveInitiativeBonus

  // ── Modifier Ledger provenance (P1: speed + initiative) ───────────────────
  // Built ALONGSIDE the sums above; each list reconstructs its effective value exactly
  // (dev assertion below). No stored override layer yet — that's P2.
  const speedBreakdown: ModifierSource[] = [
    { id: 'base:race:speed', label: 'Base speed', amount: character.speed, kind: 'base', removable: false },
    ...featSpeedSources.map(s => ({ id: `feat:${s.slug}:speed`, label: `${s.name} (feat)`, amount: s.amount, kind: 'feat' as const, removable: true })),
    ...itemEffects.speedSources.map(s => ({ id: `item:${slugifyName(s.name)}:speed`, label: `${s.name} (item)`, amount: s.amount, kind: 'item' as const, removable: true })),
    ...featureFx.speed.map(s => ({ id: `feature:${slugifyName(s.label)}:speed`, label: `${s.label} (feature)`, amount: s.amount, kind: 'feature' as const, removable: true })),
    ...speedExtraRows,
    ...(conditionSpeedDelta !== 0 ? [{ id: 'condition:speed:speed', label: `${conditionEffects.speed!.label} (${conditionEffects.speed!.mode === 'zero' ? 'speed 0' : 'speed halved'})`, amount: conditionSpeedDelta, kind: 'condition' as const, removable: true }] : []),
  ]
  const initiativeBreakdown: ModifierSource[] = [
    { id: 'abilityMod:dex:initiative', label: 'DEX modifier', amount: dexMod, kind: 'abilityMod', removable: false },
    ...((character.initiativeBonus ?? 0) !== 0
      ? [{ id: 'manual:base:initiative', label: 'Manual bonus', amount: character.initiativeBonus, kind: 'manual' as const, removable: true }]
      : []),
    ...featInitSources.map(s => ({ id: `feat:${s.slug}:initiative`, label: `${s.name} (feat)`, amount: s.amount, kind: 'feat' as const, removable: true })),
    ...itemEffects.initiativeSources.map(s => ({ id: `item:${slugifyName(s.name)}:initiative`, label: `${s.name} (item)`, amount: s.amount, kind: 'item' as const, removable: true })),
  ]
  // INV: a breakdown must reconstruct the effective value exactly — guards the refactor.
  const sumModifiers = (a: ModifierSource[]) => a.reduce((t, c) => t + c.amount, 0)
  console.assert(sumModifiers(speedBreakdown) === effectiveSpeed, '[ledger] speed breakdown ≠ effectiveSpeed', sumModifiers(speedBreakdown), effectiveSpeed)
  console.assert(sumModifiers(initiativeBreakdown) === effectiveInitiative, '[ledger] initiative breakdown ≠ effectiveInitiative', sumModifiers(initiativeBreakdown), effectiveInitiative)

  // ── Effective save proficiencies (class + feat + always-on feature) ───────
  const featureSaveProfs: AbilityName[] = []
  for (const sp of featureFx.saveProf) {
    if (sp.ability === 'all') ALL_ABILITIES.forEach(a => featureSaveProfs.push(a))
    else featureSaveProfs.push(sp.ability)
  }
  const customSaveProfGrants = activeSetGrants.filter(g => g.target === 'saveProf').map(g => g.value as AbilityName)
  const effectiveSaveProficiencies: AbilityName[] = [
    ...new Set([...character.savingThrowProficiencies, ...featDerivedSaves, ...featureSaveProfs, ...customSaveProfGrants]),
  ]

  // ── Skill and save modifiers (pre-computed for display and dice rolls) ─────
  // Each modifier is built alongside its ledger breakdown (ability mod · proficiency/
  // expertise · flat feat/item bonuses) — the list sums to the modifier (asserted below).
  const skillModifiers = {} as Record<SkillName, number>
  const skillBreakdowns = {} as Record<SkillName, ModifierSource[]>
  for (const skill of Object.keys(SKILL_ABILITY_MAP) as SkillName[]) {
    const ability = SKILL_ABILITY_MAP[skill]
    const abilMod = abilityModifier(effectiveAbilities[ability])
    const prof = effectiveSkillProficiencies[skill]
    const profMod = prof ? pb * (prof === 'expertise' ? 2 : 1) : 0
    const flatBonus = flatSkillBonuses[skill] ?? 0
    skillModifiers[skill] = abilMod + profMod + flatBonus

    const rows: ModifierSource[] = [
      { id: `abilityMod:${ability}:skill-${skill}`, label: `${ABILITY_ABBR[ability]} modifier`, amount: abilMod, kind: 'abilityMod', removable: false },
    ]
    if (prof) {
      const fromRace = prof === 'proficient' && raceSkillGrants.includes(skill)
      rows.push({
        id: `proficiency:${prof}:skill-${skill}`,
        label: prof === 'expertise' ? 'Expertise (2×PB)' : fromRace ? 'Proficiency (racial)' : 'Proficiency (PB)',
        amount: profMod, kind: fromRace ? 'race' : 'proficiency', removable: false,
      })
    }
    for (const s of flatSkillBonusSources.filter(s => s.skill === skill)) {
      rows.push({ id: s.id, label: s.label, amount: s.amount, kind: s.kind, removable: true })
    }
    skillBreakdowns[skill] = rows
    console.assert(rows.reduce((t, c) => t + c.amount, 0) === skillModifiers[skill], `[ledger] ${skill} breakdown ≠ skill modifier`)
  }

  const saveModifiers = {} as Record<AbilityName, number>
  const saveBreakdowns = {} as Record<AbilityName, ModifierSource[]>
  for (const ability of ALL_ABILITIES) {
    const abilMod = abilityModifier(effectiveAbilities[ability])
    const itemSave = itemEffects.saveBonuses[ability] ?? 0
    const isProficient = effectiveSaveProficiencies.includes(ability)
    // Always-on feature save bonuses: flat (save_bonus) + derived-from-stat
    // (Aura of Protection = +CHA to all saves, min 1).
    const featSaveRows = [
      ...featureFx.saveBonus.filter(b => b.ability === ability || b.ability === 'all')
        .map(b => ({ label: b.label, amount: b.amount })),
      ...featureFx.derivedSave.filter(d => d.ability === ability || d.ability === 'all')
        .map(d => ({ label: `${d.label} (+${ABILITY_ABBR[d.from]})`, amount: Math.max(d.min, abilityModifier(effectiveAbilities[d.from])) })),
    ]
    const featSaveTotal = featSaveRows.reduce((t, r) => t + r.amount, 0)
    saveModifiers[ability] = abilMod + (isProficient ? pb : 0) + itemSave + featSaveTotal

    const rows: ModifierSource[] = [
      { id: `abilityMod:${ability}:save-${ability}`, label: `${ABILITY_ABBR[ability]} modifier`, amount: abilMod, kind: 'abilityMod', removable: false },
    ]
    if (isProficient) rows.push({ id: `proficiency:save:${ability}`, label: 'Proficiency (PB)', amount: pb, kind: 'proficiency', removable: false })
    for (const s of itemEffects.saveBonusSources) {
      if (s.ability === ability || s.ability === 'all') {
        rows.push({ id: `item:${slugifyName(s.name)}:save-${ability}`, label: s.name, amount: s.amount, kind: 'item', removable: true })
      }
    }
    for (const r of featSaveRows) rows.push({ id: `feature:${slugifyName(r.label)}:save-${ability}`, label: r.label, amount: r.amount, kind: 'feature', removable: true })
    saveBreakdowns[ability] = rows
    console.assert(rows.reduce((t, c) => t + c.amount, 0) === saveModifiers[ability], `[ledger] ${ability} save breakdown ≠ save modifier`)
  }

  // ── Passive stats ─────────────────────────────────────────────────────────
  let passivePercBonus = 0
  let passiveInvBonus = 0
  for (const slug of character.feats) {
    const e = FEAT_EFFECTS[slug]
    if (e?.passivePerceptionBonus) passivePercBonus += e.passivePerceptionBonus
    if (e?.passiveInvestigationBonus) passiveInvBonus += e.passiveInvestigationBonus
  }
  // Passive Perception/Investigation are recomputed from the post-ledger skill
  // modifiers in the final ledger block, below (passivePercBonus/passiveInvBonus
  // carry the feat bonuses there).

  // ── Spell stats ───────────────────────────────────────────────────────────
  // First class with a spellcasting ability — the primary class may be a
  // non-caster in a multiclass (e.g. Fighter 5 / Wizard 3)
  const castingClass = classRecords.find(c => c.spellcasting?.ability) ?? null
  let spellAttackBonus = 0
  let spellSaveDC = 0
  const spellAttackBreakdown: ModifierSource[] = []
  const spellSaveDCBreakdown: ModifierSource[] = []
  if (castingClass?.spellcasting?.ability) {
    const spellAbilKey = ABILITY_FULL_TO_SHORT[castingClass.spellcasting.ability.toLowerCase()] ?? 'int'
    const spellAbilMod = abilityModifier(effectiveAbilities[spellAbilKey])
    const manualBonus = character.spellBonusModifier ?? 0

    // Spell-focus bonuses come from active items' `spell_attack`/`spell_save_dc`
    // effects (computeActiveItemEffects). The manual spellBonusModifier remains a
    // homebrew override for un-cataloged focuses.
    spellAttackBonus = spellAbilMod + pb + itemEffects.spellAttack + manualBonus
    spellSaveDC = 8 + spellAbilMod + pb + itemEffects.spellSaveDC + manualBonus

    const abilAbbr = ABILITY_ABBR[spellAbilKey]
    spellAttackBreakdown.push(
      { id: `abilityMod:${spellAbilKey}:spellAttack`, label: `${abilAbbr} modifier`, amount: spellAbilMod, kind: 'abilityMod', removable: false },
      { id: 'proficiency:level:spellAttack', label: 'Proficiency bonus', amount: pb, kind: 'proficiency', removable: false },
      ...itemEffects.spellAttackSources.map(s => ({ id: `item:${slugifyName(s.name)}:spellAttack`, label: s.name, amount: s.amount, kind: 'item' as const, removable: true })),
    )
    spellSaveDCBreakdown.push(
      { id: 'base:dc:spellSaveDC', label: 'Base DC', amount: 8, kind: 'base', removable: false },
      { id: `abilityMod:${spellAbilKey}:spellSaveDC`, label: `${abilAbbr} modifier`, amount: spellAbilMod, kind: 'abilityMod', removable: false },
      { id: 'proficiency:level:spellSaveDC', label: 'Proficiency bonus', amount: pb, kind: 'proficiency', removable: false },
      ...itemEffects.spellSaveDCSources.map(s => ({ id: `item:${slugifyName(s.name)}:spellSaveDC`, label: s.name, amount: s.amount, kind: 'item' as const, removable: true })),
    )
    if (manualBonus) {
      spellAttackBreakdown.push({ id: 'manual:base:spellAttack', label: 'Manual focus override', amount: manualBonus, kind: 'manual', removable: true })
      spellSaveDCBreakdown.push({ id: 'manual:base:spellSaveDC', label: 'Manual focus override', amount: manualBonus, kind: 'manual', removable: true })
    }
    console.assert(spellAttackBreakdown.reduce((t, c) => t + c.amount, 0) === spellAttackBonus, '[ledger] spell attack breakdown ≠ spellAttackBonus')
    console.assert(spellSaveDCBreakdown.reduce((t, c) => t + c.amount, 0) === spellSaveDC, '[ledger] spell save DC breakdown ≠ spellSaveDC')
  }

  // ── Effective AC (one exclusive base + additive bonuses; itemized for the ledger) ──
  // RAW: a creature uses exactly ONE base AC formula (worn armor, an item set-base, or
  // Unarmored Defense), then adds shield + protection + fighting-style bonuses. Each
  // contributor is recorded as a ModifierSource and the list sums to effectiveAC.
  let hasStealthDisadvantage = false
  let hasBodyArmor = false
  const acSources: ModifierSource[] = []
  const acConMod = abilityModifier(effectiveAbilities.con)
  const acWisMod = abilityModifier(effectiveAbilities.wis)
  const hasBarbarian = (character.classes ?? []).some(c => c.classSlug === 'barbarian')
  const hasMonk = (character.classes ?? []).some(c => c.classSlug === 'monk')
  // Racial natural armor (Lizardfolk 13 + DEX, Tortle 17) competes with Unarmored
  // Defense — RAW they don't stack; use whichever base is higher (udAC below needs hasShield).
  const naturalArmor = raceEffects.naturalArmor
  const naturalArmorDex = naturalArmor?.addDex ? Math.min(dexMod, naturalArmor.maxDex) : 0
  const naturalArmorAC = naturalArmor ? naturalArmor.base + naturalArmorDex : null

  // Resolve the worn body armor + shield (only *worn* pieces — equipped or attuned — count).
  let bodyArmorRec: ArmorItem | null = null
  let bodyArmorName = ''
  let shieldRec: ArmorItem | null = null
  let shieldName = ''
  if (catalog?.armor) {
    const armorByName = new Map(catalog.armor.map(a => [a.name.toLowerCase(), a]))
    const worn = character.equipment.filter(
      e => armorByName.has(e.name.toLowerCase()) && (e.equipped || e.attuned),
    )
    const body = worn.find(e => armorByName.get(e.name.toLowerCase())!.armor_type !== 'Shield')
    const shield = worn.find(e => armorByName.get(e.name.toLowerCase())!.armor_type === 'Shield')
    if (body) { bodyArmorName = body.name; bodyArmorRec = resolveArmor(body, armorByName.get(body.name.toLowerCase())!, armorByName) }
    if (shield) { shieldName = shield.name; shieldRec = resolveArmor(shield, armorByName.get(shield.name.toLowerCase())!, armorByName) }
  }
  hasBodyArmor = bodyArmorRec != null
  const hasShield = shieldRec != null
  const udApplies = hasBarbarian || (hasMonk && !hasShield)
  const udAbilityMod = hasBarbarian ? acConMod : acWisMod
  const udAC = udApplies ? 10 + dexMod + udAbilityMod : null

  // 1. BASE — exactly one, mutually exclusive.
  let baseEstablished = false
  if (hasBodyArmor) {
    if (bodyArmorRec!.stealth_disadvantage) hasStealthDisadvantage = true
    // "Varies" (variable-base magic armor, no mundane base chosen) → leave base unset → manual fallback.
    if (!bodyArmorRec!.ac_formula.trim().toLowerCase().startsWith('varies')) {
      acSources.push({ id: `armor:${slugifyName(bodyArmorName)}:ac`, label: bodyArmorName, amount: parseArmorAC(bodyArmorRec!.ac_formula, dexMod), kind: 'item', removable: false })
      const magic = bodyArmorRec!.bonus ?? 0
      if (magic) acSources.push({ id: `armor:${slugifyName(bodyArmorName)}:ac-magic`, label: `${bodyArmorName} (enchantment)`, amount: magic, kind: 'item', removable: true })
      baseEstablished = true
    }
  } else if (itemEffects.unarmoredAcBase != null) {
    // Item set-base (Robe of the Archmagi → 15 + DEX)
    acSources.push({ id: 'item:unarmored-base:ac', label: 'Unarmored base (item)', amount: itemEffects.unarmoredAcBase, kind: 'item', removable: false })
    acSources.push({ id: 'abilityMod:dex:ac', label: 'DEX modifier', amount: dexMod, kind: 'abilityMod', removable: false })
    baseEstablished = true
  } else if (naturalArmorAC != null || udAC != null) {
    // Natural armor vs Unarmored Defense — pick the higher base (they don't stack).
    const useNatural = naturalArmorAC != null && (udAC == null || naturalArmorAC >= udAC)
    if (useNatural) {
      acSources.push({ id: 'race:natural-armor:ac', label: 'Natural Armor', amount: naturalArmor!.base, kind: 'race', removable: true })
      if (naturalArmor!.addDex) acSources.push({ id: 'abilityMod:dex:ac', label: naturalArmor!.maxDex < Infinity ? `DEX modifier (max ${naturalArmor!.maxDex})` : 'DEX modifier', amount: naturalArmorDex, kind: 'abilityMod', removable: false })
    } else {
      // Unarmored Defense — Barbarian 10+DEX+CON (shield allowed); Monk 10+DEX+WIS (no shield).
      acSources.push({ id: 'base:unarmored:ac', label: 'Unarmored base', amount: 10, kind: 'base', removable: false })
      acSources.push({ id: 'abilityMod:dex:ac', label: 'DEX modifier', amount: dexMod, kind: 'abilityMod', removable: false })
      if (hasBarbarian) acSources.push({ id: 'feature:barbarian-unarmored-defense:ac', label: 'CON (Unarmored Defense)', amount: acConMod, kind: 'feature', removable: true })
      else acSources.push({ id: 'feature:monk-unarmored-defense:ac', label: 'WIS (Unarmored Defense)', amount: acWisMod, kind: 'feature', removable: true })
    }
    baseEstablished = true
  } else if (hasShield) {
    // Unarmored but wielding a shield → plain 10 + DEX base (the shield is added below).
    acSources.push({ id: 'base:unarmored:ac', label: 'Unarmored base', amount: 10, kind: 'base', removable: false })
    acSources.push({ id: 'abilityMod:dex:ac', label: 'DEX modifier', amount: dexMod, kind: 'abilityMod', removable: false })
    baseEstablished = true
  }

  // 2. Additive bonuses on top of whatever base applies.
  const acAdditive: ModifierSource[] = []
  if (hasShield) {
    acAdditive.push({ id: `armor:${slugifyName(shieldName)}:ac`, label: shieldName, amount: parseArmorAC(shieldRec!.ac_formula, dexMod) + (shieldRec!.bonus ?? 0), kind: 'item', removable: true })
  }
  if (!hasBodyArmor && itemEffects.unarmoredAcBonus !== 0) {
    acAdditive.push({ id: 'item:unarmored-ac-bonus:ac', label: 'Unarmored AC (item)', amount: itemEffects.unarmoredAcBonus, kind: 'item', removable: true })
  }
  if (itemEffects.acBonus !== 0) {
    acAdditive.push({ id: 'item:ac-protection:ac', label: 'Protection (item)', amount: itemEffects.acBonus, kind: 'item', removable: true })
  }
  if (featureFx.acAlways !== 0) acAdditive.push({ id: 'feature:ac-always:ac', label: 'Feature bonus', amount: featureFx.acAlways, kind: 'feature', removable: true })
  if (featureFx.acArmored !== 0 && hasBodyArmor) acAdditive.push({ id: 'feature:defense-style:ac', label: 'Defense (fighting style)', amount: featureFx.acArmored, kind: 'feature', removable: true })
  if (featureFx.acUnarmored !== 0 && !hasBodyArmor) acAdditive.push({ id: 'feature:ac-unarmored:ac', label: 'Feature bonus (unarmored)', amount: featureFx.acUnarmored, kind: 'feature', removable: true })

  // 3. Resolve. The AC value is always itemized (so the breakdown/pencil works everywhere),
  //    even when it falls back to the editable manual stepper (effectiveAC stays null then).
  let effectiveAC: number | null = null
  if (baseEstablished) {
    acSources.push(...acAdditive)
    effectiveAC = acSources.reduce((t, c) => t + c.amount, 0)
  } else if (acAdditive.length > 0) {
    // No computable base but there are bonuses → anchor on the manual armorClass
    // (preserves a caster's manually-entered Mage Armor value).
    acSources.push({ id: 'manual:base:ac', label: 'Manual AC', amount: character.armorClass, kind: 'manual', removable: false })
    acSources.push(...acAdditive)
    effectiveAC = acSources.reduce((t, c) => t + c.amount, 0)
  } else {
    // Pure manual AC (plain unarmored, or unresolved variable-base armor): keep the editable
    // stepper, but still itemize the value so the pencil/breakdown is available.
    acSources.push({ id: 'manual:base:ac', label: 'Manual AC', amount: character.armorClass, kind: 'manual', removable: false })
  }
  // 5b — AC floor (Barkskin → AC ≥ 16): applied AFTER base+additive, only when it raises
  // a computed AC, as a realized-delta row so the breakdown still sums. Skipped when AC is
  // purely manual (effectiveAC null) — a floor needs a computed value to floor.
  if (effectiveAC != null) {
    const acFloors = [
      ...itemEffects.acFloor.map(f => ({ id: `item:${slugifyName(f.name)}:ac-floor`, label: `${f.name} (item)`, value: f.value, kind: 'item' as const })),
      ...featureFx.acFloor.map(f => ({ id: `feature:${slugifyName(f.label)}:ac-floor`, label: `${f.label} (feature)`, value: f.value, kind: 'feature' as const })),
    ]
    const winning = acFloors.filter(f => f.value > effectiveAC!).sort((a, b) => b.value - a.value)[0]
    if (winning) {
      acSources.push({ id: winning.id, label: `${winning.label} — AC ≥ ${winning.value}`, amount: winning.value - effectiveAC, kind: winning.kind, removable: true })
      effectiveAC = winning.value
    }
  }
  // INV: when AC is auto-computed, the itemized list reconstructs it exactly.
  console.assert(effectiveAC === null || acSources.reduce((t, c) => t + c.amount, 0) === effectiveAC, '[ledger] AC breakdown ≠ effectiveAC')

  // Proficiency bonus is a single derived value (by total level) — itemized for ledger parity.
  const proficiencyBonusBreakdown: ModifierSource[] = [
    { id: 'base:level:proficiencyBonus', label: `Level ${character.level}`, amount: pb, kind: 'base', removable: false },
  ]

  // ── Adjusted Max HP ───────────────────────────────────────────────────────
  const maxHpBreakdown: ModifierSource[] = [
    { id: 'base:hp:maxHp', label: 'Base HP', amount: character.maxHp, kind: 'base', removable: false },
  ]
  let hpBonus = 0
  for (const slug of character.feats) {
    const effect = FEAT_EFFECTS[slug]
    if (effect?.maxHpBonus) {
      const amount = effect.maxHpBonus(character.level)
      hpBonus += amount
      if (amount) maxHpBreakdown.push({ id: `feat:${slug}:maxHp`, label: featData?.[slug]?.name ?? slug, amount, kind: 'feat', removable: true })
    }
  }
  for (const s of featMaxHpSources) {
    hpBonus += s.amount
    maxHpBreakdown.push({ id: `feat:${s.slug}:maxHp`, label: s.name, amount: s.amount, kind: 'feat', removable: true })
  }
  // Per-level racial HP (Dwarven Toughness, etc.) — data-driven from the subrace's
  // hp_bonus_per_level (single source; the legacy SUBRACE_HP_BONUS map is retired).
  const subraceHpBonus = raceEffects.hpPerLevel * character.level
  if (subraceHpBonus) maxHpBreakdown.push({ id: `subrace:${slugifyName(character.subrace ?? 'subrace')}:maxHp`, label: `${character.subrace ?? 'Subrace'} (per level)`, amount: subraceHpBonus, kind: 'subrace', removable: true })
  for (const s of itemEffects.maxHpSources) {
    maxHpBreakdown.push({ id: `item:${slugifyName(s.name)}:maxHp`, label: s.name, amount: s.amount, kind: 'item', removable: true })
  }
  let featureHp = 0
  for (const s of featureFx.maxHp) {
    featureHp += s.amount
    maxHpBreakdown.push({ id: `feature:${slugifyName(s.label)}:maxHp`, label: s.label, amount: s.amount, kind: 'feature', removable: true })
  }
  const additiveMaxHp = character.maxHp + hpBonus + subraceHpBonus + itemEffects.maxHp + featureHp
  // Exhaustion level 4 halves the maximum — applied as a realized delta (set, not additive).
  let adjustedMaxHp = additiveMaxHp
  if (conditionEffects.maxHpHalf) {
    adjustedMaxHp = Math.floor(additiveMaxHp / 2)
    maxHpBreakdown.push({ id: 'condition:maxhp:maxHp', label: `${conditionEffects.maxHpHalf.label} (HP halved)`, amount: adjustedMaxHp - additiveMaxHp, kind: 'condition', removable: true })
  }
  console.assert(maxHpBreakdown.reduce((t, c) => t + c.amount, 0) === adjustedMaxHp, '[ledger] maxHp breakdown ≠ adjustedMaxHp')

  // ── Hit dice type ─────────────────────────────────────────────────────────
  const hitDiceType = classData ? parseInt(classData.hit_die.replace('d', ''), 10) : 8

  // ── Weapon / armor proficiencies (union: classes + racial + feature + feat grants) ──
  const weaponProficiencies = [
    ...new Set([
      ...classRecords.flatMap(c => c.weapon_proficiencies.map(p => p.toLowerCase())),
      ...raceEffects.weaponProficiencies,
      ...featureFx.weaponProf,
      ...featWeaponProf,
    ]),
  ]
  const armorProficiencies = [
    ...new Set([
      ...classRecords.flatMap(c => c.armor_proficiencies.map(p => p.toLowerCase())),
      ...raceEffects.armorProficiencies,
      ...featureFx.armorProf,
      ...featArmorProf,
    ]),
  ]

  // ── Damage resistances / immunities — with provenance + ledger disable (Step 6b) ──
  // Each granting source becomes a SetGrantSource (id keyed by kind+type so it can be
  // disabled); the EFFECTIVE lists are the non-disabled values, deduped. Custom set
  // grants ride the same path (ledgerDisabled / allSetGrants computed earlier).
  const buildSetSources = (
    tag: 'resist' | 'immune',
    items: string[], race: string[], feats: string[],
    features: { label: string; damageType: string }[],
    customs: { id: string; label: string; value: string }[],
  ): SetGrantSource[] => {
    const out: SetGrantSource[] = []
    const add = (id: string, value: string, label: string, kind: ModifierKind) =>
      out.push({ id, value, label, kind, disabled: ledgerDisabled.has(id) })
    for (const t of items) add(`item:${tag}:${t}`, t, 'Item', 'item')
    for (const t of race) add(`race:${tag}:${t}`, t, 'Racial', 'race')
    for (const t of feats) add(`feat:${tag}:${t}`, t, 'Feat', 'feat')
    for (const f of features) add(`feature:${slugifyName(f.label)}:${tag}:${f.damageType}`, f.damageType, f.label, 'feature')
    for (const c of customs) add(c.id, c.value.toLowerCase(), c.label, 'custom')
    return out
  }

  const resistanceSources = buildSetSources(
    'resist', itemEffects.resistances, raceEffects.resistances, featResistances,
    featureFx.resistances, allSetGrants.filter(g => g.target === 'resistance'),
  )
  const immunitySources = buildSetSources(
    'immune', itemEffects.immunities, raceEffects.immunities, [],
    featureFx.immunities, allSetGrants.filter(g => g.target === 'immunity'),
  )
  const resistances = [...new Set(resistanceSources.filter(s => !s.disabled).map(s => s.value))]
  const immunities = [...new Set(immunitySources.filter(s => !s.disabled).map(s => s.value))]

  // ── Advantages / disadvantages (labeled sources, netted per RAW) ──────────
  // Collect every adv/dis source with its label (ledger provenance), then net per
  // target: any advantage + any disadvantage cancel to normal.
  const rollStateSources: { saves: Partial<Record<AbilityName, RollAdvSource[]>>; skills: Partial<Record<SkillName, RollAdvSource[]>> } =
    getCharacterAdvantages(character)
  // Always-on feature adv/dis (e.g. Danger Sense → DEX save advantage).
  for (const a of featureFx.advDis) {
    const src: RollAdvSource = { mode: a.mode, label: a.label, kind: 'feature' }
    if (a.target === 'save') {
      const abs = a.ability === 'all' ? ALL_ABILITIES : a.ability ? [a.ability] : []
      for (const ab of abs) (rollStateSources.saves[ab] ??= []).push(src)
    } else if (a.skill) {
      (rollStateSources.skills[a.skill] ??= []).push(src)
    }
  }
  // Active-item adv/dis (data-driven `advantage`/`disadvantage` ItemEffects — Step 5e).
  for (const a of itemEffects.advDis) {
    const src: RollAdvSource = { mode: a.mode, label: `${a.label} (item)`, kind: 'item' }
    if (a.target === 'save') {
      const abs = a.ability === 'all' ? ALL_ABILITIES : a.ability ? [a.ability] : []
      for (const ab of abs) (rollStateSources.saves[ab] ??= []).push(src)
    } else if (a.skill) {
      (rollStateSources.skills[a.skill] ??= []).push(src)
    }
  }
  // Player/DM custom adv/dis grants (Modifier Ledger, always-on — Step 6c). Disabled
  // ones (id in ledgerOverrides.disabled) are suppressed, like any ledger row.
  {
    for (const a of character.ledgerOverrides?.customAdvDis ?? []) {
      // Pushed even when disabled (struck-through in the breakdown); the tag pass below
      // sets the `disabled` flag from its id, and netSources skips it.
      const src: RollAdvSource = { mode: a.mode, label: a.label, kind: 'custom', id: a.id }
      if (a.target === 'save') {
        const abs = a.ability === 'all' ? ALL_ABILITIES : a.ability ? [a.ability] : []
        for (const ab of abs) (rollStateSources.saves[ab] ??= []).push(src)
      } else if (a.skill) {
        (rollStateSources.skills[a.skill] ??= []).push(src)
      }
    }
  }
  // Armor stealth disadvantage.
  if (hasStealthDisadvantage) {
    (rollStateSources.skills.stealth ??= []).push({ mode: 'dis', label: `${bodyArmorName || 'Armor'} (stealth)`, kind: 'item', id: 'advdis:item:armor-stealth' })
  }
  // Conditions: disadvantage on EVERY ability check / saving throw (Poisoned,
  // Frightened, Exhaustion, …).
  if (conditionEffects.skillDis.length) {
    for (const sk of Object.keys(SKILL_ABILITY_MAP) as SkillName[]) {
      for (const src of conditionEffects.skillDis) (rollStateSources.skills[sk] ??= []).push(src)
    }
  }
  for (const e of conditionEffects.saveDis) {
    const abs = e.ability === 'all' ? ALL_ABILITIES : [e.ability]
    for (const ab of abs) (rollStateSources.saves[ab] ??= []).push(e.src)
  }
  // 6b-3: tag every standing source with a stable id (except conditions — not
  // disableable) + a `disabled` flag from the ledger, so each can be toggled off and
  // still render struck-through. The same source object shared across targets is tagged
  // once. netSources then nets only the ENABLED sources.
  const tagAdvSource = (s: RollAdvSource) => {
    if (s.id === undefined && s.kind !== 'condition') {
      s.id = `advdis:${s.kind}:${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    }
    s.disabled = s.id ? ledgerDisabled.has(s.id) : false
  }
  for (const ab of ALL_ABILITIES) rollStateSources.saves[ab]?.forEach(tagAdvSource)
  for (const sk of Object.keys(SKILL_ABILITY_MAP) as SkillName[]) rollStateSources.skills[sk]?.forEach(tagAdvSource)

  const netSources = (srcs?: RollAdvSource[]): RollMode | undefined => {
    const live = srcs?.filter(s => !s.disabled)
    const a = !!live?.some(s => s.mode === 'adv'), d = !!live?.some(s => s.mode === 'dis')
    return a === d ? undefined : a ? 'adv' : 'dis'
  }
  const rollStates: { saves: Partial<Record<AbilityName, RollMode>>; skills: Partial<Record<SkillName, RollMode>> } = { saves: {}, skills: {} }
  for (const ab of ALL_ABILITIES) { const m = netSources(rollStateSources.saves[ab]); if (m) rollStates.saves[ab] = m }
  for (const sk of Object.keys(SKILL_ABILITY_MAP) as SkillName[]) { const m = netSources(rollStateSources.skills[sk]); if (m) rollStates.skills[sk] = m }
  // Attack-roll adv/dis (from conditions: Poisoned/Prone/Restrained → dis, Invisible →
  // adv, Exhaustion 3+ → dis). The weapon/spell Hit buttons read this.
  const attackRollSources = conditionEffects.attack
  const attackRollState = netSources(attackRollSources)

  // Roll-time: Reliable Talent at Rogue level ≥ 11 (owning-class level — INV-2).
  const reliableTalent = (character.classes ?? []).some(c => c.classSlug === 'rogue' && c.level >= 11)
  // Roll-time: the Lucky feat (slug 'lucky') gates the modal's Lucky reroll button.
  const hasLuckyFeat = (character.feats ?? []).includes('lucky')

  // 6a — apply the ledger override layer to every LEAF stat as the final derive step
  // (abilities were applied early — they cascade). Each yields the final breakdown rows
  // (disabled/overridden flags + custom rows) and effective value; passives recompute
  // from the post-ledger skill modifiers. AC stays manual (null) when uncomputed.
  const lo = character.ledgerOverrides
  const speedL = applyLedger('speed', speedBreakdown, lo)
  const initL = applyLedger('initiative', initiativeBreakdown, lo)
  const acL = effectiveAC != null ? applyLedger('ac', acSources, lo) : null
  const maxHpL = applyLedger('maxHp', maxHpBreakdown, lo)
  const spellAtkL = applyLedger('spellAttack', spellAttackBreakdown, lo)
  const spellDcL = applyLedger('spellSaveDC', spellSaveDCBreakdown, lo)
  const saveBreakdownsFinal = {} as Record<AbilityName, ModifierSource[]>
  const saveModifiersFinal = {} as Record<AbilityName, number>
  for (const ab of ALL_ABILITIES) {
    const r = applyLedger(`save:${ab}`, saveBreakdowns[ab], lo)
    saveBreakdownsFinal[ab] = r.rows; saveModifiersFinal[ab] = r.effective
  }
  const skillBreakdownsFinal = {} as Record<SkillName, ModifierSource[]>
  const skillModifiersFinal = {} as Record<SkillName, number>
  for (const sk of Object.keys(SKILL_ABILITY_MAP) as SkillName[]) {
    const r = applyLedger(`skill:${sk}`, skillBreakdowns[sk], lo)
    skillBreakdownsFinal[sk] = r.rows; skillModifiersFinal[sk] = r.effective
  }
  const passivePerceptionFinal = 10 + skillModifiersFinal.perception + passivePercBonus
  const passiveInvestigationFinal = 10 + skillModifiersFinal.investigation + passiveInvBonus

  return {
    effectiveAC: acL ? acL.effective : effectiveAC,
    adjustedMaxHp: maxHpL.effective,
    effectiveAbilities,
    effectiveSpeed: speedL.effective,
    effectiveInitiative: initL.effective,
    effectiveInitiativeBonus,
    effectiveSaveProficiencies,
    proficiencyBonus: pb,
    skillModifiers: skillModifiersFinal,
    saveModifiers: saveModifiersFinal,
    flatSkillBonuses,
    passivePerception: passivePerceptionFinal,
    passiveInvestigation: passiveInvestigationFinal,
    spellAttackBonus: spellAtkL.effective,
    spellSaveDC: spellDcL.effective,
    hasStealthDisadvantage,
    hitDiceType,
    reliableTalent,
    hasLuckyFeat,
    rollStates,
    rollStateSources,
    attackRollState,
    attackRollSources,
    activeConditions: conditionEffects.active,
    effectiveSkillProficiencies,
    featSkillGrants,
    raceSkillGrants,
    weaponProficiencies,
    armorProficiencies,
    raceToolGrants: [...new Set([...raceEffects.toolProficiencies, ...featureFx.toolProf, ...featToolProf])],
    raceGrantedLanguages: [...new Set([...raceEffects.languages, ...featLanguages, ...customLangs])],
    senses: customSenseGrants.reduce(
      (acc, g) => { const k = g.value.toLowerCase(); acc[k] = Math.max(acc[k] ?? 0, g.amount ?? 0); return acc },
      { ...raceEffects.senses },
    ),
    customSkillGrants,
    itemDamageBonus: itemEffects.damage,
    itemAttackBonus: itemEffects.attack,
    itemSpellDamageBonus: itemEffects.spellDamage,
    unarmedStrike: itemEffects.unarmed,
    itemGrantedLanguages: itemEffects.languages,
    resistances,
    immunities,
    resistanceSources,
    immunitySources,
    featureWeaponEffects: featureFx.weaponEffects,
    greatWeaponFighting: featureFx.greatWeaponFighting,
    breakdowns: {
      speed: speedL.rows,
      initiative: initL.rows,
      ac: acL ? acL.rows : acSources,
      proficiencyBonus: proficiencyBonusBreakdown,
      abilities: abilityBreakdowns,
      saves: saveBreakdownsFinal,
      skills: skillBreakdownsFinal,
      maxHp: maxHpL.rows,
      spellAttack: spellAtkL.rows,
      spellSaveDC: spellDcL.rows,
    },
  }
}
