# Invariant Catalog

Distilled from the bugs.md root-cause families (audit 2026-06-11, fixes 2026-06-12).
Each invariant: statement → member bugs → grep recipe. Statuses: **ENFORCED** (family
fixed; recipe guards regressions) | **OPEN** (violations still live; recipe finds them).

Maintenance rule: when a fix session closes a family, flip its status here and add
any new invariant the fix established. Grep patterns are ripgrep syntax.

---

## INV-1 — Effects apply exactly once, at render time — ENFORCED

Stored fields are base values. Racial ASIs, feat effects (`FeatStatDelta`,
`FEAT_EFFECTS`, `SUBRACE_HP_BONUS`), worn-armor AC (`ac_formula` + `bonus`), and
active magic-item effects apply only inside `deriveCharacterStats`. Write sites
record choices (`feats`, `featChoices`, `raceAsiChoices`, `equipment`, and the
`EquipmentItem.attuned`/`equipped` flags) — never resulting stat changes. Both
failure directions are real: write-time bake ⇒ double-count; no application ⇒ data
silently ignored (see `feature-effect-system` skill for the second direction).
**Item effects (2026-06-14):** magic items carry a structured
`effects: ItemEffect[]` array (ac [optional `condition:'unarmored'`]/unarmored_ac
[set base, unarmored only]/save/ability_set/ability_bonus/skill/speed/initiative/
damage [global flat, weapon+unarmed]/damage_dice [weapon-only rider, another type]/
max_hp [flat + perLevel]/resistance/immunity/
unarmed [unarmed-only die/type + atk/dmg override]/language [grants a known
language, locked-derived]/spell_attack/spell_save_dc). `computeActiveItemEffects`
(renamed from `computeAttunedItemEffects`) is the single application helper. **The
gate is attune-vs-equip:** an item's effects apply when *active* — attune-required
items (`catalog.attunement === true`) when `EquipmentItem.attuned`, all others when
`EquipmentItem.equipped`. Item ability changes are **uncapped** (distinct from the
feat-ASI `Math.min(20, …)` path). **Armor AC + its numeric `bonus`/`ac_formula` now
also gate on worn** (`equipped || attuned`) — unworn armor is inert inventory and AC
falls back to the manual `armorClass` stepper (2026-06-14; was previously applied for
any armor merely present in inventory). Body-armor/shield equip is **exclusive**
(EquipmentBlock `toggleActive` unwears the same slot) so the AC source is
unambiguous. Weapons treat `equipped` as a **loadout label only** — it surfaces them
in the Loadout block + activates any magic `effects[]`, but never blocks rolling
(base to-hit/damage from `computeWeaponBonus` is always available). Active items are
**pulled out** of their type sections (the `weaponItems`/`armorItems`/`wondrousInItems`/
`gearItems` filters exclude `isActive(e)`) and render only in the **Loadout** block via
`renderRow` (full controls; in-row `ActiveTag` marks Attuned vs Equipped). The
**`damage_dice`** effect (rider damage of another type, e.g. Flame Tongue → +2d6
fire) is **weapon-specific**: it is read from the weapon's OWN `effects` in
`WeaponRow` (gated on the weapon being active) and threaded through the attack as
`RollKind.extraDamage` → `DiceRollModal` rolls each rider on its own die group (crit
doubles), NOT through the global `computeActiveItemEffects` accumulator.
**Variable-base magic weapons** ("any sword / any weapon", detected by
`isVariableBaseWeapon`): the player picks the mundane base via a per-item
`EquipmentItem.baseWeapon` (stored on the equipment blob, no migration). `renderRow`
merges the chosen base's `damage_dice`/`damage_type`/`properties`/`weapon_type` into
the magic entry (keeping its `bonus` + `effects`) before `computeWeaponBonus`, so
to-hit ability (finesse/ranged) and proficiency follow the real base. Unset →
the catalog's baked default damage is the fallback. **Variable-base magic armor**
("any armor / Varies", `isVariableBaseArmor` exported from characterStats) is the
analog: `EquipmentItem.baseArmor` stores the chosen mundane armor and `resolveArmor`
in the AC block swaps its `ac_formula`/`armor_type`/`stealth_disadvantage`/
`strength_requirement` into the magic entry (keeping `bonus` + `effects`) before the
SAME `parseArmorAC` path — no data mutation, no forked AC route. Unset → `ac_formula`
stays "Varies", `canComputeAC = false`, AC falls back to the manual stepper. The base
picker is **centralized** on `EquipmentBlock` (`basePickerItem`); rows open it via an
`onChooseBase` callback (not local state). Activating a variable-base item with no base
chosen (`needsBase`) fires an `InfoPopup` prompt → "Choose base" opens the picker; a
persistent gold "set base" pill in the Loadout row covers dismissed/pre-existing cases.
The unarmored AC effects (`ac` with
`condition:'unarmored'`, and `unarmored_ac` set-base) apply only when no body armor
is worn — an app-knowable condition. This **replaced** the old
`wondrous_items.spell_focus` mechanism: spell-focus items are now authored as
`spell_attack`/`spell_save_dc` effects. The manual `spellBonusModifier` remains an
override-only field. **Charges** (`catalog.charges` + `EquipmentItem.chargesUsed`)
are a separate **usage tracker**, NOT a stat effect — they never enter
`deriveCharacterStats`; the pip UI lives in EquipmentBlock.

**Affectability principle (the rule for authoring item effects):** for each clause of
a magic item — (1) if the sheet has a representation for the attribute, apply it via a
structured `ItemEffect` at render time (never a write-time bake); (2) if the clause
needs knowledge the app cannot represent (narrative curses, creature-scoped
(dis)advantage, **DM-chosen variable damage types** e.g. Ring/Armor of Resistance),
ignore it; (3) when unsure whether a clause is affectable, ask. Adding a NEW
affectable attribute = one `ItemEffect` variant + one accumulator in
`computeActiveItemEffects` + one consumer + build validation (data→type→
application; never per-item code). Affectability roadmap (data-only once the effect
type exists): done = ac/unarmored_ac/save/ability/skill/speed/init/damage/
**damage_dice**/unarmed/spell atk-DC/**language**/**max_hp**/**resistance**/
**immunity**; future =
proficiency grants (reuse the feat-grant lock UI); ignore = creature-scoped
(dis)advantage, narrative curses, conditional triggers, DM-chosen variable types.
Item-granted languages mirror feat skill grants: exposed as
`derived.itemGrantedLanguages`, rendered locked, never written to `character.languages`.
Resistances/immunities surface read-only in CombatBlock ("Defenses") from
`derived.resistances`/`immunities`.

**Class features (2026-06-19):** selected class/subclass feature options
(`character.classFeatureChoices`, group key → option slugs) carry an optional
`FeatureEffect[]`; `computeFeatureEffects` (characterStats.ts) is the single
render-time application point, parallel to `computeActiveItemEffects`. It applies
the `ac` effect (Fighting Style: Defense → +1 AC while body armor worn) into
`effectiveAC`, and exposes the weapon-conditional `weapon_attack`/`weapon_damage`
shapes as `derived.featureWeaponEffects`; those fold **per-weapon** into
`computeWeaponBonus` via `computeFeatureWeaponBonus` (Archery +2 ranged to-hit,
Dueling +2 one-handed-melee damage — Dueling's "no other weapon" clause is
approximated as "melee, not Two-Handed", same simplification policy as advantages).
`WeaponRow` is the single consumer, so display and the dice roll share the result.
Group applicability + known-count are resolved by `src/lib/classFeatures.ts`
(`applicableGroups`/`knownCount`/`resourceCount`) from the OWNING class's level
(INV-2). Option prerequisites are a **soft, non-blocking** picker warning
(`meetsFeatureOptionPrereqs`: level / chosen-pact-boon / known-cantrip), mirroring
FeatsBlock. `featureResourcesUsed` is a usage tracker (Superiority Dice), never a
stat effect.

- Members (fixed): BUG-01, 02, 05, 13, 36; spell focus BUG-09/21 (render-time,
  session 3; folded into attuned-item `effects` 2026-06-14)
- Recipe: in any write site (characterSetup.ts, LevelUpDialog, FeatsBlock,
  CharacterPage dialogs), flag arithmetic on `abilities`, `speed`,
  `initiativeBonus`, or `maxHp` that mirrors a derive-time computation:
  `rg -n "speed\s*[:+]|initiativeBonus|applyRaceAsi|applyFeatAsi" src/lib/characterSetup.ts src/components/sheet/LevelUpDialog.tsx src/components/sheet/FeatsBlock.tsx`

## INV-2 — Never read primary class where all classes matter — ENFORCED

Any rule consuming class data (proficiency, prerequisites, spell lists, ASI levels,
hit dice, slots) must consider `character.classes[]` / all class records, not
`character.class`, `character.level`, or a lone `classRecord`.

- Members fixed: BUG-03, 04, 06, 11, 15 (2026-06-12); BUG-10 (expertise cap per
  class level), 16 (pact slots via slots+pact profile), 18 (HP roll sums all
  class dice), 19 (`getAllAsiSlots` spans all classes), 22 (per-class hit-dice
  pool in `hitDiceUsedByClass`), 38 (lone half-caster uses own slot table) — all
  2026-06-13. No known open members.
- Recipe: `rg -n "character\.class[^e]" src/` and `rg -n "character\.level" src/`
  — every hit in mechanics code needs a justification (display of primary class is
  fine; math is suspect). `computeMulticlassSlots` and `getExpertiseCap` now take
  all class records; new multiclass math must do the same.

## INV-3 — `classes[]` is the source of truth — ENFORCED

`updateCharacter` re-derives legacy `class`/`subclass`/`level` from `classes[]` on
every write. Any edit changing class structure must write `classes[]` too, or it
reverts on reload while appearing to work in-session.

- Members (fixed): BUG-34, 35
- Recipe: `rg -n "save\(\{[^}]*(class|subclass|level)" src/pages src/components/sheet`
  — any save of legacy fields without an accompanying `classes:` is a violation.

## INV-4 — Edit round-trip is idempotent and lossless — ENFORCED

`characterToDraft` → wizard → `draftToNewCharacter` → edit merge must preserve
every sheet-managed field and produce identical output when nothing is changed.
The edit merge in `CreateCharacterPage.handleFinish` preserves: `feats`,
`featChoices`, `featureResourcesUsed`, `armorClass`, `initiativeBonus`,
`savingThrowProficiencies`, `notes`, expertise. **Any new sheet-managed field must
be added to that merge.** `classFeatureChoices` is the exception that proves the
rule: it is **wizard-managed** (round-tripped via `characterToDraft` →
`SetupDraft.classFeatureChoices` → `draftToNewCharacter`, edited on the wizard's
Class Features screen), so the merge takes the NEW value, not `existing.*` —
matching spells/skills. Its sibling `featureResourcesUsed` (Superiority Dice spent)
is pure sheet usage state and IS preserved from existing.

- Members (fixed): BUG-12, 13, 14
- Recipe: when adding a `Character` field, check it appears in BOTH
  `characterToDraft`/edit merge AND import/export. Scenario test: Edit → Save
  with zero changes must be a no-op diff.

## INV-5 — Every UI claim traces to behavior — ENFORCED

Labels, help text, and displayed overrides must be backed by the code path they
describe. Audit display and behavior sites as a pair.

- Members fixed: BUG-07 ("(feat)" label → "(feat/race)"), BUG-20 (`customDamage`
  parsed and rolled, not just shown), BUG-28/33 (`toggleAsiSelection` makes the
  +2-to-one ASI reachable) — all 2026-06-13.
- Recipe: for each override/option field (`custom*`, toggle help text), list its
  display sites and behavior sites; both must consume it:
  `rg -n "customDamage|customToHit" src/`

## INV-6 — Add/remove symmetry — ENFORCED

Whatever an add path establishes (prompts, derived bookkeeping, modifier sources),
the remove path must tear down or re-prompt.

- Members structurally dissolved (2026-06-13, session 3): BUG-09/21 no longer
  exist as add/remove-symmetry problems — the spell-focus bonus moved to
  **render-time derivation** (INV-1). As of 2026-06-14 the `spell_focus` field is
  gone entirely: spell-focus items are authored as `spell_attack`/`spell_save_dc`
  entries in their `effects` array and apply via `computeActiveItemEffects` while
  active (per-class scoping dropped in v1). No add/remove prompt, no
  `SPELL_BONUS_ITEM_NAMES` set. `character.spellBonusModifier` survives only as a
  manual homebrew override (SpellBlock pencil affordance) — default 0.
- Recipe: for each `addX`, read the paired `removeX` and diff their side effects.
  Activation toggles are pure flag flips (`updateItem(id, { attuned })` for
  attune-required items, `{ equipped }` otherwise) — effects derive at render time,
  so there is nothing to tear down. Charges flip `chargesUsed` only (usage state, no
  stat effect). Verify no write site bakes item effects or mutates
  `spellBonusModifier`/HP/AC on activate/deactivate:
  `rg -n "spellBonusModifier|spell_focus|attuned|equipped|chargesUsed" src/`

## INV-7 — Threshold-crossing state resets per RAW — ENFORCED

State that accumulates below/above a threshold (death saves at 0 HP) must reset on
EVERY crossing path, not just one.

- Member fixed (2026-06-13): BUG-23 — `changeHp` resets `deathSaves` on any
  ≤0→>0 transition when either counter is non-zero, not only when fully dead.
- Recipe: find all writes to `currentHp` and check each ≤0→>0 transition resets
  `deathSaves`: `rg -n "currentHp" src/components/sheet/`

## INV-8 — Known duplication map — ENFORCED

Logic duplicated across files must be fixed in all copies or extracted. Current map:

| Logic | Copies | Status |
|---|---|---|
| ASI toggle (deselect-on-second-click defect) | `LevelUpDialog.toggleAsi`, `SetupScreen1.toggleAsiAbility` | FIXED 2026-06-13 — both call shared `toggleAsiSelection` in characterSetup.ts (BUG-28/33) |
| Legacy CSS var references | `InfoPopup.tsx`, `SelectionList.tsx`, `SpellBlock.tsx` (`--color-accent-2`); `RollButton.tsx`, `DataManagementDialog.tsx`, `EquipmentBlock.tsx` (`--color-accent`) | FIXED 2026-06-13 — all map to `--color-accent-gold`/`--color-accent-red` (BUG-25/32) |

- Recipe: `rg -n "color-accent[^-]|color-accent-2" src/` (palette) — should return
  only the `globals.css` token definition; before fixing any toggle/cap/parse logic,
  grep its key identifiers for siblings.

## INV-9 — `skillProficiencies` source tracking — PARTIALLY ENFORCED

The stored record still stores *that* a skill is proficient, not *why* — but the
two source signals consumers actually need are now derived:
- **Feat-granted** skills are exposed as `derived.featSkillGrants.{proficient,expertise}`.
  Render dot state from `derived.effectiveSkillProficiencies` (not the stored
  record) and lock feat-sourced dots so a click can't write a duplicate.
- **Background-granted** skills are parsed by `parseBackgroundSkills` (characterSetup.ts)
  into `{ fixed, choice }`: a background's `skill_proficiencies` mixes plain skill
  names ("Insight") with **choice prose** ("Your choice of two from: …", ability-
  scoped "One Int, Wis, or Cha skill of your choice"). Raw `toSkillName` over the
  list silently drops every choice entry (returns null) — those 7 backgrounds
  granted nothing and offered no picker (fixed 2026-06-19). Pickers render in
  SetupScreen3 (wizard) and BackgroundPromptDialog (sheet background change); picks
  bake into `skillProficiencies` (`draft.backgroundSkillChoices` is wizard-local — no
  Character field, no migration). The class cap excludes background skills via
  `backgroundGrantedSkills(list, character.skillProficiencies)` = fixed ∪ (choice
  options ∩ proficient). **Any consumer reading a background's granted skills must use
  `parseBackgroundSkills`/`backgroundGrantedSkills`, never `list.map(toSkillName)`.**

Members fixed (2026-06-13): BUG-27 (setup excludes bg skills from class options),
29 (cap excludes bg + feat skills), 30 (dots from derived + locked), 37 (expertise
picker is proficient-but-not-expert, from derived). Background skill-choice prose
handled 2026-06-19 (parser + wizard/sheet pickers). No source field is stored on
the record itself — class-vs-manual picks are still indistinguishable, so a NEW
counting consumer must reuse `backgroundSkills` + `featSkillGrants`, not re-derive
from the raw record.

- Recipe: `rg -n "skillProficiencies" src/ -l` — any new consumer that COUNTS or
  GATES must subtract `backgroundSkills` and `featSkillGrants.*`.
  `rg -n "skill_proficiencies" src/` — every hit must route through
  `parseBackgroundSkills`/`backgroundGrantedSkills`; a raw `.map(toSkillName)` over
  the list drops choice-prose entries.

## INV-10 — Data pipeline allowlist and nullable shapes — ENFORCED

Only the 11 `EQUIPMENT_CATEGORIES` files compile; other files in `data/equipment/`
are silently invisible. Weapon/firearm `damage_dice`/`damage_type` are nullable —
display templates must null-guard. Validator required-fields are the contract
(CLAUDE.md table now matches it).

- Fixed (2026-06-13): 49 (`parseArmorAC` handles the magic-armor shapes;
  "Varies"/"Varies + N" → manual-AC fallback), 51 (weapon damage templates
  null-guard `damage_dice`/`damage_type`). Data fixes 45/47/48/50 applied to the
  gitignored `data/` tree (re-apply if restored from backup).
- Stranded-files family closed (2026-06-13, session 3): BUG-42 (`_gap_*` files
  were obsolete string checklists, all 217 names already live → deleted), BUG-43
  (11 genuinely-new items merged into `wondrous_items.json`, staging file deleted),
  BUG-44 (`gear.json` deleted; Fargab/Narycrash dropped). **Recurrence is now
  guarded:** `build-data.js` scans `data/equipment/` after the equipment IIFE and
  pushes a warning for any `*.json` outside the allowlist (warning only, never an
  error) — a new staging file can no longer strand silently.
- Recipe: `rg -n '\$\{.*damage_dice' src/` (raw interpolation);
  `ls data/equipment/` should equal the allowlist; `npm run build:data` must emit
  no `not in EQUIPMENT_CATEGORIES` warning.

---

## RAW assertions (check against any game-mechanics code)

All of these are now ENFORCED in code (fixed 2026-06-13 unless noted); keep them
as a checklist when touching the relevant path.

- Level-up always grants ≥1 HP (BUG-08: stepper floors at 1).
- Regaining ANY hit points resets both death-save counters (BUG-23).
- An ASI may be +2 to one ability OR +1/+1 (BUG-28/33: `toggleAsiSelection`).
- Spells known/prepared are NOT capped per level by slot counts (BUG-24).
- The PHB multiclass slot table applies only when ≥2 spellcasting classes are
  combined; a lone caster uses its own class table (BUG-38).
- Warlock pact slots are separate from, and additive to, multiclass slots; they
  refresh on short rest (BUG-16: `slots+pact` profile, separate `PACT_SLOT_KEY`).
- Hit dice pools are per-class (die type and count); short-rest healing is
  roll + CON mod (BUG-22: `hitDiceUsedByClass`, `heal` roll kind).
- When two sources grant the same skill proficiency, the player picks a different
  skill instead (BUG-27/29: setup filter + cap exclusion).
- Feat ASIs cap the ability at 20; racial ASIs apply on top of base scores (INV-1).
