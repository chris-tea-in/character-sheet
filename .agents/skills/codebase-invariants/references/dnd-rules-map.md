# D&D 2014 Rules → App Map (mechanics-correctness layer)

Companion to [system-map.md](system-map.md) (dataflow) and [invariants.md](invariants.md)
(architecture). This file is the **game-rules** layer: the 2014 5e math the app must produce, the
render-time application order, and the catalog of rules the app currently gets wrong.

- **Canonical edition: 2014 5e (SRD 5.1).** A 2014↔2024 difference is NOT a bug here.
- **Full prose + citations + worked examples:** [`DND_RULES_REFERENCE.md`](../../../../docs/reference/DND_RULES_REFERENCE.md)
  at the repo root (18 subsystem sections + the full 58-finding audit). This file is the *checkable
  distillation* — read it before editing anything that computes a character stat.

## Canonical formulas (must match exactly)

| Quantity | Formula | Code |
|---|---|---|
| Ability modifier | `floor((score − 10) / 2)` (rounds toward −∞; 9→−1) | `dice.ts:abilityModifier` |
| Proficiency bonus | `ceil(level / 4) + 1`, by **total** character level | `dice.ts:proficiencyBonus` |
| Skill/save mod | `abilityMod + (proficient ? PB : 0)`; expertise `×2 PB` | `characterStats.ts:802-818` |
| Spell save DC | `8 + PB + spellAbilityMod (+ bonuses)` | `characterStats.ts:846` |
| Spell attack | `PB + spellAbilityMod (+ bonuses)` | `characterStats.ts:845` |
| AC (no armor) | `10 + DEX` · light `base+DEX` · medium `base+min(DEX,2)` · heavy `base` · shield `+2` | `characterStats.ts:341-363, 849-930` |
| Max HP (avg) | L1 `die+CON`; +`(floor(die/2)+1)+CON` per later level; min 1/level | `characterSetup.ts:49-103` |
| Passive skill | `10 + skillMod (+5 adv / −5 disadv)` | `characterStats.ts:828-829` |
| Weapon attack | `abilityMod + (proficient ? PB : 0) + magic + style` (melee STR, ranged DEX, finesse max) | `characterStats.ts:407-444` |
| Weapon damage | `dice + abilityMod + magic + item/style` — **never PB** | `characterStats.ts:432` |
| Death save | d20: ≥10 success / ≤9 fail · nat20 = +1 HP · nat1 = 2 fails · 3/3 = stable/dead | `CombatBlock.tsx` |
| Adv/disadv | roll 2d20 keep higher/lower; **never stacks**, one-of-each cancels to normal | `store/dice.ts:80-84` |

## Render-time application order (`deriveCharacterStats`)

Abilities: `base` → **+ racial ASIs (UNCAPPED)** → **+ feat ASIs (`Math.min(20,…)`)** → **+ item
(uncapped)**. PB is `proficiencyBonus(character.level)` = TOTAL level. All effects apply exactly
once here; write sites store choices only (**INV-1**). Multiclass math reads **all** class records,
never just primary (**INV-2**). Spell stats read the **first** caster class only (see DND-SPELL1).

## Mechanics invariants (DND-*) — checkable

Each is a load-bearing "this app handles X as Y" fact. Grep recipes are ripgrep. These encode the
**current** behavior (mostly gaps); honor them when tracing, and update this file if a fix lands.

### DND-AC1 — AC has only worn-armor / item / Defense-style bases
`effectiveAC` is computed solely from worn armor (`10 + DEX` baseline, then `parseArmorAC`), magic-item
`ac`/`unarmored_ac` effects, and the Defense fighting style. There is **no Unarmored Defense**
(Barbarian `10+DEX+CON`, Monk `10+DEX+WIS`), **no Draconic/natural-armor/Mage-Armor base**. An
unarmored Barbarian/Monk/Sorcerer falls back to the manual `armorClass` stepper.
- Recipe: `rg -n "effectiveAC|parseArmorAC|unarmoredAcBase" src/lib/characterStats.ts` — no class-slug branch exists.

### DND-SPELL1 — spell DC/attack are single-caster
DC/attack derive from `classRecords.find(c => c.spellcasting?.ability)` — the **first** caster only.
A two-caster multiclass (e.g. Wizard/Cleric) shows ONE DC/attack. Eldritch Knight / Arcane Trickster
have `spellcasting: null` in data, so their DC/attack are 0.
- Recipe: `rg -n "castingClass|spellSaveDC|spellAttackBonus" src/lib/characterStats.ts`.

### DND-WPN1 — weapon proficiency is brittle exact-string matching
`isWeaponProficient` matches only the lowercased tokens `"simple weapons"`, `"martial weapons"`,
`"all weapons"`, or an **exact** weapon name. `"all simple weapons"` (Cleric), singular/plural
(`"dagger"` vs `"daggers"`), and race weapon-training traits never match → no PB on those attacks.
- Recipe: `rg -n "isWeaponProficient|weaponProficiencies" src/lib/characterStats.ts`.

### DND-RACE1 — race traits beyond ASIs are mostly unmodeled
Applied: racial ASIs (`getRacialBonuses`), the `RACE_ADVANTAGES`/`SUBRACE_ADVANTAGES` tables, and the
hardcoded `SUBRACE_HP_BONUS` (hill-dwarf only). **NOT** applied: race/subrace skill proficiencies,
weapon training, damage resistances, and the `hp_bonus_per_level` data field. Floating racial ASI
pools using the `{choose, amount}` shape (Changeling/Fairy/Harengon/Owlin) and subrace `asi_choices`
(Variant Human +1/+1) have no wizard picker → silently lost.
- Recipe: `rg -n "getRacialBonuses|RACE_ADVANTAGES|SUBRACE_HP_BONUS|asi_choices" src/lib src/components/setup`.

### DND-FEAT1 — only data-`effects` feats apply; wizard slot drops half-feat grants
Applied: feats whose data carries an `effects` array (`asi`/`initiative`/`speed`/`save_proficiency`/
`skill_proficiency`/`expertise`) + the `FEAT_EFFECTS` registry (`tough`, `observant`). The creation
wizard's feat slot captures only the ASI pick — half-feat **skill/expertise** grants are dropped
there (the sheet's FeatsBlock captures them). Situational feats (GWM/Sharpshooter/Lucky/Polearm
Master…) are intentionally manual. A representable benefit missing from a feat's data is silently ignored.
- Recipe: `rg -n "FEAT_EFFECTS|computeFeatStatDelta|effects" src/lib/characterStats.ts`.

### DND-SAVE1 — save sources are class + feat + item only
`effectiveSaveProficiencies` = class saves + feat (Resilient) saves; item `save` effects add a flat
bonus. **Paladin Aura of Protection** (+CHA to all saves in range) and **Monk Diamond Soul** (prof in
all saves) have NO derive path.
- Recipe: `rg -n "effectiveSaveProficiencies|saveModifiers|saveBonuses" src/lib/characterStats.ts`.

### DND-RES1 — class resource pools & rest are unmodeled
Resource pools (Rage, Ki, Sorcery Points, Bardic Inspiration, Channel Divinity, Wild Shape, Action
Surge, Lay on Hands, Superiority Dice) are tracked **only** where a `FeatureResource` is authored in
`class-features.json` — today only Battle Master superiority dice. There is **no rest action**:
`featureResourcesUsed` / `spellSlotsUsed` / `hitDiceUsed` are never auto-reset; recovery is manual.
- Recipe: `rg -n "featureResourcesUsed|resourceCount|short rest|long rest" src/`.

### DND-HP1 — temp HP / hit dice / CON are inert in places
Temp HP never absorbs damage (`changeHp` ignores `tempHp`). Raising CON after creation does NOT
retro-update max HP (the `conMod×level` term is baked into stored `maxHp`, not derived). Spending a
hit die logs a heal but doesn't change `currentHp`.
- Recipe: `rg -n "tempHp|changeHp|adjustedMaxHp" src/components/sheet/CombatBlock.tsx src/lib/characterStats.ts`.

### DND-ROLL1 — roll coverage is partial
Skill & save rolls honor the advantage tristate (**INV-11**). **Ability checks, attack rolls, and
initiative cannot be rolled with advantage/disadvantage** (no field / no dispatch path); initiative is
display-only. Inspiration is decorative. Half-proficiency (Jack of All Trades, Remarkable Athlete) and
Reliable Talent are applied to no roll.
- Recipe: `rg -n "advantage|RollKind|initiative" src/types/dice.ts src/store/dice.ts src/lib/useRollDispatch.ts`.

### DND-ABL1 — the 20 cap is applied inconsistently
Level-up/feat ASIs clamp the **base/feat** step at 20, but the **racial** step at derive time is
**uncapped** (`effectiveAbilities[ab] = effectiveAbilities[ab] + amount`), and the write-time HP/AC
seed clamps with `Math.min(20,…)`. So an effective score can read above 20 from PC advancement, and a
later feat `+1` can *lower* an already-over-20 effective score.
- Recipe: `rg -n "Math.min\(20|racialBonuses\[ab\]|effectiveAbilities\[ab\] = effectiveAbilities" src/lib/characterStats.ts src/lib/characterSetup.ts`.

## Known-gaps catalog (2014 RAW not honored)

58 confirmed deviations (code-traced + rule-sourced). Full detail (RAW / app / example / fix) per
entry in [`DND_RULES_REFERENCE.md`](../../../../docs/reference/DND_RULES_REFERENCE.md) Part 2. One-liners by subsystem:

### Ability Scores & Modifiers
- 🟡 `code` Level-up ASI caps the BASE score at 20, letting effective score exceed 20 from PC advancement alone
- 🟢 `code` Feat ASI step can LOWER an effective score that racial ASIs already pushed over 20
- 🟢 `feature` No Standard Array or 4d6-drop-lowest ability-generation method
- 🟢 `code` Sheet ability stepper silently mutates BASE when the effective score is feat/racial-capped, and permits base up to 30

### Proficiency Bonus
- 🟢 `code` Remarkable Athlete (Champion Fighter 7) half-proficiency not applied to non-proficient STR/DEX/CON checks

### Skills & Ability Checks
- 🟡 `code` Passive Perception / Investigation computed but never surfaced; Observant +5 invisible
- 🟡 `code` Jack of All Trades / Remarkable Athlete (half-proficiency) never applied
- 🟡 `code` Reliable Talent floor (treat d20 <10 as 10) not applied to proficient skill rolls
- 🟡 `code` Armor stealth disadvantage is derived but never applied to the Stealth roll

### Saving Throws
- 🔴 `code` Paladin Aura of Protection (+CHA mod to all saves) not applied
- 🟡 `code` Monk Diamond Soul (proficiency in all saving throws) not applied
- 🟡 `data` Stone of Good Luck (Luckstone) +1-to-all-saves effect not authored / silently ignored

### Armor Class
- 🔴 `code` Barbarian Unarmored Defense (10+DEX+CON) is never computed
- 🔴 `code` Monk Unarmored Defense (10+DEX+WIS) is never computed
- 🟡 `code` Draconic Sorcerer / natural-armor unarmored bases (13+DEX, 17, etc.) never computed

### Hit Points & Hit Dice
- 🔴 `code` Temporary HP never absorbs damage — it is an inert display stepper
- 🟡 `feature` No short-rest or long-rest action — HP and hit-dice recovery are entirely manual
- 🟡 `code` Raising CON after creation does not retroactively increase max HP
- 🟢 `code` Spending a hit die logs a heal total but does not change current HP

### Death Saves & Dropping to 0 HP
- 🟢 `code` Taking damage while at 0 HP does not record a death-save failure

### Speed & Initiative
- 🟡 `code` Initiative is a static display value and cannot be rolled
- 🟡 `code` Heavy armor below its STR requirement does not reduce speed by 10 ft
- 🟢 `code` Bard Jack of All Trades does not add half proficiency bonus to initiative
- 🟢 `code` Speed bonus tag hard-labeled '(feat)' even for item-sourced bonuses

### Weapons & Attack Rolls
- 🔴 `code` Cleric gets no proficiency bonus on simple weapons ("All simple weapons" never matches)
- 🔴 `code` Individual-weapon class proficiencies fail singular/plural match (Wizard dagger, Druid scimitar, etc.)
- 🟡 `code` Race-granted weapon proficiencies (Elf/Dwarf/Drow Weapon Training) never applied
- 🟢 `code` Versatile weapons cannot roll their two-handed die

### Spellcasting Resources (slots, known/prepared, cantrips, pact)
- 🟡 `code` Level-up slot-reset uses single-class table, mis-resets multiclass slots
- 🟡 `code` Known casters cannot swap a spell on level-up (list only grows)
- 🟢 `code` Multiclass 'Spells Known' cap shows the primary class's count only

### Spell Save DC & Spell Attack Bonus
- 🔴 `code` Multiclass with two casting abilities computes only one spell save DC / attack bonus (second class's ability silently ignored)
- 🟡 `data` Eldritch Knight / Arcane Trickster have no spellcasting ability in data, so their spell save DC and attack bonus are zero / unrepresentable

### Classes, Subclasses & Multiclassing
- 🟡 `code` Multiclassing grants the secondary class's FULL weapon/armor proficiencies, not the PHB subset
- 🟡 `code` No multiclass prerequisite (>=13 in key ability of both classes) check or warning

### Races & Subraces
- 🔴 `code` Subrace asi_choices pools have no wizard picker (Variant Human +1/+1 lost)
- 🔴 `code` Floating racial ASI pools using {choose, amount} shape are silently ignored (Changeling, Fairy, Harengon, Owlin)
- 🟡 `code` Racial ASIs are not capped at 20 at derive time, but the write-time HP/AC seed is — inconsistent sheet
- 🟡 `code` Racial damage resistances never apply (Tiefling fire, Dragonborn ancestry, Genasi, Aasimar, Shadar-kai)
- 🟡 `code` Race-granted skill proficiencies are never applied (Elf Perception, Half-Orc Intimidation, etc.)
- 🟢 `code` Subrace hp_bonus_per_level data field is ignored; only a hardcoded hill-dwarf registry works

### Backgrounds
- 🟡 `code` Creation wizard silently drops a background's fixed granted languages
- 🟡 `code` Sheet-side background change merges 'None' and prose strings as literal languages
- 🟢 `code` Background tool-category choices stored verbatim as fake tool-proficiency names
- 🟢 `code` Feylost background offers no language choice despite RAW granting one
- 🟢 `code` Background-skill detection infers source from proficient options, miscounting overlaps
- 🟢 `feature` 2024-edition backgrounds (ability-score increase + Origin feat) not representable

### Feats
- 🔴 `code` Half-feat skill/expertise grants silently dropped when feat taken in the creation wizard
- 🟡 `data` Alert feat's +5 initiative bonus is not applied

### Class/Subclass Features & Resource Pools
- 🔴 `data` Rage uses and Rage damage entirely untracked (Barbarian core resource)
- 🔴 `data` Ki, Sorcery Points, Bardic Inspiration, Channel Divinity, Wild Shape, Action Surge, Lay on Hands have no resource tracker
- 🟢 `code` Battle Master Superiority Die size fixed at d8, never scales to d10/d12
- 🟢 `feature` No short/long-rest action to refill resource pools; stored usage not re-clamped on save

### Items, Tools, Attunement & Currency
- 🟡 `code` Tool proficiency never adds proficiency bonus to a check
- 🟡 `code` Attunement cap of 3 is only a warning, all attuned items still apply

### Dice Engine, Advantage/Disadvantage & Real-Time Play
- 🟡 `code` Attack rolls cannot be rolled with advantage/disadvantage at all
- 🟡 `code` Disadvantage is never applied to any roll; adv+dis cancellation is impossible
- 🟢 `code` Inspiration is a decorative toggle that grants no mechanical advantage
