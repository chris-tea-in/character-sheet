# Modifier Ledger — Progress & Continuation (resume here)

**For a fresh agent / post-compaction.** This is the authoritative "where we are, what's next, how to
continue" doc for the Modifier Ledger feature. Read this first, then the artifacts it points to.

_Last updated: 2026-06-24._

---

## 1. One-paragraph context

We are building the **Modifier Ledger**: every value the app auto-derives or auto-grants must be
(1) traceable to its source, (2) individually disableable/re-enableable, (3) augmentable with the
player's own entry. Before this, we did a full rules audit (DND_RULES_REFERENCE.md), verified all 567
spells (Part 3), and mapped every modifier source per block (MODIFIER_SOURCE_MATRIX.md). The ledger's
**P1 + AC/Prof slice is built and green**; P2+ and the broader rollout are planned.

## 2. Current state

- **Branch:** `feat/modifier-ledger-p1` (cut from `feat/soft-locks-homebrew`). **Uncommitted.** `main`
  is gated on explicit user go-ahead (per CLAUDE.md Git Workflow) — do NOT push `main` without it.
- **Tests/typecheck:** `npx vitest run` → **175 pass**; `npx tsc -p tsconfig.app.json --noEmit` → clean.
- **Heads-up — pre-existing uncommitted changes rode onto this branch** (NOT part of the ledger):
  `EquipmentBlock.tsx`, `DescriptionBlock.tsx`, `ContainerInventoryDialog.tsx`, `FeatsBlock.tsx`,
  `ui/dialog.tsx`, `bugs.md`, plus two hunks in `CombatBlock.tsx` (`HpSection` BUG-66 floor-at-0,
  `DeathSaves` BUG-67 stabilize-to-1HP). Separate these out before any commit.
- **Edit/Write are auto-approved** this session via two unscoped rules in `.claude/settings.local.json`
  (can be stripped when done). No cron jobs scheduled (the 5-hour loop was cancelled).

## 3. What is BUILT (the ledger slice)

All on `feat/modifier-ledger-p1`:

- **`src/lib/characterStats.ts`**
  - `ModifierKind` type + `ModifierSource` interface `{ id, label, amount, kind, removable }`.
    **ID scheme: `` `${kind}:${sourceSlug}:${targetKey}` ``** (stable, deterministic — P2 disabling depends on it).
  - `DerivedStats.breakdowns: { speed, initiative, ac, proficiencyBonus }` — each `ModifierSource[]`,
    built **additively alongside** the existing sums; `console.assert` guards that each list sums to its
    effective value.
  - **AC block rewritten** to "one exclusive base + additive bonuses," itemized. Base = worn armor /
    item set-base (Robe of Archmagi) / **Unarmored Defense** / unarmored+shield. **Added Barbarian
    (10+DEX+CON, shield OK) + Monk (10+DEX+WIS, no shield) Unarmored Defense — fixes audit #1/#2.**
    Manual-AC case is itemized as a `Manual AC` row while `effectiveAC` stays `null` (stepper still shows).
    Detect via `character.classes.some(c => c.classSlug === 'barbarian'|'monk')`.
  - `computeActiveItemEffects` gained `speedSources` / `initiativeSources` (per-item provenance).
- **`src/components/sheet/StatBreakdown.tsx`** (NEW) — read-only popover (shadcn `Dialog`): contributor
  rows (label · kind · signed amount) + total. **P1 = read-only**; disable/inline-edit/add-custom = P2.
- **`src/components/sheet/CombatBlock.tsx`** — muted lucide `Pencil` next to Speed, Initiative, AC
  (both computed value AND the manual stepper branch), and Prof Bonus → opens `StatBreakdown`. Existing
  steppers/displays/rolls untouched.
- **`src/lib/characterStats.test.ts`** — 4 AC tests (Barb UD = 15; Monk UD = 15 and lost with a shield;
  Plate = 18 / Plate+Shield = 20 parity; plain unarmored → `null`).

## 4. The design (canonical spec lives in BACKLOG.md → "Modifier Ledger")

- **Principle (also in CLAUDE.md → "Design principle — Transparent, Editable Derivation"):** apply the
  automated bonus, but always let the player see WHY, disable/re-enable, change, or add their own.
- **Three dimensions, one ledger:** numeric (sum) · boolean (advantage/disadvantage, netted per RAW —
  any adv + any dis = normal) · set-membership (proficiencies, languages, resistances, senses).
- **Mechanism:** `deriveCharacterStats` emits provenance; a stored override layer
  (`disabledModifiers: string[]` + `modifierOverrides: Record<id,number>` + `customGrants`) applies as
  the **LAST** derive step — still INV-1, no write-time baking. One reusable `<StatBreakdown>` + the
  muted pencil (distinct from roll-on-click, which fires rolls on skills/saves/abilities).
- **Existing manual fields are ledger contributors, not a parallel system:** `initiativeBonus`,
  `armorClass`, `spellBonusModifier`, weapon `customDamage`/`customToHit` → represent as `kind:'manual'`.
- **Per-block integration rule:** the ledger owns DERIVED values/grants ONLY. Runtime/usage state —
  current/temp HP, death saves, hit dice, spell slots used, item charges, feature resources, inspiration
  — is NOT ledger; preserve it untouched. (Full per-block PRESERVE table is in the BACKLOG epic.)

## 5. Phasing

- **P1 — DONE:** speed + initiative provenance + `StatBreakdown` + pencils.
- **P1.5 — DONE:** AC (exclusive base + Unarmored Defense #1/#2) + Prof Bonus + tests.
- **P3 (breakdown rollout) — DONE (2026-06-24, Step 1 of §9):** `breakdowns` now covers **abilities, the
  6 saves, 18 skills, maxHp, spell attack, spell save DC** (all numeric blocks). Per-source provenance
  added to `computeActiveItemEffects` (`saveBonusSources`/`skillBonusSources`/`abilityBonusSources`/
  `abilitySetSources`/`maxHpSources`/`spellAttackSources`/`spellSaveDCSources`). Abilities reconstruct the
  **score** with realized deltas — feat-ASI cap-at-20 shows "(capped at 20)", item set-to-N shows
  "(sets to N)" — so the sum still equals the effective score. Always-visible pencils on every ability
  box / save row / skill row / Max HP; spell Attack & Save DC values are breakdown triggers (the manual
  spell-focus override editor is untouched). **181 tests pass** (+6); typecheck clean. NOT YET in
  breakdowns: resistances/languages/senses (set-membership — arrives with the race-effect system) and
  advantage/disadvantage (Step 4).
- **P2 — NOT STARTED:** the stored override layer. Add `disabledModifiers` / `modifierOverrides` /
  `customGrants` to `Character` (migration **v20+**; round-trip via `characterToDraft`/edit-merge +
  import/export + cloud-sync — INV-4); wire disable / inline-edit / "add your own" into `StatBreakdown`;
  apply at the end of `deriveCharacterStats`. **Deferred to LAST** per §9.
- **P4:** per-weapon attack/damage breakdown.

## 6. The roadmap beyond the ledger UI (from MODIFIER_SOURCE_MATRIX.md)

494 sources mapped across 15 blocks; **95 modeled / 26 data-gap / 93 system-gap / 53 manual / 17 OOS.**
The 89 system-gaps collapse into ~11 reusable pieces. **Recommended build order:**

1. **Roll out breakdown plumbing to remaining blocks** (cheap; pencils everywhere; sparse until channels below land). ← user greenlit this
2. **Structured race-effect system** — *biggest single unlock.* 0/46 races have structured effects; one
   `race-effect[]` array (like `ItemEffect[]`) unblocks racial resistances, skills, weapon/tool/language
   proficiencies, senses, natural-armor AC, per-level HP, save advantages. Kills audit #29/#30/#42/#64/#70.
3. **Expand `FeatureEffect`** (+ `save_proficiency`, `resistance`, `speed`, `senses`, `language`,
   `advantage`, and **derived-from-stat** e.g. Aura of Protection = +CHA) **and `FeatEffect`** (+ weapon
   attack/damage, weapon/armor/tool proficiency, resistance, language, max_hp).
4. **Disadvantage + conditions** — `getCharacterAdvantages` only emits *advantage*; add the disadvantage
   emit + net tristate, wire stealth-disadvantage + attack adv/dis (closes dice cluster #19/#20/#36), and
   a conditions tracker (exhaustion/poisoned/…) feeding adv/dis, speed, HP.
5. **New numeric semantics:** `speed_set`/floor (Boots of Striding *sets* speed), `speed_multiplier`
   (Haste, Boots of Speed), AC-floor/clamp (Barkskin), roll-floor (Reliable Talent), per-effect cap flag
   (Belt of Dwarvenkind caps at 20), reroll model (Great Weapon Fighting, Lucky).
6. **Item-effect data authoring** — ~98% of items have `effects: null` (e.g. Boots of Striding); the 22
   hardcoded `ITEM_ADV_ENTRIES` should become data. (26 pure data-gap rows listed in the matrix backlog.)
7. Smaller: per-class spell stats (multiclass dual-DC + EK/AT INT data), source-tracking on
   proficiencies/languages (BUG-29 / INV-9), temporary/situational buff layer (Mage Armor, Bless — mostly
   stays manual), consumable/permanent base bumps (Manuals & Tomes).

## 7. Artifacts (read these)

- **BACKLOG.md → "Modifier Ledger …"** (top section) — the full epic: principle, 3 dimensions, per-block
  PRESERVE map, decisions, phasing.
- **CLAUDE.md → "Design principle — Transparent, Editable Derivation"** — the standing directive.
- **DND_RULES_REFERENCE.md** — Part 1 (rules→app per block, incl. "What Modifies It"), Part 2 (58-finding
  mechanics audit, severity-ranked), Part 3 (spell-data verification: 5 fixes, 0 class-list gaps).
- **MODIFIER_SOURCE_MATRIX.md** — 494 sources × channel × coverage × status; 89 system-gaps; 26-item
  data-authoring backlog; per-block tables.
- **`.claude/skills/codebase-invariants/`** — invoke before any character-state edit. `references/
  dnd-rules-map.md` has the checkable DND-* invariants + the gap catalog. (`.claude/` is gitignored.)

## 8. Conventions / gotchas

- Invoke the **`codebase-invariants`** skill before editing `deriveCharacterStats`, character state,
  multiclass logic, effects, or the data pipeline. Invoke **`feature-effect-system`** when adding an
  effect type.
- Ledger is **additive / INV-1**: emit provenance inside `deriveCharacterStats`; never bake at write
  time; each breakdown must sum to its effective value (keep the `console.assert`s).
- Typecheck `npx tsc -p tsconfig.app.json --noEmit`; tests `npx vitest run`. Data lives in gitignored
  `data/`; compiled `public/data/*.json` is read at runtime (rebuild with `npm run build:data`).
- A migration goes at the END of the `migrations` array in `src/storage/migrations.ts` (current last is
  **v19**; the next one is **v20**); never insert by number.

## 9. Decided plan & execution order

**Decision (2026-06-24): build the contributor infrastructure ("the big realization") BEFORE the full
P2 override layer.** Rationale: today's breakdowns are sparse (data ~98% unauthored), so P2's
disable/edit half has almost nothing to act on; and a P2 built against only the 4 numeric blocks would
need rework when the **set-membership** (proficiencies/languages/resistances/senses) and
**advantage/disadvantage** dimensions arrive. Build the contributors first, then P2 **once** against
populated, multi-dimensional breakdowns. P2 was started then **paused** — only a `TodoWrite`, **no code**;
its design is a single `Character.ledgerOverrides` field `{ disabled: string[], overrides:
Record<id,number>, custom: Partial<Record<targetKey, {id,label,amount}[]>> }` + migration **v20** +
INV-4 round-trip (repo patterns scouted in `characterRepo.ts` / `migrations.ts`).

**Execute in this order** (branch per step `feat/...`; `main` gated; confirm scope with the user each step):

1. **Breakdown rollout to remaining blocks** — ✅ **DONE 2026-06-24** (see §5 P3). `breakdowns` arrays +
   always-visible pencils for abilities, the 6 saves, 18 skills, maxHp, spell attack/DC. Same additive
   pattern as speed/init/AC; reused `StatBreakdown` + the `console.assert` sum-guard.
2. **Structured race-effect system** — THE biggest unlock. ✅ **DONE 2026-06-24 — infra + ALL 46 races authored.**
   Bulk authoring of the 40 remaining races ran via a hardened workflow (`wf_88bdf014-436`, 40 agents,
   schema-validated output applied to files + build-validated). Result: **27 races with base effects, 5 with
   subrace effects, 16 correctly empty** (their grants are player-choices, advantages [Step 4], spells, senses,
   flight, or natural weapons — none modeled as `effects[]`). Two agent errors caught + fixed by reading the
   trait text (Centaur "Survivor" is a *choice* → removed; Verdan "Persuasive" is Persuasion-only → dropped the
   stray Intimidation). Dragonborn stays deferred (ancestry-choice resistance). Workflow gotcha logged: pass
   `args` as a real JSON value, and guard `if (typeof args === 'string') args = JSON.parse(args)` — a stringified
   arg makes `Object.entries`/loops iterate characters and blow the 1000-agent cap (killed the first attempt).
   Original infra notes:
   - **Built:** `RaceEffect` union in `types/data.ts` (`skill_proficiency` / `weapon_proficiency` /
     `tool_proficiency` / `armor_proficiency` / `resistance` / `immunity` / `natural_armor`) on
     `Race.base` + `Subrace`; `validateRaceEffects` in `build-data.js`; `computeRaceEffects` accumulator
     in `characterStats.ts` (single point, INV-1) reading the new `effects[]` **plus** the clean fields
     (`languages`, `senses`, `hp_bonus_per_level`). Wired into derive: racial skill grants
     (`raceSkillGrants`, filled+locked like feats, breakdown shows a `race` row), weapon/armor prof
     unions, `raceToolGrants`, merged `resistances`/`immunities`, natural-armor AC base (higher of
     natural vs Unarmored Defense), `raceGrantedLanguages`, `senses`, and **data-driven per-level HP
     (the hardcoded `SUBRACE_HP_BONUS` map was RETIRED).** UI: ProficienciesBlock (race-locked skills +
     `race` tag), CombatBlock (Senses chips), DescriptionBlock (racial languages locked in the grid).
   - **Authored (verified):** dwarf, elf (+3 subraces), tiefling, lizardfolk, half-orc. Dragonborn left
     with a `_review` note (its resistance is Draconic-Ancestry-choice-dependent — model once ancestry
     is a stored choice). **186 tests pass** (+5); typecheck clean; `build:data` validates + compiles.
   - **Scope call:** racial **save advantages stay in the hardcoded `RACE_ADVANTAGES` map** for now
     (they work) and become data-driven in **Step 4** (adv/dis) to avoid a double-count migration here.
   - **NEXT:** bulk-author `effects[]` for the remaining ~40 races (wiki-verified per `dnd-data-verification`).
   - Fixes audit #29/#30/#42/#64/#70 as the data lands.
3. **Expand `FeatureEffect` + `FeatEffect`.** ✅ **DONE 2026-06-24.**
   - **New always-on class-feature channel** (the centerpiece — previously NO effects applied to
     always-on class features): `data/class-feature-effects.json` (`class:Feature → FeatureEffect[]`)
     → compiled → `SetupData.classFeatureEffects` → `collectFeatureEffects` accumulator scans earned
     class-level features up to the **owning-class level** (INV-2), applied once (INV-1). The old
     option-only `computeFeatureEffects` became a **shared accumulator** (`applyFeatureEffect`) feeding
     both the option channel and the always-on channel.
   - **`FeatureEffect` expanded:** `save_proficiency`, `save_bonus`, **`derived_save`** (from-a-stat,
     e.g. Aura of Protection = +CHA to all saves, min 1), `resistance`/`immunity`, `speed`, `max_hp`,
     skill/weapon/armor/tool `proficiency` — all wired into the ledger breakdowns (`kind:'feature'`).
   - **`FeatEffect` expanded + applied:** `max_hp`, `resistance`, `language`, weapon/armor/tool
     `proficiency` flow through the feat loop into the unions/resistances/maxHP/languages.
   - **Authored:** marquee always-on features (Aura of Protection, Diamond Soul, Purity of Body,
     Fast Movement, Slippery Mind) + enriched feats (Heavily/Moderately/Lightly Armored → armor prof,
     Infernal Constitution → cold/poison resist). **190 tests pass** (+4); typecheck clean.
   - **Scope calls:** `advantage` + condition-immunity variants (Divine Health's *disease*, Aura of
     Courage's *frightened*) DEFERRED to **Step 4** (conditions). Marquee features cover the high-value
     always-on FLAT effects — the SRD's remaining always-on features are advantages (Step 4), conditions
     (Step 4), or rerolls (Step 5). The hardcoded `FEAT_EFFECTS` registry now holds only `tough`/
     `observant` (kept — `observant`'s passive-perception bonus needs a new effect type; minor cleanup).
4. **Disadvantage + conditions** — add the disadvantage emit to `getCharacterAdvantages` + a net
   tristate; wire stealth-disadvantage and attack adv/dis (closes dice cluster #19/#20/#36); add a
   conditions tracker feeding adv/dis, speed, HP.
5. **New numeric semantics** (`speed_set`/floor, `speed_multiplier`, AC-floor/clamp, roll-floor,
   per-effect cap flag, reroll) + **item-effect data authoring** — opportunistically as items need them.
6. **Full P2 override layer** (disable / change / add-your-own) — LAST, against now-populated breakdowns.

Full per-block source lists + the 89 system-gaps are in `MODIFIER_SOURCE_MATRIX.md`.
