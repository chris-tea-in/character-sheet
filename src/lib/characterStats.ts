import { abilityModifier, proficiencyBonus, SKILL_ABILITY_MAP, SKILL_DISPLAY_MAP, formatBonus } from './dice'
import { ABILITY_FULL_TO_SHORT, getRacialBonuses } from './racialBonuses'
import type { Character, AbilityName, Abilities, SkillName, SkillProficiency, EquipmentItem } from '../types/character'
import type { ArmorItem, WeaponItem, ClassData, FeatData, Race, WondrousItem, ItemEffect } from '../types/data'

export interface WeaponBonus {
  toHit: string
  damage: string
  damageDice: string
  damageBonus: number
  damageType: string
  abilityLabel: string
  toHitModifier: number
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
  advantages: { saves: Set<AbilityName>; skills: Set<SkillName> }
  effectiveSkillProficiencies: Partial<Record<SkillName, SkillProficiency>>
  // Skills whose effective proficiency/expertise comes from a feat (not the
  // stored record) — the UI shows these filled but locked so a dot click can't
  // write a duplicate stored copy (BUG-30)
  featSkillGrants: { proficient: SkillName[]; expertise: SkillName[] }
  weaponProficiencies: string[]
  // Flat damage bonus from attuned items — added to weapon and unarmed damage
  itemDamageBonus: number
  // Unarmed-strike override from attuned items (e.g. Demon Armor → 1d8 slashing)
  unarmedStrike: { dice?: string; damageType?: string; attackBonus: number; damageBonus: number }
  // Languages granted by active items (e.g. Demon Armor → Abyssal) — derived, never stored
  itemGrantedLanguages: string[]
  // Damage resistances / immunities granted by active items — derived, read-only display
  resistances: string[]
  immunities: string[]
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

// ── Subrace HP bonus registry ────────────────────────────────────────────────

const SUBRACE_HP_BONUS: Partial<Record<string, (level: number) => number>> = {
  'hill-dwarf': level => level,  // Dwarven Toughness: +1 HP per level
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

// ── Advantage registry ───────────────────────────────────────────────────────
// Conditions stated in the rules (e.g. "vs poison", "vs charmed") are simplified:
// the sheet maps them to the most relevant ability and applies them broadly.
// Players retain responsibility to roll without advantage when inapplicable.

type AdvantageEntry = { saves?: AbilityName[]; skills?: SkillName[] }

const ALL_SAVES: AbilityName[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

const FEAT_ADVANTAGES: Partial<Record<string, AdvantageEntry>> = {
  'war-caster': { saves: ['con'] },                         // vs concentration break → CON
  'actor':      { skills: ['deception', 'performance'] },   // when impersonating
}

// Fey Ancestry and similar charm/fear resistances → WIS (most charm saves are WIS)
const RACE_ADVANTAGES: Partial<Record<string, AdvantageEntry>> = {
  'dwarf':      { saves: ['con'] },               // Dwarven Resilience vs poison
  'duergar':    { saves: ['con', 'wis'] },         // Dwarven Resilience + vs charm/paralysis
  'elf':        { saves: ['wis'] },               // Fey Ancestry vs charmed
  'eladrin':    { saves: ['wis'] },
  'sea-elf':    { saves: ['wis'] },
  'shadar-kai': { saves: ['wis'] },
  'bugbear':    { saves: ['wis'] },               // Fey Ancestry
  'hobgoblin':  { saves: ['wis'] },               // Fey Ancestry
  'half-elf':   { saves: ['wis'] },               // Fey Ancestry
  'gnome':      { saves: ['int', 'wis', 'cha'] }, // Gnome Cunning vs magic
  'deep-gnome': { saves: ['int', 'wis', 'cha'] }, // Gnome Cunning vs magic
  'githzerai':  { saves: ['wis'] },               // Mental Discipline vs charmed/frightened
  'halfling':   { saves: ['wis'] },               // Brave vs frightened
  'locathah':   { saves: ['wis', 'con'] },         // Leviathan Will vs many conditions
  'satyr':      { saves: ALL_SAVES },             // Magic Resistance vs all spells
  'yuan-ti':    { saves: ALL_SAVES },             // Magic Resistance vs all spells
  'verdan':     { saves: ['wis', 'cha'] },         // Telepathic Insight (unconditional)
}

const SUBRACE_ADVANTAGES: Partial<Record<string, AdvantageEntry>> = {
  'stout': { saves: ['con'] },   // Stout Halfling Resilience vs poison
}

const ITEM_ADV_ENTRIES: Array<{ name: string; entry: AdvantageEntry }> = [
  // Stealth
  { name: 'Boots of Elvenkind',          entry: { skills: ['stealth'] } },
  { name: 'Cloak of Elvenkind',          entry: { skills: ['stealth'] } },
  { name: 'Cloak of the Bat',            entry: { skills: ['stealth'] } },
  { name: 'Shadowfell Brand Tattoo',     entry: { skills: ['stealth'] } },
  { name: 'Piwafwi',                     entry: { skills: ['stealth'] } },
  { name: 'Piwafwi of Fire Resistance',  entry: { skills: ['stealth'] } },
  { name: 'Kagonesti Forest Shroud',     entry: { skills: ['stealth'] } },
  { name: "Nature's Mantle",             entry: { skills: ['stealth'] } },
  // Perception
  { name: 'Rod of Alertness',            entry: { skills: ['perception'] } },
  { name: 'Sentinel Shield',             entry: { skills: ['perception'] } },
  { name: 'Robe of Eyes',               entry: { skills: ['perception'] } },
  { name: 'Eyes of the Eagle',           entry: { skills: ['perception'] } },
  { name: 'Watchful Helm',              entry: { skills: ['perception'] } },
  // Insight
  { name: 'Ring of Truth Telling',       entry: { skills: ['insight'] } },
  { name: "Inquisitive's Goggles",       entry: { skills: ['insight'] } },
  // Persuasion
  { name: 'Gavel of the Venn Rune',     entry: { skills: ['persuasion'] } },
  // Intimidation
  { name: 'Crown of the Wrath Bringer', entry: { skills: ['intimidation'] } },
  { name: 'Skull Helm',                 entry: { skills: ['intimidation'] } },
  // Performance
  { name: "Reveler's Concertina",       entry: { skills: ['performance'] } },
  // Saves
  { name: 'Orb of the Stein Rune',      entry: { saves: ['str'] } },
  { name: 'Platinum Scarf',             entry: { saves: ALL_SAVES } },
]

const ITEM_ADV_MAP = new Map(
  ITEM_ADV_ENTRIES.map(({ name, entry }) => [name.toLowerCase(), entry]),
)

export function getCharacterAdvantages(character: Character): { saves: Set<AbilityName>; skills: Set<SkillName> } {
  const saves = new Set<AbilityName>()
  const skills = new Set<SkillName>()

  function apply(entry: AdvantageEntry) {
    for (const ab of (entry.saves ?? [])) saves.add(ab)
    for (const sk of (entry.skills ?? [])) skills.add(sk)
  }

  for (const slug of character.feats) {
    const entry = FEAT_ADVANTAGES[slug]
    if (entry) apply(entry)
  }

  const raceEntry = RACE_ADVANTAGES[character.race]
  if (raceEntry) apply(raceEntry)

  if (character.subrace) {
    const subraceEntry = SUBRACE_ADVANTAGES[character.subrace.toLowerCase()]
    if (subraceEntry) apply(subraceEntry)
  }

  for (const item of character.equipment) {
    const entry = ITEM_ADV_MAP.get(item.name.toLowerCase())
    if (entry) apply(entry)
  }

  return { saves, skills }
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
): WeaponBonus {
  const abilities = effectiveAbilities ?? character.abilities
  const strMod = abilityModifier(abilities.str)
  const dexMod = abilityModifier(abilities.dex)
  const isFinesse = weapon.properties.some(p => p.toLowerCase().includes('finesse'))
  const isRanged = weapon.weapon_type.toLowerCase().includes('ranged')
  const mod = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod
  const abilityLabel = isFinesse ? (dexMod > strMod ? 'DEX' : 'STR') : isRanged ? 'DEX' : 'STR'
  const pb = isWeaponProficient(weapon, weaponProficiencies) ? proficiencyBonus(character.level) : 0
  const magicBonus = weapon.bonus ?? 0
  const toHitModifier = mod + pb + magicBonus
  // Flat item damage bonus adds to damage only, not to-hit
  const damageBonus = mod + magicBonus + itemDamageBonus
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
  unarmoredAcBonus: number      // flat AC that applies only when no body armor (Bracers of Defense)
  unarmoredAcBase: number | null // sets unarmored AC base (Robe of the Archmagi → 15)
  saveBonuses: Partial<Record<AbilityName, number>>
  abilitySets: Partial<Record<AbilityName, number>>
  abilityBonuses: Partial<Record<AbilityName, number>>
  skillBonuses: Partial<Record<SkillName, number>>
  speed: number
  initiative: number
  damage: number
  maxHp: number
  resistances: string[]
  immunities: string[]
  spellAttack: number
  spellSaveDC: number
  languages: string[]
  unarmed: { dice?: string; damageType?: string; attackBonus: number; damageBonus: number }
}

function computeActiveItemEffects(
  character: Character,
  catalog?: { weapons?: WeaponItem[]; armor?: ArmorItem[]; wondrous_items?: WondrousItem[] } | null,
): ActiveItemEffects {
  const acc: ActiveItemEffects = {
    acBonus: 0, unarmoredAcBonus: 0, unarmoredAcBase: null,
    saveBonuses: {}, abilitySets: {}, abilityBonuses: {},
    skillBonuses: {}, speed: 0, initiative: 0, damage: 0, maxHp: 0,
    resistances: [], immunities: [], spellAttack: 0, spellSaveDC: 0,
    languages: [], unarmed: { attackBonus: 0, damageBonus: 0 },
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
        case 'unarmored_ac':
          acc.unarmoredAcBase = Math.max(acc.unarmoredAcBase ?? 0, e.base)
          break
        case 'max_hp':
          acc.maxHp += (e.amount ?? 0) + (e.perLevel ?? 0) * character.level
          break
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
          break
        case 'ability_bonus':
          acc.abilityBonuses[e.ability] = (acc.abilityBonuses[e.ability] ?? 0) + e.amount
          break
        case 'ability_set':
          // Multiple setters on one ability: keep the highest target (RAW: a set never lowers a score)
          acc.abilitySets[e.ability] = Math.max(acc.abilitySets[e.ability] ?? 0, e.value)
          break
        case 'skill':
          acc.skillBonuses[e.skill] = (acc.skillBonuses[e.skill] ?? 0) + e.amount
          break
        case 'speed':
          acc.speed += e.amount
          break
        case 'initiative':
          acc.initiative += e.amount
          break
        case 'damage':
          acc.damage += e.amount
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
          break
        case 'spell_save_dc':
          acc.spellSaveDC += e.amount
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
      case 'initiative':   parts.push(`${formatBonus(e.amount)} initiative`); break
      case 'damage':       parts.push(`${formatBonus(e.amount)} damage`); break
      case 'damage_dice':  parts.push(`+${e.dice} ${e.damageType}`); break
      case 'language':     parts.push(e.name); break
      case 'unarmed':      parts.push(`unarmed ${[e.dice, e.damageType].filter(Boolean).join(' ') || 'override'}`); break
      case 'spell_attack': parts.push(`${formatBonus(e.amount)} spell atk`); break
      case 'spell_save_dc':parts.push(`${formatBonus(e.amount)} spell DC`); break
    }
  }
  return parts.join(' · ')
}

export interface DeriveContext {
  // All class records, ordered to match character.classes; [0] = primary
  classes?: (ClassData | null)[] | null
  race?: Race | null
  catalog?: { weapons?: WeaponItem[]; armor?: ArmorItem[]; wondrous_items?: WondrousItem[] } | null
  featData?: Record<string, FeatData> | null
}

export function deriveCharacterStats(
  character: Character,
  ctx: DeriveContext = {},
): DerivedStats {
  const { race, catalog, featData } = ctx
  const classRecords = (ctx.classes ?? []).filter((c): c is ClassData => c != null)
  const classData = ctx.classes?.[0] ?? null
  const pb = proficiencyBonus(character.level)

  // ── Effective Abilities (base + racial ASIs + all feat ASIs) ─────────────
  const effectiveAbilities = { ...character.abilities }
  const racialBonuses = getRacialBonuses(race, character.raceAsiChoices ?? [], character.subrace ?? undefined)
  for (const [ab, amount] of Object.entries(racialBonuses) as [AbilityName, number][]) {
    effectiveAbilities[ab] = effectiveAbilities[ab] + amount
  }
  let featSpeedBonus = 0
  let featInitiativeBonus = 0
  const featDerivedSaves: AbilityName[] = []
  const flatSkillBonuses: Partial<Record<SkillName, number>> = {}

  if (featData) {
    for (const slug of character.feats) {
      const feat = featData[slug]
      if (!feat) continue

      const delta = computeFeatStatDelta(slug, feat, character.featChoices)
      for (const [ab, amount] of Object.entries(delta.abilities) as [AbilityName, number][]) {
        effectiveAbilities[ab] = Math.min(20, effectiveAbilities[ab] + amount)
      }
      featSpeedBonus += delta.speed
      featInitiativeBonus += delta.initiativeBonus
      if (delta.saveProficiency && !character.savingThrowProficiencies.includes(delta.saveProficiency)) {
        featDerivedSaves.push(delta.saveProficiency)
      }

      const registryEffect = FEAT_EFFECTS[slug]
      if (registryEffect?.skillBonuses) {
        for (const [sk, bonus] of Object.entries(registryEffect.skillBonuses) as [SkillName, number][]) {
          flatSkillBonuses[sk] = (flatSkillBonuses[sk] ?? 0) + bonus
        }
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

  // ── Active magic-item effects ──────────────────────────────────────────────
  // Applied on top of base + racial + feat. Item ability changes are uncapped
  // (RAW: items can raise a score above 20). Skill bonuses reuse the feat channel.
  const itemEffects = computeActiveItemEffects(character, catalog)
  for (const [ab, amount] of Object.entries(itemEffects.abilityBonuses) as [AbilityName, number][]) {
    effectiveAbilities[ab] = effectiveAbilities[ab] + amount
  }
  for (const [ab, value] of Object.entries(itemEffects.abilitySets) as [AbilityName, number][]) {
    effectiveAbilities[ab] = Math.max(effectiveAbilities[ab], value)
  }
  for (const [sk, bonus] of Object.entries(itemEffects.skillBonuses) as [SkillName, number][]) {
    flatSkillBonuses[sk] = (flatSkillBonuses[sk] ?? 0) + bonus
  }

  // ── Combat stats ──────────────────────────────────────────────────────────
  const dexMod = abilityModifier(effectiveAbilities.dex)
  const effectiveSpeed = character.speed + featSpeedBonus + itemEffects.speed
  const effectiveInitiativeBonus = (character.initiativeBonus ?? 0) + featInitiativeBonus + itemEffects.initiative
  const effectiveInitiative = dexMod + effectiveInitiativeBonus

  // ── Effective save proficiencies (class + feat) ───────────────────────────
  const effectiveSaveProficiencies: AbilityName[] = [
    ...character.savingThrowProficiencies,
    ...featDerivedSaves,
  ]

  // ── Skill and save modifiers (pre-computed for display and dice rolls) ─────
  const skillModifiers = {} as Record<SkillName, number>
  for (const skill of Object.keys(SKILL_ABILITY_MAP) as SkillName[]) {
    const ability = SKILL_ABILITY_MAP[skill]
    const abilMod = abilityModifier(effectiveAbilities[ability])
    const prof = effectiveSkillProficiencies[skill]
    const profMod = prof ? pb * (prof === 'expertise' ? 2 : 1) : 0
    const flatBonus = flatSkillBonuses[skill] ?? 0
    skillModifiers[skill] = abilMod + profMod + flatBonus
  }

  const saveModifiers = {} as Record<AbilityName, number>
  for (const ability of ALL_ABILITIES) {
    const abilMod = abilityModifier(effectiveAbilities[ability])
    const itemSave = itemEffects.saveBonuses[ability] ?? 0
    saveModifiers[ability] = abilMod + (effectiveSaveProficiencies.includes(ability) ? pb : 0) + itemSave
  }

  // ── Passive stats ─────────────────────────────────────────────────────────
  let passivePercBonus = 0
  let passiveInvBonus = 0
  for (const slug of character.feats) {
    const e = FEAT_EFFECTS[slug]
    if (e?.passivePerceptionBonus) passivePercBonus += e.passivePerceptionBonus
    if (e?.passiveInvestigationBonus) passiveInvBonus += e.passiveInvestigationBonus
  }
  const passivePerception = 10 + skillModifiers.perception + passivePercBonus
  const passiveInvestigation = 10 + skillModifiers.investigation + passiveInvBonus

  // ── Spell stats ───────────────────────────────────────────────────────────
  // First class with a spellcasting ability — the primary class may be a
  // non-caster in a multiclass (e.g. Fighter 5 / Wizard 3)
  const castingClass = classRecords.find(c => c.spellcasting?.ability) ?? null
  let spellAttackBonus = 0
  let spellSaveDC = 0
  if (castingClass?.spellcasting?.ability) {
    const spellAbilKey = ABILITY_FULL_TO_SHORT[castingClass.spellcasting.ability.toLowerCase()] ?? 'int'
    const spellAbilMod = abilityModifier(effectiveAbilities[spellAbilKey])
    const manualBonus = character.spellBonusModifier ?? 0

    // Spell-focus bonuses come from active items' `spell_attack`/`spell_save_dc`
    // effects (computeActiveItemEffects). The manual spellBonusModifier remains a
    // homebrew override for un-cataloged focuses.
    spellAttackBonus = spellAbilMod + pb + itemEffects.spellAttack + manualBonus
    spellSaveDC = 8 + spellAbilMod + pb + itemEffects.spellSaveDC + manualBonus
  }

  // ── Effective AC + stealth disadvantage ──────────────────────────────────
  let effectiveAC: number | null = null
  let hasStealthDisadvantage = false
  let hasBodyArmor = false

  if (catalog?.armor) {
    const armorByName = new Map(catalog.armor.map(a => [a.name.toLowerCase(), a]))
    // Armor contributes AC only while *worn* — equipped (non-attune) or attuned
    // (attune-required). Unworn armor is just inventory (no AC, no numeric bonus).
    const equippedArmor = character.equipment.filter(
      e => armorByName.has(e.name.toLowerCase()) && (e.equipped || e.attuned),
    )

    if (equippedArmor.length > 0) {
      const bodyPieces = equippedArmor.filter(
        e => armorByName.get(e.name.toLowerCase())!.armor_type !== 'Shield',
      )
      const shields = equippedArmor.filter(
        e => armorByName.get(e.name.toLowerCase())!.armor_type === 'Shield',
      )
      hasBodyArmor = bodyPieces.length > 0

      let baseAC = 10 + dexMod
      let canComputeAC = true

      if (hasBodyArmor) {
        // Resolve a variable-base armor to its chosen mundane base before parsing
        const bodyArmor = resolveArmor(bodyPieces[0], armorByName.get(bodyPieces[0].name.toLowerCase())!, armorByName)
        if (bodyArmor.stealth_disadvantage) hasStealthDisadvantage = true
        // Still "Varies" (variable-base with no base chosen) → fall back to manual AC
        if (bodyArmor.ac_formula.trim().toLowerCase().startsWith('varies')) {
          canComputeAC = false
        } else {
          baseAC = parseArmorAC(bodyArmor.ac_formula, dexMod) + (bodyArmor.bonus ?? 0)
        }
      }

      if (canComputeAC) {
        let shieldBonus = 0
        if (shields.length > 0) {
          const shieldRec = resolveArmor(shields[0], armorByName.get(shields[0].name.toLowerCase())!, armorByName)
          // Magic shields carry their flat bonus in `bonus` (e.g. "+2 Shield"),
          // same as body armor above
          shieldBonus = parseArmorAC(shieldRec.ac_formula, dexMod) + (shieldRec.bonus ?? 0)
        }
        effectiveAC = baseAC + shieldBonus
      }
    }
  }

  // Unarmored item AC (Robe of the Archmagi base, Bracers of Defense bonus) applies
  // only when no body armor is worn — an app-knowable condition. A set-base replaces
  // the unarmored base entirely (preserving any equipped shield); a conditional bonus
  // stacks on the existing unarmored AC (manual armorClass fallback when uncomputed).
  if (!hasBodyArmor) {
    if (itemEffects.unarmoredAcBase != null) {
      const shieldOnly = effectiveAC != null ? effectiveAC - (10 + dexMod) : 0
      effectiveAC = itemEffects.unarmoredAcBase + dexMod + itemEffects.unarmoredAcBonus + shieldOnly
    } else if (itemEffects.unarmoredAcBonus !== 0) {
      effectiveAC = (effectiveAC ?? character.armorClass) + itemEffects.unarmoredAcBonus
    }
  }

  // Flat AC from active items (Ring/Cloak of Protection) stacks on worn armor;
  // with no computed armor it applies over the manual armorClass the sheet already
  // uses as the unarmored fallback (preserves e.g. a caster's Mage Armor value).
  if (itemEffects.acBonus !== 0) {
    effectiveAC = (effectiveAC ?? character.armorClass) + itemEffects.acBonus
  }

  // ── Adjusted Max HP ───────────────────────────────────────────────────────
  let hpBonus = 0
  for (const slug of character.feats) {
    const effect = FEAT_EFFECTS[slug]
    if (effect?.maxHpBonus) hpBonus += effect.maxHpBonus(character.level)
  }
  const subraceHpFn = character.subrace ? SUBRACE_HP_BONUS[character.subrace.toLowerCase()] : undefined
  const subraceHpBonus = subraceHpFn ? subraceHpFn(character.level) : 0

  // ── Hit dice type ─────────────────────────────────────────────────────────
  const hitDiceType = classData ? parseInt(classData.hit_die.replace('d', ''), 10) : 8

  // ── Weapon proficiencies (union across all classes) ──────────────────────
  const weaponProficiencies = [
    ...new Set(classRecords.flatMap(c => c.weapon_proficiencies.map(p => p.toLowerCase()))),
  ]

  // ── Advantages ────────────────────────────────────────────────────────────
  const advantages = getCharacterAdvantages(character)

  return {
    effectiveAC,
    adjustedMaxHp: character.maxHp + hpBonus + subraceHpBonus + itemEffects.maxHp,
    effectiveAbilities,
    effectiveSpeed,
    effectiveInitiative,
    effectiveInitiativeBonus,
    effectiveSaveProficiencies,
    proficiencyBonus: pb,
    skillModifiers,
    saveModifiers,
    flatSkillBonuses,
    passivePerception,
    passiveInvestigation,
    spellAttackBonus,
    spellSaveDC,
    hasStealthDisadvantage,
    hitDiceType,
    advantages,
    effectiveSkillProficiencies,
    featSkillGrants,
    weaponProficiencies,
    itemDamageBonus: itemEffects.damage,
    unarmedStrike: itemEffects.unarmed,
    itemGrantedLanguages: itemEffects.languages,
    resistances: itemEffects.resistances,
    immunities: itemEffects.immunities,
  }
}
