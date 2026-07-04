# D&D 5e (2014) Rules → App Reference & Mechanics Audit

> **Canonical ruleset: D&D 5e *2014* (SRD 5.1 / 2014 Basic Rules).** This document is the
> authoritative map between the real rules and how this character-sheet app implements them.
> 2024 ("5.5e") changes are called out as **2024 delta** side-notes only — they are *not* the
> standard and a 2014↔2024 difference is **not** a bug here.
>
> Every rule statement is sourced where it was web-verified. Every "how the app does it" claim is
> grounded in a real `file:line`. Discrepancies were produced by an adversarial two-pass audit
> (code-trace + independent rules sourcing); only findings confirmed by both survive into the
> [Audit](#part-2--mechanics-audit).

This file is for **future development**: before touching any block (abilities, AC, spells,
weapons, …), read its section here to get (1) the RAW rule, (2) every modifier that can raise or
lower it, (3) what it rolls and how the roll resolves, (4) exactly how the app derives it, and
(5) the known gaps. It complements — does not replace:

- [CLAUDE.md](CLAUDE.md) — stack, architecture, the render-time-derivation policy.
- [bugs.md](bugs.md) — the live bug log; audit findings cross-reference its BUG-ids.
- `.claude/skills/codebase-invariants/` — the invariant catalog + `references/dnd-rules-map.md`
  (the durable "this app must handle X as Y" rules distilled from this document).

---

## How to read each subsystem entry

Every subsystem in [Part 1](#part-1--subsystem-reference) follows the same five-part shape:

| Heading | What it gives you |
|---|---|
| **The Rule (2014 RAW)** | The canonical rule, with source citations. |
| **What Modifies It** | Every source that raises/lowers the value, each tagged **auto** (the app derives it), **manual** (the player must enter/track it), or **not represented**. |
| **What It Rolls & How It Resolves** | The dice + formula, or "static value, no roll". Advantage/crit interactions noted. |
| **How This App Handles It** | The store → derive → render path with `file:line`. |
| **Gaps & Mis-Handling** | Confirmed deviations, each linked to the [Audit](#part-2--mechanics-audit). |

Audit findings carry three tags:

- **Severity** — 🔴 high (wrong number / silently-ignored data), 🟡 medium (wrong in specific
  scenarios), 🟢 low (polish / edge / intentional-but-noted).
- **Class** — **code** (logic is wrong), **data** (the logic is right but a `data/*.json` entry is
  missing the effect), or **feature** (the mechanic isn't modelled at all).
- **Status vs. `bugs.md`** — `[NEW]` (not previously logged) or `[BUG-NN]` (already tracked).

---

## The engine in one page

This app's single most important rule is the **stored-base → derived-effective** split. Get this
wrong and you get the two failure families that dominate `bugs.md`: *double-counting* (a value baked
at write time **and** derived) and *silently-ignored data* (an effect that exists in data but is
applied nowhere).

**Stored = base values.** `character.*` fields hold base numbers: `abilities` are point-buy/rolled
scores plus permanent level-up ASI +1s; `speed` is the race base; `maxHp` is rolled/average HP;
`armorClass` is a manual fallback. Racial ASIs, feat effects, magic-item effects, and class-feature
effects are **never** baked into these. ([src/types/character.ts](src/types/character.ts))

**Derived = effective values.** [`deriveCharacterStats(character, ctx)`](src/lib/characterStats.ts)
is the **single render-time application point** for every effect. It returns `effectiveAbilities`,
`effectiveAC`, `effectiveSpeed`, `adjustedMaxHp`, `skillModifiers`, `saveModifiers`,
`spellAttackBonus`, `spellSaveDC`, `weaponProficiencies`, etc. Sheet blocks read these `effective*`
fields — never the raw stored field — for any stat. Write sites record *choices*
(`feats`, `featChoices`, `raceAsiChoices`, `equipment[].equipped/attuned`, `classFeatureChoices`),
never the resulting numbers.

**The effect-application order inside `deriveCharacterStats`** (abilities example): base → `+` racial
ASIs (uncapped) → `+` feat ASIs (`Math.min(20, …)`) → `+` active-item ability effects (uncapped).
([characterStats.ts:714-785](src/lib/characterStats.ts#L714-L785))

**Multiclass is first-class.** `character.classes[]` (`{classSlug, subclassSlug, level}[]`) is the
source of truth; `classes[0]` is primary. `updateCharacter` re-derives the legacy `class`/`subclass`/
`level` columns from it on every write. Any rule that consumes class data (proficiency, slots, ASI
cadence, hit dice) must consider **all** records, not just the primary (invariant **INV-2**).

**The roll engine.** [`useDiceStore.roll(kind, derived)`](src/store/dice.ts#L78) rolls `d20 +
modifier`, pulling the modifier from `derived` (`skillModifiers`, `saveModifiers`, `abilityModifier(
effectiveAbilities[…])`, or a pre-computed attack modifier). Advantage is a **tristate**:
`advantage: true` rolls 2d20 keep-higher, `false` keep-lower (disadvantage), `undefined` normal
(**INV-11**). Attack rolls use the two-phase [DiceRollModal](src/components/sheet/DiceRollModal.tsx)
(hit → damage; nat 20 auto-advances and doubles damage dice; nat 1 = critical miss). Roll history is
session-only (never persisted).

### Core formulas (all RAW-exact in code unless noted)

| Quantity | Formula | Where |
|---|---|---|
| Ability modifier | `floor((score − 10) / 2)` | [dice.ts:10](src/lib/dice.ts#L10) |
| Proficiency bonus | `ceil(level / 4) + 1`, by **total** level | [dice.ts:14](src/lib/dice.ts#L14) |
| Skill / save modifier | `abilityMod + (proficient ? PB : 0)`; expertise `×2 PB` | [characterStats.ts:802-818](src/lib/characterStats.ts#L802-L818) |
| Spell save DC | `8 + PB + spellAbilityMod (+ item/manual)` | [characterStats.ts:846](src/lib/characterStats.ts#L846) |
| Spell attack | `PB + spellAbilityMod (+ item/manual)` | [characterStats.ts:845](src/lib/characterStats.ts#L845) |
| Worn-armor AC | `parseArmorAC(ac_formula, dexMod) + bonus (+ shield)` | [characterStats.ts:849-930](src/lib/characterStats.ts#L849-L930) |
| Max HP (avg) | `die + (floor(die/2)+1)·(level−1) + conMod·level`, min 1 | [characterSetup.ts:49-73](src/lib/characterSetup.ts#L49-L73) |
| Passive skill | `10 + skillModifier (+ feat bonus)` | [characterStats.ts:828-829](src/lib/characterStats.ts#L828-L829) |
| Weapon attack | `abilityMod + (proficient ? PB : 0) + magic + style` | [characterStats.ts:407-444](src/lib/characterStats.ts#L407-L444) |
| Weapon damage | `dice + abilityMod + magic + item/style` (no PB) | [characterStats.ts:432](src/lib/characterStats.ts#L432) |

> **Two derive-time facts that the audit hinges on:**
> 1. **AC** only ever computes from *worn armor + items + the Defense fighting style.* There is **no
>    Unarmored Defense path** (Barbarian/Monk) and no spell/natural-armor base. ([characterStats.ts:849-930](src/lib/characterStats.ts#L849-L930))
> 2. **Spell DC/attack** uses only the **first** spellcasting class (`classRecords.find(c =>
>    c.spellcasting?.ability)`), so a two-caster multiclass collapses to one ability.
>    ([characterStats.ts:834-847](src/lib/characterStats.ts#L834-L847))

---

## Table of contents

**Part 1 — Subsystem reference** *(rules → app mapping)*

1. Ability Scores & Modifiers
2. Proficiency Bonus
3. Skills & Ability Checks
4. Saving Throws
5. Armor Class
6. Hit Points & Hit Dice
7. Death Saves & Dropping to 0 HP
8. Speed & Initiative
9. Weapons & Attack Rolls
10. Spellcasting Resources (slots, known/prepared, cantrips, pact)
11. Spell Save DC & Spell Attack Bonus
12. Classes, Subclasses & Multiclassing
13. Races & Subraces
14. Backgrounds
15. Feats
16. Class/Subclass Features & Resource Pools
17. Items, Tools, Attunement & Currency
18. Dice Engine, Advantage/Disadvantage & Real-Time Play

**Part 2 — Mechanics audit** *(severity-ranked, confirmed deviations from 2014 RAW)*

**Part 3 — Spell data verification** *(all 567 spell entries checked vs open5e SRD + the wiki)*

---

# Part 1 — Subsystem reference

<a id="s1"></a>

## Ability Scores & Modifiers

### The Rule (5e RAW)

A creature has six ability scores: Strength (STR), Dexterity (DEX), Constitution (CON), Intelligence (INT), Wisdom (WIS), Charisma (CHA).

- **Score range:** 1–30. A score of 0 means incapacity in that area; 30 is the absolute maximum any creature can reach.
- **Modifier:** `floor((score − 10) / 2)`. So 1→−5, 8/9→−1, 10/11→+0, 12/13→+1, 18/19→+4, 20→+5, 30→+10. The modifier — not the raw score — feeds every check, save, attack, spell DC, AC (DEX), HP (CON), etc.
- **The 20 cap on player advancement:** A player character normally cannot raise an ability above **20** through level-up Ability Score Improvements or feats. This is the cap on *self-improvement*, not the absolute ceiling.
- **Magic items may exceed 20:** Items that *set* a score (Amulet of Health → CON 19, Belt of Hill Giant Strength → STR 21, Belt of Storm Giant Strength → STR 29) or grant a Manual/Tome bump can push a score above 20, up to the hard ceiling of 30. A *set* never lowers a score below what it already is.
- **Creation methods (PHB):**
  - **Point buy:** 27 points; each score starts at 8 and may be raised to 15 before racial bonuses; costs 8→0, 9→1, 10→2, 11→3, 12→4, 13→5, 14→7, 15→9.
  - **Standard array:** 15, 14, 13, 12, 10, 8 assigned to the six abilities.
  - **4d6-drop-lowest (rolled):** roll 4d6, drop the lowest die, six times; assign as desired.
- **Racial ASIs:** 2014 races grant fixed increases (e.g. +2/+1, or +2 to one ability) and some grant a flexible "+1 to N abilities of your choice" (half-elf: +2 CHA and +1 to two others). 2024/"variant" floating ASIs grant +1/+1/+1 or +2/+1 to chosen abilities. Racial ASIs are applied **at creation** and, per RAW, also can't take a creation score above 20.
- **Half-feats:** Many feats grant +1 to a fixed or chosen ability in addition to their main benefit (Resilient, Athlete, Actor, Heavy Armor Master, etc.), capped at 20.

### What Modifies It (increases / decreases)

- **Point-buy / custom entry at creation** — base score — *auto (wizard SetupScreen1)*.
- **Racial ASI (fixed)** — e.g. +2 STR Mountain Dwarf — *auto-derived (`getRacialBonuses` → `deriveCharacterStats`)*.
- **Racial ASI (flexible pool)** — e.g. half-elf +1/+1 — *auto-derived from `raceAsiChoices`*.
- **Subrace ASI (fixed + pools)** — *auto-derived (`getRacialBonuses` subrace branch)*.
- **Level-up ASI (+2 to one / +1 to two)** — *auto, baked into BASE `abilities` at write time (wizard `draftToNewCharacter`, `LevelUpDialog`)*.
- **Half-feat ASIs (fixed `asi:fixed` / chosen `asi:choice`)** — *auto-derived (`computeFeatStatDelta` → `deriveCharacterStats`), capped at 20*.
- **Magic item `ability_set`** (Amulet of Health, Belt of Giant Strength) — *auto-derived while active, uncapped, takes max(current, value)*.
- **Magic item `ability_bonus`** (additive) — *auto-derived while active, uncapped*.
- **Spells that change scores (Enhance Ability, Headband of Intellect-style, polymorph)** — *not represented* (the app has no temporary-buff layer).
- **Conditions / exhaustion / drain that reduce scores** — *not represented* (situational, DM-adjudicated).

### What It Rolls & How the Roll Resolves

An ability score is a **static value, no roll** — it only sources a modifier. The modifier drives:

- **Ability check:** d20 + `abilityModifier(score)` (`useDiceStore.roll` `'ability'` kind; AbilityBlock dispatches `{ type: 'ability', ability }`).
- **Saving throw / skill / attack / spell:** the modifier folds into those subsystems' rolls.
- Advantage/disadvantage and crit are properties of the *roll*, not the score. The score-to-modifier conversion (`floor((score − 10) / 2)`) is `abilityModifier` in `src/lib/dice.ts:10-12` and is RAW-exact at every breakpoint, including negative scores (1→−5).

### How This App Handles It

**Stored base → derived effective split (the core architecture):**

- `character.abilities` holds **base scores** = point-buy/custom value + permanent level-up ASI +1s (`src/types/character.ts:79-81`). Racial ASIs, feat ASIs, and item ability effects are **not** baked in.
- `deriveCharacterStats` (`src/lib/characterStats.ts:704-981`) produces `effectiveAbilities` in this fixed order:
  1. `effectiveAbilities = { ...character.abilities }` (line 715).
  2. Add racial bonuses from `getRacialBonuses(race, raceAsiChoices, subrace)` — **uncapped**, `effectiveAbilities[ab] = effectiveAbilities[ab] + amount` (lines 716-719).
  3. Add feat ASIs via `computeFeatStatDelta`, `effectiveAbilities[ab] = Math.min(20, effectiveAbilities[ab] + amount)` (lines 730-733).
  4. Add active-item `ability_bonus` (additive, uncapped, line 781) and `ability_set` (`Math.max(effective, value)`, uncapped, line 784).
- `racialBonuses.ts:getRacialBonuses` (lines 20-61) sums fixed race + flexible race pools + fixed subrace + subrace pools, indexing `raceAsiChoices` race-first then subrace — RAW-faithful for both fixed and floating patterns.
- **Modifiers everywhere read effective:** `skillModifiers`/`saveModifiers`/`spellAttackBonus`/`spellSaveDC`/`effectiveInitiative` all use `abilityModifier(effectiveAbilities[...])` (lines 791, 806, 815, 839). Sheet `AbilityBlock` renders `derived.effectiveAbilities[ability]` (`AbilityBlock.tsx:73`) and the modifier from it (line 26/49).

**Creation (wizard, SetupScreen1):**

- Two methods only: `'pointbuy'` and `'custom'` (`characterSetup.ts:510`, `SetupScreen1.tsx:71-74`). Point buy enforces 8–15 and the 27-point budget (`pointsRemaining`, `pointBuyCost`, `POINT_BUY_COST` map at `characterSetup.ts:22-39`). Custom mode allows 1–20 free entry per ability (`SetupScreen1.tsx:205-207, 213, 735`).
- The wizard displays `effective = base + racialBonus` live with a `(base N+B)` annotation (`SetupScreen1.tsx:730-763`) but the stepper edits **base** only.
- Level-up/feat ASI slots (one per qualifying class level across all classes, `getAllAsiSlots`) bake +1s into base with `Math.min(20, …)` (`characterSetup.ts:686-691`), and feat picks store `featChoices` only.

**Sheet edit:**

- `AbilityBlock.saveScore` (`AbilityBlock.tsx:58-61`) reverses the derived delta to recover base: `bonus = effective − base`, writes `Math.max(1, v − bonus)`. The stepper bounds are `min={1} max={30}` (lines 37-38).
- `LevelUpDialog` line 247 writes level-up +1s with `Math.min(20, …)` into base; `toggleAsiSelection` (`characterSetup.ts:413-423`) correctly supports +2-to-one (the BUG-28/33 fix).

### Gaps & Mis-Handling

- **Level-up ASI 20-cap is applied to the BASE score, not the effective (racial-inclusive) score** — a character can end with an effective ability above 20 from PC advancement alone. (`characterSetup.ts:690`, `LevelUpDialog.tsx:247`, compounded by the no-cap racial step at `characterStats.ts:718`.)
- **Feat ASI cap can *lower* an already-over-20 effective score** — because racial ASIs are added uncapped before the feat step's `Math.min(20, …)`, a feat's +1 can pull the displayed score down. (`characterStats.ts:732`.)
- **No native Standard Array or 4d6-drop-lowest creation method** — only point-buy and custom. (`characterSetup.ts:510`.) Custom mode can represent both manually, so this is a design limitation rather than a numeric error; logged as low severity / mostly intentional.
- **Sheet ability stepper allows base up to 30 and silently mutates base when the effective is feat/racial-capped** — editing a capped ability appears to do nothing while quietly changing the stored base. (`AbilityBlock.tsx:37-38, 58-61`.) Low severity; flagged for awareness.

#### Sourced rule facts (2014 RAW, web-verified)

- There are six abilities, each measuring a facet of a creature: Strength (physical power), Dexterity (agility), Constitution (endurance), Intelligence (reasoning and memory), Wisdom (perception and insight), and Charisma (force of personality). Each ability has a numeric score. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/using-ability-scores)
- A score of 10 or 11 is the normal human average. A score of 18 is the highest a person usually reaches without supernatural aid. Adventurers (player characters) can have scores as high as 20, and monsters and divine beings can have scores as high as 30. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/ability-scores/)
- An ability modifier is derived from the score: subtract 10 from the ability score and divide by 2, rounding down. modifier = floor((score - 10) / 2). It ranges from -5 (score 1) to +10 (score 30). — [src](https://dnd5e.info/using-ability-scores/ability-scores-and-modifiers/)
- An ability check, a saving throw, and an attack roll all use the same core: roll a d20, add the relevant ability modifier, and add the proficiency bonus if proficient. — [src](https://dnd5e.info/using-ability-scores/ability-checks/)
- Proficiency bonus is determined by total character level (not class level), increasing at certain level thresholds, and your proficiency bonus can't be added to a single die roll or other number more than once. — [src](https://dnd5e.info/beyond-1st-level/character-advancement/)
- When you have advantage, roll a second d20 and use the higher of the two rolls; with disadvantage, use the lower. Multiple sources of advantage do not stack — you still roll only one additional d20. If a roll has both advantage and disadvantage, you are considered to have neither and roll one d20, even if multiple circumstances impose disadvantage and only one grants advantage (or vice versa). — [src](https://dnd5e.info/using-ability-scores/advantage-and-disadvantage/)
- A passive check total is: 10 + all modifiers that normally apply to the check. If the character has advantage on the check, add 5; for disadvantage, subtract 5. — [src](https://www.dndbeyond.com/sources/dnd/free-rules/playing-the-game)
- Ability scores are determined at character creation by one of: rolling 4d6 and recording the sum of the highest three (repeat six times), using the Standard Array (15, 14, 13, 12, 10, 8), or the Variant: Customizing Ability Scores point-buy system (27 points). — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/step-by-step-characters)
- In the point-buy variant, you have 27 points to spend; every score starts at 8 and may be raised to a maximum of 15 (before racial increases). Costs: 8=0, 9=1, 10=2, 11=3, 12=4, 13=5, 14=7, 15=9. The cost is non-linear (14 and 15 each cost 2 points per step, not 1). — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/step-by-step-characters)
- After generating base scores, you apply ability score increases from your race. Racial ability score increases in 2014 never exceed +2 to any single ability, so the highest possible score at 1st level is 17 (15 from point buy/standard array + 2 racial) — or 20 only if an 18 was rolled and a +2 racial applies. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/step-by-step-characters)
- Ability Score Improvement: at certain class levels a character can increase one ability score by 2, or two ability scores by 1 each (this may instead be exchanged for a feat). You can't increase an ability score above 20 using this feature. — [src](https://dnd5e.info/beyond-1st-level/character-advancement/)
- No ability score can normally exceed 20 for a player character; you can't increase an ability score above 20. — [src](https://dnd5e.info/beyond-1st-level/character-advancement/)
- Working together: when one character helps another, the one being helped (or leading the effort) makes the ability check with advantage. Normally only one creature can grant this help to a given check unless the task is one many could plausibly assist with. — [src](https://dnd5e.info/using-ability-scores/ability-checks/)

#### Key tables

**Ability Scores and Modifiers (2014, SRD 5.1)** — [src](https://dnd5e.info/using-ability-scores/ability-scores-and-modifiers/)

```
Score | Modifier
1 | -5
2-3 | -4
4-5 | -3
6-7 | -2
8-9 | -1
10-11 | +0
12-13 | +1
14-15 | +2
16-17 | +3
18-19 | +4
20-21 | +5
22-23 | +6
24-25 | +7
26-27 | +8
28-29 | +9
30 | +10

Formula: modifier = floor((score - 10) / 2). Each modifier covers a 2-point band; odd scores share the modifier of the even score one below them (e.g. 13 and 12 both give +1).
```

**Point-Buy Cost Table (Variant: Customizing Ability Scores, 2014)** — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/step-by-step-characters)

```
Score | Cost
8 | 0
9 | 1
10 | 2
11 | 3
12 | 4
13 | 5
14 | 7
15 | 9

Total budget: 27 points. Each score must be between 8 and 15 (inclusive) BEFORE racial increases. Note the non-linear jump: 13->14 and 14->15 each cost 2 points. The Standard Array (15,14,13,12,10,8) costs exactly 27 points (9+7+5+4+2+0).
```

**Standard Array (2014)** — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/step-by-step-characters)

```
15, 14, 13, 12, 10, 8

Assign these six values, one per ability, in any arrangement. Sum of modifiers before racials: +2,+2,+1,+1,+0,-1 = +5 (net). Equivalent in point-buy cost to spending all 27 points.
```

**4d6-Drop-Lowest Rolling Method (2014)** — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/step-by-step-characters)

```
Roll four 6-sided dice (4d6). Drop (discard) the lowest single die. Sum the highest three dice; that total is one ability score. Repeat to generate six scores, then assign them to abilities in any order. Average score ~12.24; theoretical range 3-18 per score.
```

**Proficiency Bonus by Total Character Level (2014)** — [src](https://dnd5e.info/beyond-1st-level/character-advancement/)

```
Level | Proficiency Bonus
1-4 | +2
5-8 | +3
9-12 | +4
13-16 | +5
17-20 | +6

Formula: proficiencyBonus(level) = ceil(level/4) + 1. For multiclass characters use TOTAL level (sum across all classes), never per-class level.
```

#### 2024 deltas (not canonical here)

- Racial (species) ability score increases are REMOVED in 2024. Species no longer grant fixed ASIs (e.g. Dwarf no longer auto-grants +2 CON). An app modeling 2014 should keep race-based ASIs; for 2024 it must source ASIs from Background instead.
- In 2024, ability score increases come from your BACKGROUND. Each background lists three abilities; you either increase one by 2 and another by 1, or increase all three by 1. No single score may be raised above 20 by this. (Side-note only — 2014 canon keeps increases on race.)
- 2024 caps Background ability increases so no score exceeds 17 at character creation from background alone (15 base + 2). The 20 PC cap and the floor((score-10)/2) modifier formula are UNCHANGED in 2024.
- Standard Array (15,14,13,12,10,8), the 27-point point-buy budget, the point-buy cost table (8=0 ... 15=9), the pre-increase [8,15] range, and the 4d6-drop-lowest method are all UNCHANGED from 2014 to 2024.
- The Ability Scores and Modifiers table, proficiency-bonus-by-level table, advantage/disadvantage mechanics, passive-check formula (10 + modifiers, +/-5 for adv/dis), and the 'proficiency added only once' rule are UNCHANGED in 2024.

---

<a id="s2"></a>

## Proficiency Bonus

### The Rule (5e RAW)
Proficiency bonus is a single value that scales with **total character level** (PHB p.15), not with any individual class's level:

| Levels | Proficiency Bonus |
|---|---|
| 1–4  | +2 |
| 5–8  | +3 |
| 9–12 | +4 |
| 13–16| +5 |
| 17–20| +6 |

Formula: `ceil(level / 4) + 1`.

Multiclass characters use the **sum of all class levels** for this value (PHB p.163, "Your proficiency bonus is always based on your total character level… not your level in a particular class"). There is exactly one proficiency-bonus track for the whole character.

The bonus is added **once** to a d20 roll (or a static value like a save DC / passive score) whenever the character is proficient in the thing being used:
- Attack rolls with weapons/spells you are proficient with.
- Ability checks using a skill or tool you are proficient with.
- Saving throws of an ability whose save you are proficient in.
- Spell attack modifier (`spellcasting ability mod + PB`) and spell save DC (`8 + spellcasting ability mod + PB`).

**Core invariant: PB is never added more than once to a single roll.** The only ways it scales on one roll are:
- **Expertise** (Rogue/Bard, certain feats, certain items) — doubles PB for the affected skill or tool.
- **Jack of All Trades** (Bard 2) — adds **half** PB (rounded down) to any ability check that does **not** already include PB (i.e. non-proficient checks), and to initiative.
- **Remarkable Athlete** (Champion Fighter 7) — adds **half** PB (round up) to STR/DEX/CON checks not already proficient, and half PB to running long-jump distance.

PB also feeds derived static numbers: passive Perception/Investigation (10 + skill modifier, where the skill modifier already includes PB if proficient), and the DCs of class features.

### What Modifies It (increases / decreases)
The **base PB value itself** only ever changes with total level. Sources that change how PB is *applied* on a given roll:

- **Total character level** — the sole driver of the base PB number. *Auto-applied by app* (`proficiencyBonus(character.level)`, with `character.level` = summed multiclass total).
- **Expertise** (Rogue Expertise, Bard Expertise, Skill Expert/Prodigy feats, some tools) — doubles PB for that skill/tool. *Auto-applied by app* for skills (`prof === 'expertise' → pb*2`); feat-granted expertise is auto-merged. Tool expertise: *not represented* (no tool-check engine).
- **Jack of All Trades** (Bard 2) — +½ PB to non-proficient ability checks and initiative. **Not represented.**
- **Remarkable Athlete** (Champion 7) — +½ PB (round up) to certain non-proficient checks. **Not represented.**
- **Weapon/armor/save/skill/tool proficiency grants** (class, race, background, feat) — determine *whether* PB is added at all. *Auto-applied by app* for weapons (union across all classes), skills, saves (class + feat-derived). Tool checks: *not represented* as a roll.
- **Reliable Talent / Silver Tongue / etc.** — affect the die, not PB. *Not represented (intentionally manual / situational).*
- No 5e source ever *decreases* the base PB. (Effects that "remove proficiency" simply drop the bonus to 0 for that use; the app models this by the proficiency flag being absent.)

### What It Rolls & How the Roll Resolves
PB is a **static modifier**, not a die. It is added to:
- d20 attack/check/save rolls: `d20 + ability mod + (PB if proficient, ×2 if expertise)`.
- Static values: spell save DC `8 + ability mod + PB`; passive scores `10 + (skill modifier incl. PB)`.

Advantage/disadvantage and crits operate on the d20 portion; PB is unaffected by them (a crit doubles weapon damage dice, never the PB-bearing to-hit modifier).

### How This App Handles It
Single source of truth: `proficiencyBonus(level: number): number → Math.ceil(level / 4) + 1` ([src/lib/dice.ts:14-16](src/lib/dice.ts)). Verified correct at every breakpoint (1→+2, 4→+2, 5→+3, 9→+4, 13→+5, 17→+6, 20→+6); bugs.md line 82 records this was audited clean.

Store → derive → render path:
- `character.level` is the **total** multiclass level: `updateCharacter` re-derives it as `merged.classes.reduce((s,c)=>s+c.level,0)` ([src/storage/characterRepo.ts:227-229](src/storage/characterRepo.ts)); `upsertSyncedCharacter` does the same ([characterRepo.ts:308-310](src/storage/characterRepo.ts)). So PB correctly tracks summed multiclass level, satisfying INV-2 for the base value.
- `deriveCharacterStats` computes `const pb = proficiencyBonus(character.level)` once ([src/lib/characterStats.ts:711](src/lib/characterStats.ts)) and exposes it as `derived.proficiencyBonus` ([characterStats.ts:960](src/lib/characterStats.ts)).
- **Skills:** `profMod = prof ? pb * (prof === 'expertise' ? 2 : 1) : 0` ([characterStats.ts:808](src/lib/characterStats.ts)) — added once, doubled only for expertise. Stored in `skillModifiers`.
- **Saves:** `+ (effectiveSaveProficiencies.includes(ability) ? pb : 0)` ([characterStats.ts:817](src/lib/characterStats.ts)).
- **Spell attack / DC:** `spellAttackBonus = spellAbilMod + pb + …`; `spellSaveDC = 8 + spellAbilMod + pb + …` ([characterStats.ts:845-846](src/lib/characterStats.ts)).
- **Weapons:** PB added only when proficient — `pb = isWeaponProficient(...) ? proficiencyBonus(character.level) : 0` ([characterStats.ts:424](src/lib/characterStats.ts)); proficiency list is the union across all classes ([characterStats.ts:945-947](src/lib/characterStats.ts), [396-403](src/lib/characterStats.ts)).
- **Unarmed strike:** PB always added (`strMod + derived.proficiencyBonus + …`, [src/components/sheet/EquipmentBlock.tsx:223](src/components/sheet/EquipmentBlock.tsx)) — correct, since all creatures are proficient with unarmed strikes.
- **Roll dispatch:** `useDiceStore.roll` reads the precomputed `derived.skillModifiers[...]` / `derived.saveModifiers[...]` ([src/store/dice.ts:87-92](src/store/dice.ts)) — never recomputes PB, so no risk of double-add at roll time.
- **Display:** `CombatBlock` shows `+${derived.proficiencyBonus}` ([src/components/sheet/CombatBlock.tsx:343](src/components/sheet/CombatBlock.tsx)); `LevelUpDialog` previews old vs new PB using `proficiencyBonus(character.level)` vs `proficiencyBonus(storedLevel)` where `storedLevel = newTotalLevel ?? newLevel` ([src/components/sheet/LevelUpDialog.tsx:64,89-90](src/components/sheet/LevelUpDialog.tsx)) — uses total level for the preview.

### Gaps & Mis-Handling
- **Jack of All Trades (Bard 2) is not represented** — no +½ PB is added to non-proficient ability checks/skills or initiative anywhere in `deriveCharacterStats`. (See discrepancy `jack-of-all-trades`.)
- **Remarkable Athlete (Champion 7) is not represented** — no +½ PB (round up) to non-proficient STR/DEX/CON checks. (See discrepancy `remarkable-athlete`.)
- **Tool proficiency does not feed any roll** — `toolProficiencies` is stored as free-form names ([src/types/character.ts:125](src/types/character.ts)) but there is no tool-check roll dispatch (ProficienciesBlock only dispatches `'skill'` and `'save'`), so a proficient tool check never receives PB. This is "not represented" (no tool-check feature exists), not a miscomputation of a stat the app tries to produce — noted, not a numeric bug.
- **Distinct, already-logged:** BUG-10 (`getExpertiseCap` uses total level instead of class-specific level for multiclass) is an Expertise-*allocation* cap bug, not a PB-derivation bug; the PB value and its expertise-doubling are both correct.

#### Sourced rule facts (2014 RAW, web-verified)

- A character's proficiency bonus is determined solely by their level (total character level), not by ability scores or class. It is +2 for a 1st-level character and increases at certain levels. The bonus is used in the rules on ability checks, saving throws, and attack rolls. — [src](https://5thsrd.org/rules/proficiency_bonus/)
- Proficiency bonus progression by total level: +2 (levels 1-4), +3 (levels 5-8), +4 (levels 9-12), +5 (levels 13-16), +6 (levels 17-20). Equivalent closed form: proficiencyBonus = floor((level - 1) / 4) + 2, i.e. ceil(level / 4) + 1. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/character-advancement/)
- When multiclassing, your proficiency bonus is ALWAYS based on your total character level, not your level in a particular class. Levels in all classes are added together to determine character level (e.g. wizard 3 / fighter 2 = 5th-level character = +3 proficiency bonus). — [src](https://5thsrd.org/rules/multiclassing/)
- Your proficiency bonus can't be added to a single die roll or other number more than once. (E.g. proficiency in both a skill and an underlying tool does not stack.) — [src](https://5thsrd.org/rules/abilities/proficiency_bonus/)
- Occasionally your proficiency bonus is multiplied or divided (doubled or halved) before it is applied. The rogue's Expertise feature doubles the proficiency bonus for certain ability checks; Jack of All Trades halves it (rounded down) for non-proficient ability checks. — [src](https://www.5esrd.com/using-ability-scores/)
- Expertise doubles the proficiency bonus for the chosen ability checks (skills/tools). It applies only to ability checks, not to attack rolls or saving throws. In general you do not multiply the proficiency bonus for attack rolls or saving throws. — [src](https://www.5esrd.com/using-ability-scores/)
- If a feature allows you to multiply your proficiency bonus on an ability check that wouldn't normally benefit from the bonus, you still don't add it: your proficiency bonus for that check is 0 (multiplying 0 by any number is still 0). Therefore Expertise requires you to already be proficient in that skill/tool. — [src](https://5thsrd.org/rules/abilities/proficiency_bonus/)
- Rogue's Expertise: at 1st level choose two of your skill proficiencies, or one skill and thieves' tools, to double the proficiency bonus; at 6th level choose two more. Bard's Expertise: at 3rd level choose two skill proficiencies; at 10th level choose two more. — [src](https://5thsrd.org/rules/multiclassing/)
- Bard's Jack of All Trades (bard level 2): add HALF your proficiency bonus, rounded down, to any ability check you make that doesn't already include your proficiency bonus. Applies to ability checks only (including initiative, which is a Dexterity check), not to attack rolls or saving throws. — [src](https://farreachco.com/dnd/5e/srd/features/jack-of-all-trades)
- Spell save DC = 8 + your proficiency bonus + your spellcasting ability modifier (+ any special modifiers). Spell attack modifier = your proficiency bonus + your spellcasting ability modifier. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting)
- Attack roll proficiency: you add your proficiency bonus to a weapon attack roll only if you are proficient with that weapon (and to spell attacks you're always proficient with). Saving throws add the bonus only for the ability scores in which your class grants saving-throw proficiency. — [src](https://5thsrd.org/rules/abilities/proficiency_bonus/)
- Monsters also have a proficiency bonus, which is already incorporated into their stat blocks. Player proficiency bonus and monster proficiency bonus are independent (monster PB scales with Challenge Rating, not the same level table). — [src](https://5thsrd.org/rules/proficiency_bonus/)

#### Key tables

**Character Advancement / Proficiency Bonus by Level (2014)** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/character-advancement/)

```
Level | Experience Points | Proficiency Bonus
1  | 0       | +2
2  | 300     | +2
3  | 900     | +2
4  | 2,700   | +2
5  | 6,500   | +3
6  | 14,000  | +3
7  | 23,000  | +3
8  | 34,000  | +3
9  | 48,000  | +4
10 | 64,000  | +4
11 | 85,000  | +4
12 | 100,000 | +4
13 | 120,000 | +5
14 | 140,000 | +5
15 | 165,000 | +5
16 | 195,000 | +5
17 | 225,000 | +6
18 | 265,000 | +6
19 | 305,000 | +6
20 | 355,000 | +6
```

**Proficiency Bonus jump levels (summary)** — [src](https://roll20.net/compendium/dnd5e/Character%20Advancement)

```
PB +2: levels 1-4
PB +3: levels 5-8
PB +4: levels 9-12
PB +5: levels 13-16
PB +6: levels 17-20
Increases occur at levels 5, 9, 13, 17. Closed form: PB = floor((level-1)/4) + 2 = ceil(level/4) + 1.
```

**Proficiency multipliers applied to PB before use** — [src](https://www.5esrd.com/using-ability-scores/)

```
Normal proficient check/attack/save: + (1 x PB)
Expertise (proficient ability check only): + (2 x PB)
Jack of All Trades (non-proficient ability check only): + floor(PB / 2)
Not proficient: + 0 (PB treated as 0; multiplying 0 stays 0)
Reminder: PB can be added to a single roll at most once; attack rolls and saving throws are generally not multiplied.
```

#### 2024 deltas (not canonical here)

- The proficiency bonus-by-level table is UNCHANGED in the 2024 (5.5e) rules: +2 at levels 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17-20. Same XP thresholds. No code change needed for the core table.
- The 2024 rules formalize proficiency-bonus application in the Rules Glossary but the substance is the same: PB added once, doubled by Expertise on ability checks, not normally multiplied on attacks/saves. Multiclass PB is still based on total character level.
- 2024 removed/reduced the Tasha's-era pattern of features usable 'a number of times equal to your proficiency bonus' per rest. Many such features were re-pegged to an ability modifier instead (e.g. Sorcerer features now Charisma-modifier uses). If the app modeled any 'PB per day' resource counters, those uses move off PB in 2024 content.
- 2024 Expertise is unchanged in mechanic (double PB on proficient skills/tools, ability checks only) but the list of which classes/levels grant it shifted somewhat in class redesigns; the proficiency-bonus math is identical.
- 2024 renamed Inspiration to 'Heroic Inspiration' (reroll a die). Unrelated to PB math, but relevant if the sheet conflates inspiration with proficiency-driven mechanics.
- 2024 Bard's Jack of All Trades is retained with the same half-PB-rounded-down-on-non-proficient-ability-checks rule; no numeric delta.

---

<a id="s3"></a>

## Skills & Ability Checks

### The Rule (5e RAW)
An **ability check** tests a creature's innate talent and training to overcome a challenge: roll **d20 + the relevant ability modifier**, optionally **+ proficiency bonus** if the character is proficient in the skill (or tool) being applied, against a DC.

There are **18 skills**, each tied by default to one of the six abilities:
- **STR**: Athletics
- **DEX**: Acrobatics, Sleight of Hand, Stealth
- **INT**: Arcana, History, Investigation, Nature, Religion
- **WIS**: Animal Handling, Insight, Medicine, Perception, Survival
- **CHA**: Deception, Intimidation, Performance, Persuasion

**Proficiency tiers / multipliers applied to PB:**
- **Not proficient** → +0 (just ability mod)
- **Proficient** → **+PB**
- **Expertise** (Rogue, Bard; feats Skill Expert/Prodigy; Knowledge cleric, etc.) → **+2×PB**
- **Half-proficiency** (round down) → **+⌊PB/2⌋**, granted by:
  - **Jack of All Trades** (Bard 2): half-PB to *any ability check that doesn't already include PB* (not just skills — also raw ability checks, initiative).
  - **Remarkable Athlete** (Champion Fighter 7): half-PB (round up, RAW) to STR/DEX/CON checks not already proficient; also adds STR mod to running long jump.

**The ability governing a skill can be swapped** by features (DM-adjudicated or feature-specific), e.g. *use STR (Athletics) for a grapple*, or making a CHA (Intimidation) check with STR. These are situational and not a fixed stat.

**Reliable Talent** (Rogue 11): for any ability check where the character can add PB (i.e. is proficient), a **d20 roll of 9 or lower is treated as a 10**. This raises the *floor* of the roll, not the modifier.

**Passive checks** = **10 + all modifiers that would normally apply** (ability mod + PB/expertise + any bonus). Advantage on the check adds **+5**, disadvantage **−5**. **Observant** feat grants **+5 to passive Perception and passive Investigation**. Passive Perception is the standard for "what a creature notices without actively searching."

**Advantage / disadvantage**: roll **2d20**, take the higher (advantage) or lower (disadvantage). They don't stack and cancel to a single d20 when both present. Many skill-relevant sources grant these (Reliable conditions, items like Cloak of Elvenkind for Stealth, Help action, etc.).

### What Modifies It (increases / decreases)
- **Ability modifier** (the skill's governing ability) — *auto-applied by app* (uses `effectiveAbilities`, which already folds racial ASIs, feat ASIs, item ability changes).
- **Proficiency** (+PB) — *auto-applied by app* from `effectiveSkillProficiencies`.
- **Expertise** (2×PB) — *auto-applied by app*.
- **Half-proficiency** (Jack of All Trades, Remarkable Athlete, ⌊PB/2⌋) — **NOT represented** (no tier for it; not derived).
- **Reliable Talent** (Rogue 11, treat <10 as 10) — **NOT represented** in the roll path.
- **Flat skill bonuses from items** (e.g. Eyes of the Eagle +5 Perception, Gloves of Thievery, +X Instrument) — *auto-applied by app* via `flatSkillBonuses` (item `skill` effect) and the `Observant` registry channel.
- **Advantage from feats/races/items** (Actor → Deception/Performance; Cloak of Elvenkind → Stealth; Rod of Alertness → Perception; Fey Ancestry/Brave → simplified to a save mapping) — *auto-applied by app* as a flag (`derived.advantages.skills`), passed to the roll as a tristate `advantage: true`.
- **Disadvantage from sources** (e.g. armor stealth disadvantage; many conditions) — *NOT represented for skills* (armor stealth disadvantage is tracked as `hasStealthDisadvantage` but is **not** wired into the Stealth roll's advantage flag).
- **Ability swap for a skill** (e.g. STR(Intimidation)) — *not represented* (intentionally manual; situational/DM-adjudicated).
- **Conditions** (exhaustion → disadvantage on ability checks; restrained, etc.) — *not represented* (intentionally manual/situational).
- **Guidance / Enhance Ability / Bardic Inspiration** (spell-granted situational dice) — *not represented* (intentionally manual).

### What It Rolls & How the Roll Resolves
- **Roll:** d20 + skillModifier. `useDiceStore.roll` (`src/store/dice.ts:78-107`): for a `skill` kind it rolls d20 (line 79), pulls `modifier = derived.skillModifiers[kind.skill]` (line 88), and totals `natural + modifier` (line 100).
- **Advantage/disadvantage:** tristate (`RollKind.advantage`: `true`=adv, `false`=dis, `undefined`=normal). When set, a second d20 is rolled and max/min taken (`src/store/dice.ts:80-84`). The dropped die is kept as `natural2` for display.
- **No crit interaction** — ability checks have no crit/critical-failure mechanic in RAW; the app does not apply one for skills (the nat-20 auto-advance is attack-only, `useRollDispatch.ts:14`).
- **No Reliable Talent floor** — a natural 1–9 stays as-is.

### How This App Handles It
**Store → derive → render:**
- **Store:** `character.skillProficiencies` is `Partial<Record<SkillName, 'proficient'|'expertise'>>` (`src/types/character.ts:104`) — records *that* a skill is proficient, with no source tag (BUG-29/30/37 family).
- **Derive:** `deriveCharacterStats` (`src/lib/characterStats.ts:750-811`):
  - Builds `effectiveSkillProficiencies` from stored record + feat-granted skill/expertise choices (lines 750-774), populating `featSkillGrants` for the locked-dot UI.
  - Computes `skillModifiers[skill] = abilMod + profMod + flatBonus` where `profMod = pb * (prof === 'expertise' ? 2 : 1)` else 0 (lines 803-811). PB from `proficiencyBonus(character.level)` = total level (line 711) — correct (checks use total-level PB).
  - `passivePerception = 10 + skillModifiers.perception + passivePercBonus` and `passiveInvestigation = 10 + skillModifiers.investigation + passiveInvBonus` (lines 828-829); Observant adds +5 via `FEAT_EFFECTS` (lines 69, 823-827).
  - `advantages = getCharacterAdvantages(character)` (line 950) — feat/race/subrace/item advantage Sets (lines 137-230).
- **Render:** `ProficienciesBlock` (`src/components/sheet/ProficienciesBlock.tsx`):
  - Renders dots from `derived.effectiveSkillProficiencies` (line 334), modifier from `derived.skillModifiers[skill]` (line 340), advantage from `derived.advantages.skills` (line 341).
  - Roll dispatch: `dispatch({ type: 'skill', skill, advantage: hasAdv || undefined })` (line 392) — only ever supplies adv or normal; never disadvantage.
  - Expertise cap `getExpertiseCap(classLevels)` iterates per-class up to *that class's* level (lines 37-45), so the multiclass cap is correct (BUG-10's described total-level bug is fixed in current code; entry still sits in the open section).
- **Ability checks (raw):** `ability` rolls compute `abilityModifier(derived.effectiveAbilities[kind.ability])` (`src/store/dice.ts:92`) — no proficiency, no Jack of All Trades.

### Gaps & Mis-Handling
- **Passive Perception / Investigation are computed but never displayed** — `passivePerception`/`passiveInvestigation` (and the whole Observant +5 effect) are derived but no component reads them; grep of `src/components` finds zero usages. The single most-used non-combat stat in 5e is invisible, and the Observant feat's primary mechanical benefit produces no observable change.
- **No half-proficiency tier** (Jack of All Trades, Remarkable Athlete) — the skill record has only `'proficient'|'expertise'`; these features exist in the class/subclass data ("Jack of All Trades" ×2, "Reliable Talent" ×2 in classes.json; "Remarkable Athlete" in subclasses.json) but are never read in `deriveCharacterStats`. Bards and Champions get no half-PB on non-proficient skills or raw ability checks.
- **Reliable Talent not applied** — the roll path floors nothing; a proficient Rogue 11+ rolling a natural ≤9 keeps the low value instead of treating it as 10.
- **Stealth disadvantage from armor not wired to the Stealth roll** — `hasStealthDisadvantage` is derived but the Stealth row still rolls `advantage: hasAdv || undefined` (never `false`), so heavy/medium armor never produces a disadvantaged Stealth roll.
- **No way to roll a skill at disadvantage / manually choose advantage** — the UI only auto-sets advantage from `derived.advantages.skills`; there is no toggle (intentionally manual situational adv/dis is therefore unsupported even when the player wants it). Logged as enhancement BUG-56.

#### Sourced rule facts (2014 RAW, web-verified)

- To make an ability check, roll a d20 and add the relevant ability modifier (Strength, Dexterity, Constitution, Intelligence, Wisdom, or Charisma). Apply any other bonuses/penalties, then compare the total to a Difficulty Class (DC). Total >= DC succeeds; total < DC fails. — [src](https://5thsrd.org/rules/abilities/ability_checks/)
- A skill represents a specific aspect of an ability score. Proficiency in a skill lets you add your proficiency bonus to ability checks that involve that skill. There are 18 skills, each tied to one ability. — [src](https://www.5esrd.com/using-ability-scores/)
- The 18 skills map to abilities as: Strength = Athletics; Dexterity = Acrobatics, Sleight of Hand, Stealth; Intelligence = Arcana, History, Investigation, Nature, Religion; Wisdom = Animal Handling, Insight, Medicine, Perception, Survival; Charisma = Deception, Intimidation, Performance, Persuasion. (No skill is governed by Constitution.) — [src](https://5thsrd.org/rules/abilities/ability_checks/)
- Proficiency bonus by character level: +2 at levels 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17-20. The bonus is keyed to TOTAL character level, not the level of any single class. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/character-advancement/)
- Your proficiency bonus can't be added to a single die roll or other number more than once. If a feature lets you multiply your proficiency bonus on a check that wouldn't normally benefit from it, you still don't add the bonus to that check (zero doubled is still zero). — [src](https://5thsrd.org/rules/proficiency_bonus/)
- Expertise (Rogue at level 1, two skills; two more at level 6 — Bard at level 3, two skills; two more at level 10) doubles your proficiency bonus for any ability check that uses a chosen proficiency. The Rogue may also apply Expertise to thieves' tools. — [src](https://5thsrd.org/character/classes/rogue/)
- Advantage/Disadvantage: roll two d20s and use the higher (advantage) or lower (disadvantage). Multiple sources of advantage don't stack — you never roll more than two dice. If at least one source of advantage and one of disadvantage both apply, they cancel and you roll one normal d20, regardless of how many of each there are. — [src](https://www.5esrd.com/using-ability-scores/)
- Passive check = 10 + all modifiers that normally apply to the check. If the character has advantage on the check, add 5; for disadvantage, subtract 5. No die is rolled. — [src](https://5thsrd.org/rules/abilities/ability_checks/)
- Passive Perception = 10 + Wisdom modifier + proficiency bonus if proficient in Perception (+ Expertise doubling, advantage +5/disadvantage -5). Example: a 1st-level character with Wisdom 15 (+2) and Perception proficiency (+2) has passive Perception 14. — [src](https://5thsrd.org/rules/abilities/ability_checks/)
- Contest: both participants make ability checks appropriate to their efforts and compare totals; the higher total wins. On a tie, the situation stays as it was before the contest (no one wins/progresses). — [src](https://5thsrd.org/rules/abilities/ability_checks/)
- Group check: everyone in the group makes the ability check. If at least half the group succeeds (meets or beats the DC), the whole group succeeds; otherwise the group fails. — [src](https://www.5esrd.com/using-ability-scores/)
- Working Together / Help: when one character helps another with a task, the character doing the work makes the check with advantage. A character can help only if the task is one they could attempt alone and only when two or more working together is actually productive. In 2014, exactly one creature can give the Help, and it grants advantage on a single ability check. — [src](https://5thsrd.org/rules/abilities/ability_checks/)
- Typical Difficulty Classes: Very easy 5, Easy 10, Medium 15, Hard 20, Very hard 25, Nearly impossible 30. — [src](https://5thsrd.org/rules/abilities/ability_checks/)
- Variant: Skills with Different Abilities. Normally a skill's proficiency applies only to a specific ability (e.g., Strength (Athletics)), but the GM may allow proficiency in a skill to apply to a check using a different ability — e.g., a Constitution (Athletics) check to row a boat for an hour, or a Strength (Intimidation) check to physically menace someone. — [src](https://5thsrd.org/rules/abilities/ability_checks/)
- Jack of All Trades (Bard, level 2): add half your proficiency bonus, rounded down, to any ability check you make that doesn't already include your proficiency bonus. — [src](https://5thsrd.org/character/classes/bard/)
- Reliable Talent (Rogue, level 11): whenever you make an ability check that lets you add your proficiency bonus, you can treat a d20 roll of 9 or lower as a 10. — [src](https://5thsrd.org/character/classes/rogue/)
- Remarkable Athlete (Fighter Champion, level 7): add half your proficiency bonus, rounded up, to any Strength, Dexterity, or Constitution check you make that doesn't already use your proficiency bonus. — [src](https://5thsrd.org/character/classes/fighter/)

#### Key tables

**Skill-to-Ability Map (all 18 skills, 2014; unchanged in 2024)** — [src](https://5thsrd.org/rules/abilities/ability_checks/)

```
Strength: Athletics | Dexterity: Acrobatics, Sleight of Hand, Stealth | Constitution: (none) | Intelligence: Arcana, History, Investigation, Nature, Religion | Wisdom: Animal Handling, Insight, Medicine, Perception, Survival | Charisma: Deception, Intimidation, Performance, Persuasion
```

**Proficiency Bonus by Total Character Level** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/character-advancement/)

```
Levels 1-4: +2 | Levels 5-8: +3 | Levels 9-12: +4 | Levels 13-16: +5 | Levels 17-20: +6. (Keyed to total character level for multiclass characters.)
```

**Typical Difficulty Classes** — [src](https://5thsrd.org/rules/abilities/ability_checks/)

```
Very easy: 5 | Easy: 10 | Medium: 15 | Hard: 20 | Very hard: 25 | Nearly impossible: 30
```

**Skill check modifier formula (per skill)** — [src](https://5thsrd.org/rules/abilities/ability_checks/)

```
Skill check total = d20 + ability modifier (of the governing ability) + [proficiency bonus if proficient] + [proficiency bonus again if Expertise] + [floor(PB/2) Jack of All Trades OR ceil(PB/2) Remarkable Athlete, only if NOT already proficient] + situational bonuses. Passive version replaces 'd20' with '10' and adds +5/-5 for advantage/disadvantage.
```

**Half-proficiency features (rounding differs)** — [src](https://5thsrd.org/character/classes/bard/)

```
Jack of All Trades (Bard L2): +half PB rounded DOWN to any ability check NOT already adding PB. Remarkable Athlete (Champion Fighter L7): +half PB rounded UP to STR/DEX/CON checks NOT already adding PB. Reliable Talent (Rogue L11): treat d20 of 9 or lower as 10 on checks that DO add PB.
```

#### 2024 deltas (not canonical here)

- Inspiration is renamed Heroic Inspiration and is now a generic reroll: spend it to reroll any d20 (or hit die) after seeing the result, keeping the new roll — no longer restricted to granting advantage. (2014 Inspiration only granted advantage on one roll.) Source: https://arcaneeye.com/mechanic-overview/heroic-inspiration-in-dnd-5e-2024/
- The Help action (assisting an ability check) now REQUIRES the helper to be proficient in the relevant skill or tool and near enough to assist; it grants advantage on the ally's next check with that chosen skill/tool, expiring at the start of the helper's next turn. In 2014, helping an ability check had no proficiency requirement. Source: https://www.dndbeyond.com/forums/dungeons-dragons-discussion/rules-game-mechanics/204923-2024-help-action
- 2024 Expertise is generalized as a named feature in the rules glossary: you gain Expertise in one skill you are proficient in, your proficiency bonus is doubled for checks with that skill, and you can never have Expertise in the same skill more than once. The 2014 functional effect (double PB) is unchanged. Source: https://5e24srd.com/playing-the-game/proficiency.html
- 2024 reframes ability checks, attack rolls, and saving throws collectively as 'D20 Tests', and proficiency-bonus multiplication is explicitly stated as 'multiplied only once and divided only once'. Source: https://5e24srd.com/playing-the-game/proficiency.html
- 2024 changed Stealth/hiding and the Perception vs. passive-Perception interaction (hiding now grants the Invisible condition until found and is gated behind a DC 15 Dexterity (Stealth) check), but the 18-skill list, the skill-to-ability map, the DC anchors (5/10/15/20/25/30), and the proficiency-bonus-by-level table are all UNCHANGED from 2014. Source: https://www.dndbeyond.com/forums/dungeons-dragons-discussion/rules-game-mechanics/203294-explaining-the-2024-stealth-rules-its-cool
- Passive Perception is defined identically in 2024 (10 + Wisdom (Perception) bonus, +5 advantage / -5 disadvantage); no numeric change. Source: https://dnd-wiki.org/wiki/Passive_Perception_(5e24)

---

<a id="s4"></a>

## Saving Throws

### The Rule (5e RAW)
A saving throw is a `d20 + ability modifier + (proficiency bonus if proficient) + situational bonuses`, made to resist an effect (a spell, trap, poison, etc.). There are exactly six saves, one per ability (STR, DEX, CON, INT, WIS, CHA). The target is the effect's DC; meet or beat it to succeed.

- **Proficiency:** Each class grants proficiency in exactly **two** saving throws at level 1 (e.g. Wizard = INT + WIS, Fighter = STR + CON). On a multiclass, you gain save proficiencies **only from your first class** — secondary classes never add save proficiencies (PHB Multiclassing). Proficiency adds your proficiency bonus (`ceil(totalLevel/4)+1`) to the relevant saves.
- **No expertise on saves.** Unlike skills, you never double proficiency on a save through Expertise.
- **Death saving throws** are a distinct mechanic (flat d20 vs DC 10, no ability/prof) and are handled in CombatBlock, not here.
- **Passive/contested:** saves are always active rolls; there is no "passive save."

### What Modifies It (increases / decreases)
- **Ability modifier** of the governing ability — auto-applied (`abilityModifier(effectiveAbilities[ability])`).
- **Class save proficiency** (first class's two saves) — represented via `savingThrowProficiencies`; **not auto-locked to first-class** (manual dot toggle, see Gaps).
- **Resilient feat** (+1 to chosen ability AND proficiency in that save) — **auto-applied** at render time via the `save_proficiency` FeatEffect (`asi_choice`).
- **Magic items granting flat save bonuses** — auto-applied via `ItemEffect {type:'save', ability:'all'|<ability>, amount}` while the item is active (Cloak of Protection, Ring of Protection = +1 all saves; both authored and applied).
- **Magic items granting advantage on saves** (Platinum Scarf = advantage on all saves; Orb of the Stein Rune = STR saves) — auto-applied as **advantage flags** via the hardcoded `ITEM_ADV_MAP`.
- **Racial/subrace save advantages** (Dwarven Resilience vs poison → CON; Fey Ancestry vs charm → WIS; Gnome Cunning vs magic → INT/WIS/CHA; Magic Resistance → all; Stout Halfling → CON) — auto-applied as advantage flags via `RACE_ADVANTAGES`/`SUBRACE_ADVANTAGES` (simplified: condition dropped, applied broadly to the mapped ability).
- **War Caster feat** (advantage on CON saves to maintain concentration) — auto-applied as a CON-save advantage flag via `FEAT_ADVANTAGES`.
- **Paladin Aura of Protection** (+CHA mod to all saves for self and allies within 10 ft, level 6+) — **NOT represented** (no feature effect, no derive path).
- **Monk Diamond Soul** (proficiency in ALL saving throws, level 14) — **NOT represented**.
- **Barbarian Danger Sense** (advantage on DEX saves vs effects you can see), **Fighter Indomitable** (reroll a failed save), Rogue **Slippery Mind** (WIS save proficiency), Bard **Magical Secrets**/class save-prof features, **Diamond Soul**, **Brutal Critical**, etc. — **NOT represented**.
- **Stone of Good Luck / Luckstone** (+1 to all saves and ability checks while attuned) — authored item exists but its `effects` are `null`, so **silently ignored** (see Gaps).
- **Bless / Bane / Resistance / Guidance spells, Bardic Inspiration, Cover, conditions** (restrained → DEX disadvantage; poisoned/frightened on ability-check-and-attack only; exhaustion penalties) — **intentionally manual / situational**, the app correctly does not auto-apply transient spell or condition effects.

### What It Rolls & How the Roll Resolves
A single `d20`, plus the precomputed `saveModifiers[ability]`. The dice store rolls `d20`; if `kind.advantage === true` it rolls a second d20 and keeps the max (advantage), if `=== false` keeps the min (disadvantage), if `undefined` rolls one die (normal). `total = natural + modifier`. There is no crit/auto-success on a natural 20 for saves in RAW (the app correctly does not special-case nat 20 on saves — that special-casing lives only in the attack path). The modifier is `abilityMod + (proficient ? PB : 0) + itemSaveBonus`.

### How This App Handles It
Store → derive → render path:

- **Store (base):** `character.savingThrowProficiencies: AbilityName[]` holds chosen save proficiencies. Toggled by `ProficienciesBlock.toggleSave` (`ProficienciesBlock.tsx:190-197`) → `onSave({savingThrowProficiencies})`. There is **no class lock** — any of the six dots is clickable (`SaveDot` is only `locked` when the save is feat-derived, `ProficienciesBlock.tsx:292-296`). The "class" gold tag (`:298-302`) is display-only.
- **Derive:** `deriveCharacterStats` (`characterStats.ts:704`):
  - `effectiveSaveProficiencies = [...character.savingThrowProficiencies, ...featDerivedSaves]` (`:797-800`). `featDerivedSaves` is built from each feat's `computeFeatStatDelta(...).saveProficiency` (Resilient → `asi_choice` resolves to the player's `featChoices[slug].asiAbility`), and only added if not already present (`:736-738`) — no double-count.
  - `saveModifiers[ability] = abilMod + (effectiveSaveProficiencies.includes(ability) ? pb : 0) + itemSave` (`:813-818`), where `pb = proficiencyBonus(character.level)` (TOTAL level, `:711`) and `itemSave = itemEffects.saveBonuses[ability]` from `computeActiveItemEffects` (`:536-542` handles `ability:'all'` by adding to every ability).
  - `advantages.saves` is a `Set<AbilityName>` from `getCharacterAdvantages` (`:202-230`, `:950`) merging feat/race/subrace/item advantage entries.
- **Render:** `ProficienciesBlock` Saving Throws tab (`:274-326`) reads `derived.saveModifiers[ability]` for the displayed bonus, `derived.effectiveSaveProficiencies` for the filled dot (feat-derived shown filled+locked with a "feat" tag), and `derived.advantages.saves.has(ability)` for the `(Adv)` button state. The roll dispatches `{type:'save', ability, advantage: hasAdv || undefined}` (`:315`, correct tristate per INV-11).
- **Roll:** `useDiceStore.roll` (`store/dice.ts:78-107`) reads `derived.saveModifiers[kind.ability]` (`:89-90`) and resolves advantage tristate (`:80-84`).

### Gaps & Mis-Handling
- **No class-lock on save proficiencies / multiclass first-class rule not enforced.** Every save dot is freely clickable; nothing constrains save proficiencies to the class's two (or to first-class only on a multiclass). The wizard sets them at creation, but the sheet lets you add/remove any save freely. This is a deliberate "saves editable" design (logged in bugs.md as intentional), so it is a soft gap, not a numeric bug — but it means a multiclass can silently gain a second class's saves with no warning.
- **Paladin Aura of Protection unrepresented.** A Paladin 6 with CHA 18 should add +4 to ALL of their saves; the app shows only ability mod + PB. This is a structural omission for a stat the app does compute.
- **Monk Diamond Soul unrepresented.** A Monk 14 should be proficient in all six saves; the app shows proficiency only on the two class saves.
- **Stone of Good Luck (Luckstone) save bonus silently ignored.** The item exists in the catalog with `effects: null`; RAW grants +1 to all saves while attuned. The `save`/`ability:'all'` channel exists and would apply it if authored — this is the "data exists but the effect array is empty" failure mode.

#### Sourced rule facts (2014 RAW, web-verified)

- A saving throw (or 'save') represents an attempt to resist a spell, a trap, a poison, a disease, or a similar threat. You don't normally decide to make a saving throw; you are forced to make one because your character or monster is at risk of harm. — [src](https://5thsrd.org/rules/abilities/saving_throws/)
- To make a saving throw, roll a d20 and add the appropriate ability modifier. For example, you use your Dexterity modifier for a Dexterity saving throw. — [src](https://5thsrd.org/rules/abilities/saving_throws/)
- Each class gives proficiency in at least two saving throws. As with skill proficiencies, proficiency in a saving throw lets a character add his or her proficiency bonus to saving throws made using a particular ability score. — [src](https://5thsrd.org/rules/abilities/saving_throws/)
- A saving throw can be modified by a situational bonus or penalty and can be affected by advantage and disadvantage, as determined by the GM. — [src](https://5thsrd.org/rules/abilities/saving_throws/)
- The Difficulty Class for a saving throw is determined by the effect that causes it. For example, the DC for a saving throw allowed by a spell is determined by the caster's spellcasting ability and proficiency bonus. — [src](https://5thsrd.org/rules/abilities/saving_throws/)
- Spell save DC = 8 + your proficiency bonus + your spellcasting ability modifier. — [src](https://dnd5e.info/using-ability-scores/saving-throws/)
- Usually, a successful save means that a creature suffers no harm, or reduced harm, from an effect. — [src](https://5thsrd.org/rules/abilities/saving_throws/)
- Your proficiency bonus is always based on your total character level, not your level in a particular class. — [src](https://5thsrd.org/rules/multiclassing/)
- When you gain your first level in a class other than your initial class, you gain only some of the new class's starting proficiencies. Saving throw proficiencies are NOT among the proficiencies granted by multiclassing — they appear only when taking a class as your FIRST class. — [src](https://5thsrd.org/rules/multiclassing/)
- Under 2014 rules-as-written, a natural 20 on a saving throw does NOT automatically succeed and a natural 1 does NOT automatically fail. Automatic success on a 20 / failure on a 1 applies only to attack rolls (and to death saving throws as a special case). — [src](https://www.dndbeyond.com/forums/dungeons-dragons-discussion/rules-game-mechanics/65308-question-about-nat-20s-and-saving-throws)
- Whenever you take damage while concentrating on a spell, you must make a Constitution saving throw to maintain concentration. The DC equals 10 or half the damage you take, whichever number is higher. Each separate source of damage triggers a separate save. — [src](https://5thsrd.org/spellcasting/casting_a_spell/)
- Death saving throws are a special saving throw with no ability modifier and no proficiency: roll a d20; 10 or higher is a success, 9 or lower is a failure. Three successes = stable; three failures = death. A natural 1 counts as two failures; a natural 20 means you regain 1 hit point. Successes/failures need not be consecutive and reset when you regain any HP or become stable. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Advantage and disadvantage are not cumulative: regardless of how many sources grant advantage (or disadvantage) on a save, you roll only one extra d20. If at least one source grants advantage and at least one grants disadvantage, you roll a single normal d20. — [src](https://5thsrd.org/rules/using_ability_scores/)

#### Key tables

**Saving Throw Proficiencies by Class (2014)** — [src](https://www.quora.com/Which-d-d-5e-classes-have-which-saving-throw-proficiencies)

```
Class — Saving Throw Proficiencies (always exactly two; only granted by your FIRST class):
Barbarian — Strength, Constitution
Bard — Dexterity, Charisma
Cleric — Wisdom, Charisma
Druid — Intelligence, Wisdom
Fighter — Strength, Constitution
Monk — Strength, Dexterity
Paladin — Wisdom, Charisma
Ranger — Strength, Dexterity
Rogue — Dexterity, Intelligence
Sorcerer — Constitution, Charisma
Warlock — Wisdom, Charisma
Wizard — Intelligence, Wisdom
Artificer — Constitution, Intelligence (non-SRD)
Blood Hunter — Strength, Wisdom (non-SRD; per class design)

Mnemonic: every class has exactly one 'strong' (STR/DEX/CON) and one 'weak' (INT/WIS/CHA) save proficiency.
```

**Proficiency Bonus by Total Character Level (2014)** — [src](https://5thsrd.org/rules/leveling_up/)

```
Level 1–4: +2
Level 5–8: +3
Level 9–12: +4
Level 13–16: +5
Level 17–20: +6

Formula: proficiency bonus = ceil(level / 4) + 1, using TOTAL character level for multiclass characters. This bonus is added to a saving throw only when proficient in that save, and is always added into a character's own spell save DC.
```

**Saving Throw Modifier Calculation (2014)** — [src](https://5thsrd.org/rules/abilities/saving_throws/)

```
Save total = d20 + ability modifier + (proficiency bonus IF proficient in that save) + situational/feat/item bonuses.

Example components:
- Ability modifier = floor((effective ability score - 10) / 2)
- Proficiency bonus added ONCE if proficient; never doubled (no save 'expertise' in 2014)
- NO proficiency added if not proficient in that ability's save

Spell save DC (what enemies roll against this character's spells) = 8 + proficiency bonus + spellcasting ability modifier.
Concentration save = CON save (DC = max(10, floor(damage/2))).
Death save = flat d20 vs DC 10 (no modifiers).
```

#### 2024 deltas (not canonical here)

- Natural 20 / Natural 1 now matter on saving throws. In 2024, a natural 20 on ANY d20 Test (ability checks, attack rolls, AND saving throws) automatically succeeds, and a natural 1 automatically fails — regardless of modifiers or DC. In 2014 this auto-success/auto-failure applied ONLY to attack rolls (and death saves). This is the single most important behavioral delta for a save engine.
- Saving throws are folded into the unified 'D20 Test' category in 2024 (the three D20 Tests are ability checks, attack rolls, and saving throws), with a single shared rule for advantage/disadvantage, modifiers, and the natural 20/1 rule above. The underlying save formula (d20 + ability modifier + proficiency if proficient) is unchanged.
- The spell save DC formula is unchanged in 2024 (8 + proficiency bonus + spellcasting ability modifier), and the proficiency-bonus-by-level table is unchanged (+2 through +6).
- Per-class saving throw proficiencies are essentially unchanged in 2024 for the core SRD classes; multiclassing still does not grant additional saving throw proficiencies (you keep only your first class's two saves).
- 2024 Heroic Inspiration lets a character reroll any d20 (including a saving throw) after seeing the result and use the new roll — a broader, more impactful interaction with saves than 2014 Inspiration (which only granted advantage). Apps that model inspiration should allow it to apply to saves in 2024.
- Death saving throws are mechanically the same in 2024 (flat d20 vs 10, three successes/failures, nat 1 = two failures, nat 20 = regain 1 HP).

---

<a id="s5"></a>

## Armor Class

### The Rule (5e RAW)

Armor Class measures how hard a creature is to hit. A creature's AC is determined by exactly **one** base formula at a time (you never stack two base formulas), plus additive modifiers:

- **No armor:** `AC = 10 + DEX modifier`.
- **Light armor** (Padded, Leather, Studded Leather): `AC = armor base + full DEX modifier` (uncapped).
- **Medium armor** (Hide, Chain Shirt, Scale Mail, Breastplate, Half Plate): `AC = armor base + DEX modifier (max +2)`.
- **Heavy armor** (Ring Mail, Chain Mail, Splint, Plate): `AC = fixed armor base`, DEX ignored.
- **Shield:** `+2 AC` (a creature can benefit from only one shield at a time). Shields stack on any base formula except Monk Unarmored Defense.
- **No proficiency:** wearing armor you lack proficiency with gives disadvantage on STR/DEX ability checks, attacks, and saves, and you can't cast spells — but RAW it still grants its AC. (This sheet does not model the no-proficiency penalty.)

**Alternative base formulas** (each replaces `10 + DEX`, chosen by the creature, and only one applies):
- **Barbarian Unarmored Defense:** `10 + DEX + CON` while wearing no armor (shield allowed).
- **Monk Unarmored Defense:** `10 + DEX + WIS` while wearing no armor and no shield.
- **Draconic Bloodline Sorcerer (Draconic Resilience):** `13 + DEX` while wearing no armor.
- **Mage Armor (spell):** sets base to `13 + DEX` for 8 hours while unarmored.
- **Natural armor** (Lizardfolk `13 + DEX`, Tortle `17`, etc.): racial unarmored base.
- **Robe of the Archmagi:** sets unarmored base to `15 + DEX`. **Bracers of Defense:** `+2` while unarmored and no shield.

**Flat modifiers that stack on top of whatever base applies:**
- **Defense fighting style:** `+1` while wearing (body) armor.
- **Ring of Protection / Cloak of Protection:** `+1` AC (and saves), attunement.
- **Magic armor / shield (+1/+2/+3):** the enhancement adds to the armor's AC.
- **Shield spell:** reaction, `+5` AC until start of next turn (situational, not a static value).
- **Cover:** +2 (half) / +5 (three-quarters), situational.

**Adjacent rules that do NOT change AC:** a heavy/medium armor's Strength requirement reduces **speed by 10** if unmet — it never lowers AC. Stealth-disadvantage armor imposes disadvantage on Stealth checks, not an AC change.

### What Modifies It (increases / decreases)

- Body armor base formula (light/medium/heavy) — **auto-applied** when armor is worn (`equipped || attuned`), via `parseArmorAC`.
- DEX modifier with light=full, medium=max+2, heavy=none — **auto-applied** (regex in `parseArmorAC`).
- Shield +2 (and magic shield bonus) — **auto-applied** (resolved + `bonus` added).
- Magic armor/shield `bonus` (+1/+2/+3) — **auto-applied** (`bodyArmor.bonus`, `shieldRec.bonus`).
- Ring/Cloak of Protection (flat `ac` ItemEffect) — **auto-applied** while active (`computeActiveItemEffects` → `acBonus`).
- Bracers of Defense (`ac` with `condition:'unarmored'`) — **auto-applied** only when no body armor (`unarmoredAcBonus`).
- Robe of the Archmagi (`unarmored_ac` set-base) — **auto-applied** only when no body armor (`unarmoredAcBase`).
- Fighting Style: Defense (+1 armored) — **auto-applied** via `computeFeatureEffects` when body armor worn.
- **Barbarian Unarmored Defense (10+DEX+CON)** — **NOT represented** (no code path).
- **Monk Unarmored Defense (10+DEX+WIS)** — **NOT represented**.
- **Draconic Sorcerer (13+DEX)** — **NOT represented**.
- **Natural armor (Lizardfolk/Tortle)** — **NOT represented** (no race→AC path).
- **Mage Armor (13+DEX)** — **manual** (player edits the `armorClass` stepper when unarmored; the spell never sets AC).
- **Shield spell (+5 reaction)** — **intentionally manual** (situational reaction, not a static value).
- **Cover** — **intentionally manual / not represented** (DM-adjudicated, situational).
- **No-proficiency armor penalty** — **not represented** (sheet still grants AC regardless of proficiency).
- **STR-requirement speed penalty** — correctly does NOT touch AC; the speed reduction itself is **not represented** (separate from AC).

### What It Rolls & How the Roll Resolves

Static value, no roll. AC is a passive defense number compared against incoming attack rolls; the sheet never rolls AC. (The Shield spell and Uncanny Dodge etc. are reactions the player resolves manually.)

### How This App Handles It

Path: stored `equipment[].equipped/attuned/baseArmor` + manual `armorClass` → `deriveCharacterStats` → `derived.effectiveAC` → `CombatBlock` AC card.

- **Derivation** (`src/lib/characterStats.ts:849-930`). Starts `effectiveAC = null`. With a catalog, it filters `character.equipment` to armor entries that are worn (`e.equipped || e.attuned`, line 858-860). If any worn armor exists, it splits into `bodyPieces` (non-Shield) and `shields` (line 863-868), sets `hasBodyArmor` (869), and `baseAC = 10 + dexMod` (871). When body armor is worn it resolves variable-base armor (`resolveArmor`, 876), reads `stealth_disadvantage` (877), and if the formula is not "Varies" computes `baseAC = parseArmorAC(ac_formula, dexMod) + bonus` (882). Shield adds `parseArmorAC + bonus` (892, fixed in BUG-17). Final `effectiveAC = baseAC + shieldBonus` (894).
- **`parseArmorAC`** (`:341-363`) handles `"N"`, `"+N"`, `"N + Dex modifier"`, `"N + Dex modifier (max C)"`, and trailing `"+ flat"` shapes via one regex — covering all 11 distinct mundane formulas in `equipment.json` (Light full DEX, Medium `(max 2)`, Heavy fixed, Shield `+2`) and the magic-armor shapes (BUG-49 fixed).
- **Unarmored item AC** (`:903-910`): only when `!hasBodyArmor`. A `unarmored_ac` set-base replaces the unarmored base (preserving an equipped shield); a conditional `unarmored` bonus stacks on `effectiveAC ?? character.armorClass`.
- **Flat item AC** (Ring/Cloak of Protection, `:915-917`): `(effectiveAC ?? character.armorClass) + acBonus`, so it stacks over worn armor or over the manual fallback.
- **Fighting Style: Defense** (`:922-930`): `acArmored` (+1) added only when `hasBodyArmor`; `computeFeatureEffects` (`:638-663`) reads the `defense` option's `{type:'ac',amount:1,condition:'armored'}` effect — the only AC-bearing feature in `class-features.json` (verified). `acUnarmored` and `acAlways` channels exist but no feature populates them.
- **Render** (`src/components/sheet/CombatBlock.tsx:298-314`): when `effectiveAC !== null`, shows the number + "from armor" (read-only); when `null`, shows the editable `armorClass` stepper (the manual fallback, used for unarmored characters, Mage Armor, Unarmored Defense, etc.).
- **EquipmentBlock** only stores choices: `toggleActive` (`:1099-1125`) flips `equipped`/`attuned` and enforces exclusive body/shield slots; no AC math is baked at write time (INV-1 honored).

### Gaps & Mis-Handling

- **Barbarian Unarmored Defense not computed** — an unarmored Barbarian's AC silently falls to the manual stepper; the engine never offers `10+DEX+CON`.
- **Monk Unarmored Defense not computed** — same, never offers `10+DEX+WIS`.
- **Draconic Sorcerer / natural-armor unarmored bases not computed** — `13+DEX` (Draconic, Lizardfolk) / fixed `17` (Tortle) never derived; both fall to manual entry.
- (Borderline, not flagged as a numeric bug) **Defense fighting style gates on body armor only** — a defensible simplification; RAW "wearing armor" with only a shield is an edge ruling. (Intentionally manual.)
- (Not bugs — intentionally manual) Mage Armor, Shield spell, cover, and the no-proficiency penalty are situational/spell-driven and correctly left to manual handling.

#### Sourced rule facts (2014 RAW, web-verified)

- Armor Class (AC) represents how hard a creature is to hit. To make an attack roll the attacker rolls a d20 + bonuses; a hit lands when the total equals or exceeds the target's AC. Higher AC = harder to hit. — [src](https://5thsrd.org/adventuring/equipment/armor/)
- With no armor, a creature's base Armor Class = 10 + its Dexterity modifier. The Dexterity modifier here is uncapped and may be negative (a negative Dex mod lowers AC below 10). — [src](https://5thsrd.org/adventuring/equipment/armor/)
- The armor (and shield) you wear determines your base Armor Class. Light armor: AC = base + full Dexterity modifier. Medium armor: AC = base + Dexterity modifier capped at +2 (max +2; negative Dex still applies). Heavy armor: AC = base only; you do NOT add Dexterity modifier, but a negative Dexterity modifier is also not subtracted. — [src](https://5thsrd.org/adventuring/equipment/armor/)
- A shield is carried in one hand and increases your Armor Class by 2. You can benefit from only one shield at a time. — [src](https://5thsrd.org/adventuring/equipment/armor/)
- If the Armor table shows 'Disadvantage' in the Stealth column, the wearer has disadvantage on Dexterity (Stealth) checks while wearing that armor. — [src](https://5thsrd.org/adventuring/equipment/armor/)
- If the Armor table shows 'Str 13' or 'Str 15' in the Strength column, the armor reduces the wearer's speed by 10 feet unless the wearer's Strength score equals or exceeds the listed score. This applies only to Chain Mail (Str 13), Splint (Str 15), and Plate (Str 15). — [src](https://5thsrd.org/adventuring/equipment/armor/)
- If you wear armor or use a shield that you lack proficiency with, you have disadvantage on any ability check, saving throw, or attack roll that involves Strength or Dexterity, and you can't cast spells. — [src](https://www.5esrd.com/equipment/armor/)
- You can have only one base AC formula at a time. Worn armor, Unarmored Defense (Barbarian/Monk), Draconic Resilience, and Mage Armor are all alternative ways to SET your base AC — they do not stack with each other; the creature uses whichever single formula applies (typically the most advantageous available). — [src](https://www.sageadvice.eu/unarmored-defense-and-draconic-resilience/)
- Barbarian Unarmored Defense: while not wearing any armor, AC = 10 + Dexterity modifier + Constitution modifier. You can use a shield and still gain this benefit. — [src](https://farreachco.com/dnd/5e/srd/features/barbarian-unarmored-defense)
- Monk Unarmored Defense: while wearing no armor and not wielding a shield, AC = 10 + Dexterity modifier + Wisdom modifier. — [src](https://roll20.net/compendium/dnd5e/Barbarian%20Unarmored%20Defense)
- Mage Armor (1st-level spell) sets the target's base AC to 13 + Dexterity modifier for 8 hours, but only while the target is wearing no armor. It does not stack with worn armor. — [src](https://5thsrd.org/spellcasting/spells/mage_armor/)
- Donning/doffing time by category: Light armor — 1 minute to don, 1 minute to doff. Medium armor — 5 minutes to don, 1 minute to doff. Heavy armor — 10 minutes to don, 5 minutes to doff. Shield — 1 action to don and 1 action to doff. — [src](https://www.5esrd.com/equipment/armor/)
- Wearing heavy armor does not impose disadvantage on Dexterity (Stealth) checks unless the armor's Stealth column says 'Disadvantage' — but in 2014 every heavy armor (Ring Mail, Chain Mail, Splint, Plate) does list Disadvantage, so all heavy armor imposes Stealth disadvantage. — [src](https://roll20.net/compendium/dnd5e/Armor)

#### Key tables

**Light Armor (2014 SRD)** — [src](https://5thsrd.org/adventuring/equipment/armor/)

```
| Armor | Cost | Armor Class (AC) | Strength | Stealth | Weight |
|---|---|---|---|---|---|
| Padded | 5 gp | 11 + Dex modifier | — | Disadvantage | 8 lb. |
| Leather | 10 gp | 11 + Dex modifier | — | — | 10 lb. |
| Studded leather | 45 gp | 12 + Dex modifier | — | — | 13 lb. |

Light armor adds the FULL (uncapped) Dexterity modifier to the listed base.
```

**Medium Armor (2014 SRD)** — [src](https://5thsrd.org/adventuring/equipment/armor/)

```
| Armor | Cost | Armor Class (AC) | Strength | Stealth | Weight |
|---|---|---|---|---|---|
| Hide | 10 gp | 12 + Dex modifier (max 2) | — | — | 12 lb. |
| Chain shirt | 50 gp | 13 + Dex modifier (max 2) | — | — | 20 lb. |
| Scale mail | 50 gp | 14 + Dex modifier (max 2) | — | Disadvantage | 45 lb. |
| Breastplate | 400 gp | 14 + Dex modifier (max 2) | — | — | 20 lb. |
| Half plate | 750 gp | 15 + Dex modifier (max 2) | — | Disadvantage | 40 lb. |

Medium armor adds Dex modifier capped at +2. The cap only limits the maximum bonus; a negative Dex modifier still reduces AC. Cross-confirmed by Roll20 compendium.
```

**Heavy Armor (2014 SRD)** — [src](https://5thsrd.org/adventuring/equipment/armor/)

```
| Armor | Cost | Armor Class (AC) | Strength | Stealth | Weight |
|---|---|---|---|---|---|
| Ring mail | 30 gp | 14 | — | Disadvantage | 40 lb. |
| Chain mail | 75 gp | 16 | Str 13 | Disadvantage | 55 lb. |
| Splint | 200 gp | 17 | Str 15 | Disadvantage | 60 lb. |
| Plate | 1,500 gp | 18 | Str 15 | Disadvantage | 65 lb. |

Heavy armor: AC is the flat listed value; Dexterity modifier is NEVER added (and a negative Dex is not subtracted). Str 13/Str 15 entries impose a -10 ft speed penalty if the wearer's Strength is below the listed score. Cross-confirmed by Roll20 compendium.
```

**Shield (2014 SRD)** — [src](https://5thsrd.org/adventuring/equipment/armor/)

```
| Item | Cost | Armor Class (AC) | Strength | Stealth | Weight |
|---|---|---|---|---|---|
| Shield | 10 gp | +2 | — | — | 6 lb. |

A shield is an additive +2 to AC, carried in one hand, max one at a time. It stacks on top of any base AC formula (armor or unarmored). No Stealth penalty, no Strength requirement.
```

**AC Calculation by Armor Category** — [src](https://5thsrd.org/adventuring/equipment/armor/)

```
| Category | AC formula | Dex contribution |
|---|---|---|
| No armor (default) | 10 + Dex modifier | Full Dex, uncapped, can be negative |
| Light armor | armor base + Dex modifier | Full Dex, uncapped |
| Medium armor | armor base + Dex modifier (max +2) | Capped at +2; negative still applies |
| Heavy armor | armor base (flat) | None — Dex ignored entirely (positive or negative) |
| Shield | +2 (additive on top of any base) | n/a |

Final AC = (one chosen base formula) + (sum of additive bonuses: shield, Defense fighting style, ring/cloak of protection, cover, etc.).
```

**Armor Donning / Doffing Times (2014 SRD)** — [src](https://www.5esrd.com/equipment/armor/)

```
| Category | Time to Don | Time to Doff |
|---|---|---|
| Light | 1 minute | 1 minute |
| Medium | 5 minutes | 1 minute |
| Heavy | 10 minutes | 5 minutes |
| Shield | 1 action | 1 action |
```

#### 2024 deltas (not canonical here)

- 2024 PHB armor AC values, the medium-armor +2 Dex cap, and per-armor Stealth-disadvantage entries are UNCHANGED from 2014 (Padded, Scale Mail, Half Plate, Ring Mail, Chain Mail, Splint, Plate still list Disadvantage; the same base AC numbers apply). Treat the 2014 table as still valid for AC math in 2024.
- 2024 generalizes the Strength requirement: in 2024 the Strength prerequisite/speed-penalty concept is framed more broadly (e.g. the 'Heavy' weapon/armor Strength gating language), but the practical armor outcome is the same three heavy armors (Chain Mail Str 13; Splint & Plate Str 15) reduce speed by 10 ft if you lack the Strength. The 2014 canonical rule (speed -10 ft, only those three armors) remains the source of truth here.
- 2024 Unarmored Defense wording is essentially unchanged: Barbarian 10 + Dex + Con (shield allowed), Monk (renamed 'Martial Arts'-adjacent in some printings) 10 + Dex + Wis (no shield). The base-vs-bonus stacking semantics are identical.
- 2024 reorganizes armor-related FEATS rather than the armor table: notably shield proficiency/training moved into the lighter armor feat tier (Lightly Armored) compared to 2014. This is a feat-progression change, not an AC-table change.
- 2024 donning/doffing language was clarified/streamlined but the per-category times (Light 1 min, Medium 5 min, Heavy 10 min, Shield 1 action) carry over from 2014 with no AC impact.
- These deltas are side-notes only. CANONICAL for this app's reference document is 2014 5e / SRD 5.1 — use the 2014 tables and formulas as the source of truth.

---

<a id="s6"></a>

## Hit Points & Hit Dice

### The Rule (5e RAW)

**Maximum Hit Points.**
- **Level 1:** maximum value of the class hit die + CON modifier (e.g. Fighter d10 → 10 + CON mod).
- **Each level after 1st:** either **roll the class hit die** or take its **fixed average** (round-up halfway: d6=4, d8=5, d10=6, d12=7), then add the CON modifier. The average is `floor(die/2)+1`.
- **Minimum 1 HP gained per level** — even a hugely negative CON cannot reduce a level's gain below 1.
- The CON modifier is **retroactive**: it is added once per character level, so a CON change re-applies to every level you already have (max HP = sum of all hit-die contributions + CON mod × total level).
- **Multiclassing:** each class contributes hit dice equal to its own level, each rolled/averaged on that class's die. **Only the single first character level overall** gets the maximum die value; every other level (in any class) uses roll/average. A multiclass character's max HP is the sum of all per-class contributions + CON mod × total level.

**Temporary Hit Points.** A separate pool that is **not** real HP and does **not** stack with itself — a new grant replaces the old unless larger. Damage depletes temp HP **first**, and only the overflow reduces current HP. Temp HP is not restored by rest and is lost when it reaches 0 or on a long rest.

**Hit Dice.** A character has a pool of hit dice equal to total level, one die of each class's hit-die type per class level (Fighter 3 / Wizard 2 → 3d10 + 2d6). On a **short rest** you may spend any number of available hit dice; for each, roll the die and add your CON modifier and regain that many HP (a spend cannot heal below 0 net, but a single die always rolls ≥1). On a **long rest** you regain **all** lost HP and recover **half your total hit dice** (minimum 1), expended dice returning to the pool.

**Current HP, dropping to 0, death.** Reaching 0 HP drops you (death saves territory); excess damage below 0 only matters for the instant-death massive-damage rule. Regaining any HP from 0 brings you back conscious and resets death saves.

### What Modifies It (increases / decreases)

Max HP increases:
- **Class hit die + CON each level** — auto (computeMaxHp/computeMulticlassHp, characterSetup.ts).
- **CON modifier (retroactive ×level)** — auto at creation/level-up; note it is baked into stored `maxHp` at write time, NOT re-derived if CON later changes (see Gaps).
- **Tough feat (+2 per level)** — auto-applied at render (`FEAT_EFFECTS.tough`, characterStats.ts:68 → adjustedMaxHp:936).
- **Hill Dwarf — Dwarven Toughness (+1 per level)** — auto-applied at render (`SUBRACE_HP_BONUS['hill-dwarf']`, characterStats.ts:74-76 → :938-939).
- **Magic items with `max_hp` effect (flat + perLevel)** — auto-applied at render while active (computeActiveItemEffects:527-528 → adjustedMaxHp:954).
- **Aasimar/other racial flat HP, Draconic Resilience (Draconic Sorcerer +1/level), Periapt of Wound Closure, etc.** — NOT represented (no effect entry; Draconic Sorcerer not in any HP registry).

Temp HP (Aid, Heroism, False Life, Fiendish Vigor, Inspiring Leader, fighter's Second Wind on some builds, etc.):
- All sources are **manual** — a single `tempHp` stepper that the player sets by hand (CombatBlock:149-155). The non-stacking "take the higher" rule is the player's responsibility.

Current HP changes:
- ±1 buttons, adjust-by-amount modal, hit-die healing total (shown in roll log, applied by hand) — all manual.

### What It Rolls & How the Roll Resolves

- **Creation/level-up HP roll:** sums `rollDie(classDie)` over the relevant levels (characterSetup.ts `rollHp`:105-111; LevelUpDialog `rollHp`:200-202 rolls one die for the new level), then `+ CON mod`, floored at 1.
- **Hit-die spend (short rest):** `{ type: 'heal', die: classDie, modifier: CON mod }` → `useDiceStore.roll` rolls the die once and adds the modifier (dice.ts/dice store:79,93-94); the result is shown as `"… healing = N HP"` in the roll log. It is a single die + flat CON mod, **no advantage, no crit** (heal is not an attack).
- **Max HP itself:** a static stored value (`maxHp`) + derived bonuses (`adjustedMaxHp`); no roll at display time.

### How This App Handles It

Store → derive → render path:

- **Creation (write).** `draftToNewCharacter` (characterSetup.ts:716-725) computes `maxHp` via `computeMulticlassHp` using EFFECTIVE CON (base + racial + feat, :713-715), then sets `currentHp = maxHp`, `tempHp = 0`, `hitDiceUsed = 0`, `hitDiceUsedByClass = {}` (:786-796). `computeMaxHp`/`computeMulticlassHp` (:49-103) implement L1=max die, 2+=`floor(die/2)+1` average (or roll/max/custom), `+ CON×level`, `Math.max(1, …)`. Multiclass average gives primary-class L1 the full die and averages all other levels (:96-102). Roll-HP at creation sums every class's dice (SetupScreen1 `handleRollHp`:218-226, fixing BUG-18).
- **Level-up (write).** `LevelUpDialog` (LevelUpDialog.tsx) seeds the HP stepper at `Math.max(1, avgHpIncrease)` where `avgHpIncrease = floor(hitDie/2)+1+conMod` (:87,146); "Roll d{hitDie}" rolls `rollDie+conMod` floored at 1 (:200-202); the stepper itself floors at 1 (:369, min={1}). `handleApply` writes `maxHp = character.maxHp + hpAdd`, `currentHp = character.currentHp + hpAdd` (:211-213). The min-1 guard (BUG-08 fix) is enforced in three places.
- **Derive (render).** `deriveCharacterStats` computes `adjustedMaxHp = character.maxHp + hpBonus(feats) + subraceHpBonus + itemEffects.maxHp` (characterStats.ts:932-954). `hitDiceType = parseInt(classData.hit_die)` from the PRIMARY class only (:942), used for the single-class hit-die roll. CON modifier for hit-die healing is `abilityModifier(derived.effectiveAbilities.con)` (CombatBlock:270).
- **Render (CombatBlock.tsx).** `HpSection` shows current HP with ±1 buttons (`changeHp`:58-72) and an adjust-by-amount modal; current HP floors at 0 (`Math.max(0, …)`:61, BUG-66 fix) and is capped at `adjustedMaxHp`. Death-save reset on any ≤0→>0 transition (:64-70, BUG-23 fix). Max HP stepper edits the BASE (`newBase = v − featBonus`, :130-132) so derived bonuses aren't double-stored; label reads "+N (feat/race)" (:138-142, BUG-07 fix). Temp HP is an independent stepper (:149-155). Hit dice: single-class shows `total − hitDiceUsed` countdown + a `heal` roll that decrements `hitDiceUsed` (:274-278, 429-441); multiclass shows one row per class die, each tracked in `hitDiceUsedByClass[classSlug]` with its own `heal` roll at that class's die (:281-288, 400-423, BUG-22 fix). `classHitDice` is built in `useDerivedSheet` (:92-101) only when `classes.length > 1`.

### Gaps & Mis-Handling

- **Temp HP never absorbs damage** — it is a pure display stepper; `changeHp` ignores it entirely, so the buffer is decorative. (discrepancy: temp-hp-not-buffer)
- **No short-rest / long-rest action exists** — there is no UI to "restore all HP + half hit dice" (long rest) or to recover spent hit dice; every reset is manual stepper-by-stepper. (discrepancy: no-rest-mechanic)
- **Hit-die healing total is shown in the roll log but not applied to current HP** — `rollHitDie`/`rollClassHitDie` dispatch a `heal` roll and decrement the die pool, but never change `currentHp`; the player must read the log and bump HP by hand. Borderline intentional (manual HP control) but the spend is committed even if the player never applies the heal. (discrepancy: hitdie-heal-not-applied)
- **CON change after creation does not re-derive max HP** — `maxHp` is a stored write-time value with CON baked in ×level; raising CON on the sheet does not retroactively raise max HP (only Tough/subrace/item bonuses re-derive). Known partial overlap with BUG-57's "max HP has no write event" note. (discrepancy: con-not-retroactive-maxhp)

#### Sourced rule facts (2014 RAW, web-verified)

- At 1st level, a character's hit point maximum equals the maximum (highest) value of their class's Hit Die plus their Constitution modifier. (E.g. Fighter: 10 + CON mod; Wizard: 6 + CON mod; Barbarian: 12 + CON mod.) — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/fighter/)
- Each character has 1 Hit Die per character level; the die type is set by class (d6/d8/d10/d12). At 1st level you have 1 Hit Die. Each level up grants one additional Hit Die of that class's type. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/fighter/)
- When leveling up beyond 1st level, you increase your hit point maximum by either rolling your class's Hit Die OR taking the fixed 'average' value, then adding your Constitution modifier. The SRD per-class text reads e.g. 'Hit Points at Higher Levels: 1d10 (or 6) + your Constitution modifier per fighter level after 1st.' — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/fighter/)
- The fixed/average HP value per level by die type is: d6 -> 4, d8 -> 5, d10 -> 6, d12 -> 7. This is the value used when not rolling (then add CON modifier). — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/barbarian/)
- Your Constitution modifier contributes to your hit points: you add your Constitution modifier to each Hit Die you roll (or each fixed value taken) for your hit points. — [src](https://5thsrd.org/rules/abilities/constitution/)
- If your Constitution modifier changes, your hit point maximum changes as well, as though you had the new modifier from 1st level. The adjustment is retroactive across all levels. — [src](https://5thsrd.org/rules/abilities/constitution/)
- A creature's current hit points (usually just called hit points) can be any number from the creature's hit point maximum down to 0. — [src](https://roll20.net/compendium/dnd5e/Combat)
- Healing restores hit points up to but not beyond the hit point maximum. Any hit points regained in excess of the maximum are lost. — [src](https://roll20.net/compendium/dnd5e/Combat)
- During a short rest, a character may spend one or more Hit Dice, up to their maximum number (equal to character level). For each Hit Die spent, roll the die and add the Constitution modifier; the character regains hit points equal to the total. The player may decide to spend an additional Hit Die after each roll. — [src](https://5thsrd.org/adventuring/resting/)
- At the end of a long rest, a character regains all lost hit points and regains spent Hit Dice up to a number equal to HALF of their total number of Hit Dice (minimum of one die). — [src](https://5thsrd.org/adventuring/resting/)
- A long rest is at least 8 hours. A character can't benefit from more than one long rest in a 24-hour period, and must have at least 1 hit point at the start to gain its benefits. Strenuous activity (at least 1 hour of walking, fighting, casting spells, etc.) interrupts the long rest, requiring it to restart. — [src](https://5thsrd.org/adventuring/resting/)
- Temporary hit points are a buffer against damage — a separate pool that is not actual hit points and does not count toward the hit point maximum. Damage depletes temporary hit points first; only the remainder reduces current hit points. — [src](https://squire5.com/reference/wotc-srd-5-1/playing-the-game/combat/damage-and-healing/temporary-hit-points/)
- Temporary hit points from different sources don't add together. If you have temporary hit points and gain more, you decide whether to keep your current ones or take the new ones (you take whichever is more advantageous, not the sum). — [src](https://squire5.com/reference/wotc-srd-5-1/playing-the-game/combat/damage-and-healing/temporary-hit-points/)
- Temporary hit points cannot be healed (regaining hit points does not restore lost temporary hit points). Unless an effect says otherwise, they last until depleted or until you finish a long rest. — [src](https://squire5.com/reference/wotc-srd-5-1/playing-the-game/combat/damage-and-healing/temporary-hit-points/)
- Some effects reduce a creature's hit point maximum (separate from damage). This reduction lasts until the effect ends (typically a long rest or a specific remedy). A creature's current hit points cannot exceed a reduced maximum. — [src](https://5thsrd.org/rules/abilities/constitution/)
- When multiclassing, you gain hit points from a new class as described for 'levels after 1st' (roll or fixed value + CON mod) — you do NOT take the maximum die value. Maximum-at-1st-level HP is granted only for your very first class at character level 1. — [src](https://5thsrd.org/rules/multiclassing/)
- When multiclassing, add together the Hit Dice granted by all classes to form your pool. Hit Dice of the same type pool together; different types are tracked separately (e.g. paladin 5/cleric 5 = five d10 and five d8 Hit Dice). — [src](https://5thsrd.org/rules/multiclassing/)

#### Key tables

**Hit Die by Class (2014 SRD)** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/fighter/)

```
Barbarian: d12 | Fighter: d10 | Paladin: d10 | Ranger: d10 | Bard: d8 | Cleric: d8 | Druid: d8 | Monk: d8 | Rogue: d8 | Warlock: d8 | Sorcerer: d6 | Wizard: d6. (Non-SRD app classes: Artificer: d8; Blood Hunter: d10.)
```

**HP Gain per Level by Die Type** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/barbarian/)

```
Die | 1st-level max (auto) | Fixed value per later level | True average per later level
d6  | 6  | 4 | 3.5
d8  | 8  | 5 | 4.5
d10 | 10 | 6 | 5.5
d12 | 12 | 7 | 6.5
(Add Constitution modifier to every entry, at every level. Fixed value = die/2 + 1, i.e. the half-average rounded UP — it is one higher than the true mathematical average.)
```

**Per-Class HP Text Pattern (2014 SRD verbatim form)** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/wizard/)

```
Hit Dice: 1dX per [class] level. | Hit Points at 1st Level: [X] + your Constitution modifier. | Hit Points at Higher Levels: 1dX (or [fixed]) + your Constitution modifier per [class] level after 1st. Examples — Fighter: '10 + CON', '1d10 (or 6) + CON'. Wizard: '6 + CON', '1d6 (or 4) + CON'. Barbarian: '12 + CON', '1d12 (or 7) + CON'.
```

**Hit Dice Recovery on Rest (2014 vs 2024)** — [src](https://5thsrd.org/adventuring/resting/)

```
SHORT REST: spend any number of Hit Dice up to your total; per die roll + CON mod = HP regained (sequential, optional). LONG REST: 2014 -> regain HALF your total Hit Dice (rounded down, minimum 1) and all HP. 2024 -> regain ALL spent Hit Point Dice and all HP. Examples (2014 long rest): L1 recovers 1; L4 recovers 2; L10 recovers 5; L20 recovers 10.
```

#### 2024 deltas (not canonical here)

- 2024 DELTA — Long rest Hit Dice recovery: 2024 returns ALL spent Hit Point Dice on a long rest (plus all HP). 2014 returns only HALF your total Hit Dice (rounded down, minimum 1). Side-note only; canonical 2014 rule is HALF.
- 2024 DELTA — Terminology: 2024 renames 'Hit Dice' to 'Hit Point Dice' and uses a 'Fixed Hit Points by Class' table. The 2014 canonical term is 'Hit Dice'.
- 2024 DELTA — Level-up default: In 2024 the fixed/average value is presented as the standard/default option for increasing HP on level up (rolling is the variant). In 2014 rolling is the printed default and the fixed value is the optional alternative. The numbers (d6->4, d8->5, d10->6, d12->7) are unchanged.
- 2024 DELTA — Minimum gain: 2024 explicitly states the HP increase per level is a minimum of 1 (roll + CON mod, minimum 1). 2014 has no explicit per-level minimum, though a Hit Die roll plus a normal CON modifier effectively never goes below 1 except with a strongly negative CON.
- 2024 DELTA — Resting structure is largely unchanged otherwise: short rest = 1 hour spending Hit Point Dice (roll + CON mod), long rest = 8 hours restoring all HP; the at-least-1-HP-to-rest and once-per-24-hours constraints carry over.

---

<a id="s7"></a>

## Death Saves & Dropping to 0 HP

### The Rule (5e RAW)
When a creature drops to 0 hit points, two things can happen:

- **Instant Death:** If damage reduces you to 0 HP *and there is damage remaining*, you die if that remaining damage **equals or exceeds your hit point maximum**. (E.g. a 12-HP creature takes 30 damage: 12 absorbs the drop to 0, the remaining 18 ≥ 12 max → instant death, no saves.)
- **Falling Unconscious:** Otherwise you drop to 0 HP, fall **unconscious** (the Unconscious condition: incapacitated, prone, drops what it's holding, auto-fails STR/DEX saves, attacks against it have advantage, melee hits within 5 ft are automatic crits), and begin making **death saving throws**.

**Death Saving Throws** (made at the start of your turn while at 0 HP, *only* if not stabilized):
- Roll a **d20, no modifiers** (proficiency, ability mods, etc. do NOT apply — though a feature like a Paladin's Aura or the *Bless* spell can add to it, and advantage/disadvantage can apply).
- **10 or higher = success; 9 or lower = failure.**
- **Three successes** → you become **stable** (unconscious at 0 HP, no longer roll).
- **Three failures** → you **die**.
- Successes and failures need not be consecutive; track both until you hit 3 of either.
- **Natural 20** → you regain **1 HP** and become conscious immediately (and all death saves reset).
- **Natural 1** → counts as **two failures**.

**Damage at 0 HP:** Any damage taken while at 0 HP is an automatic **death save failure**. If the damage is from a **critical hit** (per RAW, a melee attack hitting an unconscious creature within 5 ft is an auto-crit), it counts as **two failures**. If the remaining damage ≥ HP max, it's still instant death.

**Healing & Stabilizing:**
- **Any** amount of healing (regaining ≥1 HP) makes you conscious and **resets all death saves** (both counters to 0).
- A creature can be **stabilized** without healing (e.g. a successful DC 10 WIS *Medicine* check, or the *Spare the Dying* cantrip). A stabilized creature is **unconscious at 0 HP** and stops rolling death saves; it regains **1 HP after 1d4 hours** if it doesn't take more damage.
- **Temporary HP** is a buffer that absorbs damage *before* real HP. You only drop toward 0 (and death saves) once temp HP is exhausted. Temp HP is not healing and doesn't affect death saves.

### What Modifies It (increases / decreases)
- **Drop to 0 HP** — caused by damage exceeding current HP (after temp HP). *App: manual via the HP −/adjust controls; temp HP is NOT consumed by the app's damage path (gap).* 
- **Instant death (massive damage)** — remaining damage ≥ HP max. *App: not represented (HP floors at 0; the massive-damage check is explicitly skipped — see BUG-66 note in code).* 
- **Death save success/failure** — d20 ≥10 / ≤9. *App: manual pip toggles (no d20 is rolled by the app).* 
- **Nat 20 on a death save → 1 HP + conscious.** *App: not represented as a death-save roll (no roll happens); the player would manually heal to 1 HP via HP +.* 
- **Nat 1 → two failures.** *App: not represented (pips only ever advance one at a time).* 
- **Damage at 0 HP → +1 failure (+2 on a melee crit).** *App: not auto-applied — damage at 0 just keeps HP at 0; the player must manually click a failure pip.* 
- **Any healing → conscious + reset all death saves.** *App: auto-applied in `changeHp` on the ≤0→>0 transition (CombatBlock.tsx:64-70).* 
- **Stabilize (Medicine/Spare the Dying) → unconscious at 0, stop rolling, 1 HP after 1d4 hrs.** *App: the 3-success path is treated as "Stabilized" but house-ruled to also set 1 HP immediately (BUG-67, intentional deviation); the standalone "stabilize without 3 successes" action and the 1d4-hour recovery are not represented.* 
- **Bless / Paladin Aura / advantage on death saves** — *App: not represented (no death-save roll exists to modify).* 
- **Temporary HP** — set/edited manually via the Temp HP stepper (CombatBlock.tsx:149-155); never auto-consumed.

### What It Rolls & How the Roll Resolves
- **In RAW:** death save = `1d20`, no modifiers; ≥10 success, ≤9 failure; nat 20 = revive at 1 HP; nat 1 = two failures.
- **In this app:** there is **no death-save roll**. Death saves are a purely manual 3-success / 3-failure pip tracker (CombatBlock.tsx:235-260). The d20 is never rolled by `useDiceStore`/`useRollDispatch` for death saves (`RollKind` has no death-save variant). HP changes are static value edits, not rolls. (Hit dice, separately, *do* roll: `rollHitDie` dispatches a `heal` roll of `d{hitDie}+CON` — CombatBlock.tsx:274-288 — but that's short-rest healing, not death saves.)

### How This App Handles It
Stored state: `character.currentHp`, `character.tempHp`, `character.maxHp`, and `character.deathSaves: { successes, failures }` (src/types/character.ts:85-97, 25-28). These are written via `onSave` → Zustand `update` → `characterRepo`.

- **Dropping HP:** `HpSection.changeHp(delta)` (CombatBlock.tsx:58-72) computes `newHp = Math.min(adjustedMaxHp, Math.max(0, currentHp + delta))`. HP floors at 0 (BUG-66 fixed). It does **not** route damage through `tempHp` and does **not** apply the massive-damage instant-death check (explicitly noted at lines 59-60).
- **Unconscious display:** when `currentHp <= 0`, HP renders red with an "Unconscious" label (CombatBlock.tsx:74-79, 116-120). At/below half it shows "Bloodied".
- **Healing resets death saves:** `changeHp` resets `deathSaves` to `{0,0}` on any ≤0→>0 crossing when either counter is non-zero (CombatBlock.tsx:64-70) — this is the INV-7 reset and the BUG-23 fix (closed, commit 4edb247). It correctly fires from both the +/− buttons and the "adjust by amount" modal (both call `changeHp`, lines 91/103/163).
- **Death save pips:** `DeathSaves.toggle(type, i)` (CombatBlock.tsx:183-201) advances/retreats the successes or failures count by clicking pips. Reaching **3 failures** with `currentHp <= 0` shows a "DEAD" panel (CombatBlock.tsx:181, 203-217).
- **3rd success → Stabilized:** the success branch (CombatBlock.tsx:187-198) writes `{successes:3}` plus `currentHp: Math.max(1, currentHp)` (house rule, BUG-67 — deviates from RAW where stabilize leaves you at 0), flashes "Stabilized!", then after 1500 ms resets `deathSaves` to `{0,0}`.
- **Max HP stepper** (CombatBlock.tsx:127-137) can raise `currentHp` (`currentHp: Math.min(currentHp, v)`) but never *increases* current HP above its existing value, so it can't be a back-door revive; it does not touch `deathSaves` (acceptable since it can't cross 0→>0 upward).

### Gaps & Mis-Handling
- **Temp HP is never consumed by damage** — `changeHp` subtracts `delta` straight from `currentHp`, ignoring `tempHp` entirely (CombatBlock.tsx:61). A character with temp HP who takes damage will wrongly drop toward 0 (and into the unconscious/death-save state) when the temp HP should have absorbed it. (Unlogged.)
- **Damage taken at 0 HP does not auto-add a death-save failure** — clicking − while at 0 leaves HP at 0 and never increments `failures` (CombatBlock.tsx:58-72). RAW: each instance of damage at 0 HP is an automatic failure (two on a melee crit). The player must remember to click a failure pip manually. (Intentionally manual in spirit, but worth flagging — note below.)
- **Massive-damage instant death not modeled** — HP floors at 0, so a one-shot for ≥ max HP shows a recoverable unconscious state, not death (CombatBlock.tsx:59-61). (Logged-adjacent: BUG-66 documents the floor-at-0 decision and explicitly states the instant-death check is not modeled — intentional.)
- **Stabilize action requires reaching 3 successes** — there's no way to mark a character "stable at 0 HP" from an external effect (Medicine check, *Spare the Dying*); the only stabilize path is the 3-success pip flow (CombatBlock.tsx:187-198). The 1d4-hour → 1 HP recovery is also not modeled. (Intentionally manual — DM-adjudicated timing.)
- **3rd success sets 1 HP** — deliberate house-rule deviation from RAW (stabilize = unconscious at 0), CombatBlock.tsx:190-191. Documented as BUG-67, intentional; **not a bug** — recorded here so it isn't "corrected" back.
- **Not represented (correctly manual, not bugs):** nat-20-revives-at-1-HP and nat-1-counts-as-two-failures (no death-save roll exists), and *Bless*/Paladin-aura/advantage modifiers to death saves. These depend on a death-save roll the app intentionally leaves as manual pip-clicking.

#### Sourced rule facts (2014 RAW, web-verified)

- When a creature's hit points drop to 0, it either dies outright (instant death) or falls unconscious. 0 hit points is the floor — damage never reduces a creature below 0 hit points; you can't have negative HP. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Instant Death: When damage reduces you to 0 hit points and there is damage remaining, you die instantly if the remaining damage equals or exceeds your hit point MAXIMUM. (You first subtract enough damage to reach 0, then compare the leftover damage to your max HP.) — [src](https://5thsrd.org/combat/damage_and_healing/)
- Instant Death example (verbatim from Basic Rules): a cleric with a maximum of 12 hit points currently has 6 hit points. If she takes 18 damage, she is reduced to 0 hit points, but 12 damage remains. Because the remaining damage (12) equals her hit point maximum (12), the cleric dies. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Falling Unconscious: If damage reduces you to 0 hit points and fails to kill you (the instant-death condition is not met), you fall unconscious. You remain unconscious until you regain at least 1 hit point. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Death Saving Throws: Whenever you start your turn with 0 hit points, you must make a death saving throw. It is NOT tied to any ability score, so no ability modifier, no proficiency bonus, and no save-proficiency applies. Roll a d20: 10 or higher = success; 9 or lower = failure. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Three successes / three failures: On your third SUCCESS you become stable (you stop rolling death saves, stay at 0 HP, stay unconscious). On your third FAILURE you die. The successes and failures don't need to be consecutive — track each independently, keeping a running count of both until one reaches 3. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Rolling a natural 1 on a death saving throw counts as TWO failures. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Rolling a natural 20 on a death saving throw: you immediately regain 1 hit point (and therefore stop being unconscious / return to consciousness and can act). It does NOT count as two successes — it restores you to 1 HP outright. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Resetting counters: The number of both successes and failures is reset to zero when you regain ANY hit points or when you become stable. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Taking damage while at 0 hit points causes one death saving throw FAILURE. If that damage is from a critical hit, it causes TWO failures instead. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Instant death can also occur while at 0 HP: if you take damage at 0 HP whose amount equals or exceeds your hit point maximum, you suffer instant death (you die outright rather than just gaining failures). — [src](https://5thsrd.org/combat/damage_and_healing/)
- Stabilizing a creature (active): You can use your ACTION to administer first aid to an unconscious creature and attempt to stabilize it, requiring a successful DC 10 Wisdom (Medicine) check. Success makes the creature stable. — [src](https://5thsrd.org/combat/damage_and_healing/)
- A stable creature does not make death saving throws, even though it has 0 hit points, but it remains unconscious. It stops being stable (and must resume death saves at its NEXT turn at 0 HP) if it takes any damage. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Natural recovery: A stable creature that isn't healed regains 1 hit point after 1d4 hours. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Regaining any hit points while at 0 HP immediately ends the unconscious/dying state: you are no longer at 0 HP, you regain consciousness, and your death-save success and failure counts reset to zero. — [src](https://5thsrd.org/combat/damage_and_healing/)
- Monsters and Death: At the GM's option, most monsters die the instant they drop to 0 hit points rather than falling unconscious and making death saving throws. Mighty villains and special NPCs may be treated as player characters (falling unconscious and rolling death saves). — [src](https://5thsrd.org/combat/damage_and_healing/)
- Knocking a Creature Out: When an attacker reduces a creature to 0 hit points with a MELEE attack, the attacker can choose to knock the creature out instead of killing it. The attacker makes this choice the instant the damage is dealt; the creature falls unconscious and is stable. — [src](https://5thsrd.org/combat/damage_and_healing/)
- The Unconscious condition (which applies to a creature at 0 HP that isn't dead): the creature is incapacitated (can't take actions or reactions), can't move or speak, is unaware of its surroundings, drops what it's holding and falls prone, automatically fails Strength and Dexterity saving throws, attack rolls against it have advantage, and any attack that hits it is a critical hit if the attacker is within 5 feet. — [src](https://5thsrd.org/rules/conditions/)
- Death saves are rolled only at the start of the dying creature's own turn; there is no roll triggered by simply being at 0 HP outside your turn. (Damage taken between turns inflicts auto-failures, not rolls.) — [src](https://5thsrd.org/combat/damage_and_healing/)

#### Key tables

**Death Saving Throw resolution (d20)** — [src](https://5thsrd.org/combat/damage_and_healing/)

```
d20 = 1 -> counts as TWO failures.
d20 = 2-9 -> ONE failure.
d20 = 10-19 -> ONE success.
d20 = 20 -> regain 1 HP, return to consciousness (NOT counted as successes); both counters reset.
Threshold: 10 or higher succeeds; 9 or lower fails. Flat DC 10, no modifiers of any kind.
```

**Death-save counter outcomes** — [src](https://5thsrd.org/combat/damage_and_healing/)

```
3rd SUCCESS -> creature becomes STABLE (stays at 0 HP, unconscious, no more death saves; both counters reset).
3rd FAILURE -> creature DIES.
Successes and failures are tracked separately, need not be consecutive, and persist across rounds until one reaches 3.
Regain ANY hit points -> both counters reset to 0 and creature is no longer dying.
Become stable -> both counters reset to 0.
```

**Auto-failures from damage at 0 HP** — [src](https://5thsrd.org/combat/damage_and_healing/)

```
Take any damage while at 0 HP -> 1 automatic death-save FAILURE (no roll).
Damage is from a CRITICAL HIT -> 2 automatic death-save failures.
Damage taken at 0 HP that equals or exceeds your hit point MAXIMUM -> instant death.
(Melee attack vs. an unconscious target within 5 ft auto-crits -> commonly 2 failures per hit.)
```

**Instant death threshold** — [src](https://5thsrd.org/combat/damage_and_healing/)

```
On a hit that reduces you to 0 HP with damage left over: remaining damage = (incoming damage) - (current HP at moment of hit).
If remaining damage >= your hit point MAXIMUM -> instant death (skip unconsciousness and death saves entirely).
If remaining damage < your hit point maximum -> fall unconscious, begin death saves.
Example: max 12 HP, at 6 HP, take 18: 6 used to reach 0, 12 remaining; 12 >= 12 -> dead.
```

**Ways to stabilize a creature at 0 HP** — [src](https://5thsrd.org/combat/damage_and_healing/)

```
Action + DC 10 Wisdom (Medicine) check (success = stable).
Healer's kit: expend one use (of 10) to stabilize automatically, no check.
Spare the Dying cantrip: touch a creature at 0 HP to make it stable, no roll.
Rolling a natural 20 on a death save: not 'stabilize' but regain 1 HP (back to consciousness).
Regaining any HP (healing): ends dying entirely (not the same as stabilizing).
Result of stabilizing: 0 HP, unconscious, no death saves; regains 1 HP after 1d4 hours if not healed; un-stabilizes if it takes damage.
```

#### 2024 deltas (not canonical here)

- 2024 PHB: the core death-save mechanics are UNCHANGED from 2014 — still DC 10 flat, 3 successes = stable, 3 failures = dead, nat 1 = two failures, nat 20 = regain 1 HP, damage at 0 HP = a failure (two on a crit), instant death when leftover/incoming damage >= max HP. Terminology updated (Stable, Hit Point, capitalized condition names).
- 2024 delta (terminology, not rules): the Healer's Kit / object interactions are framed via the new 'Utilize' action rather than the 2014 'Use an Object' action. Mechanically identical: expend one use to stabilize without a check.
- 2024 delta (new sources of advantage on death saves): the revised Durable feat now grants ADVANTAGE on Death Saving Throws (2014 Durable only affected hit-point recovery on a short/long rest, not death saves). The Bless and Beacon of Hope effects that grant advantage on death saves remain a way to improve them. The app should support a per-character 'advantage on death saves' flag.
- 2024 delta (healing magnitude, indirectly relevant): Healing Word in 2024 heals 2d4 + spellcasting modifier (up from 1d4 in 2014). Any healing of >=1 HP still ends the dying state and resets both death-save counters — the threshold ('any hit points') is unchanged.
- 2024 delta (Spare the Dying): in 2024 the Spare the Dying cantrip's range is increased (touch -> a ranged range in the revised cantrip) and may grant a bonus to the creature's next death save in some printings; the STABILIZE effect itself is unchanged. Treat the 2014 version (touch, stabilize, no roll) as canonical and the range/extra as a 2024 side-note.
- 2024 delta (Player vs monster death is the same): 2024 keeps the 'monsters usually die at 0 HP' guidance and the optional 'treat important NPCs as PCs' rule. No change to the PC death-save subsystem.

---

<a id="s8"></a>

## Speed & Initiative

### The Rule (5e RAW)

**Speed** is a static value (feet of walking movement) on the character, set by race
and modified by features/feats/items/conditions. Base walking speeds: 30 ft for most
races (human, elf, dragonborn, half-elf, half-orc, tiefling), 25 ft for dwarves and
Small races (halfling, gnome), and 35 ft for the Wood Elf subrace. Speed governs how
far you can move on a turn (and double that when you Dash). It is **not rolled** — it
is a fixed number compared against distances.

**Initiative** determines turn order in combat. At the start of an encounter every
combatant makes one **initiative roll**: `d20 + DEX modifier + any initiative bonuses`.
Higher result acts earlier. Ties are broken by **DEX modifier** first (higher DEX
acts first), then by DM/player choice. Some features grant **advantage** on the
initiative roll (Barbarian Feral Instinct, the 2024 Alert feat, Champion's Remarkable
Athlete in older builds via DEX, etc.). Initiative is rolled once per encounter; it is
a genuine d20 roll, not a passive/static value — though many tables pre-compute and
display the flat "initiative bonus" (DEX mod + extras) for convenience.

### What Modifies It (increases / decreases)

**Speed**
- Race base speed (30/25/35) — **auto-applied** (setup writes `speed` from `subraceData?.speed ?? race.base.speed`).
- Wood Elf subrace 35 ft override — **auto-applied** (subrace `speed` wins).
- Mobile feat (+10), Squat Nimbleness (+5) — **auto-applied** (`speed` FeatEffect → `featSpeedBonus`).
- Magic items with a `speed` ItemEffect (e.g. Boots of Speed concept) — **auto-applied** while active (`itemEffects.speed`).
- Barbarian Fast Movement (+10 ft at L5 while not in heavy armor) — **not represented** (no class-feature speed effect; the user must edit the speed stepper manually).
- Monk Unarmored Movement (+10/+15/+20/+25/+30 by level, no armor/shield) — **not represented** (manual).
- Longstrider spell (+10) and other spell/transient buffs — **intentionally manual** (situational; player edits the stepper).
- Heavy armor worn without meeting its STR requirement → **−10 ft speed** — **not represented** (data has `strength_requirement` and the app knows `effectiveAbilities.str`, but no speed penalty is computed).
- Conditions (prone/grappled/restrained = speed 0; difficult terrain) — **intentionally manual / not represented** (DM-adjudicated, transient).

**Initiative**
- DEX modifier — **auto-applied** (core of `effectiveInitiative`).
- Alert feat (+5) — **auto-applied** (`initiative` FeatEffect → `featInitiativeBonus`).
- Magic items with an `initiative` ItemEffect — **auto-applied** while active (`itemEffects.initiative`).
- Manual `initiativeBonus` override — **auto-applied** (added in).
- Bard Jack of All Trades (+½ proficiency bonus, rounded down, to initiative) — **not represented** (no half-PB-to-initiative logic anywhere).
- Advantage on initiative (Feral Instinct, 2024 Alert) — **not represented as a roll modifier** (irrelevant today because initiative is never rolled — see below).
- Alert's "can't be surprised" clause — **intentionally not represented** (narrative/encounter-level, not a stat).

### What It Rolls & How the Roll Resolves

- **Speed:** static value, no roll.
- **Initiative (RAW):** `d20 + DEX mod + initiative bonuses`, advantage/disadvantage
  taken when granted; ties broken by DEX. **In this app, initiative does not roll at
  all** — there is no `{ type: 'initiative' }` variant in `RollKind`
  (src/types/dice.ts:18–25) and no dispatch site. The Initiative StatCard
  (CombatBlock.tsx:339–342) shows only the flat bonus `derived.effectiveInitiative`
  as text; clicking it does nothing.

### How This App Handles It

Path: stored base → `deriveCharacterStats` → CombatBlock render.

- **Stored (base):** `character.speed` = race/subrace base, written once in setup at
  src/lib/characterSetup.ts:790 (`subraceData?.speed ?? race?.base.speed ?? 30`);
  `character.initiativeBonus` = 0 unless manually edited (characterSetup.ts:791;
  `defaultCharacter` sets `speed: 30, initiativeBonus: 0` at character.ts:185). These
  are base values per INV-1 — no feat/item math is baked in (BUG-01/02 fixed; the
  setup/level-up write sites no longer add `featSpeedBonus`/`featInitiativeBonus`).
- **Derived:** src/lib/characterStats.ts:792 `effectiveSpeed = character.speed +
  featSpeedBonus + itemEffects.speed`; line 793 `effectiveInitiativeBonus =
  (character.initiativeBonus ?? 0) + featInitiativeBonus + itemEffects.initiative`;
  line 794 `effectiveInitiative = dexMod + effectiveInitiativeBonus`, where `dexMod`
  (line 791) uses `effectiveAbilities.dex` (so racial/feat/item DEX bonuses correctly
  flow into initiative). `featSpeedBonus`/`featInitiativeBonus` accumulate from each
  feat's `speed`/`initiative` FeatEffect via `computeFeatStatDelta` (lines 101–104,
  734–735). Item `speed`/`initiative` effects accumulate in
  `computeActiveItemEffects` (lines 553–558) gated on active (attuned/equipped).
- **Render:** CombatBlock.tsx:316–338 shows Speed via a `StepperField` bound to
  `derived.effectiveSpeed`; editing it back-solves the base
  (`base = v - (effectiveSpeed - character.speed)`, line 322) and saves `speed`. A
  gold `+N (feat)` tag (lines 332–336) shows when `effectiveSpeed !== character.speed`.
  Initiative (lines 339–342) is read-only static text.

The feat/item application math for both stats is correct and single-point (INV-1
satisfied). The gaps below are all *missing* representation, not double-counting.

### Gaps & Mis-Handling

- Initiative is never rollable — only displayed as a flat number, while RAW initiative
  is a d20 roll. No `RollKind` variant and no dispatch. (discrepancy `init-not-rollable`)
- Heavy armor worn without meeting its STR requirement does not apply the −10 ft speed
  penalty, even though `strength_requirement` is in the armor data and `effectiveAbilities.str`
  is known at derive time. (discrepancy `heavy-armor-speed-penalty`)
- Bard Jack of All Trades does not add half proficiency bonus to initiative.
  (discrepancy `jack-of-all-trades-init`)
- The speed-bonus tag is hard-labeled "(feat)" but also fires for item-sourced speed
  bonuses (display-vs-source, INV-5). (discrepancy `speed-tag-label-feat-only`)

#### Sourced rule facts (2014 RAW, web-verified)

- Every character and monster has a speed, which is the distance in feet that the character or monster can walk in 1 round (a round represents about 6 seconds in the game world). — [src](https://5thsrd.org/adventuring/movement/)
- On your turn, you can move a distance up to your speed. You can use as much or as little of your speed as you like, in any combination with your action. — [src](https://5thsrd.org/combat/movement_and_position/)
- You can break up your movement on your turn, using some of your speed before and after your action. For example, with a speed of 30 feet, you can move 10 feet, take your action, then move 20 feet. If your action includes more than one weapon attack, you can move between those attacks. — [src](https://5thsrd.org/combat/movement_and_position/)
- If you have more than one speed (e.g. walking and flying), you can switch back and forth between your speeds during your move. Whenever you switch, subtract the distance already moved from the new speed; the result determines how much farther you can move. A result of 0 or less means you can't use that speed during the current move. — [src](https://5thsrd.org/combat/movement_and_position/)
- Every foot of movement in difficult terrain costs 1 extra foot — i.e. you move at half speed. This is true even if multiple things in a space count as difficult terrain. Examples: low furniture, rubble, undergrowth, steep stairs, snow, shallow bogs. — [src](https://5thsrd.org/combat/movement_and_position/)
- You can drop prone without using any of your speed. Standing up from prone costs an amount of movement equal to half your speed; if your speed is 0, you can't stand up. To move while prone you must crawl. — [src](https://5thsrd.org/combat/movement_and_position/)
- Every foot of movement while crawling costs 1 extra foot. Crawling 1 foot in difficult terrain therefore costs 3 feet of movement. — [src](https://5thsrd.org/combat/movement_and_position/)
- Climbing, swimming, and crawling each cost 1 extra foot per foot of movement (2 extra feet in difficult terrain), unless the creature has a climbing or swimming speed for that mode. — [src](https://5thsrd.org/adventuring/movement/)
- Long Jump: you cover a number of feet up to your Strength SCORE if you move at least 10 feet on foot immediately before the jump; with a standing jump (no running start) you cover only half that distance. Either way, each foot cleared costs a foot of movement. — [src](https://5thsrd.org/adventuring/movement/)
- High Jump: you leap into the air a number of feet equal to 3 + your Strength MODIFIER if you move at least 10 feet on foot immediately before the jump; with a standing jump you reach only half that height. You can extend your reach by half your height when grabbing for something at the apex. — [src](https://5thsrd.org/adventuring/movement/)
- Travel speed: a creature with a higher or lower walking speed than 30 ft covers a proportionally greater or lesser distance over an hour/day of travel (the standard Travel Pace table assumes a base speed near 30 ft). — [src](https://5thsrd.org/adventuring/movement/)
- Initiative: at the beginning of combat, every participant makes a Dexterity check. The GM ranks the combatants in order from the one with the highest Dexterity check total to the one with the lowest; this is the order in which they act during each round. — [src](https://5thsrd.org/combat/order_of_combat/)
- You add your Dexterity modifier to your initiative roll because initiative is a Dexterity check. — [src](https://5thsrd.org/rules/abilities/dexterity/)
- Initiative ties: the GM decides the order among tied GM-controlled creatures, and the players decide the order among their own tied characters. The GM decides the order if a tie is between a monster and a player character. Optionally, the GM can have the tied combatants each roll a d20, highest going first. — [src](https://5thsrd.org/combat/order_of_combat/)
- Surprise (2014): a character or monster that doesn't notice a threat is surprised at the start of the encounter. A surprised combatant can't move or take an action on its first turn of the combat, and can't take a reaction until that turn ends. Being surprised does NOT change its initiative roll. — [src](https://5thsrd.org/combat/order_of_combat/)
- Dash action: when you take the Dash action, you gain extra movement for the current turn equal to your speed after applying any modifiers. With a speed of 30 ft, Dashing gives 30 extra feet (60 total). Any increase or decrease to your speed changes this additional movement by the same amount. — [src](https://roll20.net/compendium/dnd5e/Combat)
- Heavy-armor Strength requirement: if the Armor table shows 'Str 13' or 'Str 15' for an armor type, the armor reduces the wearer's speed by 10 feet unless the wearer has a Strength score equal to or higher than the listed score. — [src](https://5thsrd.org/adventuring/equipment/armor/)
- Heavy armor and Dexterity: heavy armor doesn't let you add your Dexterity modifier to Armor Class, but it also doesn't penalize you if your Dexterity modifier is negative. (Heavy armor has no Dex cap because Dex is not added at all.) — [src](https://5thsrd.org/adventuring/equipment/armor/)
- Armor proficiency penalty: if you wear armor you lack proficiency with, you have disadvantage on any ability check, saving throw, or attack roll that involves Strength or Dexterity, and you can't cast spells. (This affects initiative — a Dexterity check — giving disadvantage on initiative when wearing armor you aren't proficient in.) — [src](https://5thsrd.org/adventuring/equipment/armor/)

#### Key tables

**Travel Pace (2014)** — [src](https://5thsrd.org/adventuring/movement/)

```
Pace | Per Minute | Per Hour | Per Day | Effect
Fast | 400 feet | 4 miles | 30 miles | -5 penalty to passive Wisdom (Perception)
Normal | 300 feet | 3 miles | 24 miles | —
Slow | 200 feet | 2 miles | 18 miles | Able to use Stealth

Note: These distances assume a base walking speed of ~30 ft. Difficult terrain over an extended journey halves these distances. A forced march (more than 8 hours/day) forces a Constitution save each additional hour or risk exhaustion.
```

**Movement cost modifiers (2014)** — [src](https://5thsrd.org/combat/movement_and_position/)

```
Situation | Cost per foot moved
Normal terrain | 1 foot
Difficult terrain | 2 feet (extra +1)
Crawling (prone) | 2 feet (extra +1)
Crawling in difficult terrain | 3 feet (+1 crawl, +1 terrain)
Climbing (no climb speed) | 2 feet (extra +1)
Swimming (no swim speed) | 2 feet (extra +1)
Climb/swim in difficult terrain (no special speed) | 3 feet
Standing up from prone | costs half your speed (not per-foot)
Dropping prone | free (0 movement)
```

**Jump distances (2014)** — [src](https://5thsrd.org/adventuring/movement/)

```
Jump type | Formula (running start, 10+ ft) | Standing (no run-up) | Ability used
Long Jump | feet up to your Strength SCORE | half the Strength score | Strength SCORE
High Jump | 3 + Strength MODIFIER feet | half of (3 + Str mod) | Strength MODIFIER

Each foot cleared costs a foot of movement. High jump reach can be extended by half your height when grabbing at the apex. Landing in difficult terrain after a jump may require a DC 10 Dexterity (Acrobatics) check or you land prone.
```

**Heavy armor Strength requirement / speed penalty (2014)** — [src](https://5thsrd.org/adventuring/equipment/armor/)

```
Armor | Type | Strength req | Speed penalty if below req | Stealth
Ring Mail | Heavy | — | none | Disadvantage
Chain Mail | Heavy | Str 13 | -10 ft if Str < 13 | Disadvantage
Splint | Heavy | Str 15 | -10 ft if Str < 15 | Disadvantage
Plate | Heavy | Str 15 | -10 ft if Str < 15 | Disadvantage

Only these three heavy armors carry a Strength requirement that reduces speed. Penalty is a flat -10 ft to walking speed; checked vs Strength SCORE, not modifier; not negated by Dexterity. (Padded light, Scale Mail medium, Half Plate medium also impose Stealth disadvantage but have NO speed penalty.)
```

**Initiative computation (2014)** — [src](https://5thsrd.org/combat/order_of_combat/)

```
Component | Value
Base roll | 1d20
Ability modifier | + Dexterity modifier
Proficiency | none by default (initiative is not a proficient check unless a feature grants it)
Feats/features | e.g. Alert feat +5; Jack of All Trades adds half proficiency (Bard); various class/race features
Disadvantage | if wearing armor you lack proficiency in (Dex check)
Tie-break | GM/player discretion, or optional d20 roll (highest first)

Initiative = d20 + Dexterity modifier + any feat/feature bonus.
```

#### 2024 deltas (not canonical here)

- Surprise changed: in 2024, being surprised no longer skips your first turn. Instead, a surprised creature has Disadvantage on its initiative roll. (2014: surprised creatures can't move/act/react on their first turn.) Source: https://www.dndbeyond.com/forums/dungeons-dragons-discussion/rules-game-mechanics/214690-is-initiative-a-d20-test-per-the-2024-dnd-rules
- Static/passive initiative formalized: 2024 explicitly defines an Initiative SCORE of 10 + Dexterity modifier, which a DM may use instead of rolling. (2014 had no codified passive-initiative value.) Source: https://roll20.net/compendium/dnd5e/Rules:Rules%20Definitions?expansion=32231
- Initiative tie-break changed: in 2024, ties are broken by the higher Dexterity SCORE going first (then DM decides if still tied), replacing 2014's GM/player-discretion-or-optional-d20 method. Source: https://www.dndbeyond.com/forums/dungeons-dragons-discussion/rules-game-mechanics/214690-is-initiative-a-d20-test-per-the-2024-dnd-rules
- Initiative reframed as a 'D20 Test' (Dexterity check), making it cleanly eligible for advantage, proficiency bonus, Bless, Lucky, etc. — mechanics are the same numerically (d20 + Dex mod) but the terminology unifies it under the d20 Test umbrella. Source: https://www.dndbeyond.com/forums/dungeons-dragons-discussion/rules-game-mechanics/214690-is-initiative-a-d20-test-per-the-2024-dnd-rules
- Alert feat reworked: 2014 Alert = flat +5 to initiative and can't be surprised. 2024 Alert = an Origin feat (available at level 1) that adds your PROFICIENCY BONUS to initiative (+2 to +6 by level) and lets you swap your initiative with a willing ally. Source: https://rpgbot.net/dnd-2024-5e-transition-guide-and-change-log-everything-thats-different-in-the-new-players-handbook/
- New ways to boost initiative in 2024: features such as Champion Fighter's Remarkable Athlete (advantage on initiative) and the Harengon species' Hare-Trigger (add proficiency bonus to initiative) — patterns of proficiency-to-initiative that don't exist in 2014. Source: https://rpgbot.net/dnd-2024-5e-transition-guide-and-change-log-everything-thats-different-in-the-new-players-handbook/
- Heavy-armor Strength-requirement speed penalty (-10 ft) and the Travel Pace table are essentially unchanged in 2024; jump formulas (long jump = Str score, high jump = 3 + Str mod) are also retained. These are stable across editions.

---

<a id="s9"></a>

## Weapons & Attack Rolls

### The Rule (5e RAW)
An **attack roll** is `d20 + ability modifier + proficiency bonus (if proficient with the weapon) + magic/other bonuses`, compared against the target's AC.

- **Ability used:**
  - Melee weapon → **STR** modifier.
  - Ranged weapon → **DEX** modifier.
  - **Finesse** weapon (melee *or* ranged) → the attacker chooses, so effectively the **higher of STR or DEX**.
  - **Thrown** weapon → uses the ability the weapon would normally use: a thrown *melee* weapon (handaxe, javelin, spear) uses STR; a thrown *finesse* weapon (dagger) uses higher of STR/DEX. Throwing never converts a STR weapon into a DEX weapon.
- **Proficiency:** add PB only if proficient. Proficiency comes from **class** (e.g. Fighter = all simple + martial; Wizard = dagger/dart/sling/quarterstaff/light crossbow; Cleric = all simple), **race** (Elf Weapon Training → longsword/shortsword/shortbow/longbow; Dwarven Combat Training → battleaxe/handaxe/light hammer/warhammer; Drow Weapon Training → rapier/shortsword/hand crossbow), and **feats** (Weapon Master, etc.). PB = `ceil(level/4)+1` on **total** character level.
- **Damage roll** = `weapon dice + the SAME ability modifier used for the attack + magic bonus`. Proficiency bonus is **never** added to damage.
  - **Two-weapon fighting:** when attacking with a light weapon in each hand, the **off-hand (bonus-action) attack adds no ability modifier to damage** unless you have the **Two-Weapon Fighting** style (which lets you add it). The off-hand still adds magic bonuses.
  - **Versatile** weapons (longsword 1d8/1d10) roll the larger die when wielded two-handed.
  - **Unarmed strike:** to-hit = STR mod + PB (everyone is proficient); damage = **1 + STR mod** bludgeoning (no die).
- **Critical hit (natural 20):** the attack automatically hits and you **roll all of the attack's damage dice twice** (and any extra/rider dice twice), then add modifiers once. Flat bonuses are *not* doubled. **Natural 1** always misses.
- **Advantage/disadvantage:** roll 2d20, keep higher (adv) / lower (dis). Crit triggers on the *kept* die being a 20.

### What Modifies It (increases / decreases)
**To-hit:**
- Ability modifier (STR/DEX/finesse-max) — *auto-applied* (`computeWeaponBonus`, characterStats.ts:420).
- Proficiency bonus if proficient — *auto-applied but mis-matched on several classes/races* (see Gaps).
- Magic weapon bonus (+1/+2/+3) — *auto-applied* via `weapon.bonus` (characterStats.ts:427).
- **Archery** fighting style (+2 ranged to-hit) — *auto-applied* per-weapon (`computeFeatureWeaponBonus`, characterStats.ts:683).
- Race/feat weapon proficiency (Elf/Dwarf weapon training, Weapon Master) — **NOT represented** (only class profs feed the union, characterStats.ts:945).
- Sharpshooter / Great Weapon Master −5 to-hit — *intentionally manual* (situational toggle; not modeled — use Edit stats override).
- Bless, Bardic Inspiration, Hex's no effect on to-hit, cover penalties — *not represented* (situational; manual override).
- `homebrewAllWeaponsProficient` flag forces PB onto every weapon — *auto-applied* (characterStats.ts:424).

**Damage:**
- Same ability modifier — *auto-applied* (characterStats.ts:432).
- Magic weapon bonus — *auto-applied*.
- Flat item damage bonus (attuned items, `damage` effect) — *auto-applied* via `itemDamageBonus` (characterStats.ts:432, 974).
- **Dueling** fighting style (+2 one-handed melee damage) — *auto-applied* per-weapon (characterStats.ts:685-689).
- Rider damage of another type (Flame Tongue +2d6 fire) — *auto-applied while active* (`damage_dice` effect, EquipmentBlock.tsx:294-297; crit doubles it).
- **Great Weapon Fighting** (reroll 1-2 on damage dice) — **not represented** (no reroll logic).
- **Two-Weapon Fighting** off-hand-mod rule — **not represented** (no off-hand concept; every weapon adds its ability mod to damage).
- Versatile two-handed die — **not represented** (only the one-handed die is stored/used).
- Sharpshooter/GWM +10 damage, Hex/Hunter's Mark riders, Sneak Attack, smites — *intentionally manual / not represented* (situational; use the per-weapon custom damage override).

**Crit:** doubles weapon dice + rider dice only — *auto-applied* (`rollDamageGroups`/`rollDamage`, damage.ts:65-72, DiceRollModal.tsx:16-25).

### What It Rolls & How the Roll Resolves
- **To-hit:** `d20 + toHitModifier`. Dispatched as `{type:'attack', label, modifier}` (EquipmentBlock.tsx:346, SpellBlock.tsx:605). The dice store rolls a single d20 (dice.ts store:79) — the `attack` RollKind has **no `advantage` field**, so attacks are **always rolled at normal**, never adv/dis (unlike skill/save/ability which support the tristate). Nat 20 → "Critical Hit!", nat 1 → "Critical Miss" (DiceRollModal.tsx:29-46).
- **Damage:** the separate "Dmg" button opens the damage-setup modal (`dispatchDamage`, useRollDispatch.ts:30). Player rolls `NdM + damageBonus`, with a manual **Crit (2×)** button that doubles dice only (DiceRollModal.tsx:296-305, store `rollModalDamage`). Unarmed/flat damage rolls no dice — total is just the bonus (DiceRollModal.tsx:16-19).
- **Note:** the weapon/spell Hit roll does **not** carry damage into the modal (no `damageDice` passed in the attack kind), so the two-phase hit→damage auto-flow (incl. nat-20 → "Roll Damage (2×)") is never reached from weapons/spells; damage is always a separate, manually-crit'd "Dmg" click. Numbers are correct; it's a UX seam, not a rules error.

### How This App Handles It
Store → derive → render:
1. Stored `character.equipment[]` holds `EquipmentItem` instances (name + flags: equipped/attuned/customToHit/customDamage/baseWeapon). Weapon stat blocks live in the catalog (`public/data/equipment.json` weapons), merged with custom weapons.
2. `deriveCharacterStats` (characterStats.ts:704) builds `weaponProficiencies` = lowercased **union across all class records** (line 945-947, fixes BUG-04 multiclass) and `featureWeaponEffects` (Archery/Dueling) from selected fighting styles.
3. `WeaponRow` calls `computeWeaponBonus(weapon, character, derived.weaponProficiencies, derived.effectiveAbilities, derived.itemDamageBonus, derived.featureWeaponEffects)` (EquipmentBlock.tsx:291). This computes ability mod (finesse/ranged/melee, line 420), PB via `isWeaponProficient` (line 396-403), magic bonus, fighting-style bonus → to-hit and damage strings.
4. `UnarmedRow` (EquipmentBlock.tsx:213) hard-codes to-hit = STR + PB + item attack bonus, damage = 1 + STR + item damage bonus (or an item-override die), bludgeoning.
5. Rolls dispatch through `useRollDispatch` → `useDiceStore` → `DiceRollModal`.

`computeWeaponBonus` reads **effective** abilities (post racial-ASI/feat/item), satisfying the render-time-derivation invariant.

### Gaps & Mis-Handling
- **Cleric never gets proficiency on simple weapons** — `isWeaponProficient` exact-matches `'simple weapons'`, but Cleric data is `"All simple weapons"` → no PB on any simple weapon. (`wpn-cleric-all-simple`)
- **Classes with individual (plural) weapon lists lose proficiency** — class profs are plural ("daggers", "scimitars", "longswords"); `isWeaponProficient` tests the singular weapon name ("dagger"). Wizard/Sorcerer/Druid/Bard/Rogue/Monk's specific weapons all fail the match → missing PB. (`wpn-plural-mismatch`)
- **Race/feat weapon proficiencies ignored** — `weaponProficiencies` is built only from class records; Elf/Dwarf/Drow Weapon Training (in subrace `proficiencies`) and feat-granted weapons are never added. (`wpn-race-training`)
- **Versatile two-handed die not rollable** — only `damage_dice` (one-handed) is used; the "(Versatile 1d10)" die in `properties` is never parsed or offered. (`wpn-versatile-die`)
- **Two-Weapon Fighting off-hand modifier rule unmodeled** — no off-hand concept; documented as not-represented (informational, not a wrong computed stat).
- **Great Weapon Fighting reroll unmodeled** — informational; no computed stat is wrong.

#### Sourced rule facts (2014 RAW, web-verified)

- To make an attack roll, roll a d20 and add the appropriate modifiers. If the total of the roll plus modifiers equals or exceeds the target's Armor Class (AC), the attack hits. The two most common modifiers to the roll are an ability modifier and the character's proficiency bonus. — [src](https://www.5esrd.com/gamemastering/combat/)
- The ability modifier used for a melee weapon attack is Strength, and the ability modifier used for a ranged weapon attack is Dexterity. — [src](https://www.5esrd.com/gamemastering/combat/)
- Proficiency with a weapon allows you to add your proficiency bonus to the attack roll for any attack you make with that weapon. If you make an attack roll using a weapon with which you lack proficiency, you do not add your proficiency bonus to the attack roll. — [src](https://www.5esrd.com/equipment/weapons/)
- When attacking with a weapon, you add your ability modifier — the same modifier used for the attack roll — to the damage. You roll the weapon's damage die or dice, add any modifiers, and apply the damage. With a penalty it is possible to deal 0 damage, but never negative damage. — [src](https://www.5esrd.com/gamemastering/combat/)
- If the d20 roll for an attack is a 20, the attack hits regardless of any modifiers or the target's AC. This is called a critical hit. If the d20 roll for an attack is a 1, the attack misses regardless of any modifiers or the target's AC. — [src](https://www.5esrd.com/gamemastering/combat/)
- When you score a critical hit, you get to roll extra dice for the attack's damage against the target. Roll all of the attack's damage dice twice and add them together. Then add any relevant modifiers as normal. To speed up play, you can roll all the damage dice at once. If the attack involves other damage dice, such as from the rogue's Sneak Attack feature, you roll those dice twice as well. — [src](https://www.5esrd.com/gamemastering/combat/)
- Finesse: When making an attack with a finesse weapon, you use your choice of your Strength or Dexterity modifier for the attack and damage rolls. You must use the same modifier for both rolls. — [src](https://www.5esrd.com/equipment/weapons/)
- Versatile: This weapon can be used with one or two hands. A damage value in parentheses appears with the property — the damage when the weapon is used with two hands to make a melee attack. — [src](https://www.5esrd.com/equipment/weapons/)
- Thrown: If a weapon has the thrown property, you can throw the weapon to make a ranged attack. If the weapon is a melee weapon, you use the same ability modifier for that attack roll and damage roll that you would use for a melee attack with the weapon. — [src](https://www.5esrd.com/equipment/weapons/)
- Range: A weapon that can be used to make a ranged attack has a range as well as the ammunition or thrown property. The range lists two numbers. The first is the weapon's normal range in feet, and the second indicates the weapon's long range. When attacking a target beyond normal range, you have disadvantage on the attack roll. You can't attack a target beyond the weapon's long range. — [src](https://www.5esrd.com/equipment/weapons/)
- Ammunition: You can use a weapon that has the ammunition property to make a ranged attack only if you have ammunition. Each time you attack you expend one piece of ammunition. Drawing the ammunition is part of the attack (you need a free hand to load a one-handed weapon). At the end of the battle, you can recover half your expended ammunition by taking a minute to search the battlefield. — [src](https://www.5esrd.com/equipment/weapons/)
- Loading: Because of the time required to load this weapon, you can fire only one piece of ammunition from it when you use an action, bonus action, or reaction to fire it, regardless of the number of attacks you can normally make. — [src](https://www.5esrd.com/equipment/weapons/)
- Heavy: Small creatures have disadvantage on attack rolls with heavy weapons. A heavy weapon's size and bulk make it too large for a Small creature to use effectively. — [src](https://www.5esrd.com/equipment/weapons/)
- Light: A light weapon is small and easy to handle, making it ideal for use when fighting with two weapons. (Light is the prerequisite for two-weapon fighting.) — [src](https://www.5esrd.com/equipment/weapons/)
- Reach: This weapon adds 5 feet to your reach when you attack with it, as well as when determining your reach for opportunity attacks with it. — [src](https://www.5esrd.com/equipment/weapons/)
- Two-Handed: This weapon requires two hands when you attack with it. — [src](https://www.5esrd.com/equipment/weapons/)
- Two-Weapon Fighting: When you take the Attack action and attack with a light melee weapon that you're holding in one hand, you can use a bonus action to attack with a different light melee weapon that you're holding in the other hand. You don't add your ability modifier to the damage of the bonus attack, unless that modifier is negative. If either weapon has the thrown property, you can throw the weapon instead of making a melee attack with it. — [src](https://www.5esrd.com/gamemastering/combat/)
- Unseen Attackers and Targets: When you attack a target that you can't see, you have disadvantage on the attack roll. When a creature can't see you, you have advantage on attack rolls against it. — [src](https://www.5esrd.com/gamemastering/combat/)
- Ranged Attacks in Close Combat: When you make a ranged attack with a weapon, a spell, or some other means, you have disadvantage on the attack roll if you are within 5 feet of a hostile creature who can see you and who isn't incapacitated. — [src](https://www.5esrd.com/gamemastering/combat/)
- Opportunity Attacks: You can make an opportunity attack when a hostile creature that you can see moves out of your reach. To make the opportunity attack, you use your reaction to make one melee attack against the provoking creature. — [src](https://www.5esrd.com/gamemastering/combat/)
- Improvised Weapons: An object that bears no resemblance to a weapon deals 1d4 damage (the GM assigns a damage type). At the GM's option, a character proficient with a weapon can use a similar object as if it were that weapon and use his or her proficiency bonus. If a character uses a ranged weapon to make a melee attack, or throws a melee weapon that does not have the thrown property, it also deals 1d4 damage. An improvised thrown weapon has a normal range of 20 feet and a long range of 60 feet. — [src](https://www.5esrd.com/equipment/weapons/)
- Special (Net): When you use an action, bonus action, or reaction to attack with a net, you can make only one attack regardless of the number of attacks you can normally make. A Large or smaller creature hit by a net is restrained until freed; freeing requires a DC 10 Strength check or 5 slashing damage to the net (AC 10). A net has no effect on creatures that are formless, or Huge or larger. — [src](https://www.5esrd.com/equipment/weapons/)
- Special (Lance): You have disadvantage when you use a lance to attack a target within 5 feet of you. Also, a lance requires two hands to wield when you aren't mounted. — [src](https://www.5esrd.com/equipment/weapons/)

#### Key tables

**Simple Melee Weapons (2014)** — [src](https://www.5esrd.com/equipment/weapons/)

```
Weapon | Damage | Properties
Club | 1d4 bludgeoning | Light
Dagger | 1d4 piercing | Finesse, Light, Thrown (20/60)
Greatclub | 1d8 bludgeoning | Two-Handed
Handaxe | 1d6 slashing | Light, Thrown (20/60)
Javelin | 1d6 piercing | Thrown (30/120)
Light hammer | 1d4 bludgeoning | Light, Thrown (20/60)
Mace | 1d6 bludgeoning | —
Quarterstaff | 1d6 bludgeoning | Versatile (1d8)
Sickle | 1d4 slashing | Light
Spear | 1d6 piercing | Thrown (20/60), Versatile (1d8)
```

**Simple Ranged Weapons (2014)** — [src](https://www.5esrd.com/equipment/weapons/)

```
Weapon | Damage | Properties
Crossbow, light | 1d8 piercing | Ammunition (80/320), Loading, Two-Handed
Dart | 1d4 piercing | Finesse, Thrown (20/60)
Shortbow | 1d6 piercing | Ammunition (80/320), Two-Handed
Sling | 1d4 bludgeoning | Ammunition (30/120)
```

**Martial Melee Weapons (2014)** — [src](https://www.5esrd.com/equipment/weapons/)

```
Weapon | Damage | Properties
Battleaxe | 1d8 slashing | Versatile (1d10)
Flail | 1d8 bludgeoning | —
Glaive | 1d10 slashing | Heavy, Reach, Two-Handed
Greataxe | 1d12 slashing | Heavy, Two-Handed
Greatsword | 2d6 slashing | Heavy, Two-Handed
Halberd | 1d10 slashing | Heavy, Reach, Two-Handed
Lance | 1d12 piercing | Reach, Special
Longsword | 1d8 slashing | Versatile (1d10)
Maul | 2d6 bludgeoning | Heavy, Two-Handed
Morningstar | 1d8 piercing | —
Pike | 1d10 piercing | Heavy, Reach, Two-Handed
Rapier | 1d8 piercing | Finesse
Scimitar | 1d6 slashing | Finesse, Light
Shortsword | 1d6 piercing | Finesse, Light
Trident | 1d6 piercing | Thrown (20/60), Versatile (1d8)
War pick | 1d8 piercing | —
Warhammer | 1d8 bludgeoning | Versatile (1d10)
Whip | 1d4 slashing | Finesse, Reach
```

**Martial Ranged Weapons (2014)** — [src](https://www.5esrd.com/equipment/weapons/)

```
Weapon | Damage | Properties
Blowgun | 1 piercing | Ammunition (25/100), Loading
Crossbow, hand | 1d6 piercing | Ammunition (30/120), Light, Loading
Crossbow, heavy | 1d10 piercing | Ammunition (100/400), Heavy, Loading, Two-Handed
Longbow | 1d8 piercing | Ammunition (150/600), Heavy, Two-Handed
Net | — (no damage) | Thrown (5/15), Special
```

**Weapon Properties — verbatim definitions (2014)** — [src](https://www.5esrd.com/equipment/weapons/)

```
Ammunition: Make a ranged attack only with ammunition; expend one per attack; drawing it is part of the attack; recover half after the battle.
Finesse: Use your choice of STR or DEX for BOTH the attack and damage rolls (same modifier for both).
Heavy: Small creatures have disadvantage on attack rolls with heavy weapons.
Light: Small and easy to handle — qualifies for two-weapon fighting.
Loading: Fire only one piece of ammunition per action/bonus action/reaction, regardless of number of attacks.
Range: Two numbers (normal/long); disadvantage beyond normal; cannot attack beyond long.
Reach: Adds 5 ft to your reach when attacking (and for opportunity attacks).
Special: Weapon has unusual rules in its description (e.g., Net, Lance).
Thrown: Can be thrown for a ranged attack; a thrown melee weapon uses its melee ability modifier.
Two-Handed: Requires two hands to attack with it.
Versatile: Usable one- or two-handed; parenthesized die is the two-handed melee damage.
```

**Attack roll math (2014)** — [src](https://www.5esrd.com/gamemastering/combat/)

```
Attack roll total = d20 + ability modifier + proficiency bonus (only if proficient) + other bonuses (magic weapon, fighting style, etc.). Hits if total >= target AC (ties hit).
Melee weapon ability = STR. Ranged weapon ability = DEX. Finesse = STR or DEX (player choice). Thrown melee weapon = its melee ability.
Damage = weapon die/dice + same ability modifier used for the attack (NO proficiency bonus on damage). Damage floors at 0.
Critical hit (natural 20): roll all damage dice (weapon + bonus feature dice) twice, add flat modifiers once. Natural 1 auto-misses; natural 20 auto-hits and crits.
```

#### 2024 deltas (not canonical here)

- Weapon Mastery (NEW in 2024): every simple and martial weapon gains a mastery property (Cleave, Graze, Nick, Push, Sap, Slow, Topple, Vex). Only characters whose class grants weapon-mastery slots (Barbarian, Fighter, Paladin, Ranger, Rogue) can trigger them, and only on the specific weapons they've mastered. This is a wholly new layer with no 2014 equivalent. Source: https://www.dndbeyond.com/posts/1742-your-guide-to-weapon-mastery-in-the-2024-players
- Heavy property redefined (2024): the Small-creature disadvantage rule is removed. Instead, you have disadvantage on attack rolls with a Heavy weapon if it's a Melee weapon and your Strength score isn't at least 13, or if it's a Ranged weapon and your Dexterity score isn't at least 13. Source: https://dungeonmister.com/guides/important-rules-changes-in-dnd-2024/
- Two-weapon fighting via Nick (2024): the Nick mastery property lets the extra light-weapon attack be made as part of the Attack action instead of costing a Bonus Action, freeing the bonus action for other uses. The base 2014 bonus-action off-hand attack still otherwise exists. Source: https://rpgbot.net/2024-dnd/weapon-mastery/
- Drawing/stowing weapons (2024): you may draw or stow one weapon each time you make an attack as part of the Attack action (before or after the attack), making mid-combat weapon swaps far easier than the 2014 one-free-interaction limit. Source: https://pages.roll20.net/dnd/2024-weapon-mastery
- Critical hits narrowed (2024): only WEAPON damage dice (and Unarmed Strike) double on a crit; extra dice from features/spells (e.g., Sneak Attack) generally still double per their own wording, but the 2024 rules tighten crit handling and remove monster crits against players in some variant guidance. In 2014, the rule is the broad 'roll all the attack's damage dice twice,' explicitly including Sneak Attack. (Verify against the 2024 PHB before relying on this for a feature.)
- Thrown/Finesse interaction unchanged in spirit (2024): daggers and other finesse-thrown weapons still let you use DEX when thrown; the underlying STR/DEX-choice mechanic carries over, so the 2014 behavior is safe to keep as the baseline.
- Improvised weapon and ammunition baselines are essentially unchanged in 2024 (1d4 improvised, half-ammo recovery); the big structural changes are Weapon Mastery and the Heavy-property rewrite.

---

<a id="s10"></a>

## Spellcasting Resources (slots, known/prepared, cantrips, pact)

### The Rule (5e RAW)

**Spell slots** are the fuel for casting leveled spells (cantrips cost no slot). Each class's table grants a fixed number of slots at each spell level for each class level:

- **Full casters** (bard, cleric, druid, sorcerer, wizard): full PHB slot table, reaching 9th-level slots at character level 17.
- **Half casters** (paladin, ranger): half table, first slots appear at *class* level 2, top out at 5th-level slots. **Artificer is special**: it *rounds UP* for slot purposes (`ceil(level/2)`), so it gains 1st-level slots already at class level 1, but it still tops out at 5th-level slots.
- **Third casters** (Eldritch Knight fighter, Arcane Trickster rogue): one-third table, first slots at class level 3, top out at 4th-level slots.
- **Warlock — Pact Magic** is a wholly separate system: a *small* number of slots (1–4), **all at the same single highest level** (1st→5th by warlock level), that **refresh on a short or long rest** (everyone else refreshes only on a long rest).

**Cantrips known** scale by class level (each caster's "Cantrips Known" column; e.g. wizard 3→4→5 at levels 1/4/10). Cantrip *damage* scales by **character** level at 5/11/17 (not slot level).

**Known vs prepared:**
- **Known casters** (bard, ranger, sorcerer, warlock): a fixed "Spells Known" count; you may **swap one** known spell for another each level-up. The known list is permanent until swapped.
- **Prepared casters** (cleric, druid, paladin, artificer; wizard is prepared-from-spellbook): each day prepare **spellcasting ability modifier + class level** spells (full casters), or **mod + floor(level/2)** for half-caster preppers (paladin, artificer), minimum 1. Cleric/druid/paladin/artificer prepare from their *entire* class list; wizard prepares from spells written in the spellbook.

**Spells known/prepared are NOT capped by available slot levels.** A level-3 sorcerer (slots: 4×1st, 2×2nd) may know three 2nd-level spells. The only restriction at *learning* time is that the spell must be of a level for which you have slots (cantrips always allowed); higher-level spells you may carry but cannot cast until you have a matching slot.

**Upcasting:** any spell cast using a higher-level slot scales per its "At Higher Levels" clause. **Ritual casting**: a spell with the ritual tag can be cast without a slot (10 min longer) if your class allows ritual casting. **Concentration**: only one concentration spell at a time; taking damage forces a CON save at DC `max(10, floor(damage/2))` to maintain it.

**Multiclass spell slots:** combine into ONE shared slot table keyed by *effective caster level* = (full caster levels) + (ceil(artificer/2)) + (floor(half-caster/2)) + (floor(third-caster/3)), looked up on the multiclass slots table. **Warlock Pact Magic stays a separate, additive pool** — not merged into the shared table. Spells known/prepared remain tracked *per class*.

### What Modifies It (increases / decreases)

- **Class level (per class table)** — raises slot counts/levels, cantrips known, known/prepared limits. *Auto-applied* (`parseClassSlots`, `getSpellcastingInfo`, slot pip rows in SpellBlock).
- **Multiclassing** — combines standard slots via the effective-caster-level table; warlock pact stays separate. *Auto-applied* (`computeMulticlassSlots`, `slots+pact` variant).
- **Spellcasting ability modifier** — drives prepared-spell limit and spell attack/DC; raised by ASI/feats/race. Prepared count: *auto-applied* (`getPreparedSpellCount`). Spell attack/DC: *auto-applied* in `deriveCharacterStats`.
- **Spell-focus items** (Rod of the Pact Keeper, Wand of the War Mage) — +spell attack / +save DC. *Auto-applied* at render via `itemEffects.spellAttack`/`spellSaveDC`.
- **Manual spell-focus override** (`spellBonusModifier`) — *manual* (homebrew/un-cataloged focuses).
- **Short rest** — refreshes warlock pact slots. *Not represented* (no rest button; pips restored manually).
- **Long rest** — refreshes all slots and re-prepares prepared casters. *Not represented* as an action (manual pip restore; level-up zeroes used slots).
- **Spell swap on level-up (known casters)** — *Not represented* (level-up only adds new spells; you cannot retire one).
- **Upcasting / ritual / concentration** — situational, DM/player-driven. Upcast damage scaling is *partially auto* (per-slot damage dice in the roll modal); ritual and concentration are *not represented* (intentionally manual).

### What It Rolls & How the Roll Resolves

Spell slots, cantrips known, and prepared/known counts are **static resource values — no roll.** The associated rolls are:
- **Spell attack:** `d20 + spellAttackBonus` (`spellAbilMod + proficiency + item/manual focus`), dispatched per spell "Hit" button (SpellBlock:605), advantage tristate via the roll modal.
- **Spell save DC:** `8 + spellAbilMod + proficiency + focus` — a static target number the *defender* rolls against; the app displays it (SpellBlock:462), no roll on the caster side.
- **Damage:** rolled via `dispatchDamage` with cantrip scaling (`character.level`, breakpoints 5/11/17) or leveled upcast scaling (`perLevel` dice per slot above base) (SpellBlock:606–623).

### How This App Handles It

**Store → derive → render:**
- Stored: `character.classes[]` (slug+level, source of truth), `character.spells[]` (slug + `prepared`), `character.spellSlotsUsed` (level→count, plus `PACT_SLOT_KEY = -1` for the combined pact pool), `character.spellBonusModifier` (manual focus only).
- `src/lib/spellcasting.ts`: `parseClassSlots` reads STRING slot counts from `class_specific` (`"-"`→0), keying warlock off `"Spell Slots"`/`"Slot Level"` (line 56). `getSpellcastingInfo` classifies caster kind (known via presence of `"Spells Known"` key, else prepared; pact for warlock). `computeMulticlassSlots` (line 155) builds the shared table from effective caster level and adds a separate pact pool (`slots+pact`). `getPreparedSpellCount` (line 219) = `max(1, mod + (HALF_PREPARED? floor(level/2) : level))`, HALF list = `['paladin','artificer']`.
- `src/lib/characterStats.ts:834–846`: spell attack/DC derived from the FIRST class with a `spellcasting.ability` (`classRecords.find(...)`) — correctly handles non-caster-primary multiclass — plus PB (total level), item focus effects, and manual bonus.
- `src/components/sheet/useDerivedSheet.ts:79–90`: computes `multiclassSlotProfile` (only when `classes.length > 1`) and `multiclassCasterKind` (returns `'prepared'` if ANY class is prepared, else `undefined`).
- `src/components/sheet/SpellBlock.tsx`: renders slot pip rows from `overrideSlotProfile ?? rawProfile` (line 275); separate pact row for `slots+pact` (504–518) and pure `pact` (478–487). Prepared/known limit display at 409–417 uses `getPreparedSpellCount` (prepared) or `rawSpellsKnown` (known) — over-limit is a *soft homebrew flag*, never blocked. Slot usage written by `setSlotUsed` (manual pip toggle, line 334).
- `LevelUpDialog.tsx`: uses `getSpellsKnownIncrease` (line 118) to prompt for new spells/cantrips; resets `spellSlotsUsed = {}` only when slots expanded (267–281), computed from the single-class `parseClassSlots` profiles.

### Gaps & Mis-Handling

- **Slot reset on level-up uses the single-class table, not the multiclass table** — a multiclass caster's `spellSlotsUsed` may not reset (or reset against the wrong totals) when leveling, because `oldProfile`/`newProfile` come from `parseClassSlots(classRecord, classLevel)`, ignoring the combined multiclass slot table.
- **Known-caster spell-swap on level-up is not supported** — `LevelUpDialog` only *adds* spells; there is no way to retire a known spell, so a bard/sorcerer/ranger's list can only grow.
- **Multiclass "Spells Known" limit shows only the primary class's count** — `spellLimit` falls back to `rawSpellsKnown` (primary classRecord), so a multiclass known caster's displayed cap is wrong.
- **Warlock pact slots in `slots+pact` always render at the wrong recovery framing only as text** — pips work, but there is no short-rest restore action (intentionally manual, noted).
- **No concentration / ritual / rest mechanics** — intentionally manual (situational); noted in reference, not flagged as bugs.

#### Sourced rule facts (2014 RAW, web-verified)

- A spell slot is the resource consumed to cast a 1st-level-or-higher spell. Regardless of how many spells a caster knows or prepares, they can cast only a limited number before resting. Each spellcasting class's table (except the warlock's) lists how many slots of each level the character has. Casting a spell expends a slot of that spell's level OR HIGHER, 'filling' the slot. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/magic-and-spellcasting/)
- Spell slots are level-typed like grooves: 'A 1st-level spell fits into a slot of any size, but a 9th-level spell fits only in a 9th-level slot.' You can spend a higher slot on a lower spell, but never a lower slot on a higher spell. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/magic-and-spellcasting/)
- Finishing a LONG REST restores any expended spell slots (for standard Spellcasting). This is the only general recovery for non-warlock slots. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/magic-and-spellcasting/)
- Casting a Spell at a Higher Level (upcasting): 'When a spellcaster casts a spell using a slot that is of a higher level than the spell, the spell assumes the higher level for that casting... the spell expands to fill the slot it is put into.' Some spells (magic missile, cure wounds) have stronger effects when upcast, as the spell's description details. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/magic-and-spellcasting/)
- A cantrip is 'a spell that can be cast at will, without using a spell slot and without being prepared in advance.' A cantrip's spell level is 0. Cantrips do NOT count against prepared/known spell counts and do NOT consume slots. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/magic-and-spellcasting/)
- Known vs Prepared: bards and sorcerers (and rangers, warlocks) have a fixed list of spells KNOWN, always in mind. Clerics, druids, wizards, paladins, and artificers PREPARE spells, choosing a fresh subset each day. In every case, the count fixed in mind depends on the character's level. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/magic-and-spellcasting/)
- Number of PREPARED spells for prepared full casters = spellcasting ability modifier + class level (minimum of one). Cleric: WIS mod + cleric level. Druid: WIS mod + druid level. Wizard: INT mod + wizard level (chosen from spellbook). Prepared spells must be of a level for which you have slots; cantrips are separate. — [src](https://5thsrd.org/character/classes/cleric/)
- Spell save DC = 8 + your spellcasting ability modifier + your proficiency bonus (+ any special modifiers). — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting)
- Spell attack modifier (bonus) = your spellcasting ability modifier + your proficiency bonus. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting)
- Each character has a SEPARATE spellcasting ability and therefore separate save DC and attack bonus PER CLASS. A multiclassed caster does not have one unified spell DC/attack; each spell uses its source class's ability. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Ritual casting: a spell with the ritual tag can be cast as a ritual, taking 10 minutes longer and NOT expending a slot. Because no slot is spent, 'the ritual version of a spell can't be cast at a higher level.' The caster must have a ritual-casting feature AND have the spell prepared or known (unless the feature says otherwise, as the wizard's does). — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/magic-and-spellcasting/)
- Concentration: some spells require concentration to maintain. You lose concentration when you (a) cast ANOTHER spell that requires concentration (the new spell ends the old one), (b) take damage and fail a Constitution save (DC = 10 or half the damage taken, whichever is higher), or (c) become incapacitated or die. You can end concentration voluntarily at any time (no action). You can concentrate on only ONE spell at a time. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting)
- Casting two leveled spells in one turn via bonus action: if you cast a spell with a casting time of 1 bonus action, the only other spell you can cast on that same turn is a CANTRIP with a casting time of 1 action. You cannot cast two leveled (1st+) spells in the same turn this way. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting)
- WARLOCK Pact Magic is a distinct resource: the Warlock table shows the number of slots and their level; ALL warlock slots are the SAME level, which equals the highest level shown. You regain ALL expended Pact Magic slots on a SHORT OR LONG REST. — [src](https://dnd5e.info/classes/warlock/)
- Warlock spells of 1st level and higher are always cast at the warlock's current Slot Level (the slot is always the highest available). A warlock effectively upcasts every leveled spell to their slot level automatically; they cannot choose a lower slot level because they have none. — [src](https://dnd5e.info/classes/warlock/)
- Warlock Mystic Arcanum: at warlock levels 11, 13, 15, 17 the warlock gains one 6th-, 7th-, 8th-, and 9th-level spell respectively. Each Arcanum can be cast once WITHOUT a spell slot and recharges on a LONG rest. These high-level spells are not part of Pact Magic slots. — [src](https://5thsrd.org/character/classes/warlock/)
- MULTICLASS spell slots: add together ALL levels in bard, cleric, druid, sorcerer, and wizard (full casters, full level); HALF your levels (rounded down) in paladin and ranger (and artificer is rounded UP in the multiclass rule); ONE-THIRD your levels (rounded down) in Eldritch Knight fighter and Arcane Trickster rogue. Use this combined caster level to read the Multiclass Spellcaster: Spell Slots per Spell Level table. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Multiclass spell slots vs spells known/prepared: you compute SLOTS from the combined caster level (one shared pool of standard slots), but you determine spells KNOWN/PREPARED for each class SEPARATELY as if single-classed. A high combined slot level does NOT let you learn or prepare higher-level spells than each individual class grants. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Warlock Pact Magic does NOT add into the multiclass standard slot pool. A multiclassed warlock keeps Pact Magic slots entirely separate (their own table, short-rest recharge). However, the two pools are interoperable for CASTING: you can use Pact Magic slots to cast known/prepared spells from your Spellcasting classes, and Spellcasting slots to cast warlock spells you know. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Spell level ranges from 0 (cantrips) to 9. A spell's level gates the minimum caster level needed; a 9th-level spell typically requires character level 17. Casters gain access to a new highest spell level as their class table grants the first slot of that level. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/magic-and-spellcasting/)
- A spellcasting focus (e.g., holy symbol for clerics, arcane focus/component pouch for wizards/sorcerers) can replace material components that lack a listed gp cost. Components with a stated cost (or consumed components) must be physically supplied regardless of a focus. This does not affect slot accounting but gates whether a spell can be cast. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting)

#### Key tables

**Multiclass Spellcaster: Spell Slots per Spell Level (by combined caster level)** — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)

```
CombinedLevel | 1st 2nd 3rd 4th 5th 6th 7th 8th 9th
1  | 2 - - - - - - - -
2  | 3 - - - - - - - -
3  | 4 2 - - - - - - -
4  | 4 3 - - - - - - -
5  | 4 3 2 - - - - - -
6  | 4 3 3 - - - - - -
7  | 4 3 3 1 - - - - -
8  | 4 3 3 2 - - - - -
9  | 4 3 3 3 1 - - - -
10 | 4 3 3 3 2 - - - -
11 | 4 3 3 3 2 1 - - -
12 | 4 3 3 3 2 1 - - -
13 | 4 3 3 3 2 1 1 - -
14 | 4 3 3 3 2 1 1 - -
15 | 4 3 3 3 2 1 1 1 -
16 | 4 3 3 3 2 1 1 1 -
17 | 4 3 3 3 2 1 1 1 1
18 | 4 3 3 3 3 1 1 1 1
19 | 4 3 3 3 3 2 1 1 1
20 | 4 3 3 3 3 2 2 1 1
Combined caster level = (sum of full-caster class levels) + floor(paladin+ranger levels / 2) + floor(EK-fighter+AT-rogue levels / 3); warlock levels are EXCLUDED. This same grid is also the single-class FULL caster (wizard/cleric/druid/bard/sorcerer) slot table.
```

**Full Caster Spell Slots (Wizard/Cleric/Druid/Bard/Sorcerer) by class level — identical grid to the multiclass table** — [src](https://dnd5e.info/classes/wizard/)

```
Level | Cantrips(Wiz) | 1st 2nd 3rd 4th 5th 6th 7th 8th 9th
1  | 3 | 2 - - - - - - - -
2  | 3 | 3 - - - - - - - -
3  | 3 | 4 2 - - - - - - -
4  | 4 | 4 3 - - - - - - -
5  | 4 | 4 3 2 - - - - - -
6  | 4 | 4 3 3 - - - - - -
7  | 4 | 4 3 3 1 - - - - -
8  | 4 | 4 3 3 2 - - - - -
9  | 4 | 4 3 3 3 1 - - - -
10 | 5 | 4 3 3 3 2 - - - -
11 | 5 | 4 3 3 3 2 1 - - -
12 | 5 | 4 3 3 3 2 1 - - -
13 | 5 | 4 3 3 3 2 1 1 - -
14 | 5 | 4 3 3 3 2 1 1 - -
15 | 5 | 4 3 3 3 2 1 1 1 -
16 | 5 | 4 3 3 3 2 1 1 1 -
17 | 5 | 4 3 3 3 2 1 1 1 1
18 | 5 | 4 3 3 3 3 1 1 1 1
19 | 5 | 4 3 3 3 3 2 1 1 1
20 | 5 | 4 3 3 3 3 2 2 1 1
Cantrips column shown is the wizard's; other full casters differ (e.g., bard/sorcerer/druid have their own cantrip progressions). Slot columns are identical across all full casters.
```

**Half Caster Spell Slots (Paladin / Ranger) by class level — no slots at level 1, max 5th-level slots** — [src](https://dnd5e.info/classes/paladin/)

```
Level | 1st 2nd 3rd 4th 5th
1  | - - - - -
2  | 2 - - - -
3  | 3 - - - -
4  | 3 - - - -
5  | 4 2 - - -
6  | 4 2 - - -
7  | 4 3 - - -
8  | 4 3 - - -
9  | 4 3 2 - -
10 | 4 3 2 - -
11 | 4 3 3 - -
12 | 4 3 3 - -
13 | 4 3 3 1 -
14 | 4 3 3 1 -
15 | 4 3 3 2 -
16 | 4 3 3 2 -
17 | 4 3 3 3 1
18 | 4 3 3 3 1
19 | 4 3 3 3 2
20 | 4 3 3 3 2
Half casters gain spellcasting at level 2 and never exceed 5th-level slots. (Artificer is a half caster that DOES gain a 1st-level slot at level 1 via rounding half-level UP — non-SRD.)
```

**Warlock Pact Magic table (Cantrips Known / Spells Known / Spell Slots / Slot Level) by warlock level** — [src](https://dnd5e.info/classes/warlock/)

```
Level | CantripsKnown | SpellsKnown | SpellSlots | SlotLevel
1  | 2 | 2  | 1 | 1st
2  | 2 | 3  | 2 | 1st
3  | 2 | 4  | 2 | 2nd
4  | 3 | 5  | 2 | 2nd
5  | 3 | 6  | 2 | 3rd
6  | 3 | 7  | 2 | 3rd
7  | 3 | 8  | 2 | 4th
8  | 3 | 9  | 2 | 4th
9  | 3 | 10 | 2 | 5th
10 | 4 | 10 | 2 | 5th
11 | 4 | 11 | 3 | 5th
12 | 4 | 11 | 3 | 5th
13 | 4 | 12 | 3 | 5th
14 | 4 | 12 | 3 | 5th
15 | 4 | 13 | 3 | 5th
16 | 4 | 13 | 3 | 5th
17 | 4 | 14 | 4 | 5th
18 | 4 | 14 | 4 | 5th
19 | 4 | 15 | 4 | 5th
20 | 4 | 15 | 4 | 5th
ALL warlock slots are the single Slot Level shown (no lower-level slots exist). Slots recover on a SHORT or long rest. Mystic Arcanum adds one 6th/7th/8th/9th-level spell at warlock levels 11/13/15/17, each cast once per long rest WITHOUT a slot. Spells Known column does NOT include cantrips or Mystic Arcanum spells.
```

**Number of Prepared Spells formula (prepared casters)** — [src](https://5thsrd.org/character/classes/cleric/)

```
Cleric  : WIS mod + cleric level   (min 1)
Druid   : WIS mod + druid level    (min 1)
Wizard  : INT mod + wizard level   (min 1) — chosen from spellbook
Paladin : CHA mod + floor(paladin level / 2)   (min 1)
Artificer: INT mod + floor(artificer level / 2) (min 1) — non-SRD
All prepared spells must be of a level for which the caster has slots. Cantrips are NOT counted here (separate Cantrips Known). Changing the prepared list requires a long rest (plus, for wizards, 1 minute of study per spell level). Known-casters (bard, sorcerer, ranger, warlock) do NOT use this formula — they have fixed Spells Known counts on their class tables and swap one spell only on level-up.
```

**Multiclass caster-level contribution per class (for the standard shared slot pool)** — [src](https://www.sageadvice.eu/multiclass-eldritch-knight-and-arcane-trickster-spell-slots/)

```
Full level (x1)        : Bard, Cleric, Druid, Sorcerer, Wizard
Half level, round DOWN  : Paladin, Ranger
Half level, round UP    : Artificer (non-SRD)
One-third level, round DOWN : Eldritch Knight (Fighter subclass), Arcane Trickster (Rogue subclass)
Excluded entirely       : Warlock (Pact Magic tracked separately)
Non-casting classes (Barbarian, Monk, base Fighter/Rogue, etc.) contribute 0.
Note: single-class EK/AT round their 1/3 UP on their own subclass table, but the MULTICLASS combine rule rounds DOWN. Sum all contributions, then read the Multiclass Spellcaster table at that combined level.
```

#### 2024 deltas (not canonical here)

- PREPARED-SPELLS UNIFICATION: In 2024 (5.5e), the 'spells known' system is largely retired — nearly all spellcasting classes (including bard, sorcerer, ranger) now PREPARE spells. Each class lists a FIXED number of prepared spells by level (a table column), no longer the 2014 'ability modifier + level' formula. 2014 canon keeps the known/prepared split and the modifier-based prepared count.
- FREE SPELL SWAPS: 2024 lets characters change prepared spells more freely — typically swap when you gain a class level (and for some classes, replace one after a long rest). 2014 known-casters could swap only ONE spell on level-up; 2014 prepared-casters re-chose the whole list after a long rest but with the modifier-based count.
- CANTRIP SWAPPING: 2024 allows swapping a cantrip when you gain a level in the relevant class (e.g., sorcerer). 2014 cantrips, once learned, are generally fixed (no built-in swap mechanic for most classes).
- RITUAL TAG MOVED: In 2024 the Ritual tag is presented as part of the casting time line rather than a separate property; the 10-minutes-longer mechanic is similar but presentation/edge rules differ from 2014.
- SPELL LISTS BY CLASS: 2024 prints each class's spell list within the class description and reorganizes some spells; 2014/SRD uses unified spell lists referenced by class. (Affects which spells are selectable, not slot math.)
- NEW AREA SHAPE: 2024 adds 'Emanation' as an area-of-effect type (e.g., Spirit Guardians). 2014 has only cone, cube, cylinder, line, sphere. (Targeting/AoE, not slots — included for completeness.)
- CONCENTRATION largely UNCHANGED in 2024 (Con save DC = 10 or half damage; one concentration spell at a time), so 2014 concentration rules remain a safe canonical baseline.
- WARLOCK PACT MAGIC essentially unchanged in 2024 (uniform-level slots, short-rest recovery, Mystic Arcanum), so 2014 warlock slot handling carries forward.

---

<a id="s11"></a>

## Spell Save DC & Spell Attack Bonus

### The Rule (5e RAW)

A spellcaster's two derived spell numbers:

- **Spell save DC** = `8 + proficiency bonus + spellcasting ability modifier (+ other bonuses)`
- **Spell attack bonus** = `proficiency bonus + spellcasting ability modifier (+ other bonuses)`

Both are independent of the spell's level and independent of how many slots you have.
The proficiency bonus is the character's overall PB (by **total** level for a
multiclass character — PHB Multiclassing: "your proficiency bonus is always based on
your total character level").

The **spellcasting ability is fixed per class** by the class definition:

| Ability | Classes / subclasses |
|---|---|
| Intelligence (INT) | Wizard, Artificer, **Eldritch Knight** (Fighter), **Arcane Trickster** (Rogue) |
| Wisdom (WIS) | Cleric, Druid, Ranger |
| Charisma (CHA) | Bard, Sorcerer, Warlock, Paladin |

**Multiclass is the crucial case:** each spellcasting class uses **its own**
spellcasting ability, and the DC/attack are computed **per class, separately**. A
Wizard/Cleric therefore has **two different save DCs and two different attack
bonuses** at the same time — wizard spells resolve against the INT-based DC, cleric
spells against the WIS-based DC. The multiclass rule pools spell **slots** into one
shared table, but it explicitly does **not** pool the DC/attack: "you determine your
spellcasting ability... separately for each class."

### What Modifies It (increases / decreases)

Spell save DC and spell attack both move by the same sources (DC is just attack + 8):

- **Spellcasting ability modifier** — the dominant term; raised by ASIs, racial ASIs,
  feats (e.g. Fey Touched / +1 to the casting stat), and ability-setting items. *Auto-applied:* the derive reads `effectiveAbilities`, which already folds racial ASIs + feat ASIs + item ability changes (characterStats.ts:838-839).
- **Proficiency bonus** — rises at levels 5/9/13/17. *Auto-applied* via `proficiencyBonus(character.level)` (characterStats.ts:711), correctly by total level.
- **Spell-focus / arcane-focus magic items** (Rod of the Pact Keeper, Wand of the War Mage, Robe of the Archmagi, etc.) — add a flat bonus to attack and/or DC. *Auto-applied* while the item is active (attuned/equipped) via `ItemEffect` `spell_attack`/`spell_save_dc` accumulated in `computeActiveItemEffects` → `itemEffects.spellAttack`/`itemEffects.spellSaveDC` (characterStats.ts:572-577, 845-846).
- **Homebrew / un-cataloged focus** — the manual `spellBonusModifier` field (default 0, range 0–5). *Manual*, edited via the SpellBlock pencil/InfoPopup (SpellBlock.tsx:655-669), added to both (characterStats.ts:840, 845-846).
- **Spells that target a save use the caster's DC; spell attack rolls use the attack bonus.** Cover, conditions, and situational +/- to the *target's* save are *not represented* (DM-side, correctly out of scope).

### What It Rolls & How the Roll Resolves

- **Spell save DC** — a **static value, no roll** for the caster. The *target* rolls a saving throw against it; the app surfaces the number only (`derived.spellSaveDC`, SpellBlock.tsx:462). The target's roll happens on the target's own sheet.
- **Spell attack bonus** — rolled when the spell is an attack spell. SpellBlock's "Hit" button dispatches `{ type: 'attack', label, modifier: spellAttackMod }` where `spellAttackMod = derived.spellAttackBonus` (SpellBlock.tsx:283, 605). `useDiceStore.roll` rolls `d20 + modifier`; natural 20 flags a crit and auto-advances to the damage phase in `DiceRollModal` (useRollDispatch.ts:13-23). Advantage/disadvantage are not passed for spell attacks (normal roll) — situational, correctly manual.

### How This App Handles It

Store → derive → render path:

- **Store (base):** `spellBonusModifier` (manual override, default 0); the casting ability lives in `effectiveAbilities` after derive; nothing about DC/attack is stored.
- **Derive (single application point, characterStats.ts:831-847):**
  ```
  const castingClass = classRecords.find(c => c.spellcasting?.ability) ?? null
  if (castingClass?.spellcasting?.ability) {
    spellAbilKey  = ABILITY_FULL_TO_SHORT[castingClass.spellcasting.ability.toLowerCase()] ?? 'int'
    spellAbilMod  = abilityModifier(effectiveAbilities[spellAbilKey])
    spellAttackBonus = spellAbilMod + pb + itemEffects.spellAttack + manualBonus
    spellSaveDC      = 8 + spellAbilMod + pb + itemEffects.spellSaveDC + manualBonus
  }
  ```
  `classRecords` is ordered primary-first (useDerivedSheet.ts:43-47), so `find(...)` picks the **first** class that has a spellcasting ability. `pb = proficiencyBonus(character.level)` is total-level PB (characterStats.ts:711). Both results land on `DerivedStats.spellAttackBonus`/`spellSaveDC` (characterStats.ts:966-967).
- **Render:** `SpellBlock` shows Attack (`derived.spellAttackBonus`, SpellBlock.tsx:448) and Save DC (`derived.spellSaveDC`, SpellBlock.tsx:462), and every spell's "Hit" button rolls with that single `spellAttackMod` (SpellBlock.tsx:605). Only **one** SpellBlock is mounted, always with the **primary** `classRecord`/`primaryClassLevel` (CharacterPage.tsx:965-974). The block's own "Spells Known/Prepared" `castingMod` separately reads the **primary** class's ability (SpellBlock.tsx:396-399), which is the prepared-count ability, not the DC ability.

The single-class path is RAW-correct: for any one caster the formula, the per-class ability lookup (data-driven via `spellcasting.ability`), the total-level PB, the item focus bonuses, and the manual override all compose correctly.

### Gaps & Mis-Handling

- **Multiclass with two casting abilities collapses to one DC/attack.** `castingClass = classRecords.find(c => c.spellcasting?.ability)` returns only the FIRST casting class; the second casting class's ability is silently ignored, so a Wizard/Cleric, Sorcerer/Druid, Bard/Wizard, etc. shows a single DC/attack derived from one ability and applies it to *all* spells regardless of which class granted them. (`derived` exposes exactly one `spellSaveDC`/`spellAttackBonus`; SpellBlock has no per-class DC.)
- **Eldritch Knight / Arcane Trickster spell stats are not representable.** Fighter/Rogue (and their EK/AT subclass records) carry no `spellcasting.ability` in the data, so `castingClass` is `null` → attack/DC stay 0; combined with no slot data these subclass casters get no working spell DC/attack at all. Data-gap manifestation; bordering on the broader "multiclass spellcasting model" family but worth flagging for this stat specifically.
- *Intentionally manual / not a bug:* per-target save modifiers, cover, advantage/disadvantage on spell attacks, and the homebrew `spellBonusModifier` are correctly left to the player/DM and are not derivation errors.

#### Sourced rule facts (2014 RAW, web-verified)

- Spell save DC = 8 + your spellcasting ability modifier + your proficiency bonus + any special modifiers. (SRD wording: "The DC to resist one of your spells equals 8 + your spellcasting ability modifier + your proficiency bonus + any special modifiers.") — [src](https://5thsrd.org/spellcasting/casting_a_spell/)
- Spell attack bonus = your spellcasting ability modifier + your proficiency bonus. (SRD wording: "Your attack bonus with a spell attack equals your spellcasting ability modifier + your proficiency bonus.") — [src](https://5thsrd.org/spellcasting/casting_a_spell/)
- The spellcasting ability is fixed per class, not chosen by the player: Bard = Charisma, Cleric = Wisdom, Druid = Wisdom, Paladin = Charisma, Ranger = Wisdom, Sorcerer = Charisma, Warlock = Charisma, Wizard = Intelligence. — [src](https://5thsrd.org/character/classes/wizard/)
- Per-class formulas are stated explicitly as 'Spell save DC = 8 + your proficiency bonus + your [Ability] modifier' and 'Spell attack modifier = your proficiency bonus + your [Ability] modifier'. The order of addends differs from the generic spellcasting page but the result is identical (addition is commutative). — [src](https://5thsrd.org/character/classes/cleric/)
- Proficiency bonus in both formulas is the character's normal proficiency bonus by TOTAL character level (+2 at 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17-20), not a per-class or caster-level value. — [src](https://5thsrd.org/rules/multiclassing/)
- Spell attack rolls obey the normal d20 attack-roll math: d20 + spell attack bonus vs target AC. A natural 20 is a critical hit; a natural 1 is an automatic miss. Critical hits double the spell's damage dice (not the flat modifiers). — [src](https://5thsrd.org/spellcasting/casting_a_spell/)
- Ranged spell attacks have disadvantage if you are within 5 feet of a hostile creature that can see you and that isn't incapacitated. (SRD: "Remember that you have disadvantage on a ranged attack roll if you are within 5 feet of a hostile creature that can see you and that isn't incapacitated.") — [src](https://5thsrd.org/spellcasting/casting_a_spell/)
- A spell either forces a saving throw OR requires a spell attack roll (or neither) — determined by the individual spell's text, never both for the same effect. The spell text also dictates which of the target's ability scores the save uses; the caster's spellcasting ability only sets the DC, never the save's ability. — [src](https://5thsrd.org/spellcasting/casting_a_spell/)
- When multiclassing, each spell you know or prepare is associated with one of your classes, and you use the spellcasting ability of THAT class when you cast it. There is no single combined spell save DC or spell attack bonus for a multiclass character. — [src](https://5thsrd.org/rules/multiclassing/)
- Warlock Pact Magic and standard Spellcasting are tracked separately, but both still compute DC/attack from Charisma (Warlock) and the relevant class's ability. Pact Magic slots and Spellcasting slots can be used to cast each other's known/prepared spells, but each spell uses its own class's spellcasting ability for its DC/attack. — [src](https://5thsrd.org/rules/multiclassing/)
- Cantrips use the same spell attack bonus and spell save DC as leveled spells of the same class — there is no separate cantrip math. Cantrip damage scaling is by character level, but the to-hit / DC use the standard formulas. — [src](https://5thsrd.org/spellcasting/casting_a_spell/)
- Spell save DC and spell attack bonus increase only when (a) the spellcasting ability modifier rises (via ASI/feat increasing the ability score across an even threshold) or (b) the proficiency bonus rises (at levels 5, 9, 13, 17). They do not scale with spell level or slot level. — [src](https://5thsrd.org/spellcasting/casting_a_spell/)

#### Key tables

**Spell Save DC & Spell Attack Bonus formulas (2014 canonical)** — [src](https://5thsrd.org/spellcasting/casting_a_spell/)

```
Spell save DC        = 8 + spellcasting ability modifier + proficiency bonus + any special modifiers
Spell attack bonus   =     spellcasting ability modifier + proficiency bonus

Notes:
- The constant 8 appears ONLY in the save DC, never in the attack bonus.
- 'Special modifiers' apply to the DC (and, separately, items may add to attack rolls) — e.g. Rod of the Pact Keeper, Wand of the War Mage.
- Both use the SAME spellcasting ability modifier and the SAME proficiency bonus, so: spell attack bonus = spell save DC - 8 (when no special modifiers).
```

**Spellcasting ability by class (2014 SRD)** — [src](https://5thsrd.org/character/classes/wizard/)

```
Class       | Spellcasting ability | Caster type
Bard        | Charisma             | Full (known)
Cleric      | Wisdom               | Full (prepared)
Druid       | Wisdom               | Full (prepared)
Paladin     | Charisma             | Half (prepared)
Ranger      | Wisdom               | Half (known)
Sorcerer    | Charisma             | Full (known)
Warlock     | Charisma             | Pact Magic
Wizard      | Intelligence         | Full (prepared)
--- non-SRD (verify against source) ---
Artificer   | Intelligence         | Half (prepared)
Blood Hunter| Int / Wis (subclass) | varies; most Blood Hunters have no spellcasting
```

**Proficiency bonus by total character level (used in both formulas)** — [src](https://5thsrd.org/rules/multiclassing/)

```
Level  | Proficiency bonus
1-4    | +2
5-8    | +3
9-12   | +4
13-16  | +5
17-20  | +6

Multiclass: use TOTAL character level (sum of all class levels), never per-class level. Never halve for half-casters.
```

**Worked examples (sanity-check values)** — [src](https://5thsrd.org/spellcasting/casting_a_spell/)

```
Wizard 5, Int 18 (+4): DC = 8 + 4 + 3 = 15 ; attack = +4 + 3 = +7
Cleric 1, Wis 16 (+3): DC = 8 + 3 + 2 = 13 ; attack = +3 + 2 = +5
Paladin 5 (half-caster), Cha 16 (+3): DC = 8 + 3 + 3 = 14 ; attack = +3 + 3 = +6  (prof from TOTAL level 5 = +3, NOT halved)
Warlock 3 with Rod of the Pact Keeper +1, Cha 16 (+3): DC = 8 + 3 + 2 + 1 = 14 ; attack = +3 + 2 + 1 = +6
Cleric 3 / Wizard 3 (multiclass): TWO separate stats — cleric DC = 8 + Wis mod + 3; wizard DC = 8 + Int mod + 3.
```

#### 2024 deltas (not canonical here)

- Formulas are UNCHANGED in 2024 (5.5e): Spell save DC = 8 + spellcasting ability modifier + Proficiency Bonus; Spell attack bonus = spellcasting ability modifier + Proficiency Bonus. Per-class spellcasting abilities are also unchanged.
- 2024 phrasing drops the explicit '+ any special modifiers' tail from the core formula sentence and instead folds bonuses (e.g. magic items) in via item text, but mechanically the additive bonus from items like a Rod/Wand still applies the same way.
- 2024 clarified the non-caster case: if a creature uses a magic item to cast a spell and has no spellcasting ability of its own, its spellcasting ability modifier is treated as +0 for the item, and the user's Proficiency Bonus applies. (2014 left this fuzzier; many magic items printed their own fixed DC.)
- 2024 emphasizes that the spell's text determines the TARGET's saving throw ability, fully decoupled from the caster's spellcasting ability — same as 2014 in effect, just stated more explicitly.
- 2024 multiclassing keeps per-class spellcasting ability for each spell; the combined-slot table for shared 'Spellcasting' classes is essentially retained. (Warlock Pact Magic interaction rewording is editorial, not a math change to DC/attack.)

---

<a id="s12"></a>

## Classes, Subclasses & Multiclassing

### The Rule (5e RAW)

A character is defined by one or more **classes**, each with its own **class level**. A **subclass** is chosen at a class-specific level (e.g. Cleric at L1, Wizard/Fighter/Barbarian at L3, Rogue at L3) and adds features at fixed class levels thereafter.

**Total character level** = sum of all class levels, capped at **20**. Many mechanics key off total level, others off the individual class level:

- **Proficiency bonus** scales with *total* level: `ceil(level/4)+1` (+2 at 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20).
- **Hit Dice**: each class contributes its own hit-die type, one per class level (a Fighter 3 / Wizard 2 has 3d10 + 2d6). Max HP at L1 of the *first* class = max die + CON; every later level (any class) = roll or average + CON.
- **Ability Score Improvements / feats** are granted at *class* levels 4, 8, 12, 16, 19 — **per class**, not at total-level milestones. Fighter additionally gets ASIs at class levels 6 and 14; Rogue additionally at class level 10. A Fighter 6 / Wizard 4 has Fighter ASIs at 4 & 6 plus a Wizard ASI at 4 (three total), NOT ASIs at total levels 4 & 8.
- **Expertise** (Rogue/Bard) is granted at class-specific levels and is capped per class.

**Multiclassing prerequisite (PHB):** to take levels in a new class while keeping your old one, you must have **≥13 in the key ability of BOTH** the class you are leaving and the class you are entering (e.g. Fighter→Wizard needs STR or DEX 13 *and* INT 13; some classes need two, e.g. Paladin needs STR 13 AND CHA 13). Below the threshold you cannot multiclass.

**Multiclass proficiency subset (PHB):** when you gain your *first* level in a new class via multiclassing, you do **not** get all of that class's starting proficiencies. You get only the subset listed in the PHB multiclassing table — notably **no new saving-throw proficiencies** (saves come only from your *initial* class), and only a partial slice of armor/weapon/tool proficiencies (e.g. multiclassing into Fighter grants light & medium armor, shields, simple & martial weapons — but NOT heavy armor; into Barbarian grants shields + simple/martial weapons; into Wizard grants nothing).

**Multiclass spellcasting (PHB):** spell *slots* are determined by a combined "effective caster level" = (full-caster levels) + floor(half-caster levels / 2) + ceil(Artificer level / 2), looked up on the single PHB multiclass slot table — but **only when ≥2 spellcasting classes are combined**; a lone caster uses its own class table. **Warlock Pact Magic is separate and additive** (its own pact-slot pool, refreshing on a short rest). Spells *known/prepared* are tracked per class, not combined.

### What Modifies It (increases / decreases)

- **Total level** (drives PB, feat-HP scaling): set by the level stepper / level-up flow. *Auto-applied.* Capped at 20 in UI.
- **Per-class level** (drives subclass unlock, ASI levels, hit dice, expertise cap, spell slots): stored in `classes[]`. *Auto-applied.*
- **Subclass** at class-specific level: gated by `choiceLevel`. *Auto-applied* (offered only at/above the level).
- **Proficiency bonus**: `proficiencyBonus(character.level)` using total level. *Auto-applied.*
- **ASIs/feats per class level**: setup generates one slot per qualifying class level across all classes; level-up offers them on the leveling class. *Auto-applied* (slot generation), choices stored.
- **Hit dice pool**: per-class die types summed. *Auto-applied* for display; spending is per-class.
- **Multiclass spell slots**: PHB table for ≥2 casters, own table for 1, +pact pool for warlock. *Auto-applied.*
- **Multiclass prerequisite (≥13 key ability)**: **not represented** — no gate, no warning.
- **Multiclass proficiency subset**: **mis-represented** — the secondary class's *full* weapon (and, implicitly, armor) proficiency list is granted, not the PHB subset.
- **20-level cap**: enforced in the setup UI dropdowns and the "Add class" button (`totalLevel < 20`). *Auto-applied* there.

### What It Rolls & How the Roll Resolves

Class structure is **static state**, not a roll. The only dice it feeds:
- **Hit-die HP roll** at level-up: roll the *leveling class's* hit die + CON mod (`rollHp`, LevelUpDialog.tsx:200-202), floored at 1.
- **Hit-die short-rest healing** on the sheet (per-class die, see Hit Dice subsystem).
Proficiency bonus, spell attack/DC, and weapon to-hit all *derive from* class data and feed other rolls; class structure itself rolls nothing.

### How This App Handles It

- **Source of truth** is `character.classes: ClassEntry[]` (`{classSlug, subclassSlug, level}`), `[0]` = primary/first class (types/character.ts:5-9, 72). `updateCharacter` re-derives legacy `class`/`subclass`/`level` columns from it on every write (INV-3).
- **Setup** (`draftToNewCharacter`, characterSetup.ts:727-735) builds `classes` = primary + `extraClasses`; `level` = total (line 721, 777). HP via `computeMulticlassHp` (line 722). ASI slots span all classes via `getAllAsiSlots` (line 685, INV-2/BUG-19). Saving throws come from the **primary class only** (line 756-757) — RAW-correct (saves come from the first class).
- **Level-up** (CharacterPage.tsx:1118-1151): picker chooses which class gains a level or adds a brand-new class at level 1 (`{classSlug, subclassSlug:null, level:1}`); `LevelUpDialog` writes `level`, `maxHp`, ASI/feat, spells, feature choices; the caller merges `classes[]`. PB shown via `proficiencyBonus(character.level)` (total). ASI offered when the new *class* level is an ASI level (`isASILevel`, LevelUpDialog.tsx:92-94).
- **Derivation** (`deriveCharacterStats`, characterStats.ts:704-981): `pb = proficiencyBonus(character.level)` (total, line 711). `weaponProficiencies` = lowercased **union across ALL class records** (line 945-947). Spell attack/DC use the *first class record with a `spellcasting.ability`* (line 834), not just primary, so a Fighter/Wizard casts correctly (BUG-15 fix). Hit-die *type* for the flat field uses `classData` = primary (line 942); the per-class pool is computed elsewhere.
- **Subclass** gating uses `choiceLevel` for both primary (SetupScreen1.tsx:160) and extras (line 408) — offered only at/above the class-specific level.
- **Expertise cap** is per class up to that class's own level (`getExpertiseCap`, ProficienciesBlock.tsx:37-45, INV-2/BUG-10).
- **Multiclass spell slots** (`computeMulticlassSlots`, spellcasting.ts:155-202): lone standard caster → own table; ≥2 → PHB table keyed by summed `casterLevelContribution` (full=level, artificer=ceil/2, paladin/ranger=floor/2, warlock=0); warlock contributes a separate `slots+pact` pool (BUG-16/38 fixes verified correct).

### Gaps & Mis-Handling

- **No multiclass prerequisite check.** Neither the setup wizard nor the level-up flow validates the ≥13-in-key-ability rule for either the class being left or entered; you can build an illegal multiclass with no warning (unlike feats, which show a soft "Req not met" badge). See discrepancy `mc-prereq-missing`.
- **Multiclass grants the full proficiency list of the secondary class.** `weaponProficiencies` unions every class's *full* `weapon_proficiencies` (characterStats.ts:945-947), and the AC path never validates armor proficiency at all, so multiclassing into Fighter/Barbarian/etc. silently grants martial-weapon (and effectively heavy-armor) proficiency the PHB subset withholds. See `mc-prof-subset`.
- **Multiclass-in via level-up does not grant even the correct PHB-subset proficiencies as a positive grant** — it relies entirely on the union derivation, which over-grants; there is no place where the subset is applied. Folded into `mc-prof-subset`.

(Intentionally manual / not bugs: the ≥13 prereq could only ever be a soft warning given the app's homebrew-friendly soft-lock policy; saving-throw-from-first-class-only is correctly implemented; subclass-at-class-level and the 20-level cap are correctly handled.)

#### Sourced rule facts (2014 RAW, web-verified)

- Your character level is the sum of your levels in all your classes. Experience points (XP) and proficiency bonus are based on this TOTAL character level, never on your level in any single class. A Fighter 3 / Rogue 2 has the proficiency bonus of a 5th-level character (+3) and needs 5th-level XP totals to advance. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Proficiency bonus by total level: +2 at levels 1-4, +3 at 5-8, +4 at 9-12, +5 at 13-16, +6 at 17-20. Equivalent formula: ceil(totalLevel / 4) + 1. — [src](https://dnd5e.info/beyond-1st-level/character-advancement/)
- To multiclass into a new class you must meet the ability score prerequisite (a score of 13 or higher in the listed ability/abilities) for BOTH your current class(es) and the new class. Failing to meet a prerequisite means you cannot take a level in that class at all. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- When you take your FIRST level in a class other than your initial class, you gain only a reduced subset of that class's starting proficiencies (per the Multiclassing Proficiencies table), NOT the full set a single-classed character of that class would get. You also do not gain that class's starting equipment. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Saving-throw proficiencies come only from the class you chose at 1st level (your initial class). Multiclassing into a class never grants its saving-throw proficiencies. Skill proficiencies are also limited: e.g. Bard grants one skill of choice, Ranger/Rogue grant one skill from the class list — not the larger number a single-classed member picks. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Hit points: you gain the new class's hit points as for levels after 1st (roll the class's Hit Die or take its fixed average, plus CON modifier). You gain a class's MAXIMUM-1st-level hit points only for the single class you take at character creation (1st level). — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/character-advancement/)
- Hit Dice from all classes are pooled. Classes that share a die size combine (e.g. Fighter d10 + Paladin d10 = pool of d10s); different die sizes are tracked separately (e.g. Wizard d6s vs Fighter d10s). Hit Dice are spent during a short rest from this combined pool. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/character-advancement/)
- Ability Score Improvements (ASI) are class features tied to specific CLASS levels, not character level. Most classes grant ASIs at class levels 4, 8, 12, 16, and 19. Fighter additionally gets ASIs at class levels 6 and 14; Rogue additionally at class level 10. A multiclass character only gets an ASI when an individual class reaches one of ITS ASI levels. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/fighter/)
- Extra Attack does NOT stack across classes. If you gain the Extra Attack feature from more than one class, you still make only two attacks with the Attack action (not 2+2). You benefit from only the highest single-class grant unless a feature explicitly says otherwise. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Channel Divinity: if you have the Channel Divinity feature from more than one class (e.g. Cleric and Paladin), the number of uses is NOT added together — you use the most generous uses figure. You do, however, gain the Channel Divinity options of all your classes that grant it. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Unarmored Defense can be taken from only ONE class. If a class would grant Unarmored Defense and you already have it from another class (Barbarian and Monk), you keep your original and do not gain the second. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Multiclass spell slots: add together ALL levels in Bard, Cleric, Druid, Sorcerer, and Wizard; HALF (rounded down) of levels in Paladin and Ranger; and ONE-THIRD (rounded down) of levels in the Eldritch Knight (Fighter) or Arcane Trickster (Rogue) subclasses. The Artificer counts as a half caster but rounds UP (half level rounded up). Use the resulting number on the Multiclass Spellcaster table to find your total spell slots. — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Each class's spellcaster contribution is rounded individually before being added together (RAI per Jeremy Crawford). Example: Eldritch Knight Fighter 2 contributes floor(2/3)=0; a separate Wizard 1 contributes 1; total caster level = 1, not floor(3/3)=1 by coincidence — but Ranger 3 (floor 3/2=1) + Paladin 3 (floor 3/2=1) = 2, NOT floor(6/2)=3. — [src](https://dmsworkshop.com/2017/04/09/things-you-didnt-know-about-dd-multiclass-spellcasting/)
- Warlock Pact Magic is SEPARATE from the Multiclass Spellcaster table. You do NOT add Warlock levels when determining slots on that table; Pact Magic slots are tracked by the Warlock class's own table and are gained in addition to any multiclass Spellcasting slots. — [src](https://dmsworkshop.com/2017/04/09/things-you-didnt-know-about-dd-multiclass-spellcasting/)
- Spells known and spells prepared are determined for EACH class individually, as if you were a single-classed member of that class at your level in that class only. A Cleric 1 / Wizard 17 prepares Cleric spells as a 1st-level Cleric (only 1st-level Cleric spells) even though they have access to 9th-level slots. — [src](https://x.com/jeremyecrawford/status/941083631388213248?lang=en)
- The Multiclass Spellcaster table may grant a slot of a level higher than any spell you can prepare or know. You can use those higher slots, but only to cast lower-level spells (upcasting where applicable). — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)
- Spell save DC and spell attack bonus are computed PER spellcasting class using that class's spellcasting ability — they are never combined. Bard/Sorcerer/Warlock/Paladin use Charisma; Cleric/Druid/Ranger use Wisdom; Wizard uses Intelligence. A multiclass caster has a separate DC/attack for each casting class. — [src](https://www.5esrd.com/classes/)
- Cantrips known do NOT combine across classes. Each class grants its own cantrips by its own level, tracked separately; multiclassing does not merge or increase the cantrip count using combined levels. — [src](https://rpgbot.net/dnd5/characters/multiclassing/)
- Subclasses (subclass features) are chosen at the class level the parent class specifies, and their features are gained by your level in THAT class, independent of total character level. In 2014, classes pick subclasses at varying levels (e.g. Cleric/Sorcerer/Warlock at 1st; Fighter/Wizard/etc. at 2nd or 3rd). — [src](https://dungeonmister.com/guides/classes-in-dungeons-dragons/multiclassing-in-dnd-2024/)

#### Key tables

**Multiclassing Prerequisites (2014)** — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)

```
| Class | Ability Score Minimum |
|---|---|
| Barbarian | Strength 13 |
| Bard | Charisma 13 |
| Cleric | Wisdom 13 |
| Druid | Wisdom 13 |
| Fighter | Strength 13 OR Dexterity 13 |
| Monk | Dexterity 13 AND Wisdom 13 |
| Paladin | Strength 13 AND Charisma 13 |
| Ranger | Dexterity 13 AND Wisdom 13 |
| Rogue | Dexterity 13 |
| Sorcerer | Charisma 13 |
| Warlock | Charisma 13 |
| Wizard | Intelligence 13 |

You must meet the prerequisite for BOTH the class you are leaving and the class you are entering (Fighter is the only 'either/or'; Monk/Paladin/Ranger require BOTH listed scores).
```

**Multiclassing Proficiencies Gained (2014)** — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)

```
| Class | Proficiencies Gained When Multiclassing In |
|---|---|
| Barbarian | Shields, simple weapons, martial weapons |
| Bard | Light armor, one skill of your choice, one musical instrument of your choice |
| Cleric | Light armor, medium armor, shields |
| Druid | Light armor, medium armor, shields (non-metal only) |
| Fighter | Light armor, medium armor, shields, simple weapons, martial weapons |
| Monk | Simple weapons, shortswords |
| Paladin | Light armor, medium armor, shields, simple weapons, martial weapons |
| Ranger | Light armor, medium armor, shields, simple weapons, martial weapons, one skill from the class's skill list |
| Rogue | Light armor, one skill from the class's skill list, thieves' tools |
| Sorcerer | — (none) |
| Warlock | Light armor, simple weapons |
| Wizard | — (none) |

NOTE: NO class grants its saving-throw proficiencies via multiclassing. Saving throws come only from your 1st-level (initial) class.
```

**Multiclass Spellcaster: Spell Slots per Spell Level (2014 — identical to single full-caster slot progression)** — [src](https://dnd5e.info/beyond-1st-level/multiclassing/)

```
Effective level (full casters at full level + half casters paladin/ranger at half rounded down + EK/AT at one-third rounded down; Artificer half rounded up; Warlock EXCLUDED) maps to slots:

| Lvl | 1st | 2nd | 3rd | 4th | 5th | 6th | 7th | 8th | 9th |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2 | - | - | - | - | - | - | - | - |
| 2 | 3 | - | - | - | - | - | - | - | - |
| 3 | 4 | 2 | - | - | - | - | - | - | - |
| 4 | 4 | 3 | - | - | - | - | - | - | - |
| 5 | 4 | 3 | 2 | - | - | - | - | - | - |
| 6 | 4 | 3 | 3 | - | - | - | - | - | - |
| 7 | 4 | 3 | 3 | 1 | - | - | - | - | - |
| 8 | 4 | 3 | 3 | 2 | - | - | - | - | - |
| 9 | 4 | 3 | 3 | 3 | 1 | - | - | - | - |
| 10 | 4 | 3 | 3 | 3 | 2 | - | - | - | - |
| 11 | 4 | 3 | 3 | 3 | 2 | 1 | - | - | - |
| 12 | 4 | 3 | 3 | 3 | 2 | 1 | - | - | - |
| 13 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | - | - |
| 14 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | - | - |
| 15 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | - |
| 16 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | - |
| 17 | 4 | 3 | 3 | 3 | 2 | 1 | 1 | 1 | 1 |
| 18 | 4 | 3 | 3 | 3 | 3 | 1 | 1 | 1 | 1 |
| 19 | 4 | 3 | 3 | 3 | 3 | 2 | 1 | 1 | 1 |
| 20 | 4 | 3 | 3 | 3 | 3 | 2 | 2 | 1 | 1 |

Cross-verified identical on dnd5e.info and 5esrd.com. This is also the standard single-class Bard/Cleric/Druid/Sorcerer/Wizard slot table.
```

**Character Advancement: XP and Proficiency Bonus by Total Level (2014)** — [src](https://dnd5e.info/beyond-1st-level/character-advancement/)

```
| XP | Level | Proficiency Bonus |
|---|---|---|
| 0 | 1 | +2 |
| 300 | 2 | +2 |
| 900 | 3 | +2 |
| 2,700 | 4 | +2 |
| 6,500 | 5 | +3 |
| 14,000 | 6 | +3 |
| 23,000 | 7 | +3 |
| 34,000 | 8 | +3 |
| 48,000 | 9 | +4 |
| 64,000 | 10 | +4 |
| 85,000 | 11 | +4 |
| 100,000 | 12 | +4 |
| 120,000 | 13 | +5 |
| 140,000 | 14 | +5 |
| 165,000 | 15 | +5 |
| 195,000 | 16 | +5 |
| 225,000 | 17 | +6 |
| 265,000 | 18 | +6 |
| 305,000 | 19 | +6 |
| 355,000 | 20 | +6 |

Proficiency bonus formula: ceil(level/4)+1. XP and prof bonus use TOTAL character level for multiclass characters.
```

**Hit Die, ASI Levels, and Spellcasting Ability by Class (2014)** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/fighter/)

```
| Class | Hit Die | ASI Class Levels | Spellcasting Ability | Caster Type |
|---|---|---|---|---|
| Barbarian | d12 | 4,8,12,16,19 | — | none |
| Bard | d8 | 4,8,12,16,19 | Charisma | full (known) |
| Cleric | d8 | 4,8,12,16,19 | Wisdom | full (prepared) |
| Druid | d8 | 4,8,12,16,19 | Wisdom | full (prepared) |
| Fighter | d10 | 4,6,8,12,14,16,19 | Intelligence (Eldritch Knight only) | third (EK) |
| Monk | d8 | 4,8,12,16,19 | — | none |
| Paladin | d10 | 4,8,12,16,19 | Charisma | half (prepared) |
| Ranger | d10 | 4,8,12,16,19 | Wisdom | half (known) |
| Rogue | d8 | 4,8,10,12,16,19 | Intelligence (Arcane Trickster only) | third (AT) |
| Sorcerer | d6 | 4,8,12,16,19 | Charisma | full (known) |
| Warlock | d8 | 4,8,12,16,19 | Charisma | Pact Magic (separate) |
| Wizard | d6 | 4,8,12,16,19 | Intelligence | full (prepared) |
| Artificer (non-SRD) | d8 | 4,8,12,16,19 | Intelligence | half, rounds UP |

Extra Attack: Fighter 2 attacks at L5, 3 at L11, 4 at L20; Barbarian/Monk/Paladin/Ranger 2 attacks at their L5. Does not stack across classes.
```

#### 2024 deltas (not canonical here)

- 2024 (5.5e / SRD 5.2): Half-caster levels (Paladin, Ranger) for the Multiclass Spellcaster table are now HALVED and ROUNDED UP (not rounded down as in 2014). A 2024 Paladin 3 contributes 2 caster levels (ceil(3/2)) instead of 1. This makes a 1st-level half-caster contribute 1 (ceil(1/2)) instead of 0.
- 2024: Warlock Pact Magic slots and Spellcasting slots are now fully INTERCHANGEABLE — you can cast prepared Spellcasting spells using Pact Magic slots and cast Warlock spells using Spellcasting slots. (In 2014 the two pools were separate, though both could be used to cast spells you knew/prepared.) Warlock levels are still NOT added to the Multiclass Spellcaster table.
- 2024: All subclasses are gained at class level 3 (uniformly). This changes multiclass timing — e.g. a 2024 Warlock no longer has a Patron subclass at level 1 (it now arrives at Warlock level 3), and Eldritch Knight / Arcane Trickster spellcasting starts at class level 3 as before but the subclass framing is standardized.
- 2024: Multiclassing and Feats are NO LONGER optional rules — they are part of the core 2024 rules (a DM no longer needs to 'turn them on'). The ability-score-13 prerequisites are retained (13 in the primary ability of each class involved).
- 2024: Prerequisite wording is 'a score of at least 13 in the primary ability of the new class and of your current classes.' Functionally similar to 2014's per-class minimums; the same multi-ability classes (Monk, Paladin, Ranger) remain the harder ones to enter/leave.
- 2024: Background now grants the starting ability-score increases and an origin feat, and Epic Boon feats appear at level 19+ for single classes — but these are class/level-19 features unaffected by the multiclass slot math. The Multiclass Spellcaster slot table itself is unchanged from 2014.
- 2024 deltas are SIDE-NOTES only. Canonical for this app remains 2014: half-casters round DOWN, Pact Magic tracked separately, subclass-grant levels vary by class.

---

<a id="s13"></a>

## Races & Subraces

### The Rule (5e RAW)
A character's **race** (2014 PHB model, which is what this app's data encodes) supplies a bundle of fixed and chosen traits applied once, at character creation:

- **Ability Score Increases (ASIs).** Most races grant fixed increases (e.g. Dwarf +2 CON, Elf +2 DEX). Some add a **floating** increase (Half-Elf: +2 CHA fixed *and* +1 to two other abilities of your choice; Variant Human: +1 to two abilities of your choice). A **subrace** adds further fixed/choice ASIs (Hill Dwarf +1 WIS, High Elf +1 INT, Wood Elf +1 WIS). **Hard cap: a racial increase can never raise an ability above 20** (PHB p.13). Standard Human grants +1 to *all six* abilities; Variant Human trades that for +1/+1, one skill proficiency, and one feat.
- **Base walking speed.** 25 (Dwarf, Gnome, Halfling) or 30 (most), sometimes overridden by subrace (Wood Elf 35; Mountain Dwarf keeps 25).
- **Size.** Small (Gnome, Halfling, Kobold, Goblin…) or Medium (most).
- **Languages.** Common + race-specific (Dwarvish, Elvish…), sometimes "+1 of your choice".
- **Senses.** Darkvision (typically 60 ft; Gnome/Drow 120 ft), plus special senses (blindsight, etc.).
- **Traits.** Damage resistances (Tiefling fire, Dragonborn ancestry type, Genasi element, Aasimar necrotic/radiant, Shadar-kai necrotic), save advantages (Dwarven Resilience vs poison, Elf/Half-Elf Fey Ancestry vs charmed + no magic sleep, Gnome Cunning vs INT/WIS/CHA magic, Halfling Brave vs frightened, Stout Halfling Resilience vs poison), skill proficiencies (Elf Perception, Half-Orc Intimidation, Bugbear Stealth), weapon/armor proficiencies (Dwarf battleaxe/handaxe/warhammer; Elf longsword/shortsword/shortbow/longbow; Mountain Dwarf light+medium armor), Dwarven Toughness (+1 max HP per level), and active traits (Dragonborn breath weapon, Tiefling/Drow innate spells, Lucky, Relentless Endurance). The 2024 PHB replaces fixed racial ASIs with a background-driven floating +2/+1; this app encodes the 2014 model, so 2024 floating ASIs are out of scope.

### What Modifies It (increases / decreases)
- **Fixed racial ASI** (`race.base.ability_score_increases`) — **auto-applied** (derive time).
- **Floating racial ASI from a `count`/`pool:'any'` base pool** (Half-Elf +1/+1) — **auto-applied** and picker rendered.
- **Floating racial ASI from a `{choose, amount}` base pool** (Changeling, Fairy, Harengon, Owlin) — **NOT represented** (shape mismatch; dropped — see Gaps).
- **Subrace fixed ASI** (Hill Dwarf +1 WIS, High Elf +1 INT) — **auto-applied** (derive time).
- **Subrace floating ASI** (Variant Human +1/+1) — applied by the deriver IF `raceAsiChoices` were filled, but **no wizard picker exists** to fill them (see Gaps).
- **Subrace speed override** (Wood Elf 35) — **auto-applied** (baked into stored `speed` at creation, read straight through).
- **Dwarven Toughness +1 HP/level** (Hill Dwarf) — **auto-applied** via a hardcoded registry (the data field `hp_bonus_per_level` is ignored — see Gaps).
- **Racial damage resistances** (Tiefling fire, Dragonborn ancestry, Genasi, Aasimar, Shadar-kai) — **NOT represented** (descriptive trait text only; BUG-70).
- **Racial skill proficiencies** (Elf Perception, Half-Orc Intimidation) — **NOT applied** (BUG-64).
- **Racial save advantages** (Dwarven Resilience, Fey Ancestry, Gnome Cunning, Brave, Magic Resistance) — **auto-applied but built-in-only** via hardcoded `RACE_ADVANTAGES`/`SUBRACE_ADVANTAGES` maps, broadly (condition simplified to the governing ability); custom races get none (BUG-70).
- **Darkvision / senses** — structured in data (`senses.darkvision`) but **no derived readout** (intentionally manual / unsurfaced; BUG-70).
- **Breath weapons, innate spells, Lucky, Relentless Endurance** — **not represented** (situational / active abilities; intentionally manual).
- **Languages** — race base languages union'd into stored `languages` at creation; user-editable thereafter.
- **Feat ASIs / level-up ASIs / magic items** stack on top of racial ASIs at derive time (separate subsystems).

### What It Rolls & How the Roll Resolves
Race itself is **static data, no roll.** It feeds rolls indirectly: racial ASIs change ability modifiers (every check/save/attack using that ability), Dwarven Toughness raises max HP (no roll), racial speed sets movement, and racial save-advantages flip the d20 to advantage on the mapped saves via `getCharacterAdvantages` → `useDiceStore.roll` (the `RollKind.advantage` tristate, INV-11). Dragonborn breath weapon and similar active traits are not modeled, so their saves/damage are rolled manually with the generic dice tray.

### How This App Handles It
Store → derive → render path:
- **Stored (base):** `character.race` (slug), `character.subrace` (slug | null), `character.raceAsiChoices` (`AbilityName[]`, ordered race-pool slots first then subrace-pool slots), `character.speed` (subrace override or race base), `character.languages` (race langs + user picks). Set in `draftToNewCharacter` (`src/lib/characterSetup.ts:770-790`): `speed: subraceData?.speed ?? race?.base.speed ?? 30` (`:790`), `raceAsiChoices: draft.asiChoices` (`:785`). Abilities stored as BASE only — no racial bonus baked (INV-1).
- **Derive:** `deriveCharacterStats` (`src/lib/characterStats.ts:704`) calls `getRacialBonuses(race, character.raceAsiChoices ?? [], character.subrace)` (`:716`) and adds the result into `effectiveAbilities` **uncapped** (`:717-719`). `getRacialBonuses` (`src/lib/racialBonuses.ts:20-61`) applies base fixed ASIs (`:28-31`), base choice pools by `pool.count` with a running `offset` (`:33-40`), then subrace fixed (`:46-50`) and subrace choice pools continuing the same `offset` (`:51-57`). `effectiveSpeed = character.speed + featSpeedBonus + itemEffects.speed` (`:792`) — racial speed flows through `character.speed` untouched. Subrace HP: `SUBRACE_HP_BONUS[character.subrace.toLowerCase()]` (`:74-76`, `:938-939`) → `adjustedMaxHp = character.maxHp + hpBonus + subraceHpBonus + itemEffects.maxHp` (`:954`). Save advantages: `RACE_ADVANTAGES`/`SUBRACE_ADVANTAGES` (`:143-165`) applied in `getCharacterAdvantages` (`:202-230`, keyed `RACE_ADVANTAGES[character.race]` at `:216`, `SUBRACE_ADVANTAGES[subrace.toLowerCase()]` at `:220`).
- **Render:** sheet blocks read `effectiveAbilities`, `effectiveSpeed`, `adjustedMaxHp`, `advantages`; `derived.resistances` (CombatBlock Defenses) is fed only by item effects (`:977`), never race.
- **Wizard:** `SetupScreen1.tsx` renders racial ASI pickers from `selectedRace?.base.asi_choices` only (`:165`, rendered `:316-350`), using `pool.count` for slot count (`:324`) and offering all abilities unfiltered (`:339-343`). `getRacialBonuses` is also used live for display (`:91`). Round-trip: `characterToDraft` copies `raceAsiChoices` into `draft.asiChoices` (`characterSetup.ts:886`) and `subrace` into `subraceSlug` (`:878`); idempotent since abilities are base (BUG-13 fixed).

### Gaps & Mis-Handling
- **Subrace `asi_choices` have no wizard picker** (Variant Human +1/+1 silently lost). The deriver supports subrace pools, but `SetupScreen1` only renders `base.asi_choices`.
- **`{choose, amount}` pool shape is silently dropped** for Changeling, Fairy, Harengon, Owlin — both the deriver (`pool.count` undefined) and the picker (`Array.from({length: pool.count})` empty) only understand the `{count, amount, pool}` shape.
- **Racial ASIs are not capped at 20 at derive time** (RAW cap), while the write-time HP/AC seed *does* cap — producing an internally inconsistent sheet for high custom scores.
- **`hp_bonus_per_level` subrace data field is ignored**; the +1-HP/level bonus is driven by a hardcoded `SUBRACE_HP_BONUS` registry keyed only to `'hill-dwarf'` (latent — a homebrew/edited subrace with `hp_bonus_per_level` gets nothing).
- **Racial damage resistances never apply** (Tiefling fire, etc.) — already logged BUG-70.
- **Race-granted skill proficiencies never apply** (Elf Perception, etc.) — already logged BUG-64.
- **Darkvision/senses are never surfaced** despite being structured data — within BUG-70's scope.

#### Sourced rule facts (2014 RAW, web-verified)

- Every race grants an Ability Score Increase. The increase is applied to base ability scores and may raise a score above the normal starting cap (the only cap is the absolute maximum of 20 for player characters). Racial ASIs from the race and from the subrace stack (e.g. a Hill Dwarf gets Con +2 from race AND Wis +1 from subrace). — [src](https://5thsrd.org/character/races/)
- Members of a subrace have the traits of the parent race IN ADDITION TO the traits specified for their subrace. Subrace traits never replace parent-race traits unless explicitly stated. — [src](https://5thsrd.org/character/races/)
- Size categories: Most playable races are Medium (creatures roughly 4 to 8 feet tall). Small races (Gnome, Halfling) are about 2 to 4 feet tall. A Small creature has trouble wielding a heavy weapon (heavy weapons give Small creatures disadvantage on attack rolls, per the Equipment rules). — [src](https://5thsrd.org/character/races/)
- A creature's base walking speed (in feet) is set by its race. SRD speeds: Dwarf 25, Gnome 25, Halfling 25, and Human/Elf/Half-Elf/Half-Orc/Dragonborn/Tiefling 30. Wood Elf base speed is 35 (Fleet of Foot). A Dwarf's speed is NOT reduced by wearing heavy armor (overriding the Strength-requirement speed penalty). — [src](https://5thsrd.org/character/races/dwarf/)
- Darkvision (Dwarf, Elf, Half-Elf, Half-Orc, Gnome, Tiefling, Drow): 'You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.' Human and Halfling have NO darkvision in the SRD. — [src](https://5thsrd.org/character/races/elf/)
- Dwarf: Ability Score Increase Constitution +2. Size Medium. Speed 25 ft (not reduced by heavy armor). Darkvision 60 ft. Dwarven Resilience: advantage on saving throws against poison and resistance to poison damage. Dwarven Combat Training: proficiency with battleaxe, handaxe, light hammer, warhammer. Tool Proficiency: one of smith's tools, brewer's supplies, or mason's tools. Stonecunning: treated as proficient and add DOUBLE proficiency bonus on History checks about the origin of stonework. Languages: Common and Dwarvish. — [src](https://5thsrd.org/character/races/dwarf/)
- Hill Dwarf (subrace): Ability Score Increase Wisdom +1. Dwarven Toughness: 'Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.' (i.e. +1 HP per total character level, retroactively and at every level-up.) — [src](https://5thsrd.org/character/races/dwarf/)
- Mountain Dwarf (subrace, Basic Rules/PHB, NOT in SRD 5.1): Ability Score Increase Strength +2. Dwarven Armor Training: proficiency with light and medium armor. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/races)
- Elf: Ability Score Increase Dexterity +2. Size Medium. Speed 30 ft. Darkvision 60 ft. Keen Senses: proficiency in the Perception skill. Fey Ancestry: advantage on saving throws against being charmed, and magic can't put you to sleep. Trance: elves don't sleep; they meditate 4 hours per day for the benefit of an 8-hour rest. Languages: Common and Elvish. — [src](https://5thsrd.org/character/races/elf/)
- High Elf (subrace): Ability Score Increase Intelligence +1. Elf Weapon Training: proficiency with longsword, shortsword, shortbow, longbow. Cantrip: know one cantrip of your choice from the wizard spell list; Intelligence is your spellcasting ability for it. Extra Language: speak/read/write one extra language of your choice. — [src](https://5thsrd.org/character/races/elf/)
- Wood Elf (subrace, Basic Rules/PHB, NOT in SRD 5.1): Ability Score Increase Wisdom +1. Elf Weapon Training (longsword, shortsword, shortbow, longbow). Fleet of Foot: base walking speed increases to 35 ft. Mask of the Wild: can attempt to hide when only lightly obscured by natural phenomena (foliage, heavy rain, falling snow, mist, etc.). — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/races)
- Dark Elf / Drow (subrace, PHB, NOT in SRD 5.1): Ability Score Increase Charisma +1. Superior Darkvision: darkvision range is 120 ft instead of 60 ft. Sunlight Sensitivity: disadvantage on attack rolls and on Wisdom (Perception) checks that rely on sight when you, the target, or what you're perceiving is in direct sunlight. Drow Magic: know the dancing lights cantrip; at 3rd level cast faerie fire once per long rest; at 5th level cast darkness once per long rest; Charisma is the spellcasting ability. Drow Weapon Training: proficiency with rapiers, shortswords, hand crossbows. — [src](https://dnd5e.wikidot.com/lineage:elf-drow)
- Halfling: Ability Score Increase Dexterity +2. Size Small. Speed 25 ft. NO darkvision. Lucky: when you roll a 1 on the d20 for an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll. Brave: advantage on saving throws against being frightened. Halfling Nimbleness: you can move through the space of any creature that is of a size larger than yours. Languages: Common and Halfling. — [src](https://5thsrd.org/character/races/halfling/)
- Lightfoot Halfling (subrace): Ability Score Increase Charisma +1. Naturally Stealthy: you can attempt to hide even when you are obscured only by a creature that is at least one size larger than you. — [src](https://5thsrd.org/character/races/halfling/)
- Stout Halfling (subrace, Basic Rules/PHB, NOT in SRD 5.1): Ability Score Increase Constitution +1. Stout Resilience: advantage on saving throws against poison and resistance to poison damage. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/races)
- Human (standard): Ability Score Increase — each of your six ability scores increases by 1. Size Medium. Speed 30 ft. NO darkvision. Languages: Common and one extra language of your choice. No other traits. — [src](https://5thsrd.org/character/races/human/)
- Variant Human (Basic Rules/PHB, NOT in standard SRD 5.1): instead of +1 to all abilities, you get +1 to two different ability scores of your choice, proficiency in one skill of your choice, and one feat of your choice. (Variant Human requires the optional feats rule to be in use.) — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/races)
- Dragonborn: Ability Score Increase Strength +2 and Charisma +1. Size Medium. Speed 30 ft. NO darkvision. Draconic Ancestry: choose a dragon type, which sets your breath weapon's damage type, shape, and save type. Breath Weapon: as an action, force each creature in the area to make a saving throw (DC = 8 + your Constitution modifier + your proficiency bonus); 2d6 damage (half on success), increasing to 3d6 at 6th level, 4d6 at 11th level, 5d6 at 16th level; can't use again until you finish a short or long rest. Damage Resistance: resistance to the damage type of your draconic ancestry. Languages: Common and Draconic. — [src](https://5thsrd.org/character/races/dragonborn/)
- Gnome: Ability Score Increase Intelligence +2. Size Small. Speed 25 ft. Darkvision 60 ft. Gnome Cunning: advantage on all Intelligence, Wisdom, and Charisma saving throws against magic. Languages: Common and Gnomish. — [src](https://5thsrd.org/character/races/gnome/)
- Rock Gnome (subrace): Ability Score Increase Constitution +1. Artificer's Lore: on Intelligence (History) checks related to magic items, alchemical objects, or technological devices, add TWICE your proficiency bonus instead of any proficiency bonus you normally apply. Tinker: proficiency with tinker's tools; can spend 1 hour and 10 gp of materials to build a Tiny clockwork device (AC 5, 1 hp). — [src](https://5thsrd.org/character/races/gnome/)
- Half-Elf: Ability Score Increase Charisma +2, AND two other ability scores of your choice each increase by 1. Size Medium. Speed 30 ft. Darkvision 60 ft. Fey Ancestry: advantage on saving throws against being charmed, and magic can't put you to sleep. Skill Versatility: proficiency in two skills of your choice. Languages: Common, Elvish, and one extra language of your choice. (Half-Elf has NO subraces in SRD.) — [src](https://5thsrd.org/character/races/half-elf/)
- Half-Orc: Ability Score Increase Strength +2 and Constitution +1. Size Medium. Speed 30 ft. Darkvision 60 ft. Menacing: proficiency in the Intimidation skill. Relentless Endurance: when reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead; once per long rest. Savage Attacks: when you score a critical hit with a melee weapon attack, you can roll one of the weapon's damage dice one additional time and add it to the extra damage of the crit. Languages: Common and Orc. — [src](https://5thsrd.org/character/races/half-orc/)
- Tiefling: Ability Score Increase Intelligence +1 and Charisma +2. Size Medium. Speed 30 ft. Darkvision 60 ft. Hellish Resistance: resistance to fire damage. Infernal Legacy: know the thaumaturgy cantrip; at 3rd level cast hellish rebuke once per long rest as a 2nd-level spell; at 5th level cast darkness once per long rest; Charisma is your spellcasting ability for these spells. Languages: Common and Infernal. (Tiefling has NO subraces in SRD.) — [src](https://5thsrd.org/character/races/tiefling/)
- SRD 5.1 contains exactly 9 races, each with exactly ONE subrace (or none): Hill Dwarf, High Elf, Lightfoot Halfling, Rock Gnome; Dragonborn, Half-Elf, Half-Orc, Human, and Tiefling have no subrace in the SRD. Mountain Dwarf, Wood Elf, Drow, Stout Halfling, and Variant Human are in the 2014 Basic Rules / PHB but NOT in SRD 5.1. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/races/)
- Languages from race: every race grants Common plus at least one racial language; some grant a free choice (High Elf, Human, Half-Elf each get one extra language of choice). A character can speak/read/write the languages their race, class, and background grant. — [src](https://5thsrd.org/character/races/human/)

#### Key tables

**SRD 5.1 Races — Ability Score Increase, Size, Speed, Darkvision, Languages** — [src](https://5thsrd.org/character/races/)

```
Race | ASI (race) | Size | Speed | Darkvision | Languages
Dwarf | Con +2 | Medium | 25 ft (no heavy-armor penalty) | 60 ft | Common, Dwarvish
Elf | Dex +2 | Medium | 30 ft | 60 ft | Common, Elvish
Halfling | Dex +2 | Small | 25 ft | none | Common, Halfling
Human (standard) | +1 to ALL six abilities | Medium | 30 ft | none | Common, +1 of choice
Dragonborn | Str +2, Cha +1 | Medium | 30 ft | none | Common, Draconic
Gnome | Int +2 | Small | 25 ft | 60 ft | Common, Gnomish
Half-Elf | Cha +2, +1 to two of choice | Medium | 30 ft | 60 ft | Common, Elvish, +1 of choice
Half-Orc | Str +2, Con +1 | Medium | 30 ft | 60 ft | Common, Orc
Tiefling | Int +1, Cha +2 | Medium | 30 ft | 60 ft | Common, Infernal
```

**Subraces — ASI and notable trait overrides (SRD 5.1 subraces marked *)** — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/races)

```
Subrace | Parent | Subrace ASI | Notable subrace traits
Hill Dwarf * | Dwarf | Wis +1 | Dwarven Toughness (+1 max HP per total level)
Mountain Dwarf | Dwarf | Str +2 | Dwarven Armor Training (light+medium armor prof)
High Elf * | Elf | Int +1 | Elf Weapon Training; 1 wizard cantrip (INT); +1 language
Wood Elf | Elf | Wis +1 | Elf Weapon Training; Fleet of Foot (speed 35 ft); Mask of the Wild
Drow (Dark Elf) | Elf | Cha +1 | Superior Darkvision (120 ft, OVERRIDES 60); Sunlight Sensitivity; Drow Magic (dancing lights / faerie fire @3 / darkness @5, CHA); Drow Weapon Training
Lightfoot Halfling * | Halfling | Cha +1 | Naturally Stealthy
Stout Halfling | Halfling | Con +1 | Stout Resilience (poison adv + resistance)
Rock Gnome * | Gnome | Con +1 | Artificer's Lore (double prof on relevant History); Tinker (tinker's tools)
Variant Human | Human | +1 to two of choice | one skill prof + one feat (replaces +1-to-all)
```

**Dragonborn Draconic Ancestry — damage type, breath weapon shape, save** — [src](https://5thsrd.org/character/races/dragonborn/)

```
Dragon | Damage Type | Breath Weapon (shape + save)
Black | Acid | 5 by 30 ft. line (Dex save)
Blue | Lightning | 5 by 30 ft. line (Dex save)
Brass | Fire | 5 by 30 ft. line (Dex save)
Bronze | Lightning | 5 by 30 ft. line (Dex save)
Copper | Acid | 5 by 30 ft. line (Dex save)
Gold | Fire | 15 ft. cone (Dex save)
Green | Poison | 15 ft. cone (Con save)
Red | Fire | 15 ft. cone (Dex save)
Silver | Cold | 15 ft. cone (Con save)
White | Cold | 15 ft. cone (Con save)

Breath Weapon DC = 8 + Constitution modifier + proficiency bonus.
Damage = 2d6, then 3d6 at 6th level, 4d6 at 11th level, 5d6 at 16th level (half on a successful save). Recharge: short or long rest. Damage Resistance: to the ancestry's damage type.
```

**Race-granted innate spells/cantrips (spellcasting ability gates them, NOT the character's class)** — [src](https://5thsrd.org/character/races/tiefling/)

```
Trait | Race/Subrace | Spells | Casting ability | Level gates
High Elf Cantrip | High Elf | 1 wizard cantrip of choice | Intelligence | 1st
Drow Magic | Drow | dancing lights; faerie fire; darkness | Charisma | dancing lights @1, faerie fire @3 (1/long rest), darkness @5 (1/long rest)
Infernal Legacy | Tiefling | thaumaturgy; hellish rebuke (as 2nd lvl); darkness | Charisma | thaumaturgy @1, hellish rebuke @3 (1/long rest), darkness @5 (1/long rest)
Dragonborn Breath Weapon | Dragonborn | (not a spell) breath weapon | DC uses Constitution | 2d6 @1, scales @6/11/16
```

#### 2024 deltas (not canonical here)

- Terminology: 'Race' is renamed 'Species' in the 2024 Player's Handbook. Subraces are largely eliminated as a mechanic (the few survivors, e.g. Elf lineages, become a choice within the species rather than a separate stat block).
- Ability Score Increases moved OFF the species entirely. In 2024, ASIs come from your BACKGROUND: each background lists three abilities; you either put +2 in one and +1 in another, or +1 in all three (max +1 above 17... i.e. cannot raise a score above 20). This is the single biggest structural change — a 2024-aware app must apply ASIs from background, not race.
- 2024 PHB has 10 core species (added Aasimar, Goliath, and Orc as standalone species; Half-Elf and Half-Orc are dropped as separate species and handled via lineage/parentage flavor).
- Dragonborn (2024): Breath Weapon damage is 1d10 (not 2d6), scaling 1d10/2d10/3d10/4d10 at levels 1/5/11/17; you choose the shape (15-ft cone OR 30-ft line) each use rather than it being fixed by ancestry; gains Darkvision 60 ft (2014 Dragonborn had none); and gains Draconic Flight at level 5 (temporary fly speed, 1/long rest).
- Darkvision standardized/expanded: most species with darkvision get 60 ft; Dwarves' darkvision improved to 120 ft in 2024, and Stonecunning recast as a Tremorsense-granting ability usable a number of times per long rest.
- Elf (2024): unified species with three lineages chosen at 1st level (Drow / High Elf / Wood Elf), each granting scaling cantrips/spells; the lineage spells use a casting ability you choose (Int, Wis, or Cha) rather than a fixed one.
- Small-creature heavy-weapon penalty: retained in spirit but the 2024 rules clarify Small creatures still have disadvantage with Heavy weapons; speed and size handling is otherwise similar.
- Tiefling (2024): reworked into Fiendish Legacy options (Abyssal / Chthonic / Infernal), each a different spell package; gains a choice of casting ability and resistance type tied to the chosen legacy, replacing the fixed fire-resistance + Infernal spell list of 2014.
- Half-Elf 'two skills of your choice' (Skill Versatility) and Variant Human's 'feat at level 1' are no longer race features; in 2024 the level-1 feat (an Origin feat) and skills come from the Background instead.

---

<a id="s14"></a>

## Backgrounds

### The Rule (5e RAW)

A background represents what your character did before adventuring. Under the **2014 PHB** rules (the edition this app's data encodes — all 48 entries are 2014-format), every background grants a fixed bundle:

- **Two skill proficiencies.** Most backgrounds name both outright (Acolyte → Insight, Religion). Some grant one or both as a *choice*: a fixed list ("your choice from: Arcana, Nature, or Religion" — Cloistered Scholar), a "choose two from a list" (Investigator → two of Insight/Investigation/Perception), an ability-scoped pool ("one Intelligence, Wisdom, or Charisma skill of your choice" — Faction Agent), or two identical choice clauses (Haunted One → two of Arcana/Investigation/Religion/Survival).
- **Tool proficiencies** (zero, one, or two). Frequently expressed as a *category choice*: "one type of artisan's tools", "one type of gaming set", "one musical instrument of your choice", or compound choices ("Disguise kit or one type of musical instrument").
- **Languages** — either a fixed grant (Clan Crafter → Dwarvish; Rune Carver → Giant), a count of free-choice languages ("two languages of your choice"), or a scoped choice (Haunted One → one exotic language).
- **A feature** — a non-mechanical roleplay/social ability (Acolyte's *Shelter of the Faithful*). It never affects a computed stat.
- **Starting equipment** + a pouch of gold.
- **Personality suggestion tables** — personality traits, ideals, bonds, flaws (roleplay prompts only).

**Overlapping-proficiency rule (PHB "Proficiencies" sidebar):** if a background would grant a skill/tool you already have from another source (race, class), you pick a *different* one of the same type instead — you never get the same proficiency twice, and you never silently lose the slot.

The **2024 PHB** reworked backgrounds entirely (each grants a +2/+1 (or +1/+1/+1) ability-score increase across three listed abilities, an Origin feat, one tool proficiency, and two fixed skills). **This app's data does not encode 2024 backgrounds at all** — there is no ASI or feat field on the `Background` type.

### What Modifies It (increases / decreases)

A background is a *grant source*, not a value, so "what modifies it" = the proficiencies/languages/feat it confers and how other sources interact:

- **Skill proficiencies (2)** — auto-applied by app (fixed grants baked into `skillProficiencies`; choice grants applied from the picker). Granted skill = no roll bonus by itself; it adds proficiency bonus to that skill's checks at render time.
- **Tool proficiencies** — *partially represented*: fixed tool names auto-applied; **choice/category tool prose is stored verbatim as a fake proficiency name, not resolved to a real tool** (see gaps).
- **Languages** — fixed grants: **applied on the sheet-side background-change dialog but DROPPED by the creation wizard** (see gaps). Free-choice languages: auto-applied via the language picker, capped by `language_choices`.
- **Feature** (Shelter of the Faithful, etc.) — *not represented mechanically*; display-only in the detail popup. Correct — these are DM-adjudicated, never a stat. Intentionally manual.
- **Personality traits / ideals / bonds / flaws** — surfaced as optional suggestion pickers (SetupScreen2 `SuggestTextarea`); free text otherwise. Roleplay only, no stat impact. Intentionally manual.
- **Overlap with class skill picks** — app *attempts* to honor the no-double-grant rule by excluding background-granted skills from the class picker (SetupScreen3) and the class skill cap on the sheet (ProficienciesBlock), but the exclusion is heuristic because proficiency *source* isn't stored (BUG-29 family).
- **2024 ASI + Origin feat** — *not represented* (no data, no field).

### What It Rolls & How the Roll Resolves

**Static — a background rolls nothing itself.** It is a one-time grant of proficiencies/languages/equipment plus roleplay text. The only dice associated with backgrounds in RAW are the d8 *suggestion tables* (roll a trait/ideal/bond/flaw), which this app exposes as click-to-pick suggestion lists rather than rolls (SetupScreen2.tsx:78-152). Granted skill proficiencies later feed normal d20 skill checks via the dice engine, but that resolution belongs to the Skills subsystem, not here.

### How This App Handles It

**Data shape** (`src/types/data.ts:294-308`): `Background` = `{ name, slug, description, skill_proficiencies: string[], tool_proficiencies: string[], languages: string[], language_choices: number, feature: {name, description}, starting_equipment: string[], personality_traits/ideals/bonds/flaws: string[] }`. No ASI/feat field (2014-only model).

**Skill parsing** (`src/lib/characterSetup.ts:177-217`, `parseBackgroundSkills`): splits the `skill_proficiencies` prose list into `{ fixed: SkillName[], choice: { count, options } | null }`. `toSkillName` (line 143) maps plain names; anything else is a choice clause — `\btwo\b` → count 2 else 1; explicit skill names pulled by regex, or ability-scoped clauses expanded to all skills governed by a named ability (via `SKILL_ABILITY_MAP`). Fixed grants are removed from the option set; counts sum and options union across clauses. Verified correct against all 7 choice backgrounds and covered by `src/lib/backgroundSkills.test.ts`.

**Creation wizard:**
- SetupScreen2.tsx:49-58 — background selection; selecting resets `languageProficiencies` and `backgroundSkillChoices`.
- SetupScreen3.tsx:57-69 — renders fixed background skills read-only, choice skills as a "choose N" picker; class skill options exclude `[...bgSkills, ...backgroundSkillChoices]` (BUG-27 fix).
- SetupScreen3.tsx:77-80, 284-288 — tools = union of class + background tool strings, shown as display-only text.
- SetupScreen3.tsx:73, 291-343 — languages: only `bg.language_choices` drives a picker; race languages shown for reference.
- `draftToNewCharacter` (characterSetup.ts:744-753) bakes fixed + validated choice background skills into `skillProficiencies`; tools (832-838) union class + background + manual tool strings; **languages (759-760) = race languages ∪ chosen languages only — `bg.languages` fixed grants are NOT merged**; starting equipment (827-830) merges `bg.starting_equipment`.

**Sheet-side background change** (`src/pages/CharacterPage.tsx:401-443`, `BackgroundPromptDialog`): re-parses skills via `parseBackgroundSkills`, applies fixed + chosen skills, and merges `currentLanguages ∪ background.languages ∪ selectedLangs` (line 441) — here `background.languages` IS merged (asymmetric with the wizard), including literal `"None"` and prose strings.

**Sheet cap exclusion** (`src/components/sheet/ProficienciesBlock.tsx:144,173-178`): `backgroundSkills` (computed by `backgroundGrantedSkills`, characterSetup.ts:227-239, via useDerivedSheet.ts:68) are excluded from `currentClassSkillCount` so background grants don't eat class picks (BUG-29 fix). Because source isn't stored, `backgroundGrantedSkills` infers background grants from *which choice options are currently proficient* (documented INV-9 limitation).

### Gaps & Mis-Handling

- **Creation wizard silently drops fixed background languages** — `draftToNewCharacter` omits `bg.languages`, so Clan Crafter (Dwarvish) / Rune Carver (Giant) created via the wizard lose their granted language. The sheet-side dialog applies them; the wizard does not. (discrepancy: wizard-drops-fixed-bg-languages)
- **Sheet-side `BackgroundPromptDialog` injects junk languages** — line 441 merges raw `background.languages`, so "None"-language backgrounds add a literal language "None", and `feylost` / `haunted-one` add their full prose sentence as a "language". (discrepancy: sheet-bg-language-junk)
- **Tool category/choice prose stored as fake proficiency** — 23 of 48 backgrounds express tools as choices ("one type of gaming set", "Disguise kit or one type of musical instrument"); these are stored verbatim as tool-proficiency names with no picker. (discrepancy: bg-tool-choice-not-parsed)
- **`feylost` language choice never offered** — prose lives in `languages` but `language_choices: 0`, so the wizard offers no picker; the character gets nothing for a slot RAW says is a choice. (discrepancy: feylost-language-choice-missing)
- **Skill-source ambiguity** — `backgroundGrantedSkills` infers grants from proficient options, so a class+background overlap on a choice skill can be miscounted against the class cap. Already logged (BUG-29 family / INV-9). (discrepancy: bg-skill-source-inference)
- **2024 backgrounds (ASI + Origin feat) unrepresentable** — no data or fields. Out of current scope but a genuine rules-coverage gap if 2024 content is ever added. (discrepancy: no-2024-background-asi-feat)
- **Background feature is display-only** — *not a bug*; features (Shelter of the Faithful, etc.) are DM-adjudicated social abilities with no stat. Intentionally manual.

#### Sourced rule facts (2014 RAW, web-verified)

- Every character has a background. A background gives a character concrete benefits (mechanical proficiencies, languages, a starting-equipment package, and a special feature) plus roleplaying suggestions (suggested personality traits, ideals, bonds, and flaws). — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/personality-and-background)
- Each background gives a character proficiency in exactly two skills. — [src](https://5thsrd.org/character/backgrounds/)
- Most backgrounds give a character proficiency with one or more tools, but the number of tool proficiencies varies by background and some backgrounds grant none. — [src](https://5thsrd.org/character/backgrounds/)
- Some backgrounds also allow characters to learn additional languages beyond those given by race. The number of languages is not universal — it is specified per background, and some backgrounds grant none. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/personality-and-background)
- Each background provides a package of starting equipment. If you use the optional rule to spend coin on gear (Starting Wealth by Class), you do NOT receive the starting equipment from your background. — [src](https://www.5esrd.com/backgrounds/)
- Each background includes a special Feature that grants a narrative or minor mechanical benefit. The Acolyte's feature is 'Shelter of the Faithful'. — [src](https://dnd5e.wikidot.com/background:acolyte)
- Duplicate-proficiency rule: If a character would gain the same proficiency from two different sources, they may choose a different proficiency of the same kind (skill or tool) instead. — [src](https://5thsrd.org/character/backgrounds/)
- Customizing a Background (official variant rule): you can replace the background's feature with any other background's feature, choose any two skills in place of the background's two, and choose a total of two tool proficiencies or languages from the sample backgrounds. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/personality-and-background)
- Each background includes Suggested Characteristics: tables to choose (or randomly roll) two personality traits, one ideal, one bond, and one flaw. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/personality-and-background)
- A character has exactly one background, chosen at 1st-level character creation, and it is not changed or re-granted by gaining levels or by multiclassing. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/personality-and-background)

#### Key tables

**Acolyte Background (the only SRD 5.1 background) — full mechanical entry** — [src](https://5thsrd.org/character/backgrounds/)

```
Skill Proficiencies: Insight, Religion
Tool Proficiencies: None
Languages: Two of your choice
Equipment: A holy symbol, a prayer book or prayer wheel, 5 sticks of incense, vestments, a set of common clothes, and a pouch containing 15 gp
Feature: Shelter of the Faithful
```

**Standard 2014 backgrounds and what each grants (skills / tools / languages) — PHB; only Acolyte is SRD** — [src](https://www.aidedd.org/dnd-filters/backgrounds.php)

```
Acolyte — Skills: Insight, Religion | Tools: none | Languages: 2 of choice
Charlatan — Skills: Deception, Sleight of Hand | Tools: disguise kit, forgery kit | Languages: none
Criminal/Spy — Skills: Deception, Stealth | Tools: one gaming set, thieves' tools | Languages: none
Entertainer — Skills: Acrobatics, Performance | Tools: disguise kit, one musical instrument | Languages: none
Folk Hero — Skills: Animal Handling, Survival | Tools: one artisan's tools, vehicles (land) | Languages: none
Guild Artisan — Skills: Insight, Persuasion | Tools: one artisan's tools | Languages: 1 of choice
Hermit — Skills: Medicine, Religion | Tools: herbalism kit | Languages: 1 of choice
Noble — Skills: History, Persuasion | Tools: one gaming set | Languages: 1 of choice
Outlander — Skills: Athletics, Survival | Tools: one musical instrument | Languages: 1 of choice
Sage — Skills: Arcana, History | Tools: none | Languages: 2 of choice
Sailor — Skills: Athletics, Perception | Tools: navigator's tools, vehicles (water) | Languages: none
Soldier — Skills: Athletics, Intimidation | Tools: one gaming set, vehicles (land) | Languages: none
Urchin — Skills: Sleight of Hand, Stealth | Tools: disguise kit, thieves' tools | Languages: none
```

**Acolyte Suggested Characteristics — selection counts (not the flavor text)** — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/personality-and-background)

```
Personality Traits: choose/roll 2 (d8 table)
Ideals: choose/roll 1 (d6 table)
Bonds: choose/roll 1 (d6 table)
Flaws: choose/roll 1 (d6 table)
```

#### 2024 deltas (not canonical here)

- 2024: Backgrounds now grant ABILITY SCORE INCREASES. Each background lists three ability scores; you either increase one by 2 and another by 1, or increase all three by 1 (3 total points). In 2014 ability bonuses came from race/species, NOT background — backgrounds gave zero ability bonus.
- 2024: Each background grants an ORIGIN FEAT at 1st level (e.g. Acolyte grants the Magic Initiate feat). This replaces the 2014 narrative 'background feature' (Shelter of the Faithful and the like no longer exist as background features). In 2014 the first feat was not available until 4th level (and only as an Ability Score Improvement trade-off).
- 2024: A background grants proficiency in TWO specified skills (no longer 'choose any two' by default) and proficiency in exactly ONE specified tool (or a Tool Proficiency choice). Tool/skill picks are pinned to the background rather than the flexible 2014 lists.
- 2024: The Player's Handbook presents 16 backgrounds (Acolyte, Artisan, Charlatan, Criminal, Entertainer, Farmer, Guard, Guide, Hermit, Merchant, Noble, Sage, Sailor, Scribe, Soldier, Wayfarer), versus the 13 standard 2014 PHB backgrounds.
- 2024: Backgrounds no longer grant bonus languages directly; languages in 2024 come from the species/origin (you know Common plus a number of other languages). The 'two languages of your choice' style grant on 2014 Acolyte/Sage is gone.
- 2024: Customization is reframed — when using a 2014 background under 2024 rules, you select which three ability points to assign and, if the background lacks a feat, you take an Origin feat of your choice. The 2014 'replace one feature, any two skills, two tools-or-languages' customization toolkit is superseded.
- 2024: Backgrounds still provide a starting-equipment package, but you may instead take a flat amount of gold pieces specified by the background to buy your own gear (the gold option is now defined per background rather than via a separate Starting Wealth by Class table).

---

<a id="s15"></a>

## Feats

### The Rule (5e RAW)

A **feat** is an optional rule (PHB 165; default-on in many tables, baseline in the 2024 PHB) that a character may take **in place of an Ability Score Improvement (ASI)**. Standard ASI levels for almost every class are 4, 8, 12, 16, 19, with Fighter adding 6 and 14 and Rogue adding 10. At each such slot the player chooses *either* +2 to one ability / +1 to two abilities (cap 20) *or* one feat.

Two access points exist outside the normal ASI cadence:
- **Variant Human (2014)** gains one feat at level 1 (plus +1 to two abilities and one skill proficiency).
- **2024 PHB** grants an "Origin feat" from the background at level 1 and a feat at each ASI level.

Feat structure:
- **Full feats** (e.g. Lucky, Sentinel, Great Weapon Master, Tough) grant only a benefit, no ability bump.
- **Half-feats** grant **+1 to one ability** (often a choice among a small pool) **AND** a benefit. Examples: Resilient (+1 to an ability + proficiency in that ability's saving throw), Skill Expert (+1 to any ability + one skill proficiency + expertise in one proficient skill), Observant (+1 INT or WIS + always-on +5 passive Perception and Investigation in 2014), Moderately/Heavily/Lightly Armored, Crusher, Telekinetic, Fey/Shadow Touched, Prodigy (skill + tool + language + expertise).

**Prerequisites** gate some feats — minimum ability score (e.g. Heavily Armored requires medium-armor proficiency; Grappler requires STR 13), level ("4th level"), proficiency (light/medium/heavy armor; a martial weapon), race (Dragonborn, Elf, etc.), spellcasting ("the ability to cast at least one spell", "Pact Magic feature"), a prerequisite feat (feat chains, e.g. Strike of the Giants variants), or a background (2024 Knight of Solamnia). A character cannot select a feat whose prerequisites are unmet. Feats are not normally repeatable unless the feat says so.

A 20-cap applies to the ability bonus a half-feat grants: if the ability is already 20, the +1 does nothing.

### What Modifies It (increases / decreases)

Feats are a *source* of modifications rather than a value that is itself modified. Every benefit a feat can grant, and how this app treats it:

- **+1 ability (half-feat, fixed)** — e.g. Heavily Armored (+1 STR). *Auto-applied at derive (cap 20).*
- **+1 ability (half-feat, choice from a pool)** — e.g. Resilient, Skill Expert, Crusher. *Auto-applied at derive once the player picks; picker exists in setup, level-up, and FeatsBlock.*
- **Saving-throw proficiency** — Resilient (`save_proficiency: asi_choice`). *Auto-applied at derive (`featDerivedSaves`).*
- **Skill proficiency** — Skilled (3), Skill Expert (1), Prodigy (1) (`skill_proficiency: count`). *Auto-applied at derive ONLY when added via FeatsBlock or LevelUpDialog (those collect `skillChoices`); SILENTLY DROPPED when taken in the creation wizard (see Gaps).*
- **Expertise** — Skill Expert, Prodigy (`expertise`). *Same as above: applied from FeatsBlock/LevelUp, dropped at creation.*
- **Max HP** — Tough (+2/level). *Auto-applied at derive via the separate `FEAT_EFFECTS` registry, not the data effects array.*
- **Passive Perception / Investigation** — Observant (+5 each, 2014). *Auto-applied at derive via `FEAT_EFFECTS`.*
- **Speed** — e.g. Squat Nimbleness, Mobile (`speed`). *Auto-applied at derive (`featSpeedBonus`). No feat in the current data ships a `speed` effect, but the channel exists.*
- **Initiative** — Alert (+5, `initiative`). *Channel auto-applied at derive (`featInitiativeBonus`); current Alert data does not carry the effect, so it is presently not represented numerically.*
- **Advantage on saves/skills** — War Caster (CON conc.), Actor (Deception/Performance). *Approximated via `FEAT_ADVANTAGES` and surfaced as a roll-advantage toggle; broadly applied, player adjudicates.*
- **Situational / active combat feats** — Lucky, Great Weapon Master, Sharpshooter, Sentinel, Polearm Master, Crossbow Expert, War Caster (somatic), Magic Initiate (extra spells), Healer, Inspiring Leader, Mage Slayer. *Intentionally NOT auto-applied — they depend on per-roll choices, DM adjudication, or add resources the sheet does not model. The player applies them manually.*

### What It Rolls & How the Roll Resolves

A feat itself rolls nothing; it changes the inputs to other rolls. The numeric effects fold into the relevant derived stat, then the normal roll for that stat applies:
- Ability bumps change ability modifiers → every check/save/attack using that ability.
- A save-proficiency grant adds the proficiency bonus to that save (d20 + ability mod + PB).
- Skill proficiency/expertise adds PB (×2 for expertise) to the skill roll.
- Tough is a static max-HP delta; Observant a static passive-score delta.
- Advantage feats flip the relevant roll to roll-twice-keep-higher via the tristate `RollKind.advantage`.

### How This App Handles It

Storage records **choices only** (INV-1). `character.feats: string[]` holds feat slugs; `character.featChoices: Record<slug, { asiAbility?, skillChoices?, expertiseSkill? }>` holds per-feat picks (`src/types/character.ts:119-124`). No feat-derived stat is ever baked into a stored field.

**Three write surfaces:**
- **Creation wizard** — `SetupScreen1.tsx` renders one ASI/feat slot per class ASI level (`getAllAsiSlots`, `characterSetup.ts:443-459`). The feat branch renders ONLY the choice-ASI picker (`SetupScreen1.tsx:655-680`). `draftToNewCharacter` writes `featChoices[slug] = { asiAbility }` or `{}` (`characterSetup.ts:692-707`, `810-813`) — no skill/expertise capture. The local `SetupFeatChoices` type is `Record<string, { asiAbility? }>` only (`characterSetup.ts:486`).
- **LevelUpDialog** — at an ASI level, `asiMode` toggles ASI vs Feat; the feat branch collects `featAsiChoice`, `featSkillChoices`, `featExpertiseChoice` and writes them into `featChoices` (`LevelUpDialog.tsx:226-243`). Stat effects are explicitly NOT baked (comment at `:240-241`).
- **FeatsBlock** — sheet-time add/remove. `getNextPhase` sequences asi → skill → expertise pickers (`FeatsBlock.tsx:179-185`); `finalizeFeat` writes `feats` + `featChoices` (+ a one-way `currentHp` bump for HP feats, BUG-57 fix, `:218-224`); `removeFeat` prunes both and clamps `currentHp` down (`:272-286`). A "+ Custom" path stores a homebrew `FeatData` and pushes its slug (`:289-294`).

**Derivation (single application point, `characterStats.ts`):**
- `computeFeatStatDelta` (`:86-113`) turns a feat's `effects` into `{ abilities, speed, initiativeBonus, saveProficiency }` using `featChoices[slug].asiAbility` for choice ASIs and `asi_choice` saves.
- `deriveCharacterStats` loops `character.feats` and applies ability deltas with a 20-cap (`:730-733`), accumulates feat speed/initiative (`:734-735`), pushes feat saves into `effectiveSaveProficiencies` (`:736-738`, `797-800`), and merges feat skill proficiency/expertise picks into `effectiveSkillProficiencies` + `featSkillGrants` (`:754-774`).
- The separate `FEAT_EFFECTS` registry (`:67-70`) supplies Tough's `maxHpBonus` (`:934-937`, `954`) and Observant's passive bonuses (`:823-829`). This is intentionally distinct from the data-driven `effects` array.
- Advantage feats are mapped in `FEAT_ADVANTAGES` (`:137-140`) and unioned by `getCharacterAdvantages` (`:202-230`) into `derived.advantages`.

**Prerequisites:** `meetsFeatPrerequisite` (`characterStats.ts:255-329`) evaluates ability/level/proficiency/race/spellcasting/feat-chain/background prereqs against a `FeatPrereqContext` built from ALL class records (INV-2) and effective abilities. FeatsBlock has its OWN duplicate `meetsPrereq` (`FeatsBlock.tsx:68-110`) that is correct for multiclass (uses `character.classes`). Prereq failure is a soft **warning** ("Req. not met" / "Req not met") in the picker, never a hard block.

### Gaps & Mis-Handling

- **Half-feat skill/expertise benefit is silently dropped when the feat is taken in the creation wizard.** The wizard collects only `asiAbility` for a feat slot; Skilled, Skill Expert, and Prodigy lose their skill proficiencies/expertise entirely at character creation, while the same feat taken later via FeatsBlock works. (Discrepancy `wizard-halffeat-skill-dropped`.)
- **Alert's +5 initiative is not represented** because the `alert` feat ships no `initiative` effect in the data and is not in `FEAT_EFFECTS`. The derive channel (`featInitiativeBonus`) exists but receives nothing. (Discrepancy `alert-initiative-missing`.)
- **Observant's +1 passive bonus to Investigation/Perception is hardcoded to +5 in `FEAT_EFFECTS` regardless of feat edition.** The 2024 Observant grants only +2 passive (and only Perception) plus Quick Search; the registry over-credits +5 to both for the 2024 entry. Treated as low severity since the shipped data is 2014-style. (Discrepancy `observant-2024-passive`.)
- Variant Human's level-1 feat (and its bonus skill) is **not modeled** — the trait text is informational only and no feat slot is generated at L1. This is a known structural gap, logged below, not a numeric mis-computation.
- Situational/active feats (Lucky, GWM, Sharpshooter, Sentinel, Polearm Master, Magic Initiate, War Caster somatic) are intentionally manual — correctly NOT flagged as bugs.

#### Sourced rule facts (2014 RAW, web-verified)

- Feats are an OPTIONAL rule in 2014 5e. 'A feat represents a talent or an area of expertise that gives a character special capabilities. It embodies training, experience, and abilities beyond what a class provides.' A character gains feats only if the DM uses the optional feats rule. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options)
- A character gains a feat by FORGOING an Ability Score Improvement: 'At certain levels, your class gives you the Ability Score Improvement feature. Using the optional feats rule, you can forgo taking that feature to take a feat of your choice instead.' Taking a feat means you give up the +2/+1+1 ability bump from that ASI (unless the feat itself is a half-feat granting +1). — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options)
- 'You can take each feat only once, unless the feat's description says otherwise.' — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options)
- 'You must meet any prerequisite specified in a feat to take that feat. If you ever lose a feat's prerequisite, you can't use that feat until you regain the prerequisite.' — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options)
- GRAPPLER is the ONLY feat included in the SRD 5.1 / 2014 Basic Rules. Every other named 5e feat (Alert, Lucky, Sharpshooter, Great Weapon Master, War Caster, Sentinel, Polearm Master, etc.) is from the Player's Handbook and is NOT Open Game Content / NOT in the SRD. — [src](https://www.5esrd.com/feats/)
- GRAPPLER feat (2014). Prerequisite: Strength 13 or higher. Benefits: (1) 'You have advantage on attack rolls against a creature you are grappling.' (2) 'You can use your action to try to pin a creature grappled by you. To do so, make another grapple check. If you succeed, you and the creature are both restrained until the grapple ends.' — [src](https://5thsrd.com/General_Rules/feats/)
- The 2014 printed Grappler also lists a (functionally inert) bullet: 'You can use your action to try to pin a creature grappled by you...' plus an erroneous reference to creatures one/two sizes larger that points to a dropped grappling rule. Jeremy Crawford has stated this bullet refers to a rule that no longer exists and should be disregarded. — [src](https://www.enworld.org/threads/grappler-feat-and-being-restrained-open-discussion.673380/)
- The Ability Score Improvement (ASI) class feature lets you increase one ability score by 2, OR two different ability scores by 1 each. You can't increase an ability score above 20 using this feature. If the DM uses the optional feat rule, you may take a feat instead of the ASI. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options)
- Most classes gain the ASI feature at character levels 4, 8, 12, 16, and 19. Fighter gains TWO extra ASIs (at levels 6 and 14, so 4/6/8/12/14/16/19). Rogue gains ONE extra ASI (at level 10, so 4/8/10/12/16/19). Each of these is a slot where a feat may be taken instead. — [src](https://arcaneeye.com/mechanic-overview/ability-score-improvement-5e/)
- VARIANT HUMAN (PHB 2014) is the canonical way to gain a feat at 1ST LEVEL: it replaces the standard Human's +1-to-all trait with: +1 to two different ability scores of your choice, proficiency in one skill of your choice, AND one feat of your choice. This is the only core-rules path to a feat before level 4. — [src](https://dnd5e.wikidot.com/lineage:human-variant)
- HALF-FEATS are PHB-2014 feats that grant a +1 ability score increase (to a chosen score, up to 20) IN ADDITION to other benefits. They partially offset the opportunity cost of skipping an ASI. There is no rule in 2014 letting you take two half-feats in place of one ASI — that is a popular Tasha's/optional-rule house mechanic, not RAW PHB. — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options)
- RESILIENT (half-feat, no prerequisite): increase one ability score of your choice by 1 (max 20), and gain proficiency in saving throws using that ability. This bundles an ability bump with a save proficiency in a single choice. — [src](https://dnd5e.wikidot.com/feat:resilient)
- Several PHB-2014 feats have ABILITY-SCORE prerequisites that must be checked against BASE+derived scores: Grappler (Str 13), Defensive Duelist (Dex 13), Tavern Brawler (no min, but is a half-feat for Str or Con), and various others. Armor-proficiency feats (Heavily Armored, Moderately Armored) require already having the lower tier of armor proficiency. — [src](https://dnd5e.wikidot.com/feat:resilient)
- PHB-2014 half-feats and the ability score(s) each can raise: Actor (+1 Cha), Athlete (+1 Str or Dex), Durable (+1 Con), Heavily Armored (+1 Str), Heavy Armor Master (+1 Str), Keen Mind (+1 Int), Lightly Armored (+1 Str or Dex), Linguist (+1 Int), Moderately Armored (+1 Str or Dex), Observant (+1 Int or Wis), Resilient (+1 chosen ability), Tavern Brawler (+1 Str or Con), Weapon Master (+1 Str or Dex). — [src](https://assortedmeeples.com/5e-half-feat-list-guide)
- Feats that grant proficiencies, skills, or fighting capabilities (full feats, e.g. Alert, Lucky, Mobile, Sentinel, Sharpshooter, Great Weapon Master, Polearm Master, War Caster) grant NO ability score increase at all. Choosing them means flatly giving up the +2/+1+1 from that ASI. — [src](https://www.5esrd.com/feats/)

#### Key tables

**Feat / ASI slot levels by class (2014)** — [src](https://arcaneeye.com/mechanic-overview/ability-score-improvement-5e/)

```
Class level at which each class gains an Ability Score Improvement (= a slot where a feat may be taken instead):

| Class | ASI / feat slot levels | Total slots by L20 |
|---|---|---|
| Barbarian, Bard, Cleric, Druid, Monk, Paladin, Ranger, Sorcerer, Warlock, Wizard | 4, 8, 12, 16, 19 | 5 |
| Fighter | 4, 6, 8, 12, 14, 16, 19 | 7 |
| Rogue | 4, 8, 10, 12, 16, 19 | 6 |

Multiclass note: each slot is granted by the SPECIFIC class at that class level, not by total character level. A character with Fighter 4 / Wizard 4 has TWO slots (one from each class's level 4), not a slot at character level 4 and 8.
```

**Ability Score Improvement allocation rules (2014)** — [src](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/customization-options)

```
When you take the ASI feature (instead of a feat):

| Option | Effect | Cap |
|---|---|---|
| +2 to one ability | one chosen score +2 | cannot exceed 20 |
| +1 to two abilities | two different chosen scores +1 each | cannot exceed 20 |

Half-feat +1 grants follow the same 'maximum of 20' cap. The cap also applies to racial ASIs applied at character creation.
```

**PHB-2014 half-feats (ability granted)** — [src](https://assortedmeeples.com/5e-half-feat-list-guide)

```
| Feat | Ability +1 | Prerequisite |
|---|---|---|
| Actor | Cha | — |
| Athlete | Str OR Dex | — |
| Durable | Con | — |
| Heavily Armored | Str | Prof. with medium armor |
| Heavy Armor Master | Str | Prof. with heavy armor |
| Keen Mind | Int | — |
| Lightly Armored | Str OR Dex | — |
| Linguist | Int | — |
| Moderately Armored | Str OR Dex | Prof. with light armor |
| Observant | Int OR Wis | — |
| Resilient | chosen ability | — (also grants save prof. in that ability) |
| Tavern Brawler | Str OR Con | — |
| Weapon Master | Str OR Dex | — |

All +1s are capped at 20. Every other PHB-2014 feat is a FULL feat granting no ability increase. (Skill Expert, Fey Touched, Telekinetic, Eldritch Adept, etc. are post-PHB / Tasha's half-feats, NOT in this PHB-2014 set.)
```

**Grappler feat — full text (2014, the only SRD feat)** — [src](https://5thsrd.com/General_Rules/feats/)

```
GRAPPLER
Prerequisite: Strength 13 or higher

You've developed the skills necessary to hold your own in close-quarters grappling. You gain the following benefits:
- You have advantage on attack rolls against a creature you are grappling.
- You can use your action to try to pin a creature grappled by you. To do so, make another grapple check. If you succeed, you and the creature are both restrained until the grapple ends.

(Note: a third bullet in the printed PHB referenced a dropped grappling-size rule; official errata/Sage Advice treats it as nonfunctional. Only the two benefits above apply.)
```

#### 2024 deltas (not canonical here)

- 2024 makes feats a CORE, non-optional part of every character: your Background grants an Origin feat at level 1, and the ASI class feature is replaced by 'Ability Score Improvement feat or another feat for which you qualify.' Feats are no longer an opt-in variant rule.
- 2024 sorts feats into FOUR CATEGORIES: Origin (granted by background at L1, no ability increase), General (require Level 4+, most grant an ability increase as part of the feat), Fighting Style (only for classes with the Fighting Style feature), and Epic Boon (Level 19+).
- 2024 ELIMINATES the 2014 'feat OR ability increase' tradeoff for General feats: most General feats now bundle a +1 ability increase into the feat itself, so you get both a feat benefit and a stat bump from one slot. The 'half-feat' concept is effectively the new default.
- 2024 General feats carry an explicit 'Level 4+' prerequisite (a character-level gate) in addition to any ability/proficiency prerequisites. 2014 feats had no general minimum level (other than the natural level-4 first-ASI), so Variant Human could take any qualifying feat at level 1.
- 2024 introduces REPEATABLE feats (e.g., Ability Score Improvement, several Epic Boons) — 'you can take it only once unless its description says otherwise,' and more 2024 feats say otherwise. 2014 had essentially no repeatable PHB feats.
- 2024 Epic Boons (Level 19+) can raise an ability score above 20 — up to a maximum of 30 — whereas in 2014 nothing in the core feat/ASI system could exceed 20.
- 2024 GRAPPLER was rewritten: Prerequisite Strength or Dexterity 13+; it grants advantage on attacks vs a creature you have grappled, lets you move a grappled creature without the speed-halving penalty, and (key change) once per turn when you hit with an Unarmed Strike as part of the Attack action you can deal damage AND grapple. The grapple/pin contest in 2024 grappling uses a saving throw (Str or Dex vs your Unarmed Strike DC), not the 2014 athletics contest.
- 2024 Variant Human / origin model is gone: there is no 'Variant Human' — every character gets a level-1 Origin feat from their background regardless of species, and species no longer grant ability score increases (ability increases moved to backgrounds).

---

<a id="s16"></a>

## Class/Subclass Features & Resource Pools

### The Rule (5e RAW)
Class and subclass levels grant two broad kinds of mechanics this subsystem must model:

**A. Selectable feature choices** — the class hands you a menu and you pick N options, the count scaling with that class's level:
- **Fighting Style** (Fighter L1, Champion 2nd style L10, Paladin/Ranger L2): pick 1 (Archery, Defense, Dueling, Great Weapon Fighting, Two-Weapon Fighting, Protection, etc.). Several are passive flat bonuses.
- **Battle Master Maneuvers** (Fighter): know 3 / 5 / 7 / 9 at L3 / 7 / 10 / 15.
- **Eldritch Invocations** (Warlock): 2 / 3 / 4 / 5 / 6 / 7 / 8 at L2 / 5 / 7 / 9 / 12 / 15 / 18.
- **Metamagic** (Sorcerer): 2 / 3 / 4 at L3 / 10 / 17.
- **Infusions Known** (Artificer): 4 / 6 / 8 / 10 / 12 at L2 / 6 / 10 / 14 / 18.
- **Arcane Shots** (Arcane Archer): 2 / 3 / 4 / 5 / 6 at L3 / 7 / 10 / 15 / 18.
- **Pact Boon, Totem options, Draconic Ancestry, Elemental Disciplines, Runes** — fixed/scaling picks.
- **Subclass spells, Expertise, Pact-of-the-X, Channel Divinity options** — class-feature choices in RAW.

**B. Resource pools** — limited-use counters that refresh on a short or long rest, the count scaling with the OWNING class's level:
- **Rage** (Barbarian): 2/3/4/5/6 uses by level; long rest. Rage damage +2/+3/+4 by level.
- **Ki / Focus Points** (Monk): = monk level; short or long rest.
- **Sorcery Points** (Sorcerer): = sorcerer level (from L2); long rest.
- **Superiority Dice** (Battle Master): 4 / 5 / 6 dice at L3 / 7 / 15; die size **d8 → d10 (L10) → d12 (L18)**; short or long rest.
- **Bardic Inspiration** (Bard): = CHA mod uses; die d6→d8→d10→d12 by level; long rest (short rest from L5 with Font of Inspiration).
- **Channel Divinity** (Cleric/Paladin): 1 use (Cleric 2/L6, 3/L18); short or long rest.
- **Wild Shape** (Druid): 2 uses; short or long rest.
- **Action Surge** (Fighter): 1 use (2 at L17); short or long rest. **Second Wind**: 1 use, 1d10+level, short/long rest. **Indomitable**: 1/2/3 uses at L9/13/17, long rest.
- **Lay on Hands** (Paladin): pool of 5 × paladin level HP; long rest.
- **Arcane Shot uses** (Arcane Archer): 2, recharge on short rest (regain 1 on initiative if empty).

The owning-class scaling is critical in multiclassing: a Fighter 5 / Barbarian 3 has 5 fighter levels' worth of fighter features and 3 barbarian levels' worth of Rage, never the total of 8 for either.

### What Modifies It (increases / decreases)
- **Class/subclass level** raises known-counts and pool sizes — **auto-derived** by `knownCount`/`resourceCount` from `owningClassLevel` (`classFeatures.ts:38-63`), scaling on the owning class only (INV-2).
- **Defense fighting style** → +1 AC while wearing armor — **auto-applied** (`computeFeatureEffects` → `featureFx.acArmored`, characterStats.ts:925).
- **Archery fighting style** → +2 to-hit with ranged weapons — **auto-applied** into the weapon roll (`computeFeatureWeaponBonus` → `computeWeaponBonus`, EquipmentBlock.tsx:291).
- **Dueling fighting style** → +2 damage with a one-handed melee weapon — **auto-applied** (same path; "no other weapon in the other hand" clause approximated as "melee, not Two-Handed").
- **Great Weapon Fighting / Two-Weapon Fighting / Protection** styles — **not represented** (no `effects` in data; GWF is a reroll, TWF needs an off-hand attack concept, Protection is reactive — intentionally manual).
- **Rage damage, Martial Arts die, Sneak Attack dice, Channel Divinity DC, etc.** — **not represented** as numeric modifiers; players add them manually.
- Resource pools (Rage, Ki, Sorcery Points, Bardic Inspiration, Channel Divinity, Wild Shape, Action Surge, Second Wind, Indomitable, Lay on Hands) — **not represented** at all; only Superiority Dice and Arcane Shot have a tracker.

### What It Rolls & How the Roll Resolves
- Most feature **choices** are static (no roll) until used in another subsystem (a maneuver adds a superiority die to an attack; metamagic spends sorcery points).
- The two passive numeric styles feed rolls: **Archery** adds +2 to the d20 attack total; **Dueling** adds +2 to the damage total (both fold into `computeWeaponBonus`, and crit doubling of dice is unaffected since they are flat).
- **Superiority Dice / Arcane Shot** are pure usage counters — clicking a pip toggles spent/available; no roll is performed by the tracker. The die size shown ("d8") is informational text, not rolled by the app.

### How This App Handles It
Store → derive → render:
- **Choices stored** in `character.classFeatureChoices` (group key → option slugs) and resource usage in `character.featureResourcesUsed` (group key → count spent) — choices/usage only, never stat results (`character.ts:127-134`, INV-1).
- **Data** lives in `public/data/class-features.json`, 16 groups keyed `class[:subclass]:feature`, compiled by `build-data.js` (validates `resource`, resolves `optionsRef` pools).
- **Helpers** (`classFeatures.ts`): `owningClassLevel` walks `character.classes[]` and matches subclass (lines 14-34); `knownCount` (38-48) and `resourceCount` (52-63) take the highest step at/below the owning level; `applicableGroups` (144-158) lists every group the character has unlocked.
- **Render** (`FeaturesBlock.tsx`): renders each applicable group with a `{selected}/{known}` counter (soft cap — over-limit allowed and flagged red, homebrew, lines 195-204), a picker with soft prereq warnings (`meetsFeatureOptionPrereqs`), and a pip tracker for groups that carry a `resource` (lines 208-235). `setResourceUsed` (124-129) writes `featureResourcesUsed`. A read-only "earned features" roll-up (`collectEarnedFeatures`, 33-71) lists every class/subclass feature by name.
- **Effects** (`characterStats.ts`): `computeFeatureEffects` (638-663) accumulates AC and weapon effects from chosen options across all applicable groups; `featureFx.acArmored/acUnarmored/acAlways` apply at AC computation (922-930); `featureWeaponEffects` are applied per-weapon in `computeFeatureWeaponBonus` (671-692). This is the single render-time application point (INV-1), parallel to item effects.
- **No rest mechanism exists** anywhere — `featureResourcesUsed`, `spellSlotsUsed`, and item `chargesUsed` are all manual (the user clicks pips back). This is consistent across the app, not specific to features.

### Gaps & Mis-Handling
- Major class resource pools (Rage, Ki, Sorcery Points, Bardic Inspiration, Channel Divinity, Wild Shape, Action Surge, Second Wind, Indomitable, Lay on Hands) have no resource data and no tracker — the app silently provides nothing for the headline resource of 6+ classes.
- Whole classes (Bard, Cleric, Druid, Rogue, Wizard, Blood Hunter) have zero feature-choice groups, so their feature menus (Expertise picks aside, which live elsewhere) and resources are entirely absent from the Features block.
- Superiority Dice die size is fixed at d8 in data and never scales to d10/d12 — a displayed-but-wrong value.
- The stale `data.ts:343` comment ("recorded + displayed in v1, not yet folded into rolls") no longer matches reality — Archery/Dueling ARE in rolls now. Documentation drift, not a behavior bug.

#### Sourced rule facts (2014 RAW, web-verified)

- Barbarian Rage is entered as a bonus action on your turn and lasts 1 minute. While raging you have advantage on Strength checks and Strength saving throws, gain a bonus to melee weapon damage rolls made using Strength (the Rage Damage column), and have resistance to bludgeoning, piercing, and slashing damage. Rage ends early if you are knocked unconscious or if your turn ends and you haven't attacked a hostile creature since your last turn or taken damage since then; you can also end it on your turn as a bonus action. — [src](https://5thsrd.org/character/classes/barbarian/)
- A Barbarian has a fixed number of Rages per long rest by level: 2 (lvls 1-2), 3 (3-5), 4 (6-11), 5 (12-15), 6 (17-19). Once all rages are used, the barbarian must finish a long rest before raging again. At 20th level (Primal Champion) rages become Unlimited. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/barbarian/)
- A Monk has Ki points equal to their monk level, available from 2nd level (2 points at lvl 2 up to 20 points at lvl 20; 1st level has no ki). Spent ki points return when you finish a short OR long rest, provided you spend at least 30 minutes of the rest meditating. Ki save DC = 8 + proficiency bonus + Wisdom modifier. — [src](https://5thsrd.org/character/classes/monk/)
- Sorcerer gains Sorcery Points from 2nd level (Font of Magic) equal to their sorcerer level (2 at lvl 2 up to 20 at lvl 20; 1st level has none). All spent sorcery points are regained when you finish a long rest. — [src](https://5thsrd.org/character/classes/sorcerer/)
- Sorcerer Flexible Casting: as a bonus action you can transmute sorcery points into a spell slot. Costs: 1st-level slot = 2 SP, 2nd = 3 SP, 3rd = 5 SP, 4th = 6 SP, 5th = 7 SP. The table tops out at 5th level — you cannot create a slot of 6th level or higher. Conversely, as a bonus action you can expend one spell slot to gain sorcery points equal to the slot's level. — [src](https://5thsrd.org/character/classes/sorcerer/)
- Fighter Second Wind (1st level): a bonus action to regain 1d10 + fighter level hit points. Recovers on a short OR long rest. — [src](https://5thsrd.org/character/classes/fighter/)
- Fighter Action Surge (2nd level): once on your turn you can take one additional action. Recovers on a short OR long rest. Starting at 17th level you can use it twice per rest, but only once on the same turn. — [src](https://5thsrd.org/character/classes/fighter/)
- Fighter Indomitable (9th level): reroll a failed saving throw (must use the new roll). Usable once per long rest, increasing to twice at 13th level and three times at 17th level. Recovers on a LONG rest only. — [src](https://5thsrd.org/character/classes/fighter/)
- Battle Master (Martial Archetype) Combat Superiority: you have 4 superiority dice (d8s) at 3rd level, gaining a 5th at 7th level and a 6th at 15th level. The dice become d10s at 10th level and d12s at 18th level. Maneuver save DC = 8 + proficiency bonus + Strength or Dexterity modifier (your choice). You regain all expended superiority dice when you finish a short OR long rest. — [src](https://dnd5e.wikidot.com/fighter:battle-master)
- Bardic Inspiration (1st level): a bonus action to give one creature (other than yourself) within 60 feet a Bardic Inspiration die. The creature can, within the next 10 minutes, add it to one ability check, attack roll, or saving throw. Uses = Charisma modifier (minimum 1). Die size scales: d6 (1st), d8 (5th), d10 (10th), d12 (15th). — [src](https://5thsrd.org/character/classes/bard/)
- Bard Bardic Inspiration recovery: at 1st level you regain expended uses when you finish a LONG rest. At 5th level, the Font of Inspiration feature changes this so you regain all expended uses when you finish a SHORT or long rest. — [src](https://5thsrd.org/character/classes/bard/)
- Cleric Channel Divinity (2nd level): you gain one use, increasing to two uses at 6th level and three uses at 18th level. You regain expended uses when you finish a short OR long rest. The save DC for Channel Divinity effects equals your cleric spell save DC (8 + proficiency bonus + Wisdom modifier). — [src](https://5thsrd.org/character/classes/cleric/)
- Paladin Channel Divinity (3rd level) grants one use; you must finish a short OR long rest to use it again. Divine Sense uses = 1 + Charisma modifier (long-rest recovery). Lay on Hands is a pool of hit points equal to paladin level x 5, replenished on a long rest; curing one disease or neutralizing one poison costs 5 points from the pool. — [src](https://5thsrd.org/character/classes/paladin/)
- Warlock Pact Magic: you have a small number of spell slots that are all the same level. Slot count: 1 (lvl 1), 2 (lvls 2-10), 3 (lvls 11-16), 4 (lvls 17-20). Slot level: 1st (lvls 1-2), 2nd (3-4), 3rd (5-6), 4th (7-8), 5th (9-20). You regain all expended Pact Magic spell slots when you finish a short OR long rest. — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/warlock/)
- Warlock/Multiclass Pact Magic interaction: Pact Magic slots are kept SEPARATE from spell slots gained via the Spellcasting feature (the multiclass spellcaster table). Warlock levels are NOT added into the multiclass spellcaster level used to determine the shared slot table. However, you may use Pact Magic slots to cast spells known/prepared from Spellcasting classes and vice versa. — [src](https://5thsrd.org/rules/multiclassing/)
- Wizard Arcane Recovery (1st level): once per day when you finish a SHORT rest, recover expended spell slots with a combined level equal to or less than half your wizard level (rounded up), and none of the recovered slots can be 6th level or higher. — [src](https://5thsrd.org/character/classes/wizard/)
- Druid Wild Shape (2nd level): you can use it twice; you regain expended uses when you finish a short OR long rest. You can stay transformed for a number of hours equal to half your druid level (rounded down). — [src](https://5thsrd.org/character/classes/druid/)
- Short rest: at least 1 hour. At the end you can spend Hit Dice (up to your maximum = character level), rolling each die + Constitution modifier to regain hit points. Hit Dice are NOT refreshed by a short rest — only spent. — [src](https://5thsrd.org/adventuring/resting/)
- Long rest: at least 8 hours. At the end you regain all lost hit points and regain spent Hit Dice up to a number equal to half your total number of Hit Dice (minimum of one die). A character can't benefit from more than one long rest in a 24-hour period. — [src](https://5thsrd.org/adventuring/resting/)
- Cleric Divine Intervention (10th level): use your action and roll percentile dice; if you roll equal to or lower than your cleric level, the intervention succeeds. On success you can't use it again for 7 days; on failure you can use it again after a long rest. At 20th level it succeeds automatically. — [src](https://5thsrd.org/character/classes/cleric/)
- Ranger (SRD) has NO ki-like or points resource pool. It is a half-caster using standard known-spell spellcasting with spell slots that recover on a long rest. Features like Primeval Awareness expend a ranger spell slot rather than drawing on a dedicated pool. — [src](https://5thsrd.org/character/classes/ranger/)

#### Key tables

**Barbarian Rages & Rage Damage by Level (2014)** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/barbarian/)

```
Level | Rages | Rage Damage
1 | 2 | +2
2 | 2 | +2
3 | 3 | +2
4 | 3 | +2
5 | 3 | +2
6 | 4 | +2
7 | 4 | +2
8 | 4 | +2
9 | 4 | +3
10 | 4 | +3
11 | 4 | +3
12 | 5 | +3
13 | 5 | +3
14 | 5 | +3
15 | 5 | +3
16 | 5 | +4
17 | 6 | +4
18 | 6 | +4
19 | 6 | +4
20 | Unlimited | +4
```

**Monk Ki Points & Martial Arts Die by Level (2014)** — [src](https://5thsrd.org/character/classes/monk/)

```
Ki points = monk level, from level 2.
Level | Ki Points | Martial Arts Die | Unarmored Movement
1 | 0 | 1d4 | -
2 | 2 | 1d4 | +10 ft
3 | 3 | 1d4 | +10 ft
4 | 4 | 1d4 | +10 ft
5 | 5 | 1d6 | +10 ft
6 | 6 | 1d6 | +15 ft
7 | 7 | 1d6 | +15 ft
8 | 8 | 1d6 | +15 ft
9 | 9 | 1d6 | +15 ft
10 | 10 | 1d6 | +20 ft
11 | 11 | 1d8 | +20 ft
12 | 12 | 1d8 | +20 ft
13 | 13 | 1d8 | +20 ft
14 | 14 | 1d8 | +25 ft
15 | 15 | 1d8 | +25 ft
16 | 16 | 1d8 | +25 ft
17 | 17 | 1d10 | +25 ft
18 | 18 | 1d10 | +30 ft
19 | 19 | 1d10 | +30 ft
20 | 20 | 1d10 | +30 ft
Ki save DC = 8 + proficiency bonus + Wisdom modifier. Recovers on short OR long rest.
```

**Sorcerer Flexible Casting — Sorcery Point cost to create a spell slot (2014)** — [src](https://5thsrd.org/character/classes/sorcerer/)

```
Spell Slot Level | Sorcery Point Cost
1st | 2
2nd | 3
3rd | 5
4th | 6
5th | 7
(No slot of 6th level or higher can be created.)
Reverse: expend a spell slot (bonus action) to gain Sorcery Points equal to the slot's level.
Sorcery Points pool = sorcerer level, from level 2; recovers on a long rest.
```

**Warlock Pact Magic — Spell Slots & Slot Level by Level (2014)** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/classes/warlock/)

```
Level | Spell Slots | Slot Level
1 | 1 | 1st
2 | 2 | 1st
3 | 2 | 2nd
4 | 2 | 2nd
5 | 2 | 3rd
6 | 2 | 3rd
7 | 2 | 4th
8 | 2 | 4th
9 | 2 | 5th
10 | 2 | 5th
11 | 3 | 5th
12 | 3 | 5th
13 | 3 | 5th
14 | 3 | 5th
15 | 3 | 5th
16 | 3 | 5th
17 | 4 | 5th
18 | 4 | 5th
19 | 4 | 5th
20 | 4 | 5th
All slots are the SAME level (the Slot Level above) and recover on a SHORT or long rest. Mystic Arcanum (lvls 11/13/15/17 = 6th/7th/8th/9th-level spells) are cast once per LONG rest without a slot.
```

**Battle Master Superiority Dice by Fighter Level (2014, PHB — not in SRD)** — [src](https://dnd5e.wikidot.com/fighter:battle-master)

```
Fighter Level | # Superiority Dice | Die Size
3 | 4 | d8
4 | 4 | d8
5 | 4 | d8
6 | 4 | d8
7 | 5 | d8
8 | 5 | d8
9 | 5 | d8
10 | 5 | d10
11 | 5 | d10
12 | 5 | d10
13 | 5 | d10
14 | 5 | d10
15 | 6 | d10
16 | 6 | d10
17 | 6 | d10
18 | 6 | d12
19 | 6 | d12
20 | 6 | d12
Maneuver save DC = 8 + proficiency bonus + Strength or Dexterity modifier (choice). Recovers on a SHORT or long rest. NOTE: Battle Master is not part of SRD 5.1 (SRD Fighter = Champion archetype only).
```

**Per-rest recovery cheat-sheet for resource pools (2014)** — [src](https://5thsrd.org/adventuring/resting/)

```
Resource | Pool size | Recovers on
Barbarian Rage | 2-6 (Unlimited at 20) | Long rest only
Monk Ki | = monk level | Short or long rest
Sorcery Points | = sorcerer level | Long rest only
Fighter Second Wind | 1 | Short or long rest
Fighter Action Surge | 1 (2 at lvl 17) | Short or long rest
Fighter Indomitable | 1/2/3 (lvl 9/13/17) | Long rest only
Battle Master Superiority Dice | 4/5/6 | Short or long rest
Bardic Inspiration | CHA mod (min 1) | Long rest (lvls 1-4); short or long (lvl 5+)
Cleric Channel Divinity | 1/2/3 (lvl 2/6/18) | Short or long rest
Paladin Channel Divinity | 1 | Short or long rest
Paladin Divine Sense | 1 + CHA mod | Long rest
Paladin Lay on Hands | level x 5 HP | Long rest
Druid Wild Shape | 2 | Short or long rest
Wizard Arcane Recovery | ceil(level/2) slot-levels | 1/day, on a short rest
Druid Natural Recovery | ceil(level/2) slot-levels | 1/day, on a short rest
Warlock Pact Magic slots | 1-4 | Short or long rest
Warlock Mystic Arcanum | 1 each (6th-9th) | Long rest
Hit Dice | = total level | Half (floor, min 1) per long rest
```

#### 2024 deltas (not canonical here)

- 2024 Rage: now lasts up to 10 minutes (not 1 minute) and no longer requires attacking/taking damage each turn — you maintain it each round by making an attack roll, forcing a save, OR spending a bonus action. It still ends if you don Heavy Armor or are Incapacitated. Critically, you now regain ONE expended Rage on a SHORT rest (all on a long rest), whereas 2014 rages recover only on a long rest.
- 2024 Rage damage bonus progression is the same shape (+2 lvls 1-8, +3 lvls 9-16, +4 lvls 17-20), but rage count is unchanged conceptually (2-6); the short-rest recovery is the behavioral change.
- 2024 Monk: Ki Points are renamed Focus Points (pool size still = monk level, short-rest recovery), and several monk features were rebalanced (e.g., Stunning Strike nerf, monk weapons reworked, Martial Arts die tied to a 'Martial Arts' table). Treat 'Ki' and 'Focus' as the same resource type for sheet purposes.
- 2024 Bardic Inspiration: the die now lasts 1 HOUR (not 10 minutes) and is used reactively — typically after you see a d20 roll — and an unused expended die can be reclaimed by the bard in some 2024 wording. Font of Inspiration (short-or-long-rest recovery) still arrives at 5th level. Action to grant is still a bonus action.
- 2024 Channel Divinity (Cleric): you now get TWO uses at 2nd level (vs one in 2014), scaling to 3 at 6th and 4 at 18th, and you regain ONE expended use on a short rest plus all on a long rest. 2014 gave 1/2/3 uses at lvls 2/6/18, full recovery on any short or long rest.
- 2024 generally moves many fixed per-rest features to 'uses equal to Proficiency Bonus' (e.g., several class/feat abilities), and standardizes 'regain one use on a short rest, all on a long rest' phrasing for big pools — a sheet hard-coding 2014 counts will undercount these.
- 2024 Warlock Pact Magic still recovers on a short OR long rest and slots are still all the same level; the slot table is broadly unchanged. Multiclassing still keeps Pact Magic slots separate from the multiclass spellcaster slot table.
- 2024 Weapon Mastery is a NEW resource-adjacent system (per-weapon mastery properties) granted to martial classes; it has no 2014 equivalent and is not a points pool but will appear as a class feature an app must surface.

---

<a id="s17"></a>

## Items, Tools, Attunement & Currency

### The Rule (5e RAW)

**Magic items & attunement.** Most magic items work the moment you wield/wear them; some require **attunement** (a short rest spent focused on the item) to grant their benefits. A creature can be **attuned to at most 3 magic items at once**, and cannot attune to more than one copy of an item. An attunement-required item gives **no benefit** to a non-attuned holder. When attunement ends (item >100 ft away for 24h, item attunes to someone else, the wearer dies, or you voluntarily end it on a short rest), the benefits stop. A non-attunement item that grants a passive bonus (e.g. +1 armor, Ring of Protection is actually attune) generally functions while **worn/wielded**.

**Magic-item numeric bonuses.** Items grant flat bonuses or set values to a wide range of statistics: AC (Ring of Protection +1, +X armor/shields, Bracers of Defense while unarmored), saving throws (Ring/Cloak of Protection +1 all saves, Stone of Good Luck +1), ability scores (Amulet of Health → CON 19, Headband of Intellect → INT 19, Gauntlets of Ogre Power → STR 19, Belt of Giant Strength → STR 21–29 — these **set** the score and never lower it; can exceed 20), skills, speed, max HP, damage, resistances/immunities. **Item ability-score setters/bonuses are NOT capped at 20** (unlike ASIs).

**Tools.** Being **proficient with a tool** lets you add your **proficiency bonus** to any **ability check** you make using that tool. The governing ability varies by task and is chosen by the DM (e.g. Thieves' Tools checks are usually DEX; a forgery check with a forgery kit is INT/DEX). Expertise (Rogue/Bard) can double the bonus on certain tool sets.

**Currency.** Standard exchange: 10 cp = 1 sp, 10 sp = 1 gp (so 100 cp = 1 gp), 2 ep = 1 gp (1 ep = 5 sp = 50 cp), 10 gp = 1 pp. Coins weigh 0.02 lb each (50 coins = 1 lb).

**Weight / encumbrance.** Carrying capacity = STR × 15 lb. **Variant encumbrance** (optional): >5×STR = encumbered (−10 ft speed), >10×STR = heavily encumbered (−20 ft, disadvantage). **Heavy-armor STR requirement (not variant, core):** wearing heavy armor whose listed STR you don't meet reduces speed by 10 ft.

**Containers.** A Bag of Holding (and kin: Handy Haversack, Portable Hole, etc.) holds far more than its size/weight suggests (e.g. Bag of Holding: up to 500 lb / 64 cubic ft, but the bag itself always weighs 15 lb). They can hold loose coins and items.

**Charges.** Limited-use items (Wand of Magic Missiles, Pearl of Power, Rod of the Pact Keeper) track charges that recharge (typically at dawn). A usage tracker, not a passive stat.

### What Modifies It (increases / decreases)

- **AC** — Ring/Cloak of Protection (+1 all, attune), magic armor/shield `bonus`, Bracers of Defense (unarmored), Robe of the Archmagi (sets unarmored base 15) — **auto-applied** via `ItemEffect` while active; Fighting Style Defense (+1 armored) auto-applied; manual `armorClass` stepper is the unarmored fallback.
- **Saving throws** — Ring/Cloak of Protection, Stone of Good Luck, +X save items (`save` effect, `ability:'all'` supported) — **auto-applied**.
- **Ability scores** — Amulet of Health, Headband of Intellect, Gauntlets/Belt of Giant Str (`ability_set`, uncapped via `Math.max`), additive `ability_bonus` — **auto-applied uncapped**.
- **Skills** — Boots/Cloak of Elvenkind etc. give **advantage** (registry, applied broadly); flat skill bonuses via `skill` effect — **auto-applied**.
- **Speed / Initiative** — `speed`/`initiative` item effects — **auto-applied**.
- **Max HP** — `max_hp` (flat + perLevel) e.g. Amulet of the Devout-style — **auto-applied**; Tough/Dwarven Toughness from feat/subrace registries — **auto-applied**.
- **Damage** — flat `damage` effect (added to weapon + unarmed), weapon-specific `damage_dice` rider (Flame Tongue +2d6) — **auto-applied while active**.
- **Resistances/Immunities** — `resistance`/`immunity` effects (Brooch of Shielding, Periapt of Proof Against Poison) — **auto-applied, read-only display**.
- **Spell attack / save DC** — spell-focus items (`spell_attack`/`spell_save_dc`), manual `spellBonusModifier` — **auto-applied / manual**.
- **Tool checks** — proficiency bonus per RAW — **NOT represented** (no tool-check roll exists; see Gaps).
- **Heavy-armor speed penalty** (STR below requirement) — **NOT represented**.
- **Encumbrance / carrying capacity** — **NOT represented** (intentional; weight is display-only).

### What It Rolls & How the Roll Resolves

Items/attunement/currency are **static values, no roll** — they modify pre-computed stats. The downstream consumers roll: a magic weapon's `bonus` and item `damage` feed `computeWeaponBonus` → the attack d20 + damage dice in `DiceRollModal`; item save/skill bonuses feed `saveModifiers`/`skillModifiers` → d20 rolls in `useDiceStore.roll`. Charges and currency never roll. **Tool checks have no roll dispatch path at all.**

### How This App Handles It

Store → derive → render:

- **Stored (choices only):** `EquipmentItem.attuned`/`equipped` flags, `chargesUsed`, `baseWeapon`/`baseArmor`, `containerId`, per-bag `currency`; character `currency`, `toolProficiencies`, `customWeapons/customArmor/customItems/customTools`. No resulting stat is baked (INV-1).
- **Derive (`computeActiveItemEffects`, characterStats.ts:485-582):** builds `byName` map of catalog `effects` + `requiresAttunement` (characterStats.ts:500-510); for each owned item, `active = requiresAttunement ? attuned : equipped` (characterStats.ts:516); accumulates every `ItemEffect` variant. `ability_set` = `Math.max(existing, value)` **uncapped** (characterStats.ts:548, 783-785); `ability_bonus` additive uncapped (544, 780-782). Worn-armor AC at characterStats.ts:854-897 gates on `equipped || attuned`. Resistances/immunities deduped+lowercased (531-534).
- **Render — EquipmentBlock.tsx:** `isActive` (983-985), `requiresAttunementFor` (971-980), attune cap **warning only** at :1298-1302 (`attunedCount > 3`). `toggleActive` (1099-1125) flips the gate, exclusively unwears the same armor slot, prompts for variable base. Active items pulled into the **Loadout** block (1011, 1285+); `summarizeItemEffects` (characterStats.ts:589-620) shows a one-line effect summary.
- **Tools — ToolsSection.tsx:** pure read/write of `toolProficiencies` (string[]); class-granted tools tagged "class" (53, 90-94). No derive tier; never enters any roll.
- **Currency — currency.ts:** `COIN_VALUES_CP` (pp 1000 / gp 100 / ep 50 / sp 10 / cp 1), `condenseCurrency` folds EP into the total and re-emits pp/gp/sp/cp. EquipmentBlock currency block (1451-1491) + `ValueAdjustModal`.
- **Containers — containers.ts + ContainerInventoryDialog.tsx:** `isContainerName`/`isCoinContainer` (exact-name set), `contentsOf` filters by `containerId`; per-bag coin pouch (`container.currency`), deposit/withdraw between person and bag (160-174). Bagged items hidden from main sections via `!e.containerId` (EquipmentBlock onPerson, 1007) and forced inactive on move-in (1056, 138-140).
- **Charges — ChargesTracker (EquipmentBlock 165-208):** pip UI on `chargesUsed`; pure usage tracker, never enters `deriveCharacterStats`.

### Gaps & Mis-Handling

- **Tool proficiency adds no bonus to any check (structural).** `toolProficiencies` is stored and displayed but there is no `tool` RollKind (dice.ts:18-25) and no consumer adds proficiency bonus for a tool check. A Thieves' Tools check rolls as a plain DEX ability check with no PB.
- **Attunement cap is advisory, not enforced.** A 4th attune-required item can be attuned; all 4 sets of effects apply simultaneously. RAW caps the benefit at 3.
- **Heavy-armor STR-requirement speed penalty not applied.** `strength_requirement` is display-only; no −10 ft speed when STR is below it.
- **Encumbrance/carrying capacity intentionally not represented** (weight strings never parsed) — noted as intentional-manual, not a discrepancy.
- **Container weight/capacity not modeled** — Bag of Holding capacity, 15-lb self-weight, and the "overfilling destroys it" rule are flavor-only. Intentional given no weight system.

#### Sourced rule facts (2014 RAW, web-verified)

- Currency: D&D 5e uses five coin types — copper piece (cp), silver piece (sp), electrum piece (ep), gold piece (gp), and platinum piece (pp). The three most common are gp, sp, and cp; ep and pp are described as originating from fallen empires and lost kingdoms and may arouse suspicion in transactions. — [src](https://5thsrd.org/adventuring/equipment/coins/)
- Currency conversion: 1 gp = 10 sp; 1 sp = 10 cp; 1 ep = 5 sp (= 1/2 gp); 1 pp = 10 gp. Therefore 1 gp = 100 cp = 10 sp = 2 ep = 1/10 pp. — [src](https://5thsrd.org/adventuring/equipment/coins/)
- Coin weight: a standard coin weighs about a third of an ounce, so fifty (50) coins weigh one pound. This applies equally to all coin types regardless of denomination. — [src](https://5thsrd.org/adventuring/equipment/coins/)
- Tool proficiency: proficiency with a tool allows you to add your proficiency bonus to any ability check you make using that tool. Tool use is not tied to a single ability — proficiency represents broader knowledge of its use, so the governing ability is set by context/DM, not fixed. — [src](https://dnd5e.wikidot.com/tools)
- Each type of artisan's tools, gaming set, and musical instrument requires a SEPARATE proficiency. Proficiency with one (e.g. smith's tools) does not grant proficiency with another (e.g. tinker's tools). — [src](https://dnd5e.wikidot.com/tools)
- A bard can use a musical instrument as a spellcasting focus. (This is the only tool-type that doubles as a spell focus in the core rules.) — [src](https://dnd5e.wikidot.com/tools)
- Attunement: some magic items require a creature to form a bond — attunement — before their magical properties can be used. Attuning requires the creature to spend a short rest focused on only that item while being in physical contact with it (this can't be the same short rest used to learn the item's properties). The focus can take the form of weapon practice (weapon), meditation (wondrous item), or other appropriate activity. — [src](https://dnd5e.info/magic-items/)
- Attunement limit: an item can be attuned to only one creature at a time, and a creature can be attuned to NO MORE THAN THREE magic items at a time. Any attempt to attune to a fourth fails; the creature must end an existing attunement first. — [src](https://dnd5e.info/magic-items/)
- A creature can't attune to more than one copy of the same item (e.g. cannot attune to two rings of protection at once). — [src](https://dnd5e.info/magic-items/)
- Attunement prerequisites: an item may have a prerequisite to attune (e.g. be a member of a class, a particular race, or have a minimum ability). If the prerequisite is to be a spellcaster, a creature qualifies if it can cast at least one spell using its traits or features — NOT using a magic item or the like. — [src](https://dnd5e.info/magic-items/)
- Ending attunement: a creature's attunement ends if it no longer satisfies the prerequisites, if the item has been more than 100 feet away for at least 24 hours, if the creature dies, or if another creature attunes to the item. A creature can also voluntarily end attunement by spending another short rest focused on the item — UNLESS the item is cursed. — [src](https://dnd5e.info/magic-items/)
- Wearing and wielding limits: a character can't normally wear more than one pair of footwear, one pair of gloves or gauntlets, one pair of bracers, one suit of armor, one item of headwear, and one cloak. Items that come in pairs (boots, bracers, gauntlets, gloves) impart their benefits only if both items of the pair are worn. — [src](https://www.dandwiki.com/wiki/5e_SRD:Magic_Items)
- Identifying a magic item: a creature can determine a magic item's properties (other than a curse) by focusing on the item during a short rest while in physical contact with it. The identify spell instantly reveals an item's properties and number of remaining charges. Most identification methods do not reveal curses. — [src](https://dnd5e.info/magic-items/)
- Magic items are grouped into five rarities — common, uncommon, rare, very rare, and legendary. Rarity indicates a general tier of power/availability and is INDEPENDENT of whether an item requires attunement; an item of any rarity may or may not require attunement. — [src](https://dnd5e.info/magic-items/magic-items-by-rarity/)

#### Key tables

**Standard Currency Exchange Rate (2014 SRD)** — [src](https://5thsrd.org/adventuring/equipment/coins/)

```
Conversion of a coin's value into other denominations (read row = how many of the column coin it equals):

| Coin | CP | SP | EP | GP | PP |
|------|----|----|----|----|----|
| Copper (cp) | 1 | 1/10 | 1/50 | 1/100 | 1/1,000 |
| Silver (sp) | 10 | 1 | 1/5 | 1/10 | 1/100 |
| Electrum (ep) | 50 | 5 | 1 | 1/2 | 1/20 |
| Gold (gp) | 100 | 10 | 2 | 1 | 1/10 |
| Platinum (pp) | 1,000 | 100 | 20 | 10 | 1 |

Key relations: 1 gp = 10 sp = 100 cp = 2 ep = 1/10 pp; 1 ep = 5 sp = 1/2 gp; 1 pp = 10 gp. Coin weight: 50 coins = 1 lb (any type).
```

**Tools Table — Artisan's Tools (cost / weight)** — [src](https://www.5esrd.com/equipment/tools/)

```
Each requires a separate proficiency.

| Tool | Cost | Weight |
|------|------|--------|
| Alchemist's supplies | 50 gp | 8 lb |
| Brewer's supplies | 20 gp | 9 lb |
| Calligrapher's supplies | 10 gp | 5 lb |
| Carpenter's tools | 8 gp | 6 lb |
| Cartographer's tools | 15 gp | 6 lb |
| Cobbler's tools | 5 gp | 5 lb |
| Cook's utensils | 1 gp | 8 lb |
| Glassblower's tools | 30 gp | 5 lb |
| Jeweler's tools | 25 gp | 2 lb |
| Leatherworker's tools | 5 gp | 5 lb |
| Mason's tools | 10 gp | 8 lb |
| Painter's supplies | 10 gp | 5 lb |
| Potter's tools | 10 gp | 3 lb |
| Smith's tools | 20 gp | 8 lb |
| Tinker's tools | 50 gp | 10 lb |
| Weaver's tools | 1 gp | 5 lb |
| Woodcarver's tools | 1 gp | 5 lb |
```

**Tools Table — Gaming Sets, Musical Instruments & Kits (cost / weight)** — [src](https://dnd5e.wikidot.com/tools)

```
Each gaming set and each musical instrument requires a separate proficiency. A bard can use a musical instrument as a spellcasting focus.

| Tool | Cost | Weight |
|------|------|--------|
| Dice set | 1 sp | — |
| Dragonchess set | 1 gp | 1/2 lb |
| Playing card set | 5 sp | — |
| Three-Dragon Ante set | 1 gp | — |
| Bagpipes | 30 gp | 6 lb |
| Drum | 6 gp | 3 lb |
| Dulcimer | 25 gp | 10 lb |
| Flute | 2 gp | 1 lb |
| Lute | 35 gp | 2 lb |
| Lyre | 30 gp | 2 lb |
| Horn | 3 gp | 2 lb |
| Pan flute | 12 gp | 2 lb |
| Shawm | 2 gp | 1 lb |
| Viol | 30 gp | 1 lb |
| Disguise kit | 25 gp | 3 lb |
| Forgery kit | 15 gp | 5 lb |
| Herbalism kit | 5 gp | 3 lb |
| Navigator's tools | 25 gp | 2 lb |
| Poisoner's kit | 50 gp | 2 lb |
| Thieves' tools | 25 gp | 1 lb |
```

**Attunement — Core Rules Summary** — [src](https://dnd5e.info/magic-items/)

```
| Rule | Detail |
|------|--------|
| Max attuned items | 3 per creature (base) |
| Attune action | One short rest in physical contact, focused only on that item (can't be same rest used to identify it) |
| One creature per item | An item attunes to only one creature at a time |
| No duplicate copies | Can't attune to two copies of the same item |
| Spellcaster prereq | Qualifies only if it can cast ≥1 spell via its own traits/features (not via a magic item) |
| Ends if | Prereq lost; item >100 ft away ≥24 hrs; creature dies; another creature attunes; or voluntary short rest (unless cursed) |
| Identify vs attune | Separate short rests; curses are not revealed by normal identification
```

**Wearing & Wielding Slot Limits** — [src](https://www.dandwiki.com/wiki/5e_SRD:Magic_Items)

```
A character can't normally wear more than ONE of each of the following at once:

| Slot | Limit |
|------|-------|
| Footwear | 1 pair |
| Gloves / gauntlets | 1 pair |
| Bracers | 1 pair |
| Armor | 1 suit |
| Headwear | 1 item |
| Cloak | 1 |

Paired items (boots, bracers, gauntlets, gloves) grant their benefit only if BOTH of the pair are worn. (Rings are not slot-limited by this rule, but two of the same attuned item still can't both function — see attunement.)
```

#### 2024 deltas (not canonical here)

- Currency (2024): The four standard coins are cp, sp, gp, and pp. Electrum (ep) is no longer presented as a standard coin in the 2024 Player's Handbook currency table — it is demoted to a historical/optional curiosity rather than removed entirely. cp/sp/gp/pp conversion rates and the 50-coins-per-pound weight are unchanged. (Sources: rpgbot 2024 change log; dnd2024 wikidot currency.) An app targeting 2024 may hide ep from the default coin set, but the 2 ep = 1 gp math still applies if electrum is used.
- Tools (2024): If you have proficiency with a tool, you add your proficiency bonus to checks using it (unchanged); NEW — if you also have proficiency in the relevant SKILL for that check, you gain ADVANTAGE on the check. This skill+tool synergy is a 2024 addition not present in 2014.
- Tools (2024): 'Tool expertise' as a special case is removed/reworked — the 2014 Rogue Expertise-in-thieves'-tools and Artificer level-6 expertise-with-all-tools mechanics are gone in 2024; tools are no longer treated like skills for Expertise purposes. Tools are now integral to the reworked crafting system.
- Attunement (2024): The 3-item maximum, short-rest attunement, and physical-contact requirements are retained. The short rest used to attune still cannot be the same short rest used to learn the item's properties, and an interrupted short rest fails the attempt (now stated explicitly).
- Magic items (2024): The Rogue 'Use Magic Device' feature no longer ignores item restrictions (e.g. class requirements). Instead it grants an EXTRA attunement slot (raising that rogue's effective cap above 3), a chance not to expend charges, and the ability to use spell scrolls.
- Magic items (2024): Wands were reworked — many can be used by anyone and do NOT require attunement, making them broadly usable (a change from several 2014 wands that required attunement and/or a spellcaster).
- Identify (2024): Identifying remains possible via a short rest in physical contact (revealing properties but not curses) or the identify spell; identify can be cast as a ritual by a class that has it prepared. Crafting/identification now ties more tightly into the reworked tool/crafting rules.

---

<a id="s18"></a>

## Dice Engine, Advantage/Disadvantage & Real-Time Play

### The Rule (5e RAW)

**The d20 test.** Every attack roll, ability check, and saving throw is a *d20 test*: roll one d20, add all applicable modifiers (ability modifier, proficiency bonus if proficient, plus situational bonuses), and compare the total to a target number — a DC for checks/saves, the target's AC for attacks. Meeting or exceeding the target succeeds.

**Advantage / Disadvantage.** When a rule grants *advantage*, you roll **two d20s and keep the higher**. With *disadvantage*, you roll two d20s and keep the **lower**. Critical interactions:
- Advantage/disadvantage **does not stack**: no matter how many sources grant advantage, you still roll only 2d20 (you never roll 3+ and keep the best). Same for disadvantage.
- If you have **at least one source of advantage and at least one of disadvantage, they cancel** — you roll a single d20 normally — *regardless of the count* on either side (one of each cancels just as completely as three-vs-one).
- Modifiers (proficiency, ability mod, bonuses) apply to whichever die you keep; they are not doubled.

**Critical hits & fumbles (attack rolls only).** A natural 20 on an attack roll is a **critical hit**: it hits regardless of the target's AC, and you **roll all of the attack's damage dice twice** (double the *dice*, not the flat modifiers — a 1d8+3 longsword crit is 2d8+3, not 2d8+6). A natural 1 on an attack roll **always misses** regardless of modifiers. Nat 20 / nat 1 auto-success/-failure is RAW for *attack rolls only*; for ability checks and saving throws it is an optional rule, not RAW. When rolling 2d20 for adv/dis, the **kept** die determines whether you scored a natural 20 or 1.

**Inspiration.** Heroic Inspiration is a binary resource. When you have it, you may spend it to gain **advantage on one d20 test** of your choice (decided after seeing the situation, before rolling), then it is consumed.

**Spending hit dice.** During a short rest you spend hit dice; each rolls the class's hit die + CON modifier to regain HP — a straight die roll (no advantage, no crit).

### What Modifies It (increases / decreases)

Sources that grant **advantage** on a d20 test:
- Class/race features — Fey Ancestry vs charm, Dwarven Resilience vs poison, Brave vs fear, Gnome Cunning vs magic, Magic Resistance — **partially auto-applied** via hardcoded `RACE_ADVANTAGES`/`SUBRACE_ADVANTAGES` (`characterStats.ts:143-165`) for *built-in* race slugs only; Reckless Attack is **not represented**.
- Feats — War Caster (CON concentration saves), Actor (Deception/Performance) — **auto-applied** via `FEAT_ADVANTAGES` (`characterStats.ts:137-140`).
- Magic items — Boots/Cloak of Elvenkind (Stealth), Rod of Alertness (Perception), Platinum Scarf (all saves) — **auto-applied** via `ITEM_ADV_ENTRIES` name-match (`characterStats.ts:167-200`).
- Inspiration — RAW grants advantage; **not represented** as advantage (stored boolean only).
- Spells/conditions (Faerie Fire, Guiding Bolt, restrained target, help action, flanking) — **not represented** (situational, DM-adjudicated — intentionally manual).

Sources that impose **disadvantage**:
- Heavy-armor Stealth disadvantage — tracked as a *display string* (`hasStealthDisadvantage`, `characterStats.ts:851/877`) but **never fed into the roll's tristate**.
- Exhaustion, poisoned, frightened, prone (ranged), long range, restrained — **not represented** (situational — intentionally manual).

Sources that modify **damage on a crit**: crit doubles dice (auto-applied); Brutal Critical / Savage Attacks extra die — **not represented**.

### What It Rolls & How the Roll Resolves

- **d20 test:** `d20 + modifier`. The modifier is pre-computed by the deriver per roll type (`skillModifiers`, `saveModifiers`, `abilityModifier(effectiveAbilities[ability])`, or a caller-supplied attack modifier).
- **Advantage tristate:** `advantage===true` → roll 2d20, keep `max`; `===false` → roll 2d20, keep `min`; `undefined` → roll 1d20. The kept value is `result.natural`, the dropped is `result.natural2`.
- **Crit/fumble:** detected on `result.natural === 20 / === 1` (the kept die). Nat 20 on an attack auto-advances the modal to a doubled-dice damage roll; nat 1 shows "Critical Miss" and offers only Close.
- **Crit damage:** `rollDamageGroups(groups, crit)` doubles every die *count*, leaving the flat `damageBonus` un-doubled (`damage.ts:65-71`; `DiceRollModal.tsx:16-25`).

### How This App Handles It

Store → derive → render path:

1. **`rollDie(sides)`** (`dice.ts:4-8`) uses `crypto.getRandomValues(Uint32Array(1))` then `% sides + 1` — returns 1..sides.
2. **`deriveCharacterStats`** computes `derived.advantages = getCharacterAdvantages(character)` (`characterStats.ts:950`) → two `Set`s: `advantages.saves` and `advantages.skills`, merging feat + race + subrace + item entries (`characterStats.ts:202-229`).
3. **ProficienciesBlock** reads `derived.advantages.saves.has(ability)` / `.skills.has(skill)` into `hasAdv`, dispatching `{ type: 'save'|'skill', advantage: hasAdv || undefined }` (`ProficienciesBlock.tsx:285,315-316,341,392-393`). `RollButton` shows "(Adv)" when truthy.
4. **`useDiceStore.roll`** (`store/dice.ts:78-107`) reads the tristate via `'advantage' in kind && kind.advantage===true/false`, rolls a second d20 only when adv or dis is present, keeps max/min accordingly (`:80-84`). `RollKind.advantage` is the INV-11 tristate (`types/dice.ts:20-22`).
5. **`useRollDispatch.dispatch`** (`useRollDispatch.ts:10-27`) is the single dispatch point: rolls, then for `attack` opens the two-phase modal with `isCrit = entry.result.natural === 20`.
6. **`DiceRollModal`** renders three phases — `result`, `hit` (to-hit → nat20 auto-advances to "Roll Damage (2×)", nat1 shows Critical Miss + Close), `damage`. Crit doubling applied in `rollDamage`/`rollModalDamage`.
7. **`inspiration`** is a stored boolean toggled in CombatBlock (`CombatBlock.tsx:449`); never read by any roll path.

Auto-derived: skill/save advantage from feats/built-in-races/named-items; crit dice doubling. Manual: which roll inspiration applies to; all situational adv/dis; attack-roll advantage entirely.

### Gaps & Mis-Handling

- **Attack rolls can never be rolled with advantage or disadvantage** — the `attack` RollKind variant (`types/dice.ts:23`) has no `advantage` field and every dispatch omits it.
- **Disadvantage is structurally unreachable** — nothing ever sets `advantage:false`; heavy-armor Stealth disadvantage is display-only; RAW adv+dis cancellation can't occur.
- **Inspiration grants nothing mechanically** — a decorative dot with no link to any roll.
- **`rollDie` modulo bias** for non-power-of-two dice is ~1 part in 10⁹ — noted in bugs.md, *not* flagged here.

#### Sourced rule facts (2014 RAW, web-verified)

- The core resolution mechanic is the d20 roll: roll a d20, add the relevant modifier(s), and compare the total to a target number (a Difficulty Class for ability checks/saves, or Armor Class for attack rolls). If the total equals or exceeds the target number, the roll succeeds. — [src](https://www.5esrd.com/using-ability-scores/)
- An ability modifier is derived from the ability score by subtracting 10 and dividing by 2, rounding DOWN. Round-down applies to the division result, including negative scores. — [src](https://www.5esrd.com/using-ability-scores/)
- With ADVANTAGE you roll a second d20 and use the higher of the two rolls; with DISADVANTAGE you roll a second d20 and use the lower of the two rolls. — [src](https://www.5esrd.com/using-ability-scores/)
- Advantage and disadvantage do NOT stack: if multiple situations each grant advantage (or each impose disadvantage), you still roll only one additional d20. Multiple sources of the same direction give no extra benefit. — [src](https://www.5esrd.com/using-ability-scores/)
- If a roll has both advantage and disadvantage, you are considered to have NEITHER and roll a single d20. This holds even if multiple circumstances impose disadvantage and only one grants advantage, or vice versa. — [src](https://www.5esrd.com/using-ability-scores/)
- When you have advantage or disadvantage and an effect (e.g. the Halfling Lucky trait) lets you reroll the d20, you may reroll only ONE of the two dice; you choose which one. — [src](https://www.5esrd.com/using-ability-scores/)
- The Proficiency Bonus is determined by total character level and is added to attack rolls, saving throws, and ability checks that the character is proficient in. It progresses +2 (levels 1-4), +3 (5-8), +4 (9-12), +5 (13-16), +6 (17-20). — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/character-advancement/)
- Your proficiency bonus can't be added to a single die roll or other number more than once. If a circumstance suggests it would apply more than once, you still add it only once and multiply or divide it only once. — [src](https://www.5esrd.com/using-ability-scores/)
- Attack roll = d20 + the appropriate ability modifier + proficiency bonus (if proficient with the weapon), compared to the target's AC. The total must equal or exceed AC to hit. — [src](https://www.5esrd.com/gamemastering/combat/)
- If the d20 roll for an attack is a natural 20, the attack hits regardless of any modifiers or the target's AC (a critical hit). If the d20 roll for an attack is a natural 1, the attack misses regardless of any modifiers or the target's AC. — [src](https://www.5esrd.com/gamemastering/combat/)
- On a critical hit you roll all of the attack's damage dice twice and add them together, then add any relevant modifiers as normal. Extra damage dice (e.g. Sneak Attack) are also rolled twice; flat modifiers are NOT doubled. — [src](https://www.5esrd.com/gamemastering/combat/)
- In RAW 2014, a natural 20 is an automatic success ONLY for attack rolls (and a natural 20 on a death saving throw, which regains 1 HP); a natural 20 does NOT auto-succeed on ability checks or saving throws, and a natural 1 does not auto-fail them. — [src](https://www.sageadvice.eu/does-a-natural-20-mean-an-automatic-success/)
- Spell attack roll bonus = d20 + spellcasting ability modifier + proficiency bonus. Spell save DC = 8 + spellcasting ability modifier + proficiency bonus. — [src](https://www.5esrd.com/using-ability-scores/)
- Death saving throws: when a creature at 0 HP starts its turn it rolls a d20 with no modifiers; 10 or higher succeeds, 9 or lower fails. Three successes = stable; three failures = death. A natural 1 counts as two failures; a natural 20 means the creature regains 1 hit point (and revives). — [src](https://www.5esrd.com/gamemastering/combat/)
- Passive check total = 10 + all modifiers that normally apply to the check; +5 if the character has advantage on the check, -5 if disadvantage. No die is rolled. — [src](https://www.5esrd.com/using-ability-scores/)
- Attacking a target you can't see imposes disadvantage on the attack roll; when a creature can't see you, you have advantage on attack rolls against it. Making a ranged attack while within 5 feet of a hostile creature who can see you and isn't incapacitated imposes disadvantage. Attacking at long range (beyond normal range, within long range) imposes disadvantage. — [src](https://www.5esrd.com/gamemastering/combat/)
- Cover: half cover grants +2 to AC and Dexterity saving throws; three-quarters cover grants +5 to AC and Dexterity saving throws; total cover means the target can't be targeted directly by an attack or spell. — [src](https://www.5esrd.com/gamemastering/combat/)
- In a contest (contested check), both participants make ability checks, apply all bonuses/penalties, and compare totals instead of comparing to a DC; the higher total wins. A tie leaves the situation unchanged. — [src](https://www.5esrd.com/using-ability-scores/)

#### Key tables

**Ability Score to Modifier** — [src](https://www.5esrd.com/using-ability-scores/)

```
Score 1 = -5 | 2-3 = -4 | 4-5 = -3 | 6-7 = -2 | 8-9 = -1 | 10-11 = +0 | 12-13 = +1 | 14-15 = +2 | 16-17 = +3 | 18-19 = +4 | 20-21 = +5 | 22-23 = +6 | 24-25 = +7 | 26-27 = +8 | 28-29 = +9 | 30 = +10. Formula: modifier = floor((score - 10) / 2), always rounding down.
```

**Proficiency Bonus by Total Character Level** — [src](https://www.5esrd.com/tools-resources/system-reference-document-5-1-1/character-advancement/)

```
Levels 1-4: +2 | Levels 5-8: +3 | Levels 9-12: +4 | Levels 13-16: +5 | Levels 17-20: +6. Increases occur at levels 5, 9, 13, and 17. For multiclass characters this is determined by TOTAL combined level, not the level in any single class.
```

**Advantage/Disadvantage Resolution Logic** — [src](https://www.5esrd.com/using-ability-scores/)

```
hasAdvantage AND NOT hasDisadvantage -> roll 2d20, take higher. hasDisadvantage AND NOT hasAdvantage -> roll 2d20, take lower. hasAdvantage AND hasDisadvantage -> roll 1d20 (neither), regardless of how many sources of each. Neither -> roll 1d20. Multiple sources of the same direction do NOT add a third die. Model as two booleans, never as an integer counter.
```

**Critical Hit Damage (2014)** — [src](https://www.5esrd.com/gamemastering/combat/)

```
On a natural 20 attack roll: roll ALL the attack's damage dice twice (base weapon dice + any bonus dice such as Sneak Attack, divine smite, etc.) and sum them; then add flat modifiers ONCE (ability modifier, magic weapon bonus, etc. are NOT doubled). Example: dagger crit = 2d4 + DEX mod; greataxe + Sneak Attack 3d6 crit = 2d12 (axe) + 6d6 (sneak) + STR mod.
```

**Death Saving Throw Outcomes** — [src](https://www.5esrd.com/gamemastering/combat/)

```
Roll 1d20, no modifiers. 10+ = 1 success; 9 or lower = 1 failure. Natural 1 = 2 failures. Natural 20 = regain 1 HP (conscious). 3 successes = stable (still at 0 HP, unconscious). 3 failures = dead. Counters reset to 0 on regaining any HP, stabilizing, or after a short/long rest.
```

**Passive Check Total** — [src](https://www.5esrd.com/using-ability-scores/)

```
Passive total = 10 + all modifiers that normally apply (ability modifier + proficiency if proficient + other bonuses). Advantage on the check: +5. Disadvantage on the check: -5. No die rolled. Passive Perception = 10 + WIS modifier + (proficiency bonus if proficient).
```

**Cover Bonuses** — [src](https://www.5esrd.com/gamemastering/combat/)

```
Half cover: +2 AC and +2 to Dexterity saving throws. Three-quarters cover: +5 AC and +5 to Dexterity saving throws. Total cover: cannot be targeted directly by an attack or spell. These bonuses apply to the DEFENDER, not the attacker's roll.
```

#### 2024 deltas (not canonical here)

- 2024 introduces the umbrella term 'D20 Test' for the three d20 roll types (ability checks, saving throws, attack rolls); rules that reference 'D20 Tests' apply to all three uniformly. (Source: https://5e24srd.com/playing-the-game/d20-tests.html)
- 2024 nat-20 / nat-1 expansion: a natural 20 on ANY D20 Test (ability check, saving throw, or attack roll) is an automatic SUCCESS, and a natural 1 is an automatic FAILURE. This is the headline change from 2014, where auto-success/auto-failure on a natural 20/1 applied only to attack rolls (and the death-save special cases). Apps should NOT apply this rule to 2014 characters. (Sources: https://www.enworld.org/threads/auto-succeed-fail-on-ability-checks.690829/ and https://cosmicdraft.com/does-a-natural-20-always-succeed-and-a-natural-1-always-fail/)
- 2024 critical hits are restricted: only Weapon and Unarmed Strike attacks can crit. Spell attack rolls can NO LONGER score critical hits in 2024 (a nat 20 on a spell attack just auto-hits, no doubled dice). (Source: https://screenrant.com/one-dungeons-dragons-critical-hit-rules-less-exciting/)
- 2024 crit damage scope narrowed: on a crit you double only the WEAPON/Unarmed Strike damage dice. Extra damage dice from features (e.g. Sneak Attack) are explicitly addressed and in the final 2024 rules; the design intent was to keep crits simpler. The 2014 rule (double ALL the attack's damage dice including Sneak Attack) is the canonical version for this app. (Source: https://screenrant.com/one-dungeons-dragons-critical-hit-rules-less-exciting/)
- 2024: monsters/NPCs generally cannot score critical hits against player characters (critical hits became a player-facing feature); this is a DM/monster-side change and does not affect a PC character sheet's own rolls. (Source: https://www.enworld.org/threads/critical-hits-only-for-pcs.690944/)
- 2024 advantage/disadvantage wording was reframed around 'D20 Test' but the mechanic is unchanged: roll two d20s take higher/lower, same-direction sources don't add a third die, and advantage + disadvantage cancel to a single straight d20. (Source: https://5e24srd.com/playing-the-game/d20-tests.html)
- 2024 'Heroic Inspiration' replaces 2014 'Inspiration': it lets you reroll any die immediately after rolling and keep the new roll (rather than 2014's advantage grant). Various 2024 features grant it; this changes the reroll/Lucky-style interaction. (Source: https://www.dndbeyond.com/sources/dnd/br-2024/rules-glossary)

---

# Part 2 — Mechanics audit

Confirmed deviations from 2014 RAW, found by the code-trace pass and (rule premise) cross-checked against the web-authority pass. **No code changes are proposed here** — this is the catalog. Class tags (`code`/`data`/`feature`): **code** = derive/logic is wrong; **data** = logic is right but a `data/*.json` entry lacks the effect; **feature** = the mechanic isn't modelled at all. The 2024-only Observant variant was dropped (correct under 2014), and three cross-subsystem duplicates were merged into one canonical entry each (temp-HP-absorption, heavy-armor STR speed penalty, Jack-of-All-Trades half-proficiency).

**Totals:** 58 confirmed — 🔴 12 high · 🟡 28 medium · 🟢 18 low. By class: 49 code · 5 data · 4 feature.

| # | Sev | Class | Subsystem | Finding | Location | bugs.md |
|---|---|---|---|---|---|---|
| 1 | 🔴 | code | Armor Class | Barbarian Unarmored Defense (10+DEX+CON) is never computed | src/lib/characterStats.ts:849-897 (no Unarmored Defense branch); CombatBlock.tsx:298-314 (manual fallback when effectiveAC null) | NEW |
| 2 | 🔴 | code | Armor Class | Monk Unarmored Defense (10+DEX+WIS) is never computed | src/lib/characterStats.ts:849-897; CombatBlock.tsx:298-314 | NEW |
| 3 | 🔴 | data | Class/Subclass Features & Resource Pools | Rage uses and Rage damage entirely untracked (Barbarian core resource) | public/data/class-features.json (no barbarian rage group); src/components/sheet/FeaturesBlock.tsx:208 (resource tracker only renders when group.resource exists) | NEW |
| 4 | 🔴 | data | Class/Subclass Features & Resource Pools | Ki, Sorcery Points, Bardic Inspiration, Channel Divinity, Wild Shape, Action Surge, Lay on Hands have no resource tracker | src/lib/classFeatures.ts:52-63 (resourceCount returns 0 when group has no resource); public/data/class-features.json (only 2 groups carry resource) | NEW |
| 5 | 🔴 | code | Feats | Half-feat skill/expertise grants silently dropped when feat taken in the creation wizard | src/components/setup/SetupScreen1.tsx:655-680 (only ASI picker); src/lib/characterSetup.ts:486 (SetupFeatChoices type), :692-707 + :810-813 (writes asiAbility only); src/lib/characterStats.ts:754-774 (grant gated on featChoices skillChoices/expertiseSkill) | NEW |
| 6 | 🔴 | code | Hit Points & Hit Dice | Temporary HP never absorbs damage — it is an inert display stepper | src/components/sheet/CombatBlock.tsx:58-72 (changeHp) · :149-155 (Temp HP stepper) | NEW |
| 7 | 🔴 | code | Races & Subraces | Subrace asi_choices pools have no wizard picker (Variant Human +1/+1 lost) | src/components/setup/SetupScreen1.tsx:165 (asiChoicePools = selectedRace?.base.asi_choices) and :316-350 (only base pools rendered); consumed by src/lib/racialBonuses.ts:51-57 | NEW |
| 8 | 🔴 | code | Races & Subraces | Floating racial ASI pools using {choose, amount} shape are silently ignored (Changeling, Fairy, Harengon, Owlin) | src/lib/racialBonuses.ts:35 (i < pool.count) and :52 (subrace same); src/components/setup/SetupScreen1.tsx:324 (Array.from({length: pool.count})); data shape in public/data/races.json (changeling/fairy/harengon/owlin base.asi_choices) | NEW |
| 9 | 🔴 | code | Saving Throws | Paladin Aura of Protection (+CHA mod to all saves) not applied | src/lib/characterStats.ts:813-818 (saveModifiers loop); src/lib/characterStats.ts:638-663 (computeFeatureEffects has no save channel) | NEW |
| 10 | 🔴 | code | Spell Save DC & Spell Attack Bonus | Multiclass with two casting abilities computes only one spell save DC / attack bonus (second class's ability silently ignored) | src/lib/characterStats.ts:834-847 (castingClass = classRecords.find; single spellAttackBonus/spellSaveDC); src/components/sheet/SpellBlock.tsx:283,605 (single spellAttackMod used for all spells); src/pages/CharacterPage.tsx:965-974 (one SpellBlock for the primary class) | partial — BUG-15 (Fixed) only added the first-casting-class fallback so a non-caster primary doesn't show +0; the systemic 'Multiclass spellcasting model' family (members 15/16/38) names 'multiple casting classes' as a known gap, but no BUG specifically fixes the dual-DC/attack case — this sub-case remains unaddressed. |
| 11 | 🔴 | code | Weapons & Attack Rolls | Cleric gets no proficiency bonus on simple weapons ("All simple weapons" never matches) | src/lib/characterStats.ts:399 (isWeaponProficient); data: public/data/classes.json cleric.weapon_proficiencies | NEW |
| 12 | 🔴 | code | Weapons & Attack Rolls | Individual-weapon class proficiencies fail singular/plural match (Wizard dagger, Druid scimitar, etc.) | src/lib/characterStats.ts:401 (isWeaponProficient); data: public/data/classes.json (e.g. wizard/druid weapon_proficiencies) | NEW |
| 13 | 🟡 | code | Ability Scores & Modifiers | Level-up ASI caps the BASE score at 20, letting effective score exceed 20 from PC advancement alone | src/lib/characterSetup.ts:690; src/components/sheet/LevelUpDialog.tsx:247; src/lib/characterStats.ts:716-719 | NEW |
| 14 | 🟡 | code | Armor Class | Draconic Sorcerer / natural-armor unarmored bases (13+DEX, 17, etc.) never computed | src/lib/characterStats.ts:903-910 (unarmoredAcBase only from items); getRacialBonuses (racialBonuses.ts) has no AC output | NEW |
| 15 | 🟡 | code | Backgrounds | Creation wizard silently drops a background's fixed granted languages | src/lib/characterSetup.ts:759-760 | NEW |
| 16 | 🟡 | code | Backgrounds | Sheet-side background change merges 'None' and prose strings as literal languages | src/pages/CharacterPage.tsx:441 | NEW |
| 17 | 🟡 | code | Classes, Subclasses & Multiclassing | Multiclassing grants the secondary class's FULL weapon/armor proficiencies, not the PHB subset | src/lib/characterStats.ts:945-947 (weaponProficiencies union); src/components/sheet/LevelUpDialog.tsx onApply path (no subset grant); src/lib/characterSetup.ts:727-735 (classes built, no per-class proficiency subset) | NEW |
| 18 | 🟡 | code | Classes, Subclasses & Multiclassing | No multiclass prerequisite (>=13 in key ability of both classes) check or warning | src/components/setup/SetupScreen1.tsx:401-485 (extra-class add, no prereq); src/pages/CharacterPage.tsx:1118-1151 (level-up multiclass-in, no prereq); src/lib/characterStats.ts:255-329 (meetsFeatPrerequisite handles feat prereqs only, not multiclass entry) | NEW |
| 19 | 🟡 | code | Dice Engine, Advantage/Disadvantage & Real-Time Play | Attack rolls cannot be rolled with advantage/disadvantage at all | src/types/dice.ts:23; src/components/sheet/EquipmentBlock.tsx:248,346; src/components/sheet/SpellBlock.tsx:605; src/store/dice.ts:80-84 | NEW |
| 20 | 🟡 | code | Dice Engine, Advantage/Disadvantage & Real-Time Play | Disadvantage is never applied to any roll; adv+dis cancellation is impossible | src/lib/characterStats.ts:202-229,851,877; src/components/sheet/ProficienciesBlock.tsx:392; src/components/sheet/EquipmentBlock.tsx:481,494-495; src/store/dice.ts:83-84 | BUG-56 |
| 21 | 🟡 | data | Feats | Alert feat's +5 initiative bonus is not applied | src/lib/characterStats.ts:101-103 (initiative effect handling) + :792-794 (effectiveInitiative); data: public/data/feats.json 'alert' carries no initiative effect | NEW |
| 22 | 🟡 | feature | Hit Points & Hit Dice | No short-rest or long-rest action — HP and hit-dice recovery are entirely manual | src/components/sheet/CombatBlock.tsx:265-457 (CombatBlock has no rest action) — grep for 'short rest'/'long rest' finds only the pact-slot label in SpellBlock | NEW |
| 23 | 🟡 | code | Hit Points & Hit Dice | Raising CON after creation does not retroactively increase max HP | src/lib/characterStats.ts:932-954 (adjustedMaxHp derivation — no CON term) · src/lib/characterSetup.ts:72 (conModifier*level baked into stored maxHp) | BUG-57 |
| 24 | 🟡 | code | Items, Tools, Attunement & Currency | Tool proficiency never adds proficiency bonus to a check | src/components/sheet/ToolsSection.tsx:54-63; src/types/dice.ts:18-25; src/store/dice.ts:78-95 | NEW |
| 25 | 🟡 | code | Items, Tools, Attunement & Currency | Attunement cap of 3 is only a warning, all attuned items still apply | src/components/sheet/EquipmentBlock.tsx:1099-1125,1298-1302; src/lib/characterStats.ts:513-580 | NEW |
| 26 | 🟡 | code | Races & Subraces | Racial ASIs are not capped at 20 at derive time, but the write-time HP/AC seed is — inconsistent sheet | src/lib/characterStats.ts:717-719 (uncapped racial add) vs src/lib/characterSetup.ts:713-714 (effectiveScore clamps Math.min(20, ...)) | NEW |
| 27 | 🟡 | code | Races & Subraces | Racial damage resistances never apply (Tiefling fire, Dragonborn ancestry, Genasi, Aasimar, Shadar-kai) | src/lib/characterStats.ts:977 (resistances sourced only from itemEffects); no race branch in computeActiveItemEffects or deriveCharacterStats reads race.base.traits resistances | BUG-70 |
| 28 | 🟡 | code | Races & Subraces | Race-granted skill proficiencies are never applied (Elf Perception, Half-Orc Intimidation, etc.) | src/lib/characterStats.ts:750-774 (effectiveSkillProficiencies covers only feat grants); no race skill path in characterSetup.ts draftToNewCharacter (:737-753 only class draft + background) | BUG-64 |
| 29 | 🟡 | code | Saving Throws | Monk Diamond Soul (proficiency in all saving throws) not applied | src/lib/characterStats.ts:797-800 (effectiveSaveProficiencies build); :813-818 (modifier uses it) | NEW |
| 30 | 🟡 | data | Saving Throws | Stone of Good Luck (Luckstone) +1-to-all-saves effect not authored / silently ignored | data/equipment/wondrous_items.json (Stone of Good Luck entry, effects: null); applied-if-authored at src/lib/characterStats.ts:536-542 | NEW |
| 31 | 🟡 | code | Skills & Ability Checks | Passive Perception / Investigation computed but never surfaced; Observant +5 invisible | src/lib/characterStats.ts:828-829 (computed); src/components/* (never rendered) | NEW |
| 32 | 🟡 | code | Skills & Ability Checks | Jack of All Trades / Remarkable Athlete (half-proficiency) never applied | src/lib/characterStats.ts:803-811 (skillModifiers); src/store/dice.ts:92 (ability rolls) | RESOLVED 2026-07-04 |
| 33 | 🟡 | code | Skills & Ability Checks | Reliable Talent floor (treat d20 <10 as 10) not applied to proficient skill rolls | src/store/dice.ts:79-100 | NEW |
| 34 | 🟡 | code | Skills & Ability Checks | Armor stealth disadvantage is derived but never applied to the Stealth roll | src/components/sheet/ProficienciesBlock.tsx:341,392 (skill roll dispatch); src/lib/characterStats.ts:968 (flag set, unused for rolls) | NEW |
| 35 | 🟡 | code | Speed & Initiative | Initiative is a static display value and cannot be rolled | src/components/sheet/CombatBlock.tsx:339-342; src/types/dice.ts:18-25 (no initiative variant); src/lib/useRollDispatch.ts:10-27 (no init case) | NEW |
| 36 | 🟡 | code | Speed & Initiative | Heavy armor below its STR requirement does not reduce speed by 10 ft | src/lib/characterStats.ts:792 (effectiveSpeed has no STR-requirement penalty); armor strength_requirement only displayed at src/components/sheet/EquipmentBlock.tsx:497-498 | NEW |
| 37 | 🟡 | data | Spell Save DC & Spell Attack Bonus | Eldritch Knight / Arcane Trickster have no spellcasting ability in data, so their spell save DC and attack bonus are zero / unrepresentable | src/lib/characterStats.ts:834-847 (castingClass null -> DC/attack 0); public/data/classes.json (fighter/rogue spellcasting: null) and public/data/subclasses.json (fighter:eldritch-knight / rogue:arcane-trickster spellcasting: null); src/lib/spellcasting.ts:78-94 (getSpellcastingInfo 'none' for no-slot classes) | none — not in bugs.md as a distinct entry; only adjacent to the 'Multiclass spellcasting model' family (15/16/38), which is about slot pooling, not the EK/AT INT-caster data gap or its zero DC/attack. |
| 38 | 🟡 | code | Spellcasting Resources (slots, known/prepared, cantrips, pact) | Level-up slot-reset uses single-class table, mis-resets multiclass slots | src/components/sheet/LevelUpDialog.tsx:110-111,267-281 | NEW |
| 39 | 🟡 | code | Spellcasting Resources (slots, known/prepared, cantrips, pact) | Known casters cannot swap a spell on level-up (list only grows) | src/components/sheet/LevelUpDialog.tsx:215-222; src/lib/spellcasting.ts:230-251 | NEW |
| 40 | 🟡 | code | Weapons & Attack Rolls | Race-granted weapon proficiencies (Elf/Dwarf/Drow Weapon Training) never applied | src/lib/characterStats.ts:945-947 (weaponProficiencies union); data: public/data/races.json elf.subraces[High Elf].proficiencies = ["Elf Weapon Training"] | NEW |
| 41 | 🟢 | code | Ability Scores & Modifiers | Feat ASI step can LOWER an effective score that racial ASIs already pushed over 20 | src/lib/characterStats.ts:730-733 (vs uncapped racial at 716-719) | NEW |
| 42 | 🟢 | feature | Ability Scores & Modifiers | No Standard Array or 4d6-drop-lowest ability-generation method | src/lib/characterSetup.ts:510; src/components/setup/SetupScreen1.tsx:71-74, 199-216 | NEW |
| 43 | 🟢 | code | Ability Scores & Modifiers | Sheet ability stepper silently mutates BASE when the effective score is feat/racial-capped, and permits base up to 30 | src/components/sheet/AbilityBlock.tsx:37-38, 58-61; interacts with src/lib/characterStats.ts:732 | NEW |
| 44 | 🟢 | code | Backgrounds | Background tool-category choices stored verbatim as fake tool-proficiency names | src/lib/characterSetup.ts:832-838 | NEW |
| 45 | 🟢 | code | Backgrounds | Feylost background offers no language choice despite RAW granting one | src/components/setup/SetupScreen3.tsx:73 | NEW |
| 46 | 🟢 | code | Backgrounds | Background-skill detection infers source from proficient options, miscounting overlaps | src/lib/characterSetup.ts:227-239 | BUG-29 |
| 47 | 🟢 | feature | Backgrounds | 2024-edition backgrounds (ability-score increase + Origin feat) not representable | src/types/data.ts:294-308 | NEW |
| 48 | 🟢 | code | Class/Subclass Features & Resource Pools | Battle Master Superiority Die size fixed at d8, never scales to d10/d12 | public/data/class-features.json (fighter:battle-master:maneuvers resource.die = 'd8'); src/components/sheet/FeaturesBlock.tsx:213 (renders group.resource.die verbatim) | NEW |
| 49 | 🟢 | feature | Class/Subclass Features & Resource Pools | No short/long-rest action to refill resource pools; stored usage not re-clamped on save | src/components/sheet/FeaturesBlock.tsx:124-129 (setResourceUsed stores raw used); :147 (resUsed clamps only for render); no rest handler in CombatBlock.tsx (only HP-heal resets death saves, :63) | NEW |
| 50 | 🟢 | code | Death Saves & Dropping to 0 HP | Taking damage while at 0 HP does not record a death-save failure | src/components/sheet/CombatBlock.tsx:58-72 (changeHp) and :183-201 (DeathSaves.toggle, the only failure writer) | NEW |
| 51 | 🟢 | code | Dice Engine, Advantage/Disadvantage & Real-Time Play | Inspiration is a decorative toggle that grants no mechanical advantage | src/components/sheet/CombatBlock.tsx:449; src/store/dice.ts:78-107; src/lib/useRollDispatch.ts:10-27 | NEW |
| 52 | 🟢 | code | Hit Points & Hit Dice | Spending a hit die logs a heal total but does not change current HP | src/components/sheet/CombatBlock.tsx:274-288 (rollHitDie / rollClassHitDie) · src/store/dice.ts:79,93-94 (heal roll) | NEW |
| 53 | 🟢 | code | Proficiency Bonus | Remarkable Athlete (Champion Fighter 7) half-proficiency not applied to non-proficient STR/DEX/CON checks | src/lib/characterStats.ts:803-811 (skillModifiers) | RESOLVED 2026-07-04 |
| 54 | 🟢 | code | Races & Subraces | Subrace hp_bonus_per_level data field is ignored; only a hardcoded hill-dwarf registry works | src/lib/characterStats.ts:74-76 (SUBRACE_HP_BONUS registry) and :938-939 (lookup); ignored field declared at src/types/data.ts:218 | NEW |
| 55 | 🟢 | code | Speed & Initiative | Bard Jack of All Trades does not add half proficiency bonus to initiative | src/lib/characterStats.ts:793-794 (effectiveInitiativeBonus / effectiveInitiative compute no half-PB JoAT term) | RESOLVED 2026-07-04 |
| 56 | 🟢 | code | Speed & Initiative | Speed bonus tag hard-labeled '(feat)' even for item-sourced bonuses | src/components/sheet/CombatBlock.tsx:332-336 | NEW |
| 57 | 🟢 | code | Spellcasting Resources (slots, known/prepared, cantrips, pact) | Multiclass 'Spells Known' cap shows the primary class's count only | src/components/sheet/SpellBlock.tsx:274,412,416-417 | NEW |
| 58 | 🟢 | code | Weapons & Attack Rolls | Versatile weapons cannot roll their two-handed die | src/lib/characterStats.ts:432,437-438 (damage built from weapon.damage_dice); EquipmentBlock.tsx WeaponRow Dmg dispatch (line 351); data: equipment.json Longsword properties = ['Versatile (1d10)'] | NEW |

## Detail

### 1. 🔴 `code` Barbarian Unarmored Defense (10+DEX+CON) is never computed

**Subsystem:** Armor Class · **Location:** `src/lib/characterStats.ts:849-897 (no Unarmored Defense branch); CombatBlock.tsx:298-314 (manual fallback when effectiveAC null)` · **bugs.md:** NEW

- **RAW (2014):** A Barbarian wearing no armor (shield allowed) has AC = 10 + DEX modifier + CON modifier. This is a base AC formula the app should be able to compute from class + ability scores.
- **App does:** deriveCharacterStats only sets effectiveAC when worn armor exists (characterStats.ts:858-862, 'if (equippedArmor.length > 0)'). With no armor, effectiveAC stays null and CombatBlock falls back to the manual armorClass stepper. There is no class-feature path or registry entry for Unarmored Defense (grep of the codebase finds zero references; class-features.json has no unarmored-defense option).
- **Example:** Barbarian 5, DEX 14 (+2), CON 16 (+3), no armor, no shield. RAW AC = 10 + 2 + 3 = 15. App: equippedArmor.length === 0 → effectiveAC = null → AC card shows the manual stepper defaulting to character.armorClass (e.g. 10), so the player must hand-enter 15 and re-edit it on every CON/DEX change.
- **Correct handling:** Detect Barbarian via character.classes[] and, when no body armor is worn, derive baseAC = 10 + dexMod + conMod (shield bonus still added on top). Should be a derive-time computation keyed on the class slug, mutually exclusive with the worn-armor branch, mirroring how Defense fighting style is wired through computeFeatureEffects.

### 2. 🔴 `code` Monk Unarmored Defense (10+DEX+WIS) is never computed

**Subsystem:** Armor Class · **Location:** `src/lib/characterStats.ts:849-897; CombatBlock.tsx:298-314` · **bugs.md:** NEW

- **RAW (2014):** A Monk wearing no armor and no shield has AC = 10 + DEX modifier + WIS modifier.
- **App does:** Same as Barbarian: effectiveAC only computed from worn armor (characterStats.ts:858-862). No Monk WIS path exists anywhere; an unarmored Monk gets effectiveAC = null and the manual stepper.
- **Example:** Monk 4, DEX 16 (+3), WIS 14 (+2), no armor/shield. RAW AC = 10 + 3 + 2 = 15. App: effectiveAC = null → shows manual stepper (character.armorClass, e.g. 10). The 15 is never derived and won't track DEX/WIS item bonuses (e.g. Headband of Intellect-style WIS items) automatically.
- **Correct handling:** Detect Monk via character.classes[] and, when no armor AND no shield is worn, derive baseAC = 10 + dexMod + wisMod. Must additionally suppress this base if a shield is equipped (RAW: Monk loses Unarmored Defense with a shield), unlike Barbarian.

### 3. 🔴 `data` Rage uses and Rage damage entirely untracked (Barbarian core resource)

**Subsystem:** Class/Subclass Features & Resource Pools · **Location:** `public/data/class-features.json (no barbarian rage group); src/components/sheet/FeaturesBlock.tsx:208 (resource tracker only renders when group.resource exists)` · **bugs.md:** NEW

- **RAW (2014):** A Barbarian has a Rage pool that scales with barbarian level (2 uses at L1-2, 3 at L3, 4 at L6, 5 at L12, 6 at L17, unlimited at L20), refreshing on a long rest, and a Rage damage bonus of +2/+3/+4 by level applied to STR melee attacks while raging.
- **App does:** There is no class-feature group for Barbarian rage in class-features.json (the only barbarian group is the Totem subclass option pickers, which have no resource). FeaturesBlock therefore shows no Rage counter, and Rage damage is never added in computeWeaponBonus.
- **Example:** Barbarian 6, STR 18, greataxe. RAW: 4 rages/long rest, and while raging each greataxe hit deals 1d12 + 4 (STR) + 2 (Rage) = 1d12+6. The app shows no rage counter at all and the greataxe damage reads 1d12+4 — the +2 rage damage is silently absent and the player has no place to track that they have 4 rages.
- **Correct handling:** Add a barbarian rage resource group (by-level n table for uses, long-rest refresh note) so FeaturesBlock renders a use counter; Rage damage is situational (only while raging) so it is acceptable to leave as a manual note, but the use pool should at minimum be trackable like Superiority Dice.

### 4. 🔴 `data` Ki, Sorcery Points, Bardic Inspiration, Channel Divinity, Wild Shape, Action Surge, Lay on Hands have no resource tracker

**Subsystem:** Class/Subclass Features & Resource Pools · **Location:** `src/lib/classFeatures.ts:52-63 (resourceCount returns 0 when group has no resource); public/data/class-features.json (only 2 groups carry resource)` · **bugs.md:** NEW

- **RAW (2014):** Each of Monk (Ki = monk level, short rest), Sorcerer (Sorcery Points = sorcerer level, long rest), Bard (Bardic Inspiration = CHA mod, long/short rest), Cleric & Paladin (Channel Divinity, short/long rest), Druid (Wild Shape, 2/short rest), Fighter (Action Surge / Second Wind / Indomitable), and Paladin (Lay on Hands = 5×level HP, long rest) has a scaling, rest-refreshing resource pool that is the defining limited resource of the class.
- **App does:** class-features.json contains a resource block for only two groups (fighter:battle-master:maneuvers and fighter:arcane-archer:arcane-shots). No group exists for Ki, Sorcery Points, Bardic Inspiration, Channel Divinity, Wild Shape, Action Surge, Second Wind, Indomitable, or Lay on Hands, so resourceCount returns 0 and FeaturesBlock renders no pip tracker for any of them.
- **Example:** Monk 5, WIS 16. RAW: 5 Ki points that refresh on a short rest (Flurry of Blows, Patient Defense, Step of the Wind each cost 1). The app provides no Ki counter anywhere — the player must track all 5 points off-sheet. Same for Sorcerer 5 (5 sorcery points), Bard 5 (3 Bardic Inspiration d8), Druid 4 (2 Wild Shapes), Paladin 5 (25-HP Lay on Hands pool).
- **Correct handling:** Add resource groups (or a dedicated resource registry) for the per-class pools with their by-level n tables and rest type, surfaced as use trackers in FeaturesBlock — the existing FeatureResource shape already supports this; only the data is missing.

### 5. 🔴 `code` Half-feat skill/expertise grants silently dropped when feat taken in the creation wizard

**Subsystem:** Feats · **Location:** `src/components/setup/SetupScreen1.tsx:655-680 (only ASI picker); src/lib/characterSetup.ts:486 (SetupFeatChoices type), :692-707 + :810-813 (writes asiAbility only); src/lib/characterStats.ts:754-774 (grant gated on featChoices skillChoices/expertiseSkill)` · **bugs.md:** NEW

- **RAW (2014):** A half-feat that grants skill proficiency or expertise (Skilled: 3 skills; Skill Expert: 1 skill + 1 expertise; Prodigy: 1 skill + 1 expertise) confers those benefits regardless of when it is taken. Taking the feat at character creation must let the player pick the granted skills/expertise.
- **App does:** The wizard's feat slot (SetupScreen1) renders ONLY the choice-ASI picker. SetupFeatChoices is typed Record<string,{asiAbility?}> and draftToNewCharacter writes featChoices[slug]={asiAbility} or {} — never skillChoices/expertiseSkill. Because deriveCharacterStats only grants feat skills when featChoices[slug].skillChoices/expertiseSkill is present, the skill/expertise benefit is dropped. The same feat taken later via FeatsBlock works correctly.
- **Example:** Create a Variant-context build: a level-4 Rogue, at the L4 ASI slot pick the feat 'Skilled' (effects [{type:'skill_proficiency',count:3}]). The wizard shows no skill picker, so featChoices.skilled = {}. After finishing, deriveCharacterStats finds hasSkillProf=true but choices.skillChoices is undefined → grants 0 skills. The character has Skilled in feats[] but +0 skill proficiencies. Re-taking Skilled in FeatsBlock would prompt for 3 skills and grant them — proving the wizard path alone loses them.
- **Correct handling:** The wizard feat slot must run the same asi→skill→expertise picker sequence FeatsBlock uses (getNextPhase), and SetupFeatChoices + draftToNewCharacter must persist skillChoices/expertiseSkill into featChoices, so a half-feat's skill/expertise benefit survives character creation identically to the level-up and sheet paths.

### 6. 🔴 `code` Temporary HP never absorbs damage — it is an inert display stepper

**Subsystem:** Hit Points & Hit Dice · **Location:** `src/components/sheet/CombatBlock.tsx:58-72 (changeHp) · :149-155 (Temp HP stepper)` · **bugs.md:** NEW

- **RAW (2014):** Temp HP is a buffer: damage depletes temp HP first, and only the overflow reduces current HP. The two pools are tracked separately and temp HP does not stack (a new grant replaces a smaller one).
- **App does:** changeHp only mutates currentHp (floored at 0, capped at adjustedMaxHp) and never reads or decrements character.tempHp. tempHp is set solely by an independent stepper; nothing routes incoming damage through it.
- **Example:** Character at 20/20 HP with 5 temp HP takes 8 damage. Player clicks − eight times (or uses adjust-by −8). App: currentHp = 12, tempHp still 5. RAW: 5 temp absorbed, remaining 3 hits real HP → currentHp = 17, tempHp = 0. The 5-point buffer is silently wasted; the player is 5 HP worse off than the rules dictate.
- **Correct handling:** On damage (negative delta) drain tempHp first: tempConsumed = min(tempHp, damage); apply the remainder to currentHp; write both the reduced tempHp and the reduced currentHp. Healing/positive deltas leave tempHp untouched. (Setting temp HP could also enforce the non-stacking 'keep the higher' rule, but at minimum damage must route through the buffer.)

### 7. 🔴 `code` Subrace asi_choices pools have no wizard picker (Variant Human +1/+1 lost)

**Subsystem:** Races & Subraces · **Location:** `src/components/setup/SetupScreen1.tsx:165 (asiChoicePools = selectedRace?.base.asi_choices) and :316-350 (only base pools rendered); consumed by src/lib/racialBonuses.ts:51-57` · **bugs.md:** NEW

- **RAW (2014):** Variant Human grants +1 to two abilities of your choice (modeled as a subrace asi_choices pool {count:2, amount:1, pool:'any'}). The deriver getRacialBonuses applies subrace choice pools from raceAsiChoices (offset after race pools).
- **App does:** SetupScreen1 only renders ASI pickers from selectedRace.base.asi_choices (line 165); it never renders subrace.asi_choices. So the slots the deriver expects for a subrace pool are never filled in draft.asiChoices, and getRacialBonuses' subrace-pool loop reads undefined ability entries and applies nothing.
- **Example:** Create a Human, pick the 'Variant Human' subrace, base abilities STR 8 DEX 14 CON 14 INT 10 WIS 12 CHA 10. RAW: choose +1 DEX and +1 CON -> DEX 15, CON 15. App: no picker appears for the +1/+1, raceAsiChoices stays []; getRacialBonuses returns {} for the subrace pool, so the sheet shows DEX 14, CON 14 (no racial bonus at all). The player gets zero ASIs from Variant Human.
- **Correct handling:** Render subrace asi_choices pools in SetupScreen1 immediately after the base pools, writing into draft.asiChoices at the correct flat offset (race-pool total count first, then subrace slots) so the ordering getRacialBonuses already expects is satisfied.

### 8. 🔴 `code` Floating racial ASI pools using {choose, amount} shape are silently ignored (Changeling, Fairy, Harengon, Owlin)

**Subsystem:** Races & Subraces · **Location:** `src/lib/racialBonuses.ts:35 (i < pool.count) and :52 (subrace same); src/components/setup/SetupScreen1.tsx:324 (Array.from({length: pool.count})); data shape in public/data/races.json (changeling/fairy/harengon/owlin base.asi_choices)` · **bugs.md:** NEW

- **RAW (2014):** Changeling gets +1 to one ability of choice; Fairy/Harengon/Owlin get +1 to two abilities of choice (on top of their fixed ASI). These are real choice pools the player must fill.
- **App does:** Their data encodes the pool as {"choose":N, "amount":1} instead of the {"count":N, "amount":1, "pool":"any"} shape the code understands. getRacialBonuses iterates `for (let i = 0; i < pool.count; i++)` — pool.count is undefined, so the loop body never executes and no ASI is applied. SetupScreen1's picker uses Array.from({length: pool.count}) (line 324) -> empty array -> no picker rendered.
- **Example:** Create a Changeling (base ASI {charisma:2}, plus floating {choose:1, amount:1}), base CHA 13 INT 13. RAW: +2 CHA fixed -> CHA 15, plus +1 to one ability of choice (e.g. INT) -> INT 14. App: the +2 CHA applies (CHA 15) but the floating +1 has no picker and is never applied, so INT stays 13. A Fairy/Harengon/Owlin loses two +1s the same way.
- **Correct handling:** Normalize the pool shape: treat `choose` as a synonym for `count` (and default `pool` to 'any') in both getRacialBonuses and the SetupScreen1 picker, OR fix the data to the {count, amount, pool} contract declared by the AsiChoice type. A single read helper (count = pool.count ?? pool.choose) plus the picker fix covers all four races.

### 9. 🔴 `code` Paladin Aura of Protection (+CHA mod to all saves) not applied

**Subsystem:** Saving Throws · **Location:** `src/lib/characterStats.ts:813-818 (saveModifiers loop); src/lib/characterStats.ts:638-663 (computeFeatureEffects has no save channel)` · **bugs.md:** NEW

- **RAW (2014):** A Paladin of level 6+ adds their Charisma modifier (minimum +1) to all saving throws made by themselves and friendly creatures within 10 feet (PHB Paladin, Aura of Protection).
- **App does:** deriveCharacterStats computes saveModifiers[ability] = abilMod + (proficient ? PB : 0) + itemSave only (characterStats.ts:813-818). No class-feature pass adds CHA mod to saves; computeFeatureEffects (characterStats.ts:638-663) only handles 'ac' and weapon effects, and no Aura of Protection feature exists in public/data/class-features.json.
- **Example:** Paladin 6, CHA 18 (mod +4), WIS 10, not proficient in WIS saves. RAW WIS save = d20 + 0 (WIS mod) + 4 (Aura of Protection) = d20+4. App shows WIS save = +0. Every one of the six saves is understated by +4.
- **Correct handling:** Add a derive-time rule: when any class record is paladin with owning-class level >= 6, add abilityModifier(effectiveAbilities.cha) (min +1) to every entry in saveModifiers. Ideally model it as a class-feature effect (new FeatureEffect 'save_bonus' driven from class-features data) consistent with INV-1, scoped by the OWNING class level (INV-2), not total level.

### 10. 🔴 `code` Multiclass with two casting abilities computes only one spell save DC / attack bonus (second class's ability silently ignored)

**Subsystem:** Spell Save DC & Spell Attack Bonus · **Location:** `src/lib/characterStats.ts:834-847 (castingClass = classRecords.find; single spellAttackBonus/spellSaveDC); src/components/sheet/SpellBlock.tsx:283,605 (single spellAttackMod used for all spells); src/pages/CharacterPage.tsx:965-974 (one SpellBlock for the primary class)` · **bugs.md:** BUG-15

- **RAW (2014):** RAW: each spellcasting class uses its OWN spellcasting ability, and you determine spell save DC and spell attack bonus separately for each class. A Wizard/Cleric has TWO DCs and TWO attack bonuses simultaneously — wizard spells resolve against the INT-based numbers, cleric spells against the WIS-based numbers. Only spell slots are pooled, never the DC/attack.
- **App does:** deriveCharacterStats picks castingClass = classRecords.find(c => c.spellcasting?.ability) — the FIRST (primary-first) class with a casting ability — and computes a single spellAttackBonus/spellSaveDC from that one ability. DerivedStats exposes exactly one pair, and SpellBlock applies that same spellAttackMod to every spell's Hit button regardless of which class grants the spell. The second casting class's ability is never read.
- **Example:** Wizard 5 / Cleric 5 (Wizard primary), INT 18 (+4), WIS 16 (+3), total level 10 -> PB +4. classRecords = [wizard, cleric]; castingClass = wizard (INT). App shows ONE pair: spell attack +4+4 = +8, save DC 8+4+4 = 16, and uses it for both wizard AND cleric spells. RAW: wizard spells -> attack +8 / DC 16 (correct), but cleric spells -> attack +3+4 = +7 / DC 8+3+4 = 15. Every cleric spell on the sheet is rolled/displayed at +8 / DC 16 instead of +7 / DC 15 — off by +1 here, and larger whenever the two casting stats differ more (e.g. Sorcerer 6 CHA 18 / Wizard 6 INT 12 -> CHA path +9/DC17 applied to wizard spells that should be +7/DC15).
- **Correct handling:** Determine spell attack/DC per casting class. Expose a per-class map (e.g. derived.spellStatsByClass keyed by classSlug, each {ability, attack, dc}) and have SpellBlock select the casting class for each spell (by which class's list the spell belongs to, or render a separate stats row per casting class). Single-class casters keep their current single pair. PB stays total-level for every class.

### 11. 🔴 `code` Cleric gets no proficiency bonus on simple weapons ("All simple weapons" never matches)

**Subsystem:** Weapons & Attack Rolls · **Location:** `src/lib/characterStats.ts:399 (isWeaponProficient); data: public/data/classes.json cleric.weapon_proficiencies` · **bugs.md:** NEW

- **RAW (2014):** A Cleric is proficient with all simple weapons, so attacks with a mace/quarterstaff/etc. add the proficiency bonus to the to-hit roll.
- **App does:** isWeaponProficient checks `profs.some(p => p === 'simple weapons')` (exact string). Cleric's class data is `["All simple weapons"]`, which lowercases to `"all simple weapons"` and is the ONLY class using that phrasing. It never equals 'simple weapons', so no proficiency bonus is added.
- **Example:** Cleric 5 (PB +3), STR 16 (+3), wielding a Mace (Simple Melee). RAW to-hit = d20 + 3 (STR) + 3 (PB) = +6. App: isWeaponProficient(Mace, ["all simple weapons"]) returns false (verified by simulation), so PB=0 → app shows to-hit +3. Damage is correct (+3, no PB), but to-hit is understated by 3.
- **Correct handling:** Normalize/strip a leading "all " (and match category words) when comparing: treat "all simple weapons" as covering any Simple weapon, and "all martial weapons" as covering any Martial weapon. e.g. detect /\ball\b.*simple/ → simple-category proficiency.

### 12. 🔴 `code` Individual-weapon class proficiencies fail singular/plural match (Wizard dagger, Druid scimitar, etc.)

**Subsystem:** Weapons & Attack Rolls · **Location:** `src/lib/characterStats.ts:401 (isWeaponProficient); data: public/data/classes.json (e.g. wizard/druid weapon_proficiencies)` · **bugs.md:** NEW

- **RAW (2014):** A Wizard is proficient with daggers; a Druid with scimitars; a Rogue with longswords/rapiers/shortswords; a Bard/Monk with their listed weapons. Attacks with those weapons add the proficiency bonus.
- **App does:** isWeaponProficient's last clause is `profs.includes(weapon.name.toLowerCase())`. Class data stores these as PLURAL ('daggers','scimitars','quarterstaffs','longswords'), but weapon catalog names are SINGULAR ('Dagger','Scimitar'). `['daggers',...].includes('dagger')` is false, so the proficiency bonus is dropped for every class whose list is by individual weapon (Wizard, Sorcerer, Druid, Bard, Rogue, Monk shortswords).
- **Example:** Wizard 5 (PB +3), DEX 14 (+2), wielding a Dagger (finesse). RAW to-hit = d20 + 2 (DEX) + 3 (PB) = +5. App: isWeaponProficient(Dagger, ['daggers','darts','slings','quarterstaffs','light crossbows']) returns false (verified by simulation) → PB=0 → app shows +2, understated by 3. Same for Druid 5 STR 14 + Scimitar: RAW +5 (Scimitar is Martial but Druid is proficient via its list), app shows +2.
- **Correct handling:** Singularize/normalize on compare: strip a trailing 's' on prof entries, or compare against both `name` and `name + 's'`. Better: match plural prof entry against the singular weapon name (e.g. prof.replace(/s$/,'') === weapon.name.toLowerCase()).

### 13. 🟡 `code` Level-up ASI caps the BASE score at 20, letting effective score exceed 20 from PC advancement alone

**Subsystem:** Ability Scores & Modifiers · **Location:** `src/lib/characterSetup.ts:690; src/components/sheet/LevelUpDialog.tsx:247; src/lib/characterStats.ts:716-719` · **bugs.md:** NEW

- **RAW (2014):** A player character cannot raise an ability above 20 through level-up Ability Score Improvements. Racial ASIs are applied at creation and are part of the score the 20 cap measures — the cap is on the final (effective) score, not on a racial-excluded base.
- **App does:** Level-up ASIs are baked into character.abilities (BASE) with Math.min(20, base + 1), while racial ASIs are added on TOP of base at render time with NO cap (characterStats.ts:718). So the 20 ceiling is enforced against the racial-excluded base, and the racial bonus rides above it. Effective ability can reach 22.
- **Example:** Mountain Dwarf (+2 STR) Fighter. Custom/point-buy base STR 18. Player takes two level-up ASIs of +1 STR each: draftToNewCharacter/LevelUpDialog do Math.min(20, 18+1)=19 then Math.min(20,19+1)=20, so BASE STR = 20. deriveCharacterStats then adds racial +2 uncapped (line 718): effectiveAbilities.str = 20 + 2 = 22, modifier +6. RAW: the dwarf's +2 STR is part of the score the ASI cap applies to, so STR maxes at 20 (mod +5) — the player cannot ASI past 20. The app shows STR 22 / +6, inflating every STR check, save, and attack by +1.
- **Correct handling:** The 20 cap must apply to the EFFECTIVE score. Either (a) cap the racial step at 20 in deriveCharacterStats and let level-up ASIs also be bounded by the effective ceiling, or (b) when writing a level-up/wizard ASI +1, bound it so base + racialBonus(ability) does not exceed 20. Net result: a character with racial +2 STR and base 18 cannot raise effective STR above 20 via ASIs.

### 14. 🟡 `code` Draconic Sorcerer / natural-armor unarmored bases (13+DEX, 17, etc.) never computed

**Subsystem:** Armor Class · **Location:** `src/lib/characterStats.ts:903-910 (unarmoredAcBase only from items); getRacialBonuses (racialBonuses.ts) has no AC output` · **bugs.md:** NEW

- **RAW (2014):** Draconic Bloodline Sorcerer (Draconic Resilience) and natural-armor races set an alternative unarmored base: Draconic/Lizardfolk = 13 + DEX; Tortle = 17 (flat). Each replaces 10 + DEX while unarmored.
- **App does:** There is no race→AC or subclass→AC derivation. computeActiveItemEffects.unarmoredAcBase (characterStats.ts:524-525) is fed ONLY by item 'unarmored_ac' effects, never by a race or subclass. An unarmored Draconic Sorcerer or Lizardfolk gets effectiveAC = null → manual stepper.
- **Example:** Sorcerer (Draconic Bloodline) 6, DEX 14 (+2), no armor. RAW AC = 13 + 2 = 15. App: effectiveAC = null → manual stepper (e.g. 10). Likewise a Lizardfolk Druid: RAW 13 + DEX, app shows manual fallback.
- **Correct handling:** Add an unarmored-base source for race natural armor and the Draconic Resilience subclass feature (it could reuse the existing unarmoredAcBase channel: set base 13 [or 17 for Tortle, DEX-less] when unarmored). Tortle's 17 must ignore DEX. Apply only when no body armor is worn, consistent with the existing unarmored-item gate.

### 15. 🟡 `code` Creation wizard silently drops a background's fixed granted languages

**Subsystem:** Backgrounds · **Location:** `src/lib/characterSetup.ts:759-760` · **bugs.md:** NEW

- **RAW (2014):** A background that grants a fixed language (Clan Crafter → Dwarvish, Rune Carver → Giant) gives the character that language at creation. Granted languages are part of the background bundle, no choice involved.
- **App does:** draftToNewCharacter computes languages = unique(race languages ∪ chosen languages) and never includes bg.languages, so any fixed language a background grants is lost when the character is built through the wizard. The sheet-side BackgroundPromptDialog DOES merge bg.languages, making the two paths inconsistent.
- **Example:** Create a Mountain Dwarf (race languages Common, Dwarvish) Cleric with the Clan Crafter background (languages: ["Dwarvish"], language_choices: 0) via the wizard. RAW the character knows Common + Dwarvish. The wizard already gives Dwarvish from the race, so the loss hides — but build a Human (Common only) Rune Carver (languages: ["Giant"], language_choices: 0): RAW = Common + Giant; the app stores only ["Common"]. Giant is dropped.
- **Correct handling:** draftToNewCharacter should merge a background's fixed (non-prose, non-"None") languages into the languages array: languages = unique(raceLanguages ∪ bgFixedLanguages ∪ chosen). Filter out the literal "None" sentinel and any prose/choice strings (those are choices, handled by language_choices), matching how BackgroundPromptDialog already merges — minus the junk it currently also merges.

### 16. 🟡 `code` Sheet-side background change merges 'None' and prose strings as literal languages

**Subsystem:** Backgrounds · **Location:** `src/pages/CharacterPage.tsx:441` · **bugs.md:** NEW

- **RAW (2014):** A background with no granted language (languages: ["None"]) grants nothing. A background whose language is a choice (Feylost: 'One of: Elvish, Gnomish, Goblin, or Sylvan') grants ONE language the player picks from that list — not the sentence itself.
- **App does:** BackgroundPromptDialog.handleApply merges background.languages verbatim into the character's languages set, with no filtering of the 'None' sentinel or choice-prose entries.
- **Example:** On the sheet, change a character's background to Soldier (languages: ["None"]). The character's language list gains a literal entry 'None'. Change instead to Feylost (languages: ["One of: Elvish, Gnomish, Goblin, or Sylvan"], language_choices: 0): the character gains a 'language' literally named 'One of: Elvish, Gnomish, Goblin, or Sylvan' and is offered no picker.
- **Correct handling:** Before merging, drop the literal 'None' sentinel and any entry that is choice prose (contains 'choice', a colon, 'or ', etc.) — only merge entries that resolve to a real language name. Choice languages should be surfaced through the language_choices picker (which itself needs fixing for backgrounds like Feylost that put the choice in the languages array with count 0).

### 17. 🟡 `code` Multiclassing grants the secondary class's FULL weapon/armor proficiencies, not the PHB subset

**Subsystem:** Classes, Subclasses & Multiclassing · **Location:** `src/lib/characterStats.ts:945-947 (weaponProficiencies union); src/components/sheet/LevelUpDialog.tsx onApply path (no subset grant); src/lib/characterSetup.ts:727-735 (classes built, no per-class proficiency subset)` · **bugs.md:** NEW

- **RAW (2014):** When you take your first level in a new class via multiclassing, you gain only the PHB-table subset of that class's proficiencies. Notably you get NO new saving-throw proficiencies, and only a partial armor/weapon slice (e.g. multiclassing into Fighter grants light & medium armor + shields + simple & martial weapons but NOT heavy armor; into Barbarian grants shields + simple/martial weapons; into Wizard grants no armor/weapon proficiencies at all).
- **App does:** deriveCharacterStats computes weaponProficiencies as the lowercased union of EVERY class record's full weapon_proficiencies (characterStats.ts:945-947), and the AC derivation never checks armor proficiency at all. So a multiclass character receives the full martial-weapon (and, for AC purposes, effectively heavy-armor) proficiency of any class they dip, with no subset filtering. (Saving throws ARE correctly limited to the first class via draftToNewCharacter line 756-757, so that half of the rule is right.)
- **Example:** Wizard 5 / Fighter 1 (multiclassed into Fighter, who has weapon_proficiencies ["Simple weapons","martial weapons"] and armor_proficiencies ["All armor","shields"]). RAW: the Wizard gains light & medium armor, shields, and simple+martial weapons from the Fighter dip, but NOT heavy armor, and gains no new saving throws. App: derived.weaponProficiencies = {daggers, darts, slings, quarterstaffs, light crossbows} (wizard) ∪ {simple weapons, martial weapons} (fighter) — so a Greatsword (martial) shows the proficiency bonus added to its to-hit. Equipping Plate (heavy) computes full AC with no proficiency check. Both are over-grants the PHB subset forbids.
- **Correct handling:** Distinguish the FIRST class (classes[0], grants full proficiencies) from multiclass-acquired classes (classes[1..], grant only the PHB multiclass-table subset). Build a per-class-slug multiclass-proficiency table (Fighter→light+medium armor, shields, simple+martial weapons; Barbarian→shields, simple+martial weapons; Wizard→none; etc.) and union the FIRST class's full list with each later class's SUBSET when deriving weaponProficiencies and any armor-proficiency check. This is a spec/data change only — no behavior should bake at write time (INV-1).

### 18. 🟡 `code` No multiclass prerequisite (>=13 in key ability of both classes) check or warning

**Subsystem:** Classes, Subclasses & Multiclassing · **Location:** `src/components/setup/SetupScreen1.tsx:401-485 (extra-class add, no prereq); src/pages/CharacterPage.tsx:1118-1151 (level-up multiclass-in, no prereq); src/lib/characterStats.ts:255-329 (meetsFeatPrerequisite handles feat prereqs only, not multiclass entry)` · **bugs.md:** NEW

- **RAW (2014):** To multiclass you must have a score of at least 13 in the key ability of BOTH the class you are leaving AND the class you are entering (some classes require two abilities, e.g. Paladin needs STR 13 and CHA 13). If you don't meet it, you can't take levels in that class.
- **App does:** Nothing checks this. The setup wizard's 'Add class' / extra-class picker (SetupScreen1.tsx:401-485) and the level-up multiclass-in flow (CharacterPage.tsx:1134-1139) let you add any class at any ability scores with no validation and no soft warning. Feats by contrast DO get a soft 'Req not met' badge via meetsFeatPrerequisites, so the inconsistency is visible: a player gets warned for an under-statted feat but not for an illegal multiclass.
- **Example:** A character with INT 8 builds Fighter 5 / Wizard 1. RAW: illegal — Wizard's key ability is INT and 8 < 13, so this multiclass is not allowed. App: the Wizard dip is added with no error or warning, the character is created, and it casts wizard spells off INT 8 (spell save DC = 8 + (-1) + 3 = 10). Conversely a Paladin dip with CHA 8 is also silently permitted despite needing CHA 13.
- **Correct handling:** Add a soft, non-blocking warning (mirroring the FeatsBlock / feature-option prereq pattern, which is the app's established homebrew-friendly policy) when an added class's key ability (or the current first class's key ability) is below 13. Drive it from each class's primary_ability data plus derived.effectiveAbilities. Do not hard-block (consistent with the soft-lock policy), but surface the violation so the player knows it's homebrew.

### 19. 🟡 `code` Attack rolls cannot be rolled with advantage/disadvantage at all

**Subsystem:** Dice Engine, Advantage/Disadvantage & Real-Time Play · **Location:** `src/types/dice.ts:23; src/components/sheet/EquipmentBlock.tsx:248,346; src/components/sheet/SpellBlock.tsx:605; src/store/dice.ts:80-84` · **bugs.md:** NEW

- **RAW (2014):** Attack rolls take advantage (roll 2d20 keep higher) or disadvantage (keep lower) from many sources: Reckless Attack, Faerie Fire, attacking a prone target in melee, an unseen attacker, Inspiration. The kept die also determines nat20/nat1 auto-hit/miss.
- **App does:** The 'attack' member of RollKind has no advantage field, and every attack dispatch omits it, so an attack always rolls a single d20. There is no UI affordance to request advantage on a weapon or spell attack.
- **Example:** Barbarian using Reckless Attack with a +7 greataxe. RAW: roll 2d20 keep higher, +7. App: clicking 'Hit' rolls exactly one d20+7 because kind.advantage is absent (store/dice.ts:79 takes the single-d20 branch). The player's real hit/crit chance with advantage (crit ≈9.75% vs 5%) is materially higher; the sheet silently under-rolls and the player must roll a second d20 in their head.
- **Correct handling:** Add an optional advantage tristate to the attack RollKind plus a way to set it (e.g. a toggle on the Hit button or a Reckless/inspiration toggle) so attacks roll 2d20 keep-higher/keep-lower exactly as saves and skills already do; crit detection continues to key off the kept die.

### 20. 🟡 `code` Disadvantage is never applied to any roll; adv+dis cancellation is impossible

**Subsystem:** Dice Engine, Advantage/Disadvantage & Real-Time Play · **Location:** `src/lib/characterStats.ts:202-229,851,877; src/components/sheet/ProficienciesBlock.tsx:392; src/components/sheet/EquipmentBlock.tsx:481,494-495; src/store/dice.ts:83-84` · **bugs.md:** BUG-56

- **RAW (2014):** Disadvantage = roll 2d20 keep the lower. Heavy-armor wearers have disadvantage on Stealth checks. Any single source of advantage and any single source of disadvantage cancel to a normal single d20.
- **App does:** Nothing in the codebase sets advantage:false. getCharacterAdvantages only adds to advantage Sets; hasStealthDisadvantage is computed but rendered as a label only and never passed into the Stealth roll's tristate. The store CAN keep the lower die but no caller asks it to.
- **Example:** Fighter in plate (Stealth disadvantage), DEX 10. RAW Stealth: 2d20 keep lower +0. App: dispatch is { type:'skill', skill:'stealth', advantage: hasAdv || undefined }; hasAdv comes only from the advantage Sets, so advantage is undefined and a single d20+0 is rolled — the plate disadvantage is ignored. If that fighter also had Cloak of Elvenkind, RAW the two cancel to a normal d20, but the app would roll WITH advantage (keep higher), over-rolling.
- **Correct handling:** Feed disadvantage sources into the same tristate as advantage and net them: both present -> undefined (normal); advantage-only -> true; disadvantage-only -> false. getCharacterAdvantages must also emit disadvantages (or a net per-skill/save tristate) consumed at dispatch.

### 21. 🟡 `data` Alert feat's +5 initiative bonus is not applied

**Subsystem:** Feats · **Location:** `src/lib/characterStats.ts:101-103 (initiative effect handling) + :792-794 (effectiveInitiative); data: public/data/feats.json 'alert' carries no initiative effect` · **bugs.md:** NEW

- **RAW (2014):** The Alert feat (2014) grants a flat +5 bonus to initiative (plus can't-be-surprised and a no-advantage-against-hidden clause). The +5 initiative is a flat, always-on, app-representable number that should raise effectiveInitiative.
- **App does:** deriveCharacterStats has a working feat-initiative channel (featInitiativeBonus from computeFeatStatDelta's 'initiative' effect, characterStats.ts:734,793), but the 'alert' feat in feats.json ships no {type:'initiative'} effect and is absent from FEAT_EFFECTS, so the channel receives 0. Initiative is computed as dexMod + effectiveInitiativeBonus with no Alert contribution.
- **Example:** Rogue 5, DEX 16 (mod +3), with the Alert feat. RAW initiative = +3 (DEX) + 5 (Alert) = +8. The app derives effectiveInitiativeBonus = (initiativeBonus 0) + featInitiativeBonus 0 + item 0 = 0, so effectiveInitiative = +3 — understating the bonus by 5.
- **Correct handling:** Author an {type:'initiative',amount:5} effect on the 'alert' feat in the data so the existing render-time channel applies it (data-only fix; no code change). The surprise/hidden clauses remain intentionally manual.

### 22. 🟡 `feature` No short-rest or long-rest action — HP and hit-dice recovery are entirely manual

**Subsystem:** Hit Points & Hit Dice · **Location:** `src/components/sheet/CombatBlock.tsx:265-457 (CombatBlock has no rest action) — grep for 'short rest'/'long rest' finds only the pact-slot label in SpellBlock` · **bugs.md:** NEW

- **RAW (2014):** A long rest restores all lost HP and recovers half the character's total hit dice (minimum 1). A short rest lets the character spend available hit dice to heal; expended hit dice return to the pool on a long rest.
- **App does:** There is no rest button or rest flow anywhere on the sheet. The only HP/hit-dice controls are the manual current-HP buttons, the temp-HP / max-HP steppers, and the per-die hit-dice countdown steppers. To 'long rest' the player must hand-set current HP to max and hand-edit each hit-dice remaining stepper back up by half the pool.
- **Example:** Fighter 3 / Wizard 2 (5 total hit dice) ends a day at 12/40 HP with 2 hit dice spent (used d10, used d6). On a long rest RAW they should: restore HP to 40 AND recover floor(5/2)=2 hit dice (so the spent d10 and d6 both come back). The app provides no single action; the player must manually drag currentHp to 40 and manually edit two hit-dice steppers, with no guidance that only half the pool is recoverable — making over- or under-recovery easy.
- **Correct handling:** Add a Long Rest action: set currentHp = adjustedMaxHp, tempHp = 0, and reduce each class's hitDiceUsed by its share of floor(totalLevel/2) recovered dice (min 1 overall). Optionally a Short Rest helper that just exposes the existing hit-die spends. At minimum a Long Rest that restores full HP and half the hit-dice pool.

### 23. 🟡 `code` Raising CON after creation does not retroactively increase max HP

**Subsystem:** Hit Points & Hit Dice · **Location:** `src/lib/characterStats.ts:932-954 (adjustedMaxHp derivation — no CON term) · src/lib/characterSetup.ts:72 (conModifier*level baked into stored maxHp)` · **bugs.md:** BUG-57

- **RAW (2014):** The CON modifier applies to HP retroactively: when CON increases (ASI, Belt of Giant Strength-style item, etc.), max HP rises by the modifier delta times character level immediately, across all levels already gained.
- **App does:** maxHp is a write-time stored value with CON baked in once at creation/level-up (computeMaxHp adds conModifier*level). adjustedMaxHp re-derives only feat (Tough), subrace (Dwarven Toughness) and item max_hp bonuses on top of stored maxHp — it never recomputes the CON contribution from effectiveAbilities.con. So a CON increase made on the sheet (or via an Amulet of Health) does not move max HP.
- **Example:** Level 8 Fighter, CON 14 (mod +2), maxHp stored as e.g. 60. Player takes an ASI raising CON 14→16 (mod +3) via the sheet's ability stepper. RAW: max HP should rise by (3−2)*8 = +8 to 68. App: adjustedMaxHp stays 60 — the CON delta is ignored because the +2/level was frozen into stored maxHp at level-up and nothing re-derives it. (An Amulet of Health setting CON to 19 likewise raises effective CON but not HP.)
- **Correct handling:** Either derive the CON contribution at render time (adjustedMaxHp should include (abilityModifier(effectiveAbilities.con) - bakedConModUsed) * level) or, more simply, recompute and rewrite stored maxHp whenever base CON changes. The current write-time bake silently desyncs HP from any post-creation CON change. (Note the existing BUG-57 entry observes 'max HP has no dedicated write event' — this is the CON-specific instance of that root cause.)

### 24. 🟡 `code` Tool proficiency never adds proficiency bonus to a check

**Subsystem:** Items, Tools, Attunement & Currency · **Location:** `src/components/sheet/ToolsSection.tsx:54-63; src/types/dice.ts:18-25; src/store/dice.ts:78-95` · **bugs.md:** NEW

- **RAW (2014):** Proficiency with a tool lets you add your proficiency bonus to any ability check you make using that tool (PHB p.154).
- **App does:** toolProficiencies is a free-form string[] stored and displayed only (ToolsSection.tsx). There is no 'tool' RollKind (src/types/dice.ts:18-25) and no roll-dispatch path that adds PB for a tool, so a tool-based check rolls as a plain ability check with +0 from the tool.
- **Example:** Rogue 5 (PB +3), DEX 16 (+3), proficient with Thieves' Tools. RAW a lockpicking check = d20 + 3 (DEX) + 3 (tool PB) = +6 (or +9 with Thieves' Tools expertise). The app has no Thieves' Tools roll; the player rolls a DEX ability check at +3, silently missing the +3 PB.
- **Correct handling:** Either add a 'tool' RollKind that takes a governing ability + the tool name and applies PB (x2 if expertise) when the tool is in toolProficiencies, with an optional ability picker; or document tool checks as manual. At minimum the tool list should not imply a computed bonus it never delivers.

### 25. 🟡 `code` Attunement cap of 3 is only a warning, all attuned items still apply

**Subsystem:** Items, Tools, Attunement & Currency · **Location:** `src/components/sheet/EquipmentBlock.tsx:1099-1125,1298-1302; src/lib/characterStats.ts:513-580` · **bugs.md:** NEW

- **RAW (2014):** A creature can be attuned to no more than three magic items at a time; attuning to a fourth fails.
- **App does:** EquipmentBlock computes attunedCount (1013) and shows a gold warning when attunedCount > 3 (1298-1302), but toggleActive (1099-1125) sets attuned:true unconditionally and computeActiveItemEffects (characterStats.ts:513-580) applies the effects of every attuned item with no cap.
- **Example:** Character attunes to Amulet of Health (CON 19), Belt of Hill Giant Str (STR 21), Cloak of Protection (+1 AC/saves), and a 4th item Ring of Protection (+1 AC/saves). RAW the 4th attunement should be impossible, so its +1/+1 must not apply. The app applies all four: AC and saves get +2 from two protection items at once, beyond the legal 3-item limit.
- **Correct handling:** Beyond the warning, either block setting attuned:true when attunedCount is already 3 (the data-knowable, app-enforceable reading), or at least exclude effects from attune-required items past the 3rd from computeActiveItemEffects. Keep equip-only items uncapped.

### 26. 🟡 `code` Racial ASIs are not capped at 20 at derive time, but the write-time HP/AC seed is — inconsistent sheet

**Subsystem:** Races & Subraces · **Location:** `src/lib/characterStats.ts:717-719 (uncapped racial add) vs src/lib/characterSetup.ts:713-714 (effectiveScore clamps Math.min(20, ...))` · **bugs.md:** NEW

- **RAW (2014):** A racial ability score increase can never raise a score above 20 (2014 PHB p.13). deriveCharacterStats is the single authoritative application point and should reflect that cap.
- **App does:** characterStats.ts:717-719 adds racial bonuses to effectiveAbilities with no Math.min(20, ...) (feat ASIs at :732 DO cap). Meanwhile characterSetup.ts:714 seeds maxHp/AC with effectiveScore = Math.min(20, base + racial + feat). So the score used to bake maxHp at creation is capped at 20 while the score shown on the sheet (and used for the CON modifier elsewhere) is uncapped.
- **Example:** Create a Dwarf (race +2 CON), ability method Custom, base CON 20. RAW: racial +2 cannot exceed 20, so CON = 20 (mod +5). App write-time: effectiveScore('con') = min(20, 20+2) = 20 -> mod +5 -> maxHp seeded with +5/level (correct). App render-time: effectiveAbilities.con = 20 + 2 = 22 (mod +6). The sheet displays CON 22 and uses +6 for CON saves/Concentration, but the stored maxHp was computed with +5/level. The displayed score is above the RAW cap and is inconsistent with the HP it baked.
- **Correct handling:** Cap racial ASI application at 20 in deriveCharacterStats (apply Math.min(20, effectiveAbilities[ab] + amount) for the racial loop, mirroring the feat loop), so the derived score never exceeds 20 from racial sources and matches the write-time HP/AC seed. (Items remain intentionally uncapped above this.)

### 27. 🟡 `code` Racial damage resistances never apply (Tiefling fire, Dragonborn ancestry, Genasi, Aasimar, Shadar-kai)

**Subsystem:** Races & Subraces · **Location:** `src/lib/characterStats.ts:977 (resistances sourced only from itemEffects); no race branch in computeActiveItemEffects or deriveCharacterStats reads race.base.traits resistances` · **bugs.md:** BUG-70

- **RAW (2014):** Many races grant damage resistance (Tiefling: fire; Dragonborn: ancestry type; Genasi-fire: fire; Aasimar: necrotic+radiant; Shadar-kai: necrotic). These are passive defenses that should show in the character's resistances.
- **App does:** derived.resistances (CombatBlock 'Defenses') is fed exclusively by active magic-item effects via computeActiveItemEffects (characterStats.ts:977 -> itemEffects.resistances). There is no race -> resistance path; the race trait is stored only as descriptive text (e.g. tiefling traits 'Hellish Resistance': 'You have resistance to fire damage.').
- **Example:** A Tiefling Warlock 1 takes a Fireball for 28 damage. RAW: Hellish Resistance halves fire damage to 14. App: derived.resistances is [] (no item granting fire resistance), so the Defenses readout shows nothing and the player has no in-app indication that fire is resisted; the damage is applied at full unless tracked by hand.
- **Correct handling:** Give races a structured render-time effect model (resistance/immunity/advantage/senses) analogous to ItemEffect[], applied in deriveCharacterStats into derived.resistances. (Logged as a dedicated separate-session restructure.)

### 28. 🟡 `code` Race-granted skill proficiencies are never applied (Elf Perception, Half-Orc Intimidation, etc.)

**Subsystem:** Races & Subraces · **Location:** `src/lib/characterStats.ts:750-774 (effectiveSkillProficiencies covers only feat grants); no race skill path in characterSetup.ts draftToNewCharacter (:737-753 only class draft + background)` · **bugs.md:** BUG-64

- **RAW (2014):** Several races grant fixed or choice skill proficiencies (Elf: Perception; Half-Orc: Intimidation; Bugbear: Stealth; Half-Elf: two of choice).
- **App does:** Neither draftToNewCharacter nor deriveCharacterStats reads race proficiencies into skillProficiencies/effectiveSkillProficiencies. Only class, background, and feat skill grants are wired (effectiveSkillProficiencies at characterStats.ts:750-774 layers feat grants over the stored record; race is absent).
- **Example:** Create an Elf Wizard 1, WIS 12. RAW: Keen Senses grants Perception proficiency -> Perception modifier = +1 (WIS) + 2 (proficiency) = +3, passive Perception 13. App: Perception is not added to skillProficiencies, so the sheet shows Perception +1 and passive Perception 11. The proficiency is silently dropped.
- **Correct handling:** Apply race/subrace skill grants, ideally derived at render time (a raceSkillGrants analog of featSkillGrants), exclude them from the class skill cap, and render them locked/titled 'Race'; handle 'choose N' race grants with a picker like background skills.

### 29. 🟡 `code` Monk Diamond Soul (proficiency in all saving throws) not applied

**Subsystem:** Saving Throws · **Location:** `src/lib/characterStats.ts:797-800 (effectiveSaveProficiencies build); :813-818 (modifier uses it)` · **bugs.md:** NEW

- **RAW (2014):** At Monk level 14, Diamond Soul grants proficiency in ALL six saving throws (PHB Monk).
- **App does:** effectiveSaveProficiencies = [...character.savingThrowProficiencies, ...featDerivedSaves] (characterStats.ts:797-800). featDerivedSaves comes only from feats (Resilient), never from class features. No path adds Monk's remaining four saves at level 14.
- **Example:** Monk 14, WIS 16 (+3), proficient only in STR and DEX saves (Monk's two class saves). PB at level 14 = +5. RAW INT save (Diamond Soul makes it proficient) = d20 + INT mod + 5. App shows INT save = d20 + INT mod + 0, understated by the full +5 proficiency bonus on INT, CON, WIS, and CHA saves.
- **Correct handling:** At derive time, when a class record is monk with owning-class level >= 14, treat all six abilities as save-proficient (add the four missing abilities to effectiveSaveProficiencies). Model as a class-feature grant scoped to the owning monk level (INV-2), parallel to feat-derived saves.

### 30. 🟡 `data` Stone of Good Luck (Luckstone) +1-to-all-saves effect not authored / silently ignored

**Subsystem:** Saving Throws · **Location:** `data/equipment/wondrous_items.json (Stone of Good Luck entry, effects: null); applied-if-authored at src/lib/characterStats.ts:536-542` · **bugs.md:** NEW

- **RAW (2014):** While the Stone of Good Luck (Luckstone) is on your person, you gain a +1 bonus to ability checks AND saving throws (DMG).
- **App does:** The catalog entry has effects: null (verified in public/data/equipment.json), so computeActiveItemEffects contributes nothing for it. The save channel exists: ItemEffect {type:'save', ability:'all', amount:1} is implemented and applied at characterStats.ts:536-542 — the data simply doesn't carry it. Contrast Cloak/Ring of Protection, which DO author {type:'save','all',1} and work.
- **Example:** Character with CON save mod +2 attunes a Luckstone. RAW CON save = d20 + 2 + 1 (Luckstone) = +3. App shows +2 — the +1 is dropped. (The ability-check half of the item is also unrepresented, but the app has no general ability-check bonus channel; the save half IS representable and is being missed.)
- **Correct handling:** Author the Luckstone's effects with {type:'save', ability:'all', amount:1} (data-only fix; the application path already exists per INV-1 affectability principle). The ability-check +1 is currently unrepresentable and may be left as intentionally manual.

### 31. 🟡 `code` Passive Perception / Investigation computed but never surfaced; Observant +5 invisible

**Subsystem:** Skills & Ability Checks · **Location:** `src/lib/characterStats.ts:828-829 (computed); src/components/* (never rendered)` · **bugs.md:** NEW

- **RAW (2014):** Passive Perception = 10 + Perception modifier (+5 advantage / +5 from Observant). It is the standard 'what you notice' value the DM uses constantly. Passive Investigation = 10 + Investigation modifier, +5 from Observant.
- **App does:** deriveCharacterStats computes passivePerception and passiveInvestigation (src/lib/characterStats.ts:828-829) and the Observant feat adds +5 to each (FEAT_EFFECTS line 69, applied lines 823-827), but no component reads derived.passivePerception or derived.passiveInvestigation. A grep of src/components returns zero matches — the values are dead, and Observant has no observable effect on the sheet.
- **Example:** WIS 16 (+3) Wood Elf Ranger, proficient in Perception, level 5 (PB +3). RAW passive Perception = 10 + 3 + 3 = 16. Add the Observant feat → 21. The app correctly derives passivePerception = 16 (and 21 with Observant) but no sheet view shows it, so the player taking Observant for its passive-Perception bonus sees no number change anywhere and cannot read their passive scores.
- **Correct handling:** Render derived.passivePerception and derived.passiveInvestigation on the sheet (e.g. in ProficienciesBlock's skills tab or CombatBlock), so the already-correct values (including the Observant +5) are visible.

### 32. 🟡 `code` Jack of All Trades / Remarkable Athlete (half-proficiency) never applied

**Subsystem:** Skills & Ability Checks · **Location:** `src/lib/characterStats.ts:803-811 (skillModifiers); src/store/dice.ts:92 (ability rolls)` · **bugs.md:** NEW

- **RAW (2014):** Jack of All Trades (Bard 2) adds half proficiency bonus (round down) to any ability check that doesn't already include PB. Remarkable Athlete (Champion Fighter 7) adds half PB (round up) to STR/DEX/CON checks not already proficient. Both raise non-proficient skill and raw ability checks.
- **App does:** skillModifiers only multiplies PB by 1 (proficient) or 2 (expertise), else 0 (src/lib/characterStats.ts:808). SkillProficiency type has no half tier (src/types/character.ts:18). The features exist in the data ('Jack of All Trades' and 'Reliable Talent' appear in classes.json; 'Remarkable Athlete' in subclasses.json) but deriveCharacterStats never reads them. Raw ability rolls likewise add no half-PB (src/store/dice.ts:92).
- **Example:** Bard 4 (PB +2), DEX 14 (+2), NOT proficient in Stealth. RAW with Jack of All Trades: Stealth = +2 (DEX) + 1 (half PB, floor(2/2)) = +3. App shows Stealth = +2 only (no half-prof). At Bard 8 (PB +3) the gap widens: RAW +2 + 1 = +3 vs app +2.
- **Correct handling:** Detect Jack of All Trades / Remarkable Athlete from the character's class/subclass features and, for non-proficient eligible checks, add floor(PB/2) (Remarkable Athlete: ceil(PB/2) on STR/DEX/CON). Requires a half-proficiency concept in skillModifiers and the raw-ability roll path.
- **RESOLVED (2026-07-04, `feat/half-proficiency-checks`):** `half_proficiency_checks` FeatureEffect in `data/class-feature-effects.json` (bard class-keyed; `fighter:champion` subclass-keyed with a per-effect `level` gate). Applied in `deriveCharacterStats`: ledger rows on non-proficient skills (disable-able) + `abilityCheckBonuses` consumed by the dice store and roll-modal itemization for raw checks. Overlapping grants take the larger (never sum); proficient/expertise checks untouched. Vitest-covered.

### 33. 🟡 `code` Reliable Talent floor (treat d20 <10 as 10) not applied to proficient skill rolls

**Subsystem:** Skills & Ability Checks · **Location:** `src/store/dice.ts:79-100` · **bugs.md:** NEW

- **RAW (2014):** Reliable Talent (Rogue 11): whenever the character makes an ability check that lets them add their proficiency bonus, a d20 roll of 9 or lower is treated as a 10.
- **App does:** useDiceStore.roll resolves a skill roll as natural + modifier with no floor (src/store/dice.ts:79, 100). The 'Reliable Talent' feature string is present in classes.json but is never consulted by the roll path or by deriveCharacterStats.
- **Example:** Rogue 11 (PB +4), DEX 16 (+3), Expertise in Stealth (2x PB = +8). Rolls a natural 4. RAW Reliable Talent treats the 4 as 10 → total 10 + 8 = 18. App keeps the 4 → total 4 + 8 = 12, a 6-point understatement on every low roll.
- **Correct handling:** When the character has Reliable Talent and the rolled skill is proficient (PB applies), clamp the natural die to a minimum of 10 before summing. Needs the roll path to know the character has the feature and that PB is included.

### 34. 🟡 `code` Armor stealth disadvantage is derived but never applied to the Stealth roll

**Subsystem:** Skills & Ability Checks · **Location:** `src/components/sheet/ProficienciesBlock.tsx:341,392 (skill roll dispatch); src/lib/characterStats.ts:968 (flag set, unused for rolls)` · **bugs.md:** NEW

- **RAW (2014):** Wearing armor with the Stealth: Disadvantage trait imposes disadvantage on DEX (Stealth) checks.
- **App does:** deriveCharacterStats sets hasStealthDisadvantage when body armor has stealth_disadvantage (src/lib/characterStats.ts:877, 968), but ProficienciesBlock's Stealth row always dispatches advantage: hasAdv || undefined (src/components/sheet/ProficienciesBlock.tsx:392) — it reads only derived.advantages.skills and never passes advantage: false. The stealth-disadvantage flag is consumed nowhere in the roll.
- **Example:** Fighter in Plate (stealth_disadvantage = true), DEX 10 (+0), proficient Stealth (PB +3) → modifier +3. RAW the Stealth check is rolled at disadvantage (2d20 keep lower). App rolls a single normal d20 + 3 — no disadvantage — so the roll is systematically too good when in heavy/medium stealth-penalty armor.
- **Correct handling:** When derived.hasStealthDisadvantage is true and no overriding advantage applies, dispatch the Stealth roll with advantage: false (disadvantage). Ideally net advantage and disadvantage to normal when both present.

### 35. 🟡 `code` Initiative is a static display value and cannot be rolled

**Subsystem:** Speed & Initiative · **Location:** `src/components/sheet/CombatBlock.tsx:339-342; src/types/dice.ts:18-25 (no initiative variant); src/lib/useRollDispatch.ts:10-27 (no init case)` · **bugs.md:** NEW

- **RAW (2014):** At the start of an encounter each combatant rolls initiative: d20 + DEX modifier + initiative bonuses, with advantage when a feature grants it (Feral Instinct, 2024 Alert). Initiative is a die roll, not a passive value.
- **App does:** There is no { type: 'initiative' } member in RollKind, and no dispatch site rolls initiative. The Initiative StatCard renders derived.effectiveInitiative as read-only text; clicking it does nothing. Every other check (skills, saves, abilities, attacks, hit dice) is rollable via useRollDispatch, but initiative is not.
- **Example:** Rogue 5, DEX 18 (effectiveAbilities.dex = 18 → dexMod +4), no init feats. derived.effectiveInitiative = +4 is shown correctly. The player wants to roll initiative for combat: there is no button or row to do so. They must roll a physical d20 and add +4 by hand, while the sheet rolls every other d20 check for them.
- **Correct handling:** Add a RollKind variant { type: 'initiative'; modifier: number; advantage?: boolean } (modifier = derived.effectiveInitiative), wire it in useDiceStore.roll (d20 + modifier, tristate advantage per INV-11) and useRollDispatch, and make the Initiative StatCard click dispatch it. Advantage-granting features (Feral Instinct) would then have somewhere to attach. No write-site changes — purely additive roll support.

### 36. 🟡 `code` Heavy armor below its STR requirement does not reduce speed by 10 ft

**Subsystem:** Speed & Initiative · **Location:** `src/lib/characterStats.ts:792 (effectiveSpeed has no STR-requirement penalty); armor strength_requirement only displayed at src/components/sheet/EquipmentBlock.tsx:497-498` · **bugs.md:** NEW

- **RAW (2014):** If you wear heavy armor whose Strength requirement you do not meet, your speed is reduced by 10 feet (PHB Armor: 'If the Armor table shows 'Str 13' or 'Str 15' ... your speed is reduced by 10 feet' unless you meet it).
- **App does:** effectiveSpeed = character.speed + featSpeedBonus + itemEffects.speed (characterStats.ts:792). There is no term that inspects worn armor's strength_requirement against effectiveAbilities.str. resolveArmor/parseArmorAC only touch AC; strength_requirement is read solely for display (EquipmentBlock.tsx:497-498, 869). So speed is unchanged when an under-strength character dons heavy armor.
- **Example:** Cleric 1, STR 12, wearing Plate (Heavy, strength_requirement 15). RAW speed = race 25/30 minus 10 because STR 12 < 15. App: a dwarf cleric (base 25) wearing Plate still shows effectiveSpeed = 25 instead of 15; a human cleric (base 30) shows 30 instead of 20. The data needed (strength_requirement 15, effectiveAbilities.str 12, body armor worn) is all present at derive time.
- **Correct handling:** In deriveCharacterStats, after resolving the worn body armor, if its armor_type is Heavy and strength_requirement != null and effectiveAbilities.str < strength_requirement, subtract 10 from effectiveSpeed (floored at 0). Apply only to the worn body piece (equipped || attuned), matching the AC-worn gate. Display only, derived once — no stored field.

### 37. 🟡 `data` Eldritch Knight / Arcane Trickster have no spellcasting ability in data, so their spell save DC and attack bonus are zero / unrepresentable

**Subsystem:** Spell Save DC & Spell Attack Bonus · **Location:** `src/lib/characterStats.ts:834-847 (castingClass null -> DC/attack 0); public/data/classes.json (fighter/rogue spellcasting: null) and public/data/subclasses.json (fighter:eldritch-knight / rogue:arcane-trickster spellcasting: null); src/lib/spellcasting.ts:78-94 (getSpellcastingInfo 'none' for no-slot classes)` · **bugs.md:** NEW

- **RAW (2014):** Eldritch Knight (Fighter) and Arcane Trickster (Rogue) are INT-based third-casters: spell save DC = 8 + PB + INT mod, spell attack = PB + INT mod, with slots from their subclass progression. They have real, computable spell numbers from level 3.
- **App does:** The fighter/rogue class records and their eldritch-knight/arcane-trickster subclass records carry spellcasting: null and no slot levels. So castingClass = classRecords.find(c => c.spellcasting?.ability) is null -> the if-guard at characterStats.ts:837 is false -> spellAttackBonus stays 0 and spellSaveDC stays 0. (Compounded: getSpellcastingInfo returns kind 'none' for fighter/rogue, so SpellBlock returns null at SpellBlock.tsx:276 and a single-class EK/AT gets no spellcasting UI at all.)
- **Example:** Eldritch Knight Fighter 7, INT 16 (+3), PB +3. RAW: spell save DC = 8+3+3 = 14, spell attack = +3+3 = +6, with 4/3 first/second-level slots. App: fighter has no spellcasting.ability and no slot data, so castingClass = null -> spellAttackBonus 0, spellSaveDC 0; getSpellcastingInfo(fighter) = 'none' so SpellBlock renders null entirely — the EK cannot track or roll spells, and any spell-attack roll that did reach derived would dispatch at +0.
- **Correct handling:** Author subclass-level spellcasting (ability + a third-caster slot progression) for eldritch-knight and arcane-trickster in the data, and make the casting-ability lookup consider subclass spellcasting (currently only class-record spellcasting.ability is read). Then EK/AT derive INT-based DC/attack like any other caster. This is primarily a data-gap fix plus threading subclass spellcasting into castingClass selection.

### 38. 🟡 `code` Level-up slot-reset uses single-class table, mis-resets multiclass slots

**Subsystem:** Spellcasting Resources (slots, known/prepared, cantrips, pact) · **Location:** `src/components/sheet/LevelUpDialog.tsx:110-111,267-281` · **bugs.md:** NEW

- **RAW (2014):** A character's available spell slots are the COMBINED multiclass table (effective caster level). On a long rest (and structurally, when the slot table changes on level-up the app zeroes used slots), the slot pool should reflect the combined table, not one class's own table.
- **App does:** LevelUpDialog computes oldProfile/newProfile via parseClassSlots(classRecord, currentClassLevel/newLevel) — the SINGLE-class table for the class being leveled — and only sets spellSlotsUsed = {} when THAT class's own table expanded. The multiclass combined table (computeMulticlassSlots) is never consulted in the reset logic.
- **Example:** Cleric 2 / Wizard 1 (3 effective caster levels → multiclass table: 4×1st, 2×2nd). Player levels Wizard 1→2. parseClassSlots(wizard, 1) and parseClassSlots(wizard, 2) both yield only 1st/2nd wizard-table slots; the combined slots that actually changed (cleric+wizard effective level 3→4) are invisible here. The slotsExpanded test compares wizard-only tables, so the combined 2nd-level slot that opened up may not trigger spellSlotsUsed={} — and even when it does, the reset is decided off the wrong (single-class) numbers, so used-slot accounting on the multiclass pool can be left stale.
- **Correct handling:** When character.classes.length > 1, decide slot expansion (and the spellSlotsUsed reset) by comparing computeMulticlassSlots before vs after the level-up, not the single-class parseClassSlots profiles.

### 39. 🟡 `code` Known casters cannot swap a spell on level-up (list only grows)

**Subsystem:** Spellcasting Resources (slots, known/prepared, cantrips, pact) · **Location:** `src/components/sheet/LevelUpDialog.tsx:215-222; src/lib/spellcasting.ts:230-251` · **bugs.md:** NEW

- **RAW (2014):** Bard, sorcerer, ranger, and warlock are KNOWN casters: on each level-up they may replace ONE spell they know with a different spell from their list (in addition to any new spell gained). The total known count is a hard cap, not a floor.
- **App does:** LevelUpDialog only ADDS spells: handleApply appends newCantrips/newSpells to character.spells (lines 215-222). There is no UI to drop/replace an existing known spell. getSpellsKnownIncrease returns only the positive delta, so a level with net-zero new spells but a legal swap offers nothing.
- **Example:** Sorcerer 3 (knows 4 spells incl. Burning Hands) levels to 4. RAW: gains 1 new spell known (→5) AND may swap Burning Hands for, e.g., Misty Step. The app only prompts for the +1 new spell; Burning Hands is stuck in the list forever (removable only via the sheet's manual remove, which is unguarded by the known cap). The intended level-up swap is unrepresented.
- **Correct handling:** On level-up for known casters (casterKind 'known'/'pact'), offer an optional one-for-one swap: let the player pick one existing known spell to retire and one to learn, independent of the spellsKnown increase.

### 40. 🟡 `code` Race-granted weapon proficiencies (Elf/Dwarf/Drow Weapon Training) never applied

**Subsystem:** Weapons & Attack Rolls · **Location:** `src/lib/characterStats.ts:945-947 (weaponProficiencies union); data: public/data/races.json elf.subraces[High Elf].proficiencies = ["Elf Weapon Training"]` · **bugs.md:** NEW

- **RAW (2014):** Elf Weapon Training grants proficiency with longsword, shortsword, shortbow, and longbow; Dwarven Combat Training grants battleaxe/handaxe/light hammer/warhammer; Drow Weapon Training grants rapier/shortsword/hand crossbow. These add the proficiency bonus to attacks even for non-martial classes.
- **App does:** deriveCharacterStats builds weaponProficiencies ONLY from class records (`classRecords.flatMap(c => c.weapon_proficiencies)`). Race/subrace proficiencies — stored in the data as named strings like "Elf Weapon Training" in subrace.proficiencies — are never read into the union, and even if they were, the string "Elf Weapon Training" isn't a weapon name isWeaponProficient would match.
- **Example:** High-Elf Wizard 5 (PB +3), DEX 14 (+2), wielding a Longsword (Martial, but granted by Elf Weapon Training, used two-handed for STR or finesse? Longsword is not finesse, so STR). With STR 14 (+2): RAW to-hit = d20 + 2 (STR) + 3 (PB) = +5. App: Longsword is Martial, Wizard has no martial proficiency and race training is ignored → PB=0 → app shows +2, understated by 3.
- **Correct handling:** Expand race/subrace weapon-training named traits into the actual weapon-name set (a small registry mapping 'Elf Weapon Training' → ['longsword','shortsword','shortbow','longbow'], etc.) and fold them into derived.weaponProficiencies alongside class profs, at the single render-time point.

### 41. 🟢 `code` Feat ASI step can LOWER an effective score that racial ASIs already pushed over 20

**Subsystem:** Ability Scores & Modifiers · **Location:** `src/lib/characterStats.ts:730-733 (vs uncapped racial at 716-719)` · **bugs.md:** NEW

- **RAW (2014):** A half-feat's +1 to an ability either raises it (if under 20) or has no effect (if already at/over the cap). A feat can never reduce a score.
- **App does:** deriveCharacterStats adds racial ASIs uncapped (line 718), then applies feat ASIs as effectiveAbilities[ab] = Math.min(20, effectiveAbilities[ab] + amount) (line 732). When racial already put the score above 20, Math.min(20, …) clamps it DOWN to 20, so taking the feat visibly reduces the ability.
- **Example:** Custom-stat Half-Orc with base STR 20 (custom mode permits up to 20) and racial +2 STR. After the racial step effectiveAbilities.str = 22. The player then takes a half-feat granting +1 STR (asi choice STR). Line 732 computes Math.min(20, 22 + 1) = 20. Adding the feat drops displayed STR from 22 to 20 (mod +6 to +5). RAW: the feat's +1 should have no effect; the score should stay whatever the non-feat value is (and at most 20 under the PC cap), but it should never go DOWN as a result of gaining a feat.
- **Correct handling:** Apply the 20 cap consistently across racial + feat in one capped pass so a later +1 never reduces the running total. Compute the racial+feat sum, then clamp once: effective = min(20, base + racialBonus + cappedFeatBonus). A feat must be monotonic non-decreasing on the score.

### 42. 🟢 `feature` No Standard Array or 4d6-drop-lowest ability-generation method

**Subsystem:** Ability Scores & Modifiers · **Location:** `src/lib/characterSetup.ts:510; src/components/setup/SetupScreen1.tsx:71-74, 199-216` · **bugs.md:** NEW

- **RAW (2014):** PHB offers three standard ability-generation methods: point buy (27 pts, 8-15), standard array (15/14/13/12/10/8), and 4d6-drop-lowest rolled.
- **App does:** The wizard exposes only 'pointbuy' and 'custom' (characterSetup.ts:510; SetupScreen1.tsx:71-74). There is no guided standard-array assignment and no 4d6 roller; custom mode is free numeric entry 1-20 with no validation against any method.
- **Example:** A new player who wants the standard array (15,14,13,12,10,8) must switch to Custom and type each of the six values by hand with no enforcement that they used a legal array; a player wanting 4d6-drop-lowest must roll physically/elsewhere and type the results. Compare HP, which has a dedicated 'Roll' method (SetupScreen1.tsx:64-69) — abilities have no rolled analog.
- **Correct handling:** Custom mode CAN represent both, so this is a UX/feature gap, not a numeric error. If addressed: add a 'standard array' method that offers the six fixed values as an assignment pool, and/or a '4d6 drop lowest' roller that fills the six abilities (cap 1-20). Not a correctness bug — recorded as intentional-manual.

### 43. 🟢 `code` Sheet ability stepper silently mutates BASE when the effective score is feat/racial-capped, and permits base up to 30

**Subsystem:** Ability Scores & Modifiers · **Location:** `src/components/sheet/AbilityBlock.tsx:37-38, 58-61; interacts with src/lib/characterStats.ts:732` · **bugs.md:** NEW

- **RAW (2014):** Raising an ability that is already at its cap should have no effect; the displayed score should not change and no hidden value should drift.
- **App does:** AbilityBlock renders effective (max=30) and on save reverses the delta: bonus = effective - base, writes Math.max(1, v - bonus) to base (AbilityBlock.tsx:58-61). When effective is pinned at 20 by the feat-cap (Math.min(20) at characterStats.ts:732), clicking '+' raises the displayed v to 21, but the re-derive re-clamps effective back to 20 — so the visible score is unchanged while the stored BASE silently increments by 1. The stepper also allows base to climb to 30 (max=38 line) with no relation to the 20 PC cap.
- **Example:** Half-Orc base STR 18, racial +2 -> effective 20. Character also has a +1 STR feat, so effective is min(20, 20+1)=20. Player clicks '+' on the STR stepper: displayed v = min(30, 20+1) = 21; saveScore computes bonus = 20 - 18 = 2 and writes base = max(1, 21 - 2) = 19. Effective re-derives to min(20, 19+2+1)=20 — screen still shows 20, but base silently went 18 -> 19. Repeated clicks keep inflating hidden base with no visible feedback; if the feat is later removed the now-19 base surfaces unexpectedly.
- **Correct handling:** When the displayed effective is at the PC cap (20), the '+' control should be a no-op (disabled or clamp v to the current effective) rather than mutating base. More generally, the editable stepper should bound against the same effective ceiling the derive enforces, so base never drifts above what produces the shown value.

### 44. 🟢 `code` Background tool-category choices stored verbatim as fake tool-proficiency names

**Subsystem:** Backgrounds · **Location:** `src/lib/characterSetup.ts:832-838` · **bugs.md:** NEW

- **RAW (2014):** Backgrounds grant tool proficiencies often as a category choice: 'one type of gaming set', 'one musical instrument of your choice', 'Disguise kit or one type of musical instrument'. The player picks a concrete tool (e.g. Dice Set) and is proficient with THAT tool.
- **App does:** draftToNewCharacter unions bg.tool_proficiencies into toolProficiencies as-is, and SetupScreen3 displays them as plain text. The prose string itself is stored as the proficiency name; no picker resolves it to a real catalog tool. (Tools never feed any derived stat, so there is no roll impact — purely a data-fidelity/UX defect.)
- **Example:** Create a Soldier (tool_proficiencies: ["One type of gaming set", "vehicles (land)"]). The character's stored toolProficiencies contains the literal string 'One type of gaming set' instead of a real gaming set (e.g. Dice Set). 23 of 48 backgrounds have at least one such prose tool entry (Criminal, Entertainer, Guild Artisan, Urban Bounty Hunter's compound 'choose two from...', etc.).
- **Correct handling:** Parse tool prose into a choice picker the way parseBackgroundSkills handles skills: detect 'one type of gaming set' / 'musical instrument' / 'artisan's tools' / explicit names, present a picker populated from the equipment tools catalog, and store the chosen concrete tool name. Strip the prose strings from stored toolProficiencies.

### 45. 🟢 `code` Feylost background offers no language choice despite RAW granting one

**Subsystem:** Backgrounds · **Location:** `src/components/setup/SetupScreen3.tsx:73` · **bugs.md:** NEW

- **RAW (2014):** The Feylost background grants one language chosen from Elvish, Gnomish, Goblin, or Sylvan.
- **App does:** The data encodes the choice as prose inside the languages array (["One of: Elvish, Gnomish, Goblin, or Sylvan"]) with language_choices: 0. The wizard's language picker is driven solely by language_choices, so it renders no picker and grants nothing; the sheet dialog instead merges the prose string as a fake language (see sheet-bg-language-junk).
- **Example:** Create any character with the Feylost background. RAW they should pick one of Elvish/Gnomish/Goblin/Sylvan. The wizard shows langChoiceCount = 0, so no language picker appears and the character ends up with zero background languages (vs the sheet path, which wrongly stores the whole prose sentence).
- **Correct handling:** Either fix the data (set feylost language_choices: 1 and move the option list out of the languages array), or have the wizard/dialog parse choice prose in the languages array into a constrained picker (count from prose, options = the listed languages). Constrain the picker to the listed options rather than ALL_LANGUAGES.

### 46. 🟢 `code` Background-skill detection infers source from proficient options, miscounting overlaps

**Subsystem:** Backgrounds · **Location:** `src/lib/characterSetup.ts:227-239` · **bugs.md:** BUG-29

- **RAW (2014):** When a character is proficient in a skill, exactly one source 'owns' it. Class skill picks are capped at the class's count; background grants are separate and must not consume class picks. When a class pick and a background choice list overlap, the player should resolve which source covers which skill.
- **App does:** skillProficiencies stores only that a skill is proficient, not why. backgroundGrantedSkills reconstructs background ownership by treating any currently-proficient choice option as background-granted. So a choice-option skill the player actually spent a CLASS pick on is mis-attributed to the background and excluded from the class cap, letting the player effectively gain an extra class skill.
- **Example:** Cloistered Scholar (fixed History + choice of Arcana/Nature/Religion) on a Wizard (class options include Arcana, History, Religion; pick 2). Player leaves the background choice unfilled but takes Arcana AND Religion as their two class picks. backgroundGrantedSkills sees Arcana proficient (a background option) and reports it as background-granted, so ProficienciesBlock excludes it from currentClassSkillCount — the cap reads 1/2 and the player can add a third class-option skill (e.g. Investigation) for free, exceeding the 2-pick limit.
- **Correct handling:** Track proficiency source explicitly (e.g. store backgroundSkills: SkillName[] on the character, or tag skillProficiencies entries with their source) so the class cap counts only class-sourced picks and background ownership is unambiguous, instead of inferring it from the option set.

### 47. 🟢 `feature` 2024-edition backgrounds (ability-score increase + Origin feat) not representable

**Subsystem:** Backgrounds · **Location:** `src/types/data.ts:294-308` · **bugs.md:** NEW

- **RAW (2014):** Under the 2024 PHB, a background grants an ability-score increase (+2/+1 or +1/+1/+1 across three listed abilities), an Origin feat, one tool proficiency, and two fixed skills. ASIs from a 2024 background feed effective ability scores; the Origin feat carries its own effects.
- **App does:** The Background type has no ability_score_increases or feat field, and deriveCharacterStats has no path to apply background ASIs or a background-granted feat. All 48 background data files are 2014-format. A 2024 background's ASI and feat are silently impossible to model.
- **Example:** A 2024 Soldier grants +2 STR/+1 CON (or +1/+1/+1) and the Savage Attacker feat. In this app there is no field to hold those, and no derive step would apply them, so a STR 15 (base) character who should render STR 17 from the background ASI renders STR 15. The feat's effects are likewise absent.
- **Correct handling:** If 2024 backgrounds are ever in scope: extend Background with ability_score_increases / asi_choices and a granted feat slug, store the player's ASI allocation as a choice (like raceAsiChoices), and apply both the background ASI and the granted feat inside deriveCharacterStats at render time (never baked at write time, per the render-time policy).

### 48. 🟢 `code` Battle Master Superiority Die size fixed at d8, never scales to d10/d12

**Subsystem:** Class/Subclass Features & Resource Pools · **Location:** `public/data/class-features.json (fighter:battle-master:maneuvers resource.die = 'd8'); src/components/sheet/FeaturesBlock.tsx:213 (renders group.resource.die verbatim)` · **bugs.md:** NEW

- **RAW (2014):** A Battle Master's Superiority Dice are d8 at level 3, become d10 at level 10, and d12 at level 18.
- **App does:** The resource carries a single flat die: "die": "d8". FeaturesBlock renders `(${group.resource.die})` = '(d8)' regardless of fighter level, and resourceCount only scales the COUNT (4/5/6), never the die size.
- **Example:** Battle Master Fighter 11, INT 14. RAW: 5 Superiority Dice, each a d10. The app's tracker label reads 'Superiority Dice (d8)' and shows 5 pips. The count (5) is right but the die size shown is d8, two steps low — a player rolling 1d8 instead of 1d10 for a maneuver loses ~1 point of average effect.
- **Correct handling:** Make FeatureResource.die a by-level table (or add a die-step list) so the displayed die advances d8→d10 at L10→d12 at L18, matching the resource count scaling already present.

### 49. 🟢 `feature` No short/long-rest action to refill resource pools; stored usage not re-clamped on save

**Subsystem:** Class/Subclass Features & Resource Pools · **Location:** `src/components/sheet/FeaturesBlock.tsx:124-129 (setResourceUsed stores raw used); :147 (resUsed clamps only for render); no rest handler in CombatBlock.tsx (only HP-heal resets death saves, :63)` · **bugs.md:** NEW

- **RAW (2014):** Resource pools refresh on the appropriate rest (Superiority Dice on a short or long rest), restoring all expended uses in one action.
- **App does:** There is no rest button anywhere in the sheet; the only reset path is the user manually clicking each spent pip back to available. featureResourcesUsed is stored raw by setResourceUsed and only clamped for DISPLAY (Math.min(used, resTotal)), never written back clamped.
- **Example:** Battle Master 3 (4 dice) spends all 4 in combat; after a short rest the player must click all 4 pips back individually because no 'short rest' control exists. This is consistent with how spell slots and item charges also work (all manual), so it is a representable-but-tedious gap rather than a numeric error — flagged low. The stored-value re-clamp is harmless today because levels only increase, but a future down-level edit could leave used > total persisted.
- **Correct handling:** Optionally add a short/long-rest action that zeroes the relevant featureResourcesUsed / spellSlotsUsed / chargesUsed entries; at minimum clamp featureResourcesUsed to resTotal on write so a stale over-count can't persist. Note: the all-manual model is an intentional app-wide design choice, not unique to features.

### 50. 🟢 `code` Taking damage while at 0 HP does not record a death-save failure

**Subsystem:** Death Saves & Dropping to 0 HP · **Location:** `src/components/sheet/CombatBlock.tsx:58-72 (changeHp) and :183-201 (DeathSaves.toggle, the only failure writer)` · **bugs.md:** NEW

- **RAW (2014):** Whenever a creature at 0 HP takes any damage, it suffers one automatic death-save failure (two failures if the damage is from a critical hit, e.g. a melee hit within 5 ft of an unconscious creature). If the remaining damage equals or exceeds its HP maximum, it dies outright.
- **App does:** changeHp with a negative delta while currentHp is already 0 just re-clamps to 0 and writes currentHp: 0; it never increments character.deathSaves.failures. The DEAD panel and Stabilized logic only react to manual pip clicks.
- **Example:** Fighter at currentHp 0 with deathSaves {successes:0, failures:1}. An enemy hits for 6 damage; player clicks adjust -6. RAW: that damage at 0 HP is an automatic failure → failures should become 2 (and a third hit would kill). App: currentHp stays 0, deathSaves.failures stays 1; the player must remember to also click a failure pip, which is easy to forget and silently under-counts deaths.
- **Correct handling:** When a negative HP delta is applied while currentHp is already 0 (or brings it to 0 with damage still pending), changeHp should also increment deathSaves.failures by 1 (offer/handle +2 for a crit). At minimum the UI should prompt that damage-at-0 = a failure. Acknowledged this borders on situational; flagged because the app DOES auto-handle the inverse (healing resets saves) but silently skips the symmetric damage rule.

### 51. 🟢 `code` Inspiration is a decorative toggle that grants no mechanical advantage

**Subsystem:** Dice Engine, Advantage/Disadvantage & Real-Time Play · **Location:** `src/components/sheet/CombatBlock.tsx:449; src/store/dice.ts:78-107; src/lib/useRollDispatch.ts:10-27` · **bugs.md:** NEW

- **RAW (2014):** Heroic Inspiration lets the character spend it to gain advantage on one d20 test of their choice, then it is consumed.
- **App does:** character.inspiration is a stored boolean toggled by a gold dot in CombatBlock and persisted, but it is never read by any roll dispatch or by useDiceStore.roll. No roll path consults it (grep of src shows only storage/UI references).
- **Example:** Player has inspiration and clicks a skill row to roll Persuasion (CHA +5). RAW they could spend it for advantage (2d20 keep higher +5). App: dispatch is { type:'skill', skill:'persuasion', advantage: hasAdv || undefined }; inspiration is not in the advantage Set, so advantage is undefined and a single d20+5 is rolled. Toggling the dot changes nothing about the roll, there is no prompt to spend it, and the dot never auto-clears.
- **Correct handling:** Either keep it explicitly as a manual reminder tracker (document it as intentionally non-mechanical) OR wire a 'spend inspiration' action that forces advantage:true on the next d20 test and clears the boolean. As-is, the feature looks functional but does nothing.

### 52. 🟢 `code` Spending a hit die logs a heal total but does not change current HP

**Subsystem:** Hit Points & Hit Dice · **Location:** `src/components/sheet/CombatBlock.tsx:274-288 (rollHitDie / rollClassHitDie) · src/store/dice.ts:79,93-94 (heal roll)` · **bugs.md:** NEW

- **RAW (2014):** Spending a hit die on a short rest immediately regains HP equal to the die roll + CON modifier; the expended die is consumed and the HP is added to the character.
- **App does:** rollHitDie / rollClassHitDie dispatch a {type:'heal'} roll (shown in the log as 'Hit Die (dN) … = total') and immediately increment hitDiceUsed / hitDiceUsedByClass, but neither writes currentHp. The die is consumed even though no HP is added unless the player separately reads the log and bumps HP by hand.
- **Example:** Fighter at 12/40 HP, CON +2, spends one d10 hit die. App rolls e.g. 7, logs 'Hit Die (d10) (+2)' total 9, and sets hitDiceUsed 0→1. currentHp stays 12. The hit die is gone but the 9 HP is only applied if the player manually edits current HP to 21. A player who trusts the button loses the heal while still paying the die.
- **Correct handling:** After the heal roll resolves, add the rolled total to currentHp (clamped to adjustedMaxHp) in the same write that increments the used counter — so spending a die and gaining its HP are one atomic action. (If keeping HP fully manual is the deliberate policy, the die should not be consumed until the player confirms applying the heal.)

### 53. 🟢 `code` Remarkable Athlete (Champion Fighter 7) half-proficiency not applied to non-proficient STR/DEX/CON checks

**Subsystem:** Proficiency Bonus · **Location:** `src/lib/characterStats.ts:803-811 (skillModifiers)` · **bugs.md:** NEW

- **RAW (2014):** A Champion Fighter of 7th level adds half their proficiency bonus (rounded up) to any Strength, Dexterity, or Constitution check that does not already use their proficiency bonus.
- **App does:** No Champion/subclass-level check exists in deriveCharacterStats; non-proficient STR/DEX/CON skill checks get abilityMod only (characterStats.ts:807-810).
- **Example:** Champion Fighter 7 (PB +3), STR 16 (+3), NOT proficient in Athletics. RAW Athletics = d20 + 3 + ceil(3/2)=+2 → +5 total. App shows +3 — understated by 2 (the half-PB, rounded up).
- **Correct handling:** When the character has the Champion subclass at Fighter level >= 7, add ceil(pb/2) to non-proficient skill/ability-check modifiers governed by STR/DEX/CON. Requires subclass-aware feature gating (not currently modeled for this passive).
- **RESOLVED (2026-07-04, `feat/half-proficiency-checks`):** implemented via the new subclass-keyed class-feature-effects channel (`"fighter:champion"` entry, per-effect `level: 7` gate on the OWNING class's level, INV-2). See #32 for the shared mechanism.

### 54. 🟢 `code` Subrace hp_bonus_per_level data field is ignored; only a hardcoded hill-dwarf registry works

**Subsystem:** Races & Subraces · **Location:** `src/lib/characterStats.ts:74-76 (SUBRACE_HP_BONUS registry) and :938-939 (lookup); ignored field declared at src/types/data.ts:218` · **bugs.md:** NEW

- **RAW (2014):** Dwarven Toughness grants +1 max HP per character level. The subrace data carries this as the structured field hp_bonus_per_level (Hill Dwarf = 1); any subrace (built-in or homebrew) with that field should get the bonus.
- **App does:** deriveCharacterStats reads SUBRACE_HP_BONUS, a hardcoded registry with a single entry 'hill-dwarf' (characterStats.ts:74-76), instead of character.subrace's data hp_bonus_per_level field. The Subrace type even declares hp_bonus_per_level?: number (data.ts:218) but it is never read anywhere.
- **Example:** A homebrew/edited subrace 'Stone Dwarf' authored with hp_bonus_per_level: 1 on a level-8 character: RAW expects +8 max HP. App: SUBRACE_HP_BONUS['stone-dwarf'] is undefined, so subraceHpBonus = 0 and adjustedMaxHp gets no bonus. (Built-in Hill Dwarf works only because its slug is hardcoded; both paths coincidentally yield +1/level for it, so there is no numeric error for the one shipped case — the gap is latent.)
- **Correct handling:** Derive the per-level HP bonus from the resolved subrace's hp_bonus_per_level field (subrace.hp_bonus_per_level * character.level) inside deriveCharacterStats, replacing the hardcoded registry, so any subrace with the field applies it.

### 55. 🟢 `code` Bard Jack of All Trades does not add half proficiency bonus to initiative

**Subsystem:** Speed & Initiative · **Location:** `src/lib/characterStats.ts:793-794 (effectiveInitiativeBonus / effectiveInitiative compute no half-PB JoAT term)` · **bugs.md:** NEW

- **RAW (2014):** A Bard with Jack of All Trades (level 2+) adds half their proficiency bonus, rounded down, to any ability check that doesn't already include proficiency — including the initiative roll (a DEX check).
- **App does:** effectiveInitiativeBonus = (character.initiativeBonus ?? 0) + featInitiativeBonus + itemEffects.initiative (characterStats.ts:793). Jack of All Trades is a class feature, not a feat or item, and there is no class-feature initiative effect or half-PB logic anywhere in the codebase (grep for jack-of-all / half proficiency returns nothing). A Bard's initiative omits the JoAT bonus.
- **Example:** Bard 5, DEX 16 (dexMod +3), proficiencyBonus +3, no init feats. RAW initiative = +3 (DEX) + floor(3/2)=+1 (JoAT) = +4. App shows effectiveInitiative = +3, missing the +1. At Bard 9 (PB +4) the gap is +2 (floor(4/2)).
- **Correct handling:** Detect Jack of All Trades from the Bard class record (level >= 2) across character.classes[] (INV-2), and add floor(proficiencyBonus/2) into effectiveInitiativeBonus (and, when initiative becomes rollable, into that modifier). Note JoAT also applies to non-proficient skill/ability checks generally; scope appropriately if implemented. Treat as low priority since it is a niche, derive-only adjustment.
- **RESOLVED (2026-07-04, `feat/half-proficiency-checks`):** the DEX grant from `half_proficiency_checks` feeds `effectiveInitiativeBonus` with a `feature:half-prof:initiative` provenance row (breakdown sum asserted). See #32 for the shared mechanism.

### 56. 🟢 `code` Speed bonus tag hard-labeled '(feat)' even for item-sourced bonuses

**Subsystem:** Speed & Initiative · **Location:** `src/components/sheet/CombatBlock.tsx:332-336` · **bugs.md:** NEW

- **RAW (2014):** A displayed modifier label should reflect its actual source; speed can be raised by feats OR magic items (a speed ItemEffect).
- **App does:** CombatBlock.tsx:332-336 renders '+{effectiveSpeed - character.speed} (feat)' whenever effectiveSpeed differs from the stored base. But effectiveSpeed includes itemEffects.speed (characterStats.ts:792), so an item-only speed bonus is mislabeled '(feat)'. (The Max HP tag at line 138-142 correctly says '(feat/race)'.)
- **Example:** Fighter with no speed feats but an active magic item granting +10 ft (speed ItemEffect). effectiveSpeed = base 30 + 10 = 40. The sheet shows '+10 (feat)' even though no feat is involved — the bonus is entirely from the item. INV-5 (every UI claim traces to behavior) is violated for the label text.
- **Correct handling:** Relabel to a source-neutral string such as '(feat/item)' or '(bonus)', mirroring the HP tag's '(feat/race)'. Cosmetic only; no math change.

### 57. 🟢 `code` Multiclass 'Spells Known' cap shows the primary class's count only

**Subsystem:** Spellcasting Resources (slots, known/prepared, cantrips, pact) · **Location:** `src/components/sheet/SpellBlock.tsx:274,412,416-417` · **bugs.md:** NEW

- **RAW (2014):** In a multiclass, each class tracks its own spells known/prepared separately (PHB multiclassing). A known caster's cap is that class's own Spells Known for its own level.
- **App does:** SpellBlock computes spellLimit for known casters as rawSpellsKnown, taken from getSpellcastingInfo(classRecord, classLevel) where classRecord is the PRIMARY class and classLevel is primaryClassLevel. The non-primary known caster's count is never used; one shared 'Spells Known' card mixes all classes' spells against the primary's cap.
- **Example:** Sorcerer 2 (primary) / Bard 3. Primary Sorcerer 2 → rawSpellsKnown = 3. The card shows 'Known X/3' even though the character also legally knows ~6 bard spells (bard 3 = 6 known). A bard-heavy spell list reads as wildly 'over limit (homebrew)' in red, or a sorcerer-only list shows the wrong denominator. The displayed cap is structurally wrong for any multiclass of two known casters.
- **Correct handling:** Track and display known/prepared limits per spellcasting class (sum the per-class caps, or show a per-class breakdown). At minimum, when classes.length>1, derive the known cap from the sum of each known caster class's own Spells Known rather than the primary alone.

### 58. 🟢 `code` Versatile weapons cannot roll their two-handed die

**Subsystem:** Weapons & Attack Rolls · **Location:** `src/lib/characterStats.ts:432,437-438 (damage built from weapon.damage_dice); EquipmentBlock.tsx WeaponRow Dmg dispatch (line 351); data: equipment.json Longsword properties = ['Versatile (1d10)']` · **bugs.md:** NEW

- **RAW (2014):** A versatile weapon deals its larger die of damage when wielded with two hands (e.g. Longsword 1d8 one-handed / 1d10 two-handed).
- **App does:** computeWeaponBonus and the Dmg button use only `weapon.damage_dice`, which stores the one-handed die (Longsword → '1d8'). The two-handed die lives inside the `properties` string ('Versatile (1d10)') and is never parsed or offered; there is no one-/two-handed toggle. The only escape is the manual per-weapon custom-damage override.
- **Example:** Fighter 1, STR 16 (+3), Longsword wielded two-handed (no shield). RAW two-handed damage = 1d10 + 3. App always rolls 1d8 + 3 (the stored damage_dice) — averages 5.5+3 instead of 6.5+3, and there is no UI to choose the 1d10. Player must hand-type the override.
- **Correct handling:** Parse the 'Versatile (NdM)' property and offer a one-/two-handed damage choice (default one-handed if a shield is equipped, else allow two-handed), feeding the larger die into the damage roll. Crit doubling already handles the larger die once it's the base.

---

# Part 3 — Spell data verification

All **567** entries in `public/data/spells.json` were verified field-by-field against authoritative 2014 sources. **Method:**

- **302 SRD-matchable spells** — diffed against open5e's structured `wotc-srd` document (level, school, components V/S/M, concentration, ritual, casting time, range, duration).
- **265 non-SRD spells** (PHB/XGE/TCE/UA) — each fetched from [dnd5e.wikidot.com](https://dnd5e.wikidot.com) and compared field-by-field, quoting the exact stat block; UA flags second-sourced.
- **Every flag cross-checked against a second source.** This is load-bearing: it **rejected 3 false positives** where open5e's SRD school data is itself wrong — open5e lists Revivify as *conjuration* and Mass Cure Wounds / Mass Heal as *conjuration*, but 5thsrd.org **and** the PHB-sourced wiki confirm the local values (Revivify = *necromancy*, the mass heals = *evocation*) are correct. No single source was trusted blindly.
- **Class-list comparison was discarded as unreliable:** open5e's `wotc-srd` `spell_lists` is buggy (it lists Arcane Eye and Barkskin as *cleric* spells, which is wrong), so it cannot be used to audit the local class assignments. Verifying class lists properly would need a separate per-spell wiki pass.

**Result: the local spell data is ~99% accurate.** 5 confirmed/candidate corrections (all minor — no spell's damage, save, or effect was wrong):

| # | Spell | Field | Local | Correct (2014) | Source | Note |
|---|---|---|---|---|---|---|
| 1 | Power Word Stun | components | `V, S` | `V` only | [5thsrd](https://5thsrd.org/spellcasting/spells/power_word_stun/) | spurious Somatic |
| 2 | Conjure Fey | casting_time | `1 action` | `1 minute` | [5thsrd](https://5thsrd.org/spellcasting/spells/conjure_fey/) | |
| 3 | Harm | duration | `Instantanous` | `Instantaneous` | spelling | typo |
| 4 | Shield | casting_time | `…targeted by the` (truncated) | `…the magic missile spell` | PHB | text cut off mid-sentence |
| 5 | Psychic Crush (UA) | components | `V` | `V, S` | [wiki (UA 66)](https://dnd5e.wikidot.com/spell:psychic-crush) | UA/playtest; version-variant, low stakes |

**Not bugs (verified correct or formatting-only):** the local `Concentration, up to X` duration form is correct (open5e merely strips the prefix into a flag); local storing the full reaction-trigger casting-time text (Feather Fall, Hellish Rebuke, Plant Growth) is *more* complete than the abbreviated wiki form; `1 day` vs `24 hours` are equivalent.

> **Fixes:** each row is a one-line edit in the gitignored `data/spells/<slug>.json` source followed by `npm run build:data`. Not yet applied — this is the verification catalog, mirroring Part 2.

### Class-list verification (which classes can cast each spell)

A second full pass checked every spell's **class assignments** against the wiki's "Spell Lists." line
(most-permissive: base list + XGE/Tasha expansions + Artificer; subclass/domain grants excluded). This is
the dimension open5e could NOT be trusted for — its SRD `spell_lists` is buggy (it lists Arcane Eye and
Barkskin as *cleric* spells), and the "66 missing" it implied were **all open5e false positives**.

**Result: 0 content gaps.** Across all 567 spells the authoritative wiki found **no class missing a spell
it should have** — a player of every class can already see every spell they are entitled to. Only flags:

| Spell | Issue | Note |
|---|---|---|
| Encode Thoughts | local lists `wizard`; wiki "Spell Lists. None" | benign *extra* (GGtR wizard spell); local arguably more useful. No action. |
| On/Off (UA), Otherworldly Form (UA) | not on the wiki | UA/playtest; not locatable, not verifiable. |

So the spell catalog is complete on the **access** dimension — no fixes needed there. Combined with the
stat-block pass, the spell data has **5 minor field corrections total and no content/access gaps**.
