# Invariant Catalog

Distilled from the bugs.md root-cause families (audit 2026-06-11, fixes 2026-06-12).
Each invariant: statement → member bugs → grep recipe. Statuses: **ENFORCED** (family
fixed; recipe guards regressions) | **OPEN** (violations still live; recipe finds them).

Maintenance rule: when a fix session closes a family, flip its status here and add
any new invariant the fix established. Grep patterns are ripgrep syntax.

---

## INV-1 — Effects apply exactly once, at render time — ENFORCED

Stored fields are base values. Racial ASIs and feat effects (`FeatStatDelta`,
`FEAT_EFFECTS`, `SUBRACE_HP_BONUS`) apply only inside `deriveCharacterStats`.
Write sites record choices (`feats`, `featChoices`, `raceAsiChoices`) — never
resulting stat changes. Both failure directions are real: write-time bake ⇒
double-count; no application ⇒ data silently ignored (see `feature-effect-system`
skill for the second direction).

- Members (fixed): BUG-01, 02, 05, 13, 36
- Recipe: in any write site (characterSetup.ts, LevelUpDialog, FeatsBlock,
  CharacterPage dialogs), flag arithmetic on `abilities`, `speed`,
  `initiativeBonus`, or `maxHp` that mirrors a derive-time computation:
  `rg -n "speed\s*[:+]|initiativeBonus|applyRaceAsi|applyFeatAsi" src/lib/characterSetup.ts src/components/sheet/LevelUpDialog.tsx src/components/sheet/FeatsBlock.tsx`

## INV-2 — Never read primary class where all classes matter — PARTIALLY OPEN

Any rule consuming class data (proficiency, prerequisites, spell lists, ASI levels,
hit dice, slots) must consider `character.classes[]` / all class records, not
`character.class`, `character.level`, or a lone `classRecord`.

- Members fixed: BUG-03, 04, 06, 11, 15. Still open: BUG-10 (expertise cap uses
  total level), 16 (pact slots dropped), 18 (HP roll ignores secondary dice),
  19 (secondary ASI levels), 22 (hit-dice roll primary die only), 38 (lone
  half-caster slots).
- Recipe: `rg -n "character\.class[^e]" src/` and `rg -n "character\.level" src/`
  — every hit in mechanics code needs a justification (display of primary class is
  fine; math is suspect).

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

## INV-5 — Every UI claim traces to behavior — OPEN

Labels, help text, and displayed overrides must be backed by the code path they
describe. Audit display and behavior sites as a pair.

- Members open: BUG-07 ("(feat)" label includes subrace HP), BUG-20 (customDamage
  displayed but calc.* rolled), BUG-28/33 (help text promises +2-to-one ASI the
  toggle can't produce)
- Recipe: for each override/option field (`custom*`, toggle help text), list its
  display sites and behavior sites; both must consume it:
  `rg -n "customDamage|customToHit" src/`

## INV-6 — Add/remove symmetry — OPEN

Whatever an add path establishes (prompts, derived bookkeeping, modifier sources),
the remove path must tear down or re-prompt.

- Members open: BUG-09 (bonus-item prompt only when modifier unset), BUG-21
  (`spellBonusModifier` orphaned after item removal — no edit path at all)
- Recipe: for each `addX`, read the paired `removeX` and diff their side effects:
  `rg -n "SPELL_BONUS_ITEM_NAMES|spellBonusModifier" src/`

## INV-7 — Threshold-crossing state resets per RAW — OPEN

State that accumulates below/above a threshold (death saves at 0 HP) must reset on
EVERY crossing path, not just one.

- Member open: BUG-23 (death saves persist after healing unless fully dead; Max-HP
  stepper path also raises HP without reset)
- Recipe: find all writes to `currentHp` and check each ≤0→>0 transition resets
  `deathSaves`: `rg -n "currentHp" src/components/sheet/`

## INV-8 — Known duplication map — OPEN

Logic duplicated across files must be fixed in all copies or extracted. Current map:

| Logic | Copies | Status |
|---|---|---|
| ASI toggle (deselect-on-second-click defect) | `LevelUpDialog.toggleAsi`, `SetupScreen1.toggleAsiAbility` | both defective (BUG-28/33) — fix together via shared helper |
| Legacy CSS var references | `InfoPopup.tsx`, `SelectionList.tsx`, `SpellBlock.tsx` (`--color-accent-2`); `RollButton.tsx`, `DataManagementDialog.tsx:268`, `EquipmentBlock.tsx:330` (`--color-accent`) | open (BUG-25/32 + two refs found 2026-06-12 the audit missed) |

- Recipe: `rg -n "color-accent[^-]|color-accent-2" src/` (palette);
  before fixing any toggle/cap/parse logic, grep its key identifiers for siblings.

## INV-9 — `skillProficiencies` has no source tracking — OPEN (design gap)

The record stores *that* a skill is proficient, not *why* (class pick vs background
vs feat). Every cap count or picker filter built on it miscounts. Treat any
"count proficient skills" logic as suspect until source tracking exists.

- Members open: BUG-27, 29, 30, 37
- Recipe: `rg -n "skillProficiencies" src/ -l` — audit each consumer that counts
  or gates.

## INV-10 — Data pipeline allowlist and nullable shapes — OPEN

Only the 11 `EQUIPMENT_CATEGORIES` files compile; other files in `data/equipment/`
are silently invisible. Weapon/firearm `damage_dice`/`damage_type` are nullable —
display templates must null-guard. Validator required-fields are the contract
(CLAUDE.md table now matches it).

- Members open: BUG-42/43/44 (stranded staging files), 49 (unparseable
  `ac_formula` shapes), 51 ("null null" templates)
- Recipe: `rg -n '\$\{.*damage_dice' src/` (raw interpolation);
  `ls data/equipment/` vs the allowlist in build-data.js.

---

## RAW assertions (check against any game-mechanics code)

- Level-up always grants ≥1 HP (BUG-08 open: stepper allows 0).
- Regaining ANY hit points resets both death-save counters (BUG-23 open).
- An ASI may be +2 to one ability OR +1/+1 (BUG-28/33 open: +2 unreachable).
- Spells known/prepared are NOT capped per level by slot counts (BUG-24 open).
- The PHB multiclass slot table applies only when ≥2 spellcasting classes are
  combined; a lone caster uses its own class table (BUG-38 open).
- Warlock pact slots are separate from, and additive to, multiclass slots; they
  refresh on short rest (BUG-16 open).
- Hit dice pools are per-class (die type and count); short-rest healing is
  roll + CON mod (BUG-22 open).
- When two sources grant the same skill proficiency, the player picks a different
  skill instead (BUG-27/29 open).
- Feat ASIs cap the ability at 20; racial ASIs apply on top of base scores.
