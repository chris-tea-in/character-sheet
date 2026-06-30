import type { AbilityName, SkillName } from './character'

// ── Equipment catalog types ────────────────────────────────────────────────

/**
 * Structured mechanical effect carried by a magic item. Applied exactly once, at
 * render time, in deriveCharacterStats — and only while the item is *active*: an
 * attune-required item when `EquipmentItem.attuned`, a non-attune item when
 * `EquipmentItem.equipped` (see computeActiveItemEffects). Magic-item ability
 * changes are NOT capped at 20 (unlike feat ASIs): `ability_set` takes the max of
 * current vs. value and may exceed 20; `ability_bonus` is additive and uncapped.
 */
export type ItemEffect =
  // flat AC (Ring/Cloak of Protection). `condition: 'unarmored'` applies only when
  // no body armor is worn (Bracers of Defense) — an app-knowable condition.
  | { type: 'ac'; amount: number; condition?: 'unarmored' }
  // Floors total AC at `value` (Barkskin → AC ≥ 16): applied after base+additive AC,
  // only when it raises AC. For homebrew items + the future spell-effect channel.
  | { type: 'ac_floor'; value: number }
  | { type: 'save'; ability: AbilityName | 'all'; amount: number }  // save bonus
  // Magic-item ability changes are uncapped by default (may exceed 20). An optional
  // `cap` caps THIS effect's result (Belt of Dwarvenkind → +2 CON to a max of 20); it
  // never lowers an already-higher score.
  | { type: 'ability_set'; ability: AbilityName; value: number; cap?: number }    // Amulet of Health (CON 19), Belt of Giant Str
  | { type: 'ability_bonus'; ability: AbilityName; amount: number; cap?: number }  // additive ability bump
  | { type: 'skill'; skill: SkillName; amount: number }             // flat skill bonus
  | { type: 'speed'; amount: number }
  // Non-additive speed (5a). `speed_set` is a FLOOR: walking speed becomes `value`
  // unless already higher (Boots of Striding → 30). `speed_multiplier` multiplies the
  // post-floor speed (Boots of Speed / Haste → 2). Applied after the additive sum.
  | { type: 'speed_set'; value: number }
  | { type: 'speed_multiplier'; factor: number }
  | { type: 'initiative'; amount: number }
  | { type: 'damage'; amount: number }                              // flat bonus to weapon & unarmed damage
  | { type: 'attack'; amount: number }                              // flat bonus to weapon attack rolls (to-hit)
  // Rider damage dice of another type on the weapon that carries it (Flame Tongue →
  // +2d6 fire). Applies to that weapon's attacks while it is active; crit doubles
  // the dice. Weapon-specific (read from the weapon's own effects), not global.
  | { type: 'damage_dice'; dice: string; damageType: string }
  | { type: 'max_hp'; amount?: number; perLevel?: number }          // flat (+X) and/or scaling (+X per level) max-HP bonus
  | { type: 'resistance'; damageType: string }                      // damage resistance (free-form type, lowercased)
  | { type: 'immunity'; damageType: string }                        // damage immunity
  | { type: 'unarmored_ac'; base: number }                          // sets unarmored AC base (Robe of the Archmagi → 15 + DEX); applies only when no body armor
  | { type: 'spell_attack'; amount: number }
  | { type: 'spell_save_dc'; amount: number }
  | { type: 'spell_damage'; amount: number }                        // flat bonus to spell damage rolls
  // Roll advantage/disadvantage on a save (one ability or 'all') or a skill, granted
  // while the item is active. Mirrors the FeatureEffect variant (Step 5e).
  | { type: 'advantage'; target: 'save' | 'skill'; ability?: AbilityName | 'all'; skill?: SkillName }
  | { type: 'disadvantage'; target: 'save' | 'skill'; ability?: AbilityName | 'all'; skill?: SkillName }
  | { type: 'language'; name: string }                              // grants a known language while active (Demon Armor → Abyssal)
  // Overrides the unarmed strike (Demon Armor: 1d8 slashing, +1 atk/dmg). Any
  // field omitted keeps the unarmed default (1 + STR bludgeoning, no bonus).
  | { type: 'unarmed'; dice?: string; damageType?: string; attackBonus?: number; damageBonus?: number }

/**
 * Limited-use charges on an item. Purely a usage tracker (EquipmentItem.chargesUsed)
 * — it never feeds deriveCharacterStats. `recharge` is when they refill; `regain` is
 * the descriptive dice formula (e.g. "1d6+1"). The app has no automatic rest, so the
 * tracker is manual.
 */
export interface ItemCharges {
  max: number
  recharge?: 'dawn' | 'dusk' | 'long_rest' | 'short_rest'
  regain?: string
}

export interface WeaponItem {
  name: string
  category: 'weapon'
  weapon_type: 'Simple Melee' | 'Simple Ranged' | 'Martial Melee' | 'Martial Ranged' | 'Varies'
  damage_dice: string | null
  damage_type: string | null
  properties: string[]
  cost?: string | null
  weight?: string | null
  // magical weapon fields
  magical?: boolean
  rarity?: string
  attunement?: boolean
  source?: string
  description?: string
  base_weapon_type?: string | null
  bonus?: number | null
  special_properties?: string[]
  effects?: ItemEffect[]  // applied at render time while active (attuned/equipped)
  charges?: ItemCharges   // limited-use tracker (EquipmentItem.chargesUsed)
}

export interface ArmorItem {
  name: string
  category: 'armor' | 'shield'
  armor_type: 'Light' | 'Medium' | 'Heavy' | 'Shield' | 'Varies'
  ac_formula: string
  stealth_disadvantage: boolean
  strength_requirement: number | null
  cost?: string | null
  weight?: string | null
  // magical armor fields
  magical?: boolean
  rarity?: string
  attunement?: boolean
  source?: string
  description?: string
  base_armor_type?: string | null
  bonus?: number | null
  effects?: ItemEffect[]  // applied at render time while active (attuned/equipped)
  charges?: ItemCharges   // limited-use tracker (EquipmentItem.chargesUsed)
}

export interface AdventuringGearItem {
  name: string
  category: 'adventuring_gear'
  subcategory: string
  cost: string | null
  weight: string | null
  description?: string
  // Consumable healing (Potion of Healing → 2d4 + 2). Present → the item shows a
  // "Drink" action that rolls the heal and consumes one (decrement / remove at 0).
  heal?: { dice: string; bonus: number }
}

export interface TrinketItem {
  name: string
  category: 'trinket'
  source: string
  roll?: number
}

export interface FirearmItem {
  name: string
  category: 'firearm' | 'ammunition'
  era: 'renaissance' | 'modern' | 'futuristic'
  weapon_type: 'Martial Ranged' | 'Ammunition'
  damage_dice: string | null
  damage_type: string | null
  properties: string[]
  cost: string | null
  weight: string | null
}

export interface ExplosiveItem {
  name: string
  category: 'explosive'
  era: 'renaissance' | 'modern'
  cost: string | null
  weight: string | null
  description: string
}

export interface WondrousItem {
  name: string
  category: 'wondrous_item'
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary' | 'Artifact' | 'Varies'
  attunement: boolean
  attunement_note?: string
  source?: string
  description?: string
  effects?: ItemEffect[]  // applied at render time while active (spell-focus items use spell_attack/spell_save_dc here)
  charges?: ItemCharges   // limited-use tracker (EquipmentItem.chargesUsed)
}

export interface CurrencyItem {
  name: string
  category: 'currency'
  abbreviation: string
  value_in_cp: number
}

export interface PoisonItem {
  name: string
  category: 'poison'
  poison_type: 'Contact' | 'Ingested' | 'Inhaled' | 'Injury'
  cost: string
  description?: string
}

export interface ToolItem {
  name: string
  category: 'tool'
  tool_category: "Artisan's Tools" | 'Gaming Set' | 'Musical Instrument' | 'Other'
  cost: string | null
  weight: string | null
}

export interface SiegeEquipmentItem {
  name: string
  category: 'siege_equipment'
  ac?: number | null
  hp?: number | null
  damage?: string | null
  damage_type?: string | null
  range?: string | null
  attack_bonus?: number | null
  save?: string | null
  description?: string
}

export interface EquipmentData {
  weapons?: WeaponItem[]
  armor?: ArmorItem[]
  adventuring_gear?: AdventuringGearItem[]
  trinkets?: TrinketItem[]
  firearms?: FirearmItem[]
  explosives?: ExplosiveItem[]
  wondrous_items?: WondrousItem[]
  currency?: CurrencyItem[]
  poisons?: PoisonItem[]
  tools?: ToolItem[]
  siege_equipment?: SiegeEquipmentItem[]
}

export interface EquipmentOption {
  label: string
  items: string[]  // catalog item names; "@any_simple", "@any_simple_melee", "@any_martial", "@any_martial_melee", "@any_musical_instrument", "@arcane_focus", "@druidic_focus", "@holy_symbol" are open-pick sentinels
}

export type EquipmentGrant =
  | { type: 'fixed'; items: string[] }
  | { type: 'choice'; options: EquipmentOption[] }

export interface AsiChoice {
  count: number
  amount: number
  pool: 'any' | AbilityName[]
}

/**
 * Structured, machine-applicable racial trait effect. Applied exactly once at
 * render time in deriveCharacterStats (INV-1) via computeRaceEffects — parallel to
 * ItemEffect. This is the authoritative grant channel: the legacy `proficiencies`
 * string array holds only trait *names*, and resistances live only in prose `traits`,
 * so neither is machine-readable. `languages`, `senses`, and `hp_bonus_per_level`
 * remain clean structured fields and are read directly (not re-encoded here).
 * Save/skill *advantages* are intentionally NOT modeled here yet — they are applied
 * by the hardcoded advantage maps and become data-driven in the adv/dis phase.
 */
export type RaceEffect =
  | { type: 'skill_proficiency';  skill: SkillName }
  | { type: 'weapon_proficiency'; weapons: string[] }   // specific weapon names (e.g. "Longsword")
  | { type: 'tool_proficiency';   tools: string[] }     // fixed grants only; "choose one" stays a manual pick
  | { type: 'armor_proficiency';  armor: string[] }     // "light" | "medium" | "heavy" | "shield"
  | { type: 'resistance'; damageType: string }          // damage resistance (free-form type, lowercased on apply)
  | { type: 'immunity';   damageType: string }
  // Natural armor sets the unarmored AC base (Lizardfolk 13 + DEX, Tortle 17 flat).
  | { type: 'natural_armor'; base: number; addDex?: boolean; maxDex?: number }

export interface Subrace {
  name: string
  ability_score_increases: Partial<Record<AbilityName, number>>
  asi_choices: AsiChoice[]
  speed: number | null         // null = inherit base race speed; number = override
  size: string | null
  languages: string[]
  senses: Record<string, unknown>
  proficiencies: string[]
  traits: Record<string, string>
  hp_bonus_per_level?: number
  effects?: RaceEffect[]
}

export interface Race {
  name: string
  slug: string
  description: string
  base: {
    ability_score_increases: Partial<Record<AbilityName, number>>
    asi_choices: AsiChoice[]
    speed: number
    size: string
    languages: string[]
    senses: Record<string, unknown>
    proficiencies: string[]
    traits: Record<string, string>
    effects?: RaceEffect[]
  }
  subraces: Subrace[]
}

export interface ClassLevel {
  proficiency_bonus: number
  features: string[]
  class_specific: Record<string, string>
}

export interface ClassData {
  name: string
  slug: string
  description: string
  hit_die: string
  primary_ability: string[]
  saving_throw_proficiencies: string[]
  armor_proficiencies: string[]
  weapon_proficiencies: string[]
  tool_proficiencies: string[]
  skill_choices: {
    count: number
    options: string[]
  }
  starting_equipment: EquipmentGrant[]
  levels: Record<string, ClassLevel>   // keyed by level number string: "1"–"20"
  spellcasting: { ability: string; description: string } | null
}

export interface SpellData {
  name: string
  slug: string
  level: number
  school: string
  casting_time: string
  range: string
  components: {
    verbal: boolean
    somatic: boolean
    material: boolean
    material_text: string | null
  }
  duration: string
  concentration: boolean
  ritual: boolean
  description: string
  at_higher_levels: string | null
  classes: string[]
}

export interface SubclassData {
  name: string
  classSlug: string
  subclassSlug: string
  key: string
  choiceLevel: number
  description: string
  features: Record<string, Array<{ name: string; description: string }>>
}

export interface Background {
  name: string
  slug: string
  description: string
  skill_proficiencies: string[]
  tool_proficiencies: string[]
  languages: string[]
  language_choices: number
  feature: { name: string; description: string }
  starting_equipment: string[]
  personality_traits: string[]
  ideals: string[]
  bonds: string[]
  flaws: string[]
}

export type FeatEffect =
  | { type: 'asi'; subtype: 'fixed'; ability: string; amount: number }
  | { type: 'asi'; subtype: 'choice'; options: string[]; amount: number }
  | { type: 'initiative'; amount: number }
  | { type: 'speed'; amount: number }
  | { type: 'save_proficiency'; ability: string }  // ability name or 'asi_choice'
  | { type: 'skill_proficiency'; count: number }
  | { type: 'expertise'; count: number }
  // Data-driven equivalents of the old hardcoded FEAT_EFFECTS registry + new grants.
  | { type: 'max_hp'; amount?: number; perLevel?: number }   // Tough → perLevel 2; Dwarven Toughness-style
  | { type: 'resistance'; damageType: string }               // e.g. feats granting a damage resistance
  | { type: 'language'; name: string }
  | { type: 'weapon_proficiency'; weapons: string[] }
  | { type: 'armor_proficiency'; armor: string[] }           // light | medium | heavy | shield
  | { type: 'tool_proficiency'; tools: string[] }

export interface FeatData {
  name: string
  slug: string
  prerequisites: string[]
  description: string
  effects?: FeatEffect[]
  /** Rules edition the entry comes from. Absent = 2014/legacy (no marker shown);
   * "2024" surfaces a "(2024)" tag in selection lists. */
  edition?: '2014' | '2024'
}

// ── Selectable class features (maneuvers, fighting styles, invocations, …) ─────
//
// A data-driven "choice group" = one choosable class/subclass feature. Compiled
// from data/class-features/*.json into public/data/class-features.json keyed by
// group key. The framework reads these to render pickers and (for the few options
// with passive stat impact) derive effects at render time — INV-1. Adding a class
// is data-only. See FeaturesBlock + computeFeatureEffects.

/**
 * Passive, app-knowable stat effect carried by a chosen feature option. Applied
 * exactly once at render time in deriveCharacterStats (INV-1). v1 implements the
 * armored/unarmored `ac` effect (Fighting Style: Defense). The weapon-conditional
 * shapes are authored in the data now but applied in a later pass through
 * computeWeaponBonus — recorded + displayed in v1, not yet folded into rolls.
 */
export type FeatureEffect =
  | { type: 'ac'; amount: number; condition?: 'armored' | 'unarmored' }
  | { type: 'ac_floor'; value: number }  // floors total AC at value (Barkskin → 16)
  | { type: 'weapon_attack'; weaponClass: 'ranged' | 'melee'; amount: number }
  | { type: 'weapon_damage'; weaponClass: 'ranged' | 'melee'; handed?: 'one-handed' | 'two-handed'; amount: number }
  // Saving throws: proficiency (Diamond Soul → all), flat bonus, or a value DERIVED
  // from another ability (Aura of Protection → +CHA to all saves, min 1).
  | { type: 'save_proficiency'; ability: AbilityName | 'all' }
  | { type: 'save_bonus'; ability: AbilityName | 'all'; amount: number }
  | { type: 'derived_save'; ability: AbilityName | 'all'; from: AbilityName; min?: number }
  | { type: 'resistance'; damageType: string }
  | { type: 'immunity'; damageType: string }
  | { type: 'speed'; amount: number }
  // Non-additive speed (5a) — floor (set-if-higher) and multiplier, same semantics as ItemEffect.
  | { type: 'speed_set'; value: number }
  | { type: 'speed_multiplier'; factor: number }
  | { type: 'max_hp'; amount?: number; perLevel?: number }
  | { type: 'skill_proficiency'; skill: SkillName }
  | { type: 'weapon_proficiency'; weapons: string[] }
  | { type: 'armor_proficiency'; armor: string[] }
  | { type: 'tool_proficiency'; tools: string[] }
  // Roll advantage/disadvantage on a save (one ability or 'all') or a skill.
  | { type: 'advantage'; target: 'save' | 'skill'; ability?: AbilityName | 'all'; skill?: SkillName }
  | { type: 'disadvantage'; target: 'save' | 'skill'; ability?: AbilityName | 'all'; skill?: SkillName }

export interface FeatureOption {
  slug: string
  name: string
  description: string
  prerequisites?: string[]
  effects?: FeatureEffect[]
}

// Always-on class-feature effects, keyed classSlug → { "Feature Name": FeatureEffect[] }.
// Applied at render time for every earned class-level feature, up to the owning class's
// level (INV-2). Compiled from data/class-feature-effects.json.
export type ClassFeatureEffects = Record<string, Record<string, FeatureEffect[]>>

/** Cumulative count known once the owning class reaches `level`. */
export interface FeatureKnownStep { level: number; count: number }
/** Resource pool size once the owning class reaches `level`. */
export interface FeatureResourceStep { level: number; n: number }

/** A choice-attached usage resource (e.g. Battle Master Superiority Dice). */
export interface FeatureResource {
  name: string
  die?: string                    // e.g. "d8" — optional (some resources are flat counts)
  by: FeatureResourceStep[]
}

export interface FeatureChoiceGroup {
  key: string
  label: string
  /** Granted by this class (and optionally only with this subclass). Counts scale
   * with the OWNING class's level from character.classes[], never total level (INV-2). */
  source: { classSlug: string; subclassSlug?: string | null }
  known: FeatureKnownStep[]
  allowReplace?: boolean
  resource?: FeatureResource
  options: FeatureOption[]         // pools (optionsRef in source) are resolved at build time
}

/** Compiled class-features.json — keyed by group key. */
export type ClassFeatureData = Record<string, FeatureChoiceGroup>
