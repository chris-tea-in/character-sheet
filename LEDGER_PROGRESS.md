# Modifier Ledger — Progress & Continuation (resume here)

**For a fresh agent / post-compaction.** This is the authoritative "where we are, what's next, how to
continue" doc for the Modifier Ledger feature. Read this first, then the artifacts it points to.

_Last updated: 2026-06-27 — Steps 1–6 DONE; GWF (5d-C) done. **All §2a follow-ons (6b-3 C/D languages+proficiencies
in-place disable, + ITEM_ADV data migration) DONE, plus P4 (per-weapon attack/damage editable breakdowns) and an
editable Proficiency-Bonus breakdown. The Modifier Ledger now covers EVERY derived value with an editable,
persisting StatBreakdown.** Committed on `feat/modifier-ledger-p1`; `main` merge pending explicit go-ahead._

---

## 1. One-paragraph context

We are building the **Modifier Ledger**: every value the app auto-derives or auto-grants must be
(1) traceable to its source, (2) individually disableable/re-enableable, (3) augmentable with the
player's own entry. Before this, we did a full rules audit (DND_RULES_REFERENCE.md), verified all 567
spells (Part 3), and mapped every modifier source per block (MODIFIER_SOURCE_MATRIX.md). The ledger's
**P1 + AC/Prof slice is built and green**; P2+ and the broader rollout are planned.

## 2. Current state (2026-06-27, post Step 6 + GWF)

- **Branch:** `feat/modifier-ledger-p1`. `main` is gated on explicit user go-ahead — do NOT push `main`.
  **HEAD = `4181f9e`.** Nothing pushed anywhere.
- **The arc, committed on this branch** (oldest→newest): `beba8d7` Step 4 (adv/dis + conditions + dice tools) ·
  `0631072` Step 5 plan · `cc363ea` 5a speed semantics · `6b5a3b2` 5b AC floor · `4b2c7ee` 5c ability cap ·
  `43bb373` 5d Reliable Talent + Lucky · `45f7ee4` roll/dice UX (Lucky-feat gate, pool roller, slim tray,
  non-sticky header) · `46cd128` **6a numeric override** · `8bd061e` **Effect Builder P1 (item effects)** ·
  `f1052c1` **Effect Builder P2 + 6c (always-on grants/adv-dis)** · `127a2a4` **Step 6b/6b-3 (set grants +
  provenance/disable)** · `4181f9e` **GWF (5d-C) + weapon Roll→Dmg flow + GWF visibility/homebrew override**.
  (Steps 1–3 + Features hub were `d4bdd75`/`b73ded0`/`a18c23c` earlier.)
- **Working tree (2026-06-27):** UNCOMMITTED follow-on work on top of `4181f9e` — the three §2a items below
  are implemented but NOT yet committed (awaiting user go-ahead). Touched: `characterStats.ts` (languageSources +
  skill/save ProfSources provenance + ITEM_ADV map removed), `DescriptionBlock.tsx`, `ProficienciesBlock.tsx`,
  `characterStats.test.ts` (+3 tests), and gitignored `data/equipment/{wondrous_items,armor}.json` (21 advantage
  effects authored). Also untracked `ARCHITECTURE_REVIEW_2026-06-21.md` (another branch's doc — leave it).
- **Tests:** **258 pass** via `npx vitest run --no-file-parallelism` (was 255; +3 disable tests). ⚠ The Windows worker-fork flake is BAD
  right now — most full runs print `16/17 files` + a partial count (e.g. "243 passed (255)") with a crashed
  worker, **NEVER a real `FAIL`/`✗`**. To confirm: run changed files alone (`npx vitest run <file>`), or
  `--reporter=verbose` which often catches the clean 255. Typecheck: `npx tsc -p tsconfig.app.json --noEmit`.
  Build: `npm run build` (data + tsc + vite) — currently green.
- **Migrations:** last is **v21** (`ledger_overrides`, Step 6a). Next is **v22**. NB: the new ledger sub-fields
  (`customAdvDis`, `customGrants`) and `EquipmentItem.gwf` all ride existing JSON-blob columns → **no migration**.
- **data/ is gitignored** (race effects, feature-descriptions/categories, class-feature-effects, feat
  enrichments, the Danger Sense adv demo — all local-only). `public/data/` is also gitignored (rebuild
  with `npm run build:data`).
- **Edit/Write auto-approved** via `.claude/settings.local.json` (strip when done). No cron jobs.

## 2a. Follow-ons — ALL DONE (2026-06-27, uncommitted on top of `4181f9e`)

All three §2a items are now implemented (INV-1, no migration — they ride the existing `ledger_overrides` JSON blob).
Load `codebase-invariants` before any further `deriveCharacterStats` edit.

1. **6b-3 (C) — disable a racial/derived LANGUAGE in place. ✅ DONE.** Added `derived.languageSources`
   (`SetGrantSource[]`, ids `lang:<kind>:<name>`; custom reuses its panel grant id so the panel + in-place toggle
   sync), built right after `resistanceSources`/`immunities`. Effective `raceGrantedLanguages`/`itemGrantedLanguages`
   are now derived from the non-disabled sources. `DescriptionBlock`'s `LanguageSelector` was refactored: granted
   chips are tap-to-disable (struck-through when off, re-enableable), with a `+`/`×` button to open the picker; a
   disabled grant frees the language to be added manually (the "augmentable" principle). Test added.
2. **6b-3 (D) — disable a class/race-granted PROFICIENCY in place. ✅ DONE.** Added `derived.skillProfSources` /
   `skillExpertiseSources` / `saveProfSources` (`SetGrantSource[]`, ids `skillprof:<kind>:…` / `skillexp:feat:…` /
   `saveprof:<kind>:…`; custom reuses panel id). The ledger sets are now computed EARLY in derive so the grant loops
   gate on `disabled`. A disabled grant is registered in the source list (re-enableable) but NOT folded into
   `effectiveSkillProficiencies`/`effectiveSaveProficiencies` — so the dot un-fills AND the modifier drops PB
   together. `featSkillGrants`/`raceSkillGrants`/`customSkillGrants` are now derived (active-only) from the sources,
   preserving caps/tags. `ProficienciesBlock` dots became tap-to-disable for derived grants (`toggleSources` flips
   every source id for that skill/save in `ledgerOverrides.disabled`); a muted `kind (off)` tag shows when disabled.
   Stored/class proficiencies are unchanged (still toggle the stored record). 2 tests added.
3. **ITEM_ADV data migration. ✅ DONE.** Authored the 21 advantage items as data-driven `advantage` ItemEffects in
   gitignored `data/equipment/wondrous_items.json` (20) + `armor.json` (Sentinel Shield — note it exists in BOTH
   files, a pre-existing duplicate). Removed the hardcoded `ITEM_ADV_ENTRIES`/`ITEM_ADV_MAP` + the item loop in
   `getCharacterAdvantages`. ⚠ **Two consequences (both accepted):** (a) gating changed from OWNERSHIP → ACTIVE
   (equipped/attuned) — RAW-correct ("while you wear it") but existing characters must equip the item to keep the
   advantage; (b) these advantages now live in gitignored data, so a fresh checkout without `data/` loses them (the
   live deploy is always built from a machine WITH data, so it's fine). All 21 names verified present + activatable.
4. **Still deferred / N/A.** Ledger-path attack/damage targets (no breakdown — `specToLedgerCustom` returns []).
   **Two-Weapon Fighting** stays manual (BACKLOG C1 — no offhand-attack model). Senses-disable = N/A (no sheet list).

### Derived fields a fresh agent can rely on (DerivedStats)
`effectiveAbilities · effectiveSpeed · effectiveInitiative · effectiveAC · adjustedMaxHp · proficiencyBonus ·
skillModifiers · saveModifiers · spellAttackBonus · spellSaveDC · effectiveSkillProficiencies ·
effectiveSaveProficiencies · weaponProficiencies · armorProficiencies · raceSkillGrants · raceToolGrants ·
raceGrantedLanguages · senses · resistances · immunities · featureWeaponEffects · hasStealthDisadvantage ·
rollStates {saves,skills} · rollStateSources (labeled adv/dis) · attackRollState · attackRollSources ·
activeConditions · breakdowns {speed,initiative,ac,proficiencyBonus,abilities,saves,skills,maxHp,spellAttack,spellSaveDC}`.

### Effect-type registry (src/types/data.ts) — extend these for new semantics
- **ItemEffect:** ac · save · ability_set · ability_bonus · skill · speed · initiative · damage · damage_dice ·
  max_hp · resistance · immunity · unarmored_ac · language · unarmed · spell_attack · spell_save_dc.
- **FeatureEffect:** ac · weapon_attack · weapon_damage · save_proficiency · save_bonus · derived_save ·
  resistance · immunity · speed · max_hp · skill/weapon/armor/tool_proficiency · advantage · disadvantage.
- **RaceEffect:** skill/weapon/tool/armor_proficiency · resistance · immunity · natural_armor.
- **FeatEffect:** asi · initiative · speed · save_proficiency · skill_proficiency · expertise · max_hp ·
  resistance · language · weapon/armor/tool_proficiency.
- Build validation lives in `scripts/build-data.js`: `validateEffects` (items), `validateFeatureEffects`
  (features incl. class-feature-effects.json), `validateRaceEffects`. **Add every new variant there too.**

### Key invariants / patterns (apply to Step 5)
- **INV-1:** emit in `deriveCharacterStats`; never bake at write time.
- **Realized-delta pattern** for non-additive (set/floor/multiply/cap): compute the additive total, then
  apply the set/floor/multiply as a **delta row** so the breakdown still `console.assert`-sums to the
  effective value. Precedents already in the file: ability set-to-N + feat-ASI cap (`abilityBreakdowns`),
  **condition speed set/half** (`additiveSpeed`→`effectiveSpeed` via `conditionSpeedDelta`), Exhaustion-4
  **maxHp halving** (`additiveMaxHp`→`adjustedMaxHp`). Reuse this shape.
- **ModifierKind** includes `condition`; add new kinds in BOTH `characterStats.ts` (the union) AND
  `StatBreakdown.tsx` `KIND_LABEL` (a missing key is a TS error — that's the reminder).
- **INV-4** for any NEW stored field: migration (v21) → `Character` type + `defaultCharacter` →
  `normalizeNewCharacter` (auto via spread) → `characterRepo` (rowToCharacter + insert + update + upsert,
  positional — add the column + one `?` + the value in EACH) → `draftToNewCharacter` (characterSetup.ts) →
  the `characterRepo.test.ts` parity fixture. (Most Step-5 work is DERIVED, needs no migration.)

### Dice engine touchpoints (for Step 5 roll-time mechanics)
- `src/store/dice.ts` `roll(kind, derived)` — single d20/raw roller; already does advantage(2d20 keep
  high)/disadvantage(keep low), multi-die raw (`count`), `rerollWithMode(mode,count)` (keep best/worst of
  N), `rollIndependent(count)`. `roll()` HAS `derived`, so it can read `effectiveSkillProficiencies`,
  `proficiencyBonus`, class info for roll-time rules.
- `src/components/sheet/DiceRollModal.tsx` — `rollDamage()` (weapon hit→damage) + `rollModalDamage()`
  (store, Dmg button) roll damage dice; `RollResult` has `natural · natural2 · dice · multi · modifier · total`.
- `src/lib/useRollDispatch.ts` `dispatch()` — auto-applies `derived.attackRollState` to attack rolls.
- `src/components/sheet/RollButton.tsx` — `rollMode?: 'adv'|'dis'` shows (Adv)/(Dis).

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
4. **Disadvantage + conditions.** ✅ **DONE 2026-06-24.**
   - 4a: `rollStates` (per save/skill tristate, RAW-netted) + armor stealth-disadvantage wiring.
   - 4b: every adv/dis source **labeled** (provenance) + a data-driven `advantage`/`disadvantage`
     `FeatureEffect` variant; the save/skill breakdown popover shows a **Roll** section (sources + net).
   - 4c: attack adv/dis via `advantage` on the attack `RollKind` + `rerollWithMode` + modal re-roll UI.
   - 4d: **conditions tracker** — `Character.conditions {active, exhaustion}` (**migration v20** + full
     INV-4 round-trip), `CONDITION_DEFS` registry + `computeConditionEffects`, applied to skills/saves
     (per-target), attacks (auto via `useRollDispatch`, netted), speed (set/half as realized delta),
     and Exhaustion-4 max-HP halving. Conditions UI (chips + exhaustion stepper) in CombatBlock.
   - **+ Dice-roller enhancements:** freestyle DiceTray ×N (roll 4d6 at once) + roll-modal "how many"
     (keep best/worst of N → Elven Accuracy, and roll-N-independent). Closes dice cluster #19/#20/#36.
5. **New numeric semantics** (`speed_set`/floor, `speed_multiplier`, AC-floor/clamp, roll-floor,
   per-effect cap flag, reroll) + **item-effect data authoring** — opportunistically as items need them.
   ← **NEXT.** Note: condition speed set/half already lands a realized-delta pattern Step 5 can reuse.
6. **Full P2 override layer** (disable / change / add-your-own) — LAST, against now-populated breakdowns.

Full per-block source lists + the 89 system-gaps are in `MODIFIER_SOURCE_MATRIX.md`.

---

## 10. Step 5 — execution plan (decided 2026-06-24; user chose "include roll-time rerolls too")

**NOT STARTED.** Build in this order; branch is `feat/modifier-ledger-p1` (continue on it), `main` gated,
show the user a plan before each sub-step, keep INV-1 + the realized-delta + console.assert patterns.

**5a — Speed semantics — ✅ DONE.** Shipped `speed_set {value}` (floor: set-if-higher) + `speed_multiplier
{factor}` on both `ItemEffect` and `FeatureEffect` (collapsed the redundant `speed_floor` alias into
`speed_set` — one behavior, one name). Collected in `computeActiveItemEffects.speedSet/speedMult` +
`FeatureEffectAccum.speedSet/speedMult`; applied in `deriveCharacterStats` in RAW order additive → floor (max)
→ multiplier (compounded, `Math.floor`) → condition, each a realized-delta row in `speedBreakdown` (still
`console.assert`-sums). Build validators added in both `validateEffects` + `validateFeatureEffects`. Demo:
Boots of Striding and Springing (`speed_set:30`) authored in `data/equipment/wondrous_items.json`. 4 new
tests in `characterStats.test.ts` (floor / no-op-when-higher / ×2 multiplier / RAW order w/ exhaustion).
No migration, no new ModifierKind (rows reuse `item`/`feature`).

_Original plan:_
**5a — Speed semantics (clean, do first).** Add to `ItemEffect` + `FeatureEffect`:
`speed_set {value}` (Boots of Striding → 30, a floor: `max`), `speed_floor {value}` (same as set-if-lower),
`speed_multiplier {factor}` (Haste/Boots of Speed → 2). Collect them in `computeActiveItemEffects` /
`collectFeatureEffects`. Apply in derive AFTER `additiveSpeed`, in RAW order: additive → floor/set (max) →
multiplier → THEN the existing condition delta. Each step is a realized-delta row (`kind:'item'`/`'feature'`)
so `speedBreakdown` still sums. Add `validateEffects`/`validateFeatureEffects` cases. Demo: author Boots of
Striding and Springing (`speed_set:30`) in `data/equipment/wondrous_items.json` (gitignored).

**5b — AC floor — ✅ DONE.** Shipped `ac_floor {value}` on both `ItemEffect` and `FeatureEffect`. Applied in
`deriveCharacterStats` AFTER base+additive AC, only when it raises a *computed* AC (skipped when AC is purely
manual / `effectiveAC` null), as a realized-delta row placed BEFORE the AC `console.assert` so it still sums.
Build validators added in both. 2 tests (floor raises low AC / no-op when already met). **No demo data authored:**
no real DMG item floors AC and there's no spell-effect channel yet — genuine carriers are homebrew/custom items
+ a future spell-effect channel; test uses a synthetic "Bracers of Barkskin". No migration, no new ModifierKind.

_Original plan:_
**5b — AC floor.** Add `ac_floor {value}` to `ItemEffect`/`FeatureEffect` (Barkskin → AC ≥ 16). After
`effectiveAC` is computed and itemized, if any floor and `effectiveAC < floor`, push a realized-delta AC
row (`Barkskin (AC floor 16)`, amount = floor − effectiveAC) and set effectiveAC = floor. Keep the
`console.assert`. (Barkskin is a spell, so likely a FeatureEffect/manual demo, not an item.)

**5c — Ability cap flag — ✅ DONE.** Added optional `cap?: number` to `ItemEffect` `ability_bonus` + `ability_set`
(items stay uncapped by default — RAW). Threaded through `abilityBonusSources`/`abilitySetSources`; the two
per-source derive loops clamp with `max(before, min(target, cap))` — caps THIS effect's result without ever
lowering an already-higher score. Realized delta + label (`(max 20)`) flow into `abilityBreakdowns` (still
sums). Build validators added. Demo: Belt of Dwarvenkind (`ability_bonus con +2, cap 20`) in wondrous_items.json.
3 tests (clamp / no-op-at-or-above-cap / uncapped set still exceeds 20). No migration.

_Original plan:_
**5c — Ability cap flag.** Items are currently uncapped (RAW: items CAN exceed 20). Add optional
`cap?: number` to `ItemEffect` `ability_set`/`ability_bonus` (Belt of Dwarvenkind caps CON at 20). In the
per-source ability application in derive (`itemEffects.abilityBonusSources` / `abilitySetSources`), clamp
the realized delta so the score doesn't exceed `cap`. Surface as the realized amount in `abilityBreakdowns`
(it already records realized deltas — same as the feat-ASI cap).

**5d — Roll-time mechanics — ✅ A+B DONE, GWF DEFERRED** (user chose 2026-06-25: ship Reliable Talent +
Lucky now, defer GWF as its own follow-up; Lucky button-only/untracked, no migration).
- **Reliable Talent (Rogue 11+) — DONE.** `derived.reliableTalent` (rogue owning-class level ≥ 11, INV-2).
  In `store/dice.ts` `roll()` a proficient `skill` roll floors the kept natural d20 at 10 (`[Reliable Talent]`
  label note). Eligibility rides on `ModalState.reliableTalent` (set in `useRollDispatch`) so `rerollWithMode`
  + `rollIndependent` keep flooring. 2 tests.
- **Lucky (feat) — DONE.** `luckyReroll()` store action + a "🍀 Lucky" button in the shared `RerollRow`
  (renders for attack/skill/save/ability — exactly the d20 rolls). Rolls one extra d20, keeps the better
  (`[Lucky: a→b]`), honors Reliable Talent on the lucky die. **Untracked** (no use-counter, no migration). The
  button is **gated on the Lucky feat** — `derived.hasLuckyFeat` (`character.feats.includes('lucky')`) rides on
  `ModalState.hasLuckyFeat` (set in `useRollDispatch`); `RerollRow` shows 🍀 Lucky only when true. The store
  `luckyReroll()` mechanic stays ungated (UI decides whether to offer it). NOTE: gates on the Lucky *feat* only,
  not the Halfling *Lucky* racial (different mechanic — reroll a nat 1, not keep-better). 3 tests.
  RerollRow UX polish: Adv/Dis buttons (was "Keep best/worst (Adv/Dis)"); the count stepper merged into the
  "Roll N×" action button with ±-on-the-sides (mirrors the dice tray ×N control) — the same `n` still drives
  keep-best/worst-of-N for Adv/Dis.
- **Great Weapon Fighting — DEFERRED** to its own focused commit (the invasive weapon→DamageSpec→
  `rollDamageGroups` reroll threading + style detection). BACKLOG C1 ("GWF left to manual") still stands until
  that lands. Plan below preserved.

**Dice/roll-UX tweaks shipped alongside 5d (non-ledger, user-requested 2026-06-25):** freestyle **pool roller**
— a new `pool` RollKind (`store/dice.ts`), a 🎲 button in the dice tray opening a `DicePoolDialog` to pick
counts per die type (4d8 + 2d10 + 3d12) and roll together; result shown per-group in `DiceRollModal`
(`ResultBody`). Dice **tray slimmed**: dropped the inline ×N count stepper (the pool roller supersedes it),
die buttons are now one-tap single rolls; kept history + the 🎲 launcher. Character-page **header no longer
sticky** (`CharacterPage.tsx`) — scrolls away at the page top. 2 pool tests.

**STATUS (2026-06-25): moving to Step 6 at the user's direction. Step 5 remainders still OPEN as follow-ups:
5e (ITEM_ADV → item `advantage` data migration, not started) and 5d-C GWF (deferred). Pick these up after/with
Step 6 — they are not dropped, just resequenced.**

**EFFECT-BUILDER FEATURE (2026-06-25, user-requested "DM can add +1 CON / adv-dis"). Decided: ONE shared
`<EffectBuilder>` wired into BOTH items (equip-gated) and direct character grants (always-on). Phased:**
- **Phase 1 (items) — ✅ DONE.** New `src/lib/effectSpec.ts` (`EffectSpec` = number-target | advdis-target, `specLabel`,
  `specToItemEffect`) + `src/components/sheet/EffectBuilder.tsx` (target dropdown + value: numeric stepper, or
  Bonus/Adv/Dis for saves & skills). Wired into `CustomItemDialog` → **covers BOTH** player custom items (EquipmentBlock)
  AND DM campaign items (CampaignPage reuses the same dialog; `handleCreate` already passes the full def). Custom
  builders (`buildCustomWeapon/Armor/Wondrous`) gained `effects?: ItemEffect[]`. **This also closed Step 5e**: added the
  item-level `advantage`/`disadvantage` `ItemEffect` variant → build validation + `computeActiveItemEffects.advDis`
  accumulator + a derive loop feeding `rollStateSources` (mirrors `featureFx.advDis`). 6 tests. Note: the legacy
  hardcoded `ITEM_ADV_ENTRIES` still exist — migrating those 22 to data effects is the remaining 5e data chore.
- **Phase 2 (always-on character grant) — ✅ DONE.** New `CustomEffectsBlock` sheet panel (mounted after
  DescriptionBlock) uses the SAME `<EffectBuilder>` in **grant mode** (`onAdd` callback; hides the item-only
  weapon-to-hit/weapon-damage/spell-damage targets that have no ledger breakdown). `specToLedgerCustom(spec, id)`:
  numeric → a `ledgerOverrides.custom[targetKey]` modifier (applied by 6a), "all saves" numeric → 6 grants sharing
  one id; adv/dis → a `CustomAdvDis` entry. **Step 6c done:** `LedgerOverrides.customAdvDis?` (optional sub-field on
  the existing `ledger_overrides` JSON blob — **no migration**, rides INV-4 automatically; `?? []` for old rows;
  edit-merge already preserves the whole `ledgerOverrides`); derive loop feeds non-disabled `customAdvDis` into
  `rollStateSources` (kind `custom`, honoring the `disabled` set). The panel lists all grants (dedup by id) with
  eye-disable + remove. 7 tests.
- **6b-1 (set-membership: add-your-own) — ✅ DONE.** EffectBuilder gained a `grant` EffectSpec kind +
  "Defenses & languages" optgroup (Resistance / Immunity / Language → a text/damage-type input instead of a
  number). `specToItemEffect` maps grants to the existing `resistance`/`immunity`/`language` ItemEffects (so the
  **item dialog** can now author those too); `specToLedgerCustom` maps to a `CustomGrant`. New
  `LedgerOverrides.customGrants?` (optional, same JSON blob — no migration); derive folds non-disabled grants into
  `derived.resistances`/`immunities`/`raceGrantedLanguages`. CustomEffectsBlock lists/disables/removes them. 5 tests.
- **6b-2 (provenance + disable for derived resistances/immunities) — ✅ DONE.** `derived.resistanceSources` /
  `immunitySources`: `SetGrantSource[]` (`{id, value, label, kind, disabled}`), built in derive from item/race/feat
  (kind-level labels) + feature/custom (named). Effective `resistances`/`immunities` are the **non-disabled** values.
  CombatBlock **Defenses** chips now render every source (struck-through when disabled) and **tap-to-disable**
  (toggles the id in `ledgerOverrides.disabled`). Custom resistance grants appear here too (same id as the panel, so
  disabling syncs). 1 test. NOTE: item/race/feat provenance is kind-level (label "Item"/"Racial"/"Feat", id keyed by
  kind+type) — item-NAME granularity would need threading names through `computeActiveItemEffects` (refinement).
- **6b set add-your-own COMPLETED for all set types.** Extended the `grant` system to **sense** (Darkvision + a
  range), **skill proficiency**, **save proficiency** (grant-mode-only — no ItemEffect, so `specToItemEffect`
  returns `null` and CustomItemDialog filters; `CustomGrant.target` + optional `amount`). Derive folds non-disabled
  grants in: skill prof → `effectiveSkillProficiencies` + `derived.customSkillGrants` (ProficienciesBlock locks
  those dots, merged into `raceProficientSkills`); save prof → `effectiveSaveProficiencies` (auto-locks via the
  existing `!isStored && effective.includes` check); sense → `derived.senses`. All listed/disabled/removed in the
  Custom Effects panel. `ledgerDisabled`/`allSetGrants`/`activeSetGrants` now computed ONCE early in derive.
- **6b-3 (disable DERIVED grants) — PARTIAL.**
  - **(A) Standing adv/dis sources — ✅ DONE.** `RollAdvSource` gained `id?`/`disabled?`. Each standing
    feat/race/subrace/item/custom adv-dis source is tagged with a stable id (conditions excluded — not
    disableable) + a `disabled` flag from `ledgerDisabled`; `netSources` nets only ENABLED sources. The
    StatBreakdown **Roll** section (saves/skills) now shows an eye-toggle per source (struck-through when off).
    Custom adv-dis grants reuse their own id (synced with the panel). 1 test.
  - **(B) Senses — N/A.** `derived.senses` is no longer rendered as a sheet list (it moved into the Features &
    Traits text; custom sense grants are managed in the Custom Effects panel). Nothing to add a disable to.
  - **(C) Racial/derived LANGUAGES + (D) class/race-granted PROFICIENCIES — NOT DONE.** Each needs a provenance
    refactor (languageSources / proficiency-grant ids) THREADED into a complex, already-working block (the
    DescriptionBlock language grid / the ProficienciesBlock dots, where the prof + the modifier must stay in
    sync). Higher regression risk than the resistance chips — best done as a focused follow-on. Custom language
    + custom skill/save-prof grants are ALREADY disableable via the Custom Effects panel; only the
    class/race/feat-DERIVED ones lack an in-place disable.
  - STILL deferred elsewhere: ledger-path attack/damage targets; **GWF (5d-C)**; the **ITEM_ADV data migration**.

_(superseded)_ **Phase 2 (always-on character grant) — design notes.** Wire the SAME `<EffectBuilder>` into a sheet "grant" panel →
  numeric goes into `ledgerOverrides.custom` (6a, done); add the **adv/dis custom channel to the ledger (= Step 6c)**.
  Then a `specToLedgerCustom` adapter. **Item attack/damage targets now done:** weapon **to-hit** (new `attack`
  ItemEffect → `itemEffects.attack` → `derived.itemAttackBonus` → `computeWeaponBonus`), spell **to-hit**
  (`spell_attack`, pre-existing), weapon **damage** (`damage`, pre-existing), and spell **damage** (new `spell_damage`
  ItemEffect → `derived.itemSpellDamageBonus` → fed into the spell `onDamage` DamageSpec in SpellBlock; NOT applied to
  healing) — all in the builder. Still deferred: attack targets for the **ledger/always-on** path (no attack breakdown
  there yet) and **resistances** as a builder target (set-membership = 6b).

_Original plan:_
**5d — Roll-time mechanics (the dice-engine part — user opted in).**
- **Reliable Talent** (Rogue 11+): on a *proficient* ability check, treat a natural d20 ≤ 9 as 10. Expose
  `derived.reliableTalent: boolean` (true at rogue level ≥ 11) — gate via the rogue class record + level.
  In `dice.ts` `roll()` for `kind.type === 'skill'`: if `derived.reliableTalent` AND
  `derived.effectiveSkillProficiencies[kind.skill]` is set, `natural = Math.max(natural, 10)`. (Also applies
  to ability checks with tool/skill proficiency — keep to skills for v1.) Add a derived flag + a small note
  in the roll history/modal ("Reliable Talent").
- **Great Weapon Fighting**: reroll 1s and 2s on a weapon's damage dice once (Fighting Style: Great Weapon
  Fighting, two-handed/versatile melee). The damage path is `rollDamage()` (DiceRollModal) + `rollDamageGroups`
  (`lib/damage.ts`) + `rollModalDamage()` (store). Thread a `rerollBelow?: number` (=2) into the `DamageSpec`
  / hit-damage path when the active weapon qualifies (the character has the GWF fighting style, surfaced via
  `featureFx`/`featureWeaponEffects`) and reroll dice showing ≤ rerollBelow once. NOTE: BACKLOG C1 says GWF was
  "left to manual"; this supersedes it — update BACKLOG C1 when done.
- **Lucky** (feat): reroll a d20 (attack/check/save), 3 uses/long rest. Two parts: (1) a roll-modal "Lucky"
  button that calls a reroll (can reuse `rerollWithMode('adv')`-style fresh roll, or a dedicated keep-either),
  and (2) usage tracking. Uses = runtime state → either a NEW stored counter (`luckyUsed` → migration v21 +
  full INV-4 round-trip) OR keep it manual/un-tracked for v1. RECOMMEND: ship the reroll button now, defer the
  use-counter (note it) unless the user wants the v21 migration.

**5e — Item-effect data authoring (opportunistic).** Author the marquee items needing 5a–5c (Boots of
Striding/Speed, Belt of Dwarvenkind cap, etc.) and begin migrating the 22 hardcoded `ITEM_ADV_ENTRIES`
(stealth/perception/etc. advantage items) → item `effects[]` using the `advantage` channel from Step 4b
(would need an item-level `advantage` ItemEffect variant — add it, mirroring FeatureEffect's). All in
gitignored `data/equipment/*.json`; rebuild + validate.

**Step 6 — P2 stored override layer.** Phased: 6a numeric (✅ DONE) → 6b set-membership grants → 6c standing
adv/dis disable.

**6a — numeric override layer — ✅ DONE (2026-06-25).** `Character.ledgerOverrides { disabled: string[],
overrides: Record<id,number>, custom: Record<TargetKey, {id,label,amount}[]> }` (migration **v21**
`ledger_overrides`; full INV-4 round-trip: type + defaultCharacter + draftToNewCharacter + 4 characterRepo
sites + edit-merge preserve in CreateCharacterPage + repo-test fixture). `applyLedger(targetKey, rows, ledger)`
+ `TargetKey` type exported from characterStats. Applied in derive at TWO points (INV-1, no write-time bake):
**abilities EARLY** (right after the ability dev-guard — they cascade into mods/saves/skills/AC/HP/init/DC) and
**all leaf stats at the END** (speed/init/ac/maxHp/saves/skills/spellAttack/spellSaveDC), with passives
recomputed from the post-ledger skill modifiers. `ModifierSource` gained `disabled?`/`rawAmount?`. `StatBreakdown`
is now editable (eye-toggle disable that keeps the row struck-through + re-enableable, tap-to-edit override with
"was X", "+ Add modifier" custom rows, RAW→yours footer); read-only when the targetKey/ledger/onChange props are
omitted. Mounts wired in AbilityBlock, CombatBlock (speed/init/ac/maxHp; **proficiencyBonus left read-only** —
excluded from 6a; **manual AC** [effectiveAC null] left read-only — governed by the stepper), ProficienciesBlock
(saves/skills), SpellBlock (atk/DC). 6 tests; migration head now v21.

**6b/6c — NOT STARTED.** 6b = set-membership grants (proficiencies/languages/resistances/senses: provenance +
disable/add) reusing the same `disabled`/`customGrants` layer. 6c = disable a *standing* adv/dis source (the
per-roll situational Adv/Dis toggle already exists in the modal). Also still open from Step 5: **5e** (ITEM_ADV
→ item `advantage` data migration) and **5d-C** (Great Weapon Fighting).

Design sketched in §9: one `Character.ledgerOverrides` field applied as the final derive step; disable/inline-
edit/add-custom wired into `StatBreakdown`.
