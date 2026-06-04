import { abilityModifier, proficiencyBonus } from './dice'
import type { Character, AbilityName, Abilities, SkillName } from '../types/character'
import type { ArmorItem, WeaponItem, ClassData, FeatData } from '../types/data'

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
  effectiveAC: number | null  // null when armor catalog unavailable
  adjustedMaxHp: number
}

// ── Feat effect registry ────────────────────────────────────────────────────

interface FeatEffect {
  maxHpBonus?: (level: number) => number
}

const FEAT_EFFECTS: Partial<Record<string, FeatEffect>> = {
  'tough': { maxHpBonus: level => level * 2 },
}

const ABILITY_FROM_FULL: Record<string, AbilityName> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
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
        const ab = ABILITY_FROM_FULL[effect.ability.toLowerCase()]
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
        : ABILITY_FROM_FULL[effect.ability.toLowerCase()]
      if (ab) delta.saveProficiency = ab
    }
  }
  return delta
}

export function applyFeatAsi(
  abilities: Abilities,
  delta: Partial<Record<AbilityName, number>>,
): Abilities {
  const result = { ...abilities }
  for (const [ab, amount] of Object.entries(delta) as [AbilityName, number][]) {
    result[ab] = Math.min(20, result[ab] + amount)
  }
  return result
}

export function unapplyFeatAsi(
  abilities: Abilities,
  delta: Partial<Record<AbilityName, number>>,
): Abilities {
  const result = { ...abilities }
  for (const [ab, amount] of Object.entries(delta) as [AbilityName, number][]) {
    result[ab] = result[ab] - amount
  }
  return result
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
    const ab = ABILITY_FROM_FULL[abilityMatch[1].toLowerCase()]
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
// Handles: "18", "+2", "11 + DEX modifier", "13 + DEX modifier (max 2)"

function parseArmorAC(formula: string, dexMod: number): number {
  const trimmed = formula.trim()

  // Shield: "+2"
  if (trimmed.startsWith('+')) {
    return parseInt(trimmed.slice(1), 10) || 0
  }

  const deхPattern = /^(\d+)\s*\+\s*DEX modifier(\s*\(max\s*(\d+)\))?$/i
  const match = trimmed.match(deхPattern)
  if (match) {
    const base = parseInt(match[1], 10)
    const cap = match[3] !== undefined ? parseInt(match[3], 10) : Infinity
    return base + Math.min(dexMod, cap)
  }

  // Plain number
  return parseInt(trimmed, 10) || 0
}

// ── Weapon proficiency check ─────────────────────────────────────────────────

function isWeaponProficient(weapon: WeaponItem, classRecord: ClassData | null): boolean {
  if (!classRecord) return false
  const profs = classRecord.weapon_proficiencies.map(p => p.toLowerCase())
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
  classRecord: ClassData | null,
): WeaponBonus {
  const strMod = abilityModifier(character.abilities.str)
  const dexMod = abilityModifier(character.abilities.dex)
  const isFinesse = weapon.properties.some(p => p.toLowerCase().includes('finesse'))
  const isRanged = weapon.weapon_type.toLowerCase().includes('ranged')
  const mod = isFinesse ? Math.max(strMod, dexMod) : isRanged ? dexMod : strMod
  const abilityLabel = isFinesse ? (dexMod > strMod ? 'DEX' : 'STR') : isRanged ? 'DEX' : 'STR'
  const pb = isWeaponProficient(weapon, classRecord) ? proficiencyBonus(character.level) : 0
  const magicBonus = weapon.bonus ?? 0
  const toHitModifier = mod + pb + magicBonus
  const damageBonus = mod + magicBonus
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

export function deriveCharacterStats(
  character: Character,
  catalog?: { armor?: ArmorItem[] },
): DerivedStats {
  const dexMod = abilityModifier(character.abilities.dex)

  // ── Effective AC ──────────────────────────────────────────────────────────
  let effectiveAC: number | null = null

  if (catalog?.armor) {
    const armorByName = new Map(catalog.armor.map(a => [a.name.toLowerCase(), a]))
    const equippedArmor = character.equipment.filter(e => armorByName.has(e.name.toLowerCase()))

    if (equippedArmor.length > 0) {
      const bodyPieces = equippedArmor.filter(e => {
        const item = armorByName.get(e.name.toLowerCase())!
        return item.armor_type !== 'Shield'
      })
      const shields = equippedArmor.filter(e => {
        const item = armorByName.get(e.name.toLowerCase())!
        return item.armor_type === 'Shield'
      })

      let baseAC = 10 + dexMod  // unarmored
      if (bodyPieces.length > 0) {
        const bodyArmor = armorByName.get(bodyPieces[0].name.toLowerCase())!
        if (bodyArmor.ac_formula === 'Varies') {
          effectiveAC = null  // can't auto-compute variable-formula magical armor
        } else {
          baseAC = parseArmorAC(bodyArmor.ac_formula, dexMod) + (bodyArmor.bonus ?? 0)
        }
      }

      if (effectiveAC === null) {
        // skip further computation — at least one piece can't be auto-resolved
      } else {
        const shieldBonus = shields.length > 0
          ? parseArmorAC(armorByName.get(shields[0].name.toLowerCase())!.ac_formula, dexMod)
          : 0
        effectiveAC = baseAC + shieldBonus
      }
    }
  }

  // ── Adjusted Max HP ───────────────────────────────────────────────────────
  let hpBonus = 0
  for (const slug of character.feats) {
    const effect = FEAT_EFFECTS[slug]
    if (effect?.maxHpBonus) hpBonus += effect.maxHpBonus(character.level)
  }

  return {
    effectiveAC,
    adjustedMaxHp: character.maxHp + hpBonus,
  }
}
