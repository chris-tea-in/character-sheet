import type { WeaponItem, ArmorItem, FeatData, WondrousItem, ToolItem, SpellData, Race } from './data'

export type AbilityName = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'

export interface ClassEntry {
  classSlug: string
  subclassSlug: string | null
  level: number
}

export type SkillName =
  | 'acrobatics' | 'animalHandling' | 'arcana' | 'athletics'
  | 'deception' | 'history' | 'insight' | 'intimidation'
  | 'investigation' | 'medicine' | 'nature' | 'perception'
  | 'performance' | 'persuasion' | 'religion' | 'sleightOfHand'
  | 'stealth' | 'survival'

export type SkillProficiency = 'proficient' | 'expertise'

export interface Abilities {
  str: number; dex: number; con: number
  int: number; wis: number; cha: number
}

export interface DeathSaves {
  successes: number
  failures: number
}

export interface Currency {
  cp: number; sp: number; ep: number; gp: number; pp: number
}

export interface EquipmentItem {
  id: string
  name: string
  quantity: number
  notes?: string
  customDamage?: string  // overrides catalog damage display
  customToHit?: string   // overrides calculated to-hit display
  displayCategory?: 'weapon' | 'armor' | 'item'  // for magic items: which section to show in
  attuned?: boolean      // attune-required items: when true the catalog `effects` apply at render time and the item shows in Active Items
  equipped?: boolean     // non-attune items: when true the catalog `effects` apply at render time (the equip gate, parallel to `attuned`)
  chargesUsed?: number   // limited-use items: charges spent (catalog `charges.max` − chargesUsed = remaining); usage tracker only, no stat effect
  baseWeapon?: string    // for "any sword/any weapon" magic weapons: the chosen mundane base weapon name; its damage/type/properties drive the stats
  baseArmor?: string     // for "any armor / Varies" magic armors: the chosen mundane base armor name; its ac_formula/type/stealth/STR drive the AC
  containerId?: string   // when set, this item is stored INSIDE the container item with this id (a bag of holding etc.); it is hidden from the main sheet sections and can't be active. undefined = carried on person
  currency?: Partial<Currency>  // a container's own coin pouch (bag of holding & kin); coins held inside the bag, separate from the character's carried Currency. Only meaningful on coin-capable container items
}

export interface CharacterSpell {
  slug: string
  prepared: boolean
  // Player-entered damage (the spell catalog carries none) so the Dmg button can
  // roll it. `damageDice` is the dice at the spell's own level (e.g. "8d6");
  // `damagePerLevel` adds dice per slot level above base for upcasting (leveled
  // spells); cantrips auto-scale by character level and ignore `damagePerLevel`.
  damageDice?: string
  damageType?: string
  damagePerLevel?: string
}

// A player-authored modifier added to a stat's breakdown via the Modifier Ledger.
export interface CustomModifier {
  id: string
  label: string
  amount: number
}

// Modifier Ledger override layer (P2). Edits the player makes to the auto-derived
// breakdowns, applied as the LAST step(s) of deriveCharacterStats — still INV-1, no
// write-time baking. `disabled` suppresses a contributor by its stable id (it still
// shows in the breakdown, struck-through, and re-enables when the id is dropped).
// `overrides` replaces a contributor's amount by id. `custom` appends player rows,
// keyed by TargetKey (e.g. "speed", "ability:str", "skill:stealth").
export interface LedgerOverrides {
  disabled: string[]
  overrides: Record<string, number>
  custom: Record<string, CustomModifier[]>
}

export interface Character {
  id: string
  name: string
  race: string        // slug into races.json
  subrace: string | null
  class: string       // primary class slug (classes[0].classSlug)
  subclass: string | null  // primary subclass (classes[0].subclassSlug)
  background: string  // slug into backgrounds.json
  level: number       // total character level (sum of all classes[i].level)
  classes: ClassEntry[]  // all classes; classes[0] = primary
  xp: number
  progressionType: 'xp' | 'milestone'
  alignment: string
  languages: string[]
  backstory: string

  // BASE scores: point-buy/rolled values + permanent level-up ASI +1s.
  // Racial ASIs and feat effects are derived at render time (deriveCharacterStats).
  abilities: Abilities
  // Flexible racial ASI picks, ordered: race pool slots first, then subrace pools
  raceAsiChoices: AbilityName[]

  maxHp: number
  currentHp: number
  tempHp: number
  armorClass: number
  speed: number
  initiativeBonus: number
  spellBonusModifier: number
  // Homebrew override: when true, the proficiency bonus is added to EVERY weapon
  // attack regardless of class/race weapon proficiency. Read at render time in
  // computeWeaponBonus (the single weapon-proficiency application point).
  homebrewAllWeaponsProficient: boolean

  deathSaves: DeathSaves
  hitDiceUsed: number
  // Multiclass hit-dice spending, keyed by class slug; single-class
  // characters use the flat hitDiceUsed counter instead
  hitDiceUsedByClass: Partial<Record<string, number>>
  inspiration: boolean
  // Active conditions (runtime state, toggled on the sheet). `active` holds the
  // condition keys (poisoned, prone, restrained, …); `exhaustion` is the 0–6 level.
  // Feeds derived adv/dis, speed, and max-HP at render time (deriveCharacterStats).
  conditions: { active: string[]; exhaustion: number }

  skillProficiencies: Partial<Record<SkillName, SkillProficiency>>
  savingThrowProficiencies: AbilityName[]

  // Modifier Ledger override layer (P2): player edits to the auto-derived breakdowns
  // (disable a contributor / change its amount / add your own). Applied at render time
  // in deriveCharacterStats (INV-1). Sheet-managed — the edit merge preserves it.
  ledgerOverrides: LedgerOverrides

  spells: CharacterSpell[]
  spellSlotsUsed: Partial<Record<number, number>>

  personalityTraits: string
  ideals: string
  bonds: string
  flaws: string
  notes: string

  equipment: EquipmentItem[]
  currency: Currency

  feats: string[]  // feat slugs (keys from feats.json)
  featChoices: Record<string, {
    asiAbility?: AbilityName
    skillChoices?: SkillName[]   // for Skilled (3 picks), Prodigy (1 pick)
    expertiseSkill?: SkillName   // for Skill Expert, Prodigy
  }>  // per-feat player choices
  toolProficiencies: string[]  // tool names (free-form, from equipment catalog)

  // Selected class/subclass feature options (maneuvers, fighting styles,
  // invocations, …), keyed by feature-choice group key → chosen option slugs.
  // Stores choices only; any passive effect derives at render time (INV-1).
  classFeatureChoices: Record<string, string[]>
  // Usage tracker for choice-attached resources (e.g. Battle Master Superiority
  // Dice), keyed by group key → count spent. Not a stat effect — never enters
  // deriveCharacterStats; parallels equipment chargesUsed / spellSlotsUsed.
  featureResourcesUsed: Record<string, number>

  // Homebrew custom content — catalog-shaped definitions authored on this
  // character (distinct from equipment[] instances and feats[] slug refs). Merged
  // into the equipment catalog / feat data at render time (see lib/customContent)
  // so AC, weapon bonuses, and feat ASIs derive identically to built-in entries
  // (INV-1). Sheet-managed, not wizard-managed; ride the synced data blob.
  customWeapons: WeaponItem[]
  customArmor: ArmorItem[]
  customFeats: FeatData[]
  // Homebrew wondrous/generic items, spells, tools, and races — same render-time
  // merge pattern as customWeapons/Armor/Feats (see lib/customContent), folded
  // into the equipment catalog / spell map / race lookup so they resolve exactly
  // like built-ins (INV-1). Sheet-managed; ride the synced data blob.
  customItems: WondrousItem[]
  customSpells: SpellData[]
  customTools: ToolItem[]
  customRaces: Race[]

  // Campaign association (player-owned, synced like any other field). null = not
  // in a campaign. Does NOT gate the main list — it only adds the character to a
  // campaign view. The server keeps a derived campaign_id column (set from this on
  // owner writes) so the DM query is indexed.
  campaignId: string | null

  // Per-character class disguise, shown only to OTHER players in the campaign
  // roster (the DM and the owner always see the real class). `disguiseClass`
  // toggles it on; `disguiseAs` is the decoy class slug to show instead, or '' to
  // show no class (just the level). Applied server-side in the roster endpoint so
  // the real class never leaves the server for a disguised viewer.
  disguiseClass: boolean
  disguiseAs: string

  createdAt: number  // unix ms
  updatedAt: number
}

export type NewCharacter = Omit<Character, 'id' | 'createdAt' | 'updatedAt'>

export function defaultCharacter(name: string): NewCharacter {
  return {
    name,
    race: '', subrace: null,
    class: '', subclass: null,
    background: '',
    level: 1, xp: 0, progressionType: 'milestone', alignment: '',
    classes: [],
    languages: [], backstory: '',
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    raceAsiChoices: [],
    maxHp: 0, currentHp: 0, tempHp: 0,
    armorClass: 10, speed: 30, initiativeBonus: 0, spellBonusModifier: 0,
    homebrewAllWeaponsProficient: false,
    deathSaves: { successes: 0, failures: 0 },
    hitDiceUsed: 0, hitDiceUsedByClass: {}, inspiration: false,
    conditions: { active: [], exhaustion: 0 },
    skillProficiencies: {},
    savingThrowProficiencies: [],
    ledgerOverrides: { disabled: [], overrides: {}, custom: {} },
    spells: [], spellSlotsUsed: {},
    personalityTraits: '', ideals: '', bonds: '', flaws: '', notes: '',
    equipment: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    feats: [],
    featChoices: {},
    toolProficiencies: [],
    classFeatureChoices: {},
    featureResourcesUsed: {},
    customWeapons: [],
    customArmor: [],
    customFeats: [],
    customItems: [],
    customSpells: [],
    customTools: [],
    customRaces: [],
    campaignId: null,
    disguiseClass: false,
    disguiseAs: '',
  }
}

/**
 * Coerce an arbitrary, possibly-partial character blob into a complete
 * `NewCharacter` by filling any missing field with its default.
 *
 * Apply this at every boundary where untrusted external JSON becomes a
 * `Character`: the synced cloud `data` blob and campaign fetches are *typed*
 * `NewCharacter`, but that is an unchecked assertion over network/DB JSON — a
 * record written by an older client, a partial write, or an import may be missing
 * a field. Without normalization the first missing array/object field crashes
 * `deriveCharacterStats` (e.g. spreading an `undefined` `savingThrowProficiencies`).
 *
 * Local-DB reads are already normalized by the column defaults; this closes the
 * one path that skips that round-trip — the DM campaign view, which renders other
 * players' raw cloud blobs directly. Present fields are preserved as-is (JSON
 * never carries `undefined` own-properties, so a missing key stays defaulted).
 */
export function normalizeNewCharacter(data: unknown): NewCharacter {
  const d = data && typeof data === 'object' ? (data as Partial<NewCharacter>) : {}
  return { ...defaultCharacter(typeof d.name === 'string' ? d.name : ''), ...d }
}
