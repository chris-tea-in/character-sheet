# Invariant Catalog

Distilled from the bugs.md root-cause families (audit 2026-06-11, fixes 2026-06-12).
Each invariant: statement → member bugs → grep recipe. Statuses: **ENFORCED** (family
fixed; recipe guards regressions) | **OPEN** (violations still live; recipe finds them).

Maintenance rule: when a fix session closes a family, flip its status here and add
any new invariant the fix established. Grep patterns are ripgrep syntax.

---

## INV-1 — Effects apply exactly once, at render time — ENFORCED

Stored fields are base values. Racial ASIs, feat effects (`FeatStatDelta`,
`FEAT_EFFECTS`, `SUBRACE_HP_BONUS`), and equipped-item effects (armor `ac_formula`,
wondrous `spell_focus`) apply only inside `deriveCharacterStats`. Write sites
record choices (`feats`, `featChoices`, `raceAsiChoices`, `equipment`) — never
resulting stat changes. Both failure directions are real: write-time bake ⇒
double-count; no application ⇒ data silently ignored (see `feature-effect-system`
skill for the second direction). Spell-focus bonuses joined this set 2026-06-13
(session 3): `wondrous_items.spell_focus` derives into `spellAttackBonus`/
`spellSaveDC`; the manual `spellBonusModifier` is now an override-only field.

- Members (fixed): BUG-01, 02, 05, 13, 36; spell focus BUG-09/21 (render-time, session 3)
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
`featChoices`, `armorClass`, `initiativeBonus`, `savingThrowProficiencies`,
`notes`, expertise. **Any new sheet-managed field must be added to that merge.**

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
  **render-time derivation** (INV-1). Equipped focus items annotated with
  `spell_focus: {bonus, attack, save_dc, class}` in `wondrous_items.json`
  contribute to `spellAttackBonus`/`spellSaveDC` inside `deriveCharacterStats`,
  scoped to the casting class (`class: null` = any caster). No add/remove prompt,
  no `SPELL_BONUS_ITEM_NAMES` set (deleted). `character.spellBonusModifier`
  survives only as a manual homebrew override (SpellBlock pencil affordance) for
  un-cataloged focuses — default 0.
- Recipe: for each `addX`, read the paired `removeX` and diff their side effects.
  For spell focus specifically there is now nothing to tear down (derive-time);
  verify no write site mutates `spellBonusModifier` on equip/unequip:
  `rg -n "spellBonusModifier|spell_focus" src/`

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
- **Background-granted** skills are computed in `CharacterPage` and passed as
  `backgroundSkills` to ProficienciesBlock; the class skill cap excludes them.

Members fixed (2026-06-13): BUG-27 (setup excludes bg skills from class options),
29 (cap excludes bg + feat skills), 30 (dots from derived + locked), 37 (expertise
picker is proficient-but-not-expert, from derived). No source field is stored on
the record itself — class-vs-manual picks are still indistinguishable, so a NEW
counting consumer must reuse `backgroundSkills` + `featSkillGrants`, not re-derive
from the raw record.

- Recipe: `rg -n "skillProficiencies" src/ -l` — any new consumer that COUNTS or
  GATES must subtract `backgroundSkills` and `featSkillGrants.*`.

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
