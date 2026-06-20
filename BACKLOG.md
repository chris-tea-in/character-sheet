# D&D Character Sheet — Bug & Refactor Backlog

## Homebrew Custom Content + Quick-Adjust + Soft-Lock (2026-06-20)

Shipped this session: a shared **"type a value → Add/Subtract"** module used for HP and
currency (replaces the place-value currency modal — supersedes the Distributed-App Feedback
item #3 below); **per-character custom weapons / armor / feats** (migration **v18**;
render-time catalog/feat merge in [src/lib/customContent.ts](src/lib/customContent.ts) so
custom items derive like built-ins; create dialogs + "Custom" buttons in Equipment/Feats);
and **soft-lock parity** for class-feature counts in the wizard + level-up dialog (the sheet
already allowed it). Also fixed a **pre-existing `CharacterPage` reload crash** (early return
before hooks — hard-refreshing a sheet URL showed a blank page).

Deferred (not requested today — captured for later):

| # | Item | Status |
|---|---|---|
| C1 | **Fighting-style combat math** — **Great Weapon Fighting** (reroll 1s/2s on damage, likely threaded through [DiceRollModal.tsx](src/components/sheet/DiceRollModal.tsx)) and **Two-Weapon Fighting** (offhand ability mod to damage). Archery/Dueling already ride `featureWeaponEffects`; GWF/TWF are authored in the fighting-styles data but intentionally not auto-applied. | Deferred |
| C2 | **Class-feature data — subclass long tail.** The data-driven framework supports every class and the headline choices are authored; the remaining minor one-off subclass picks are data-only additions to `data/class-features/*.json`. | Deferred |

---

## Cloud Sync Hardening — Conflict Handling & Corruption Defense (2026-06-18)

Follow-on to the distributed-app feedback. Two gaps in the local↔cloud merge: (1) a corrupt
or gutted cloud blob can silently overwrite good local data (`normalizeNewCharacter` prevents
crashes, not data loss); (2) conflicts are whole-character last-write-wins with no detection of
genuine divergence. **Decision:** keep the uniform local-first + cloud-mirror model (no separate
fully-cloud path); add corruption defenses + a 3-way reconcile that prompts only on true
conflict. Full design + reconcile table + required-vs-optional policy:
`.claude/plans/cloud-sync-hardening.md`.

| # | Item | Session | Status |
|---|---|---|---|
| H1 | **Shared validator** `{ok, reason}` — refactor `validateCharacterPayload` ([src/lib/importExport.ts](src/lib/importExport.ts)) into a pure required-vs-optional core importable by both client and Pages Functions (verify it typechecks/bundles under `functions/`). | 1 | ✅ Done 2026-06-19 — `shared/characterValidation.ts` (dependency-free), added to `tsconfig.app.json` include; Functions pull it in via relative import (no functions-tsconfig change). 17 Vitest cases. **Vitest added** (`npm run test`). |
| H2 | **Server-side content validation on `PUT`** ([functions/api/characters/[id].ts](functions/api/characters/[id].ts)) — validate the **MERGED** blob (not the partial patch) before writing; reject 400 so bad data never lands in D1. | 1 | ✅ Done 2026-06-19 — validates merged (existing) / full incoming (new); guards an unparseable stored blob; **also returns the authoritative `updatedAt`** so the client sets its base exactly. |
| H3 | **Per-row defensive parse on reads** ([functions/api/characters.ts](functions/api/characters.ts) + campaign characters) — a corrupt row skips/flags instead of throwing the whole pull (absence is never a delete). | 1 | ✅ Done 2026-06-19 — both GET endpoints skip + `console.warn` a corrupt row. |
| H4 | **`last_synced_updated_at` base** — append migration **v13** (current last is v12) + repo/sync plumbing; device-local only, never in the synced `data` blob (INV-4). | 2 | ✅ Done 2026-06-19 — migration v13; `getSyncBases`/`setSyncBase` + base param on `upsertSyncedCharacter`; **kept off the `Character` type** so it can't ride along in `data`. |
| H5 | **3-way reconcile + adopt-gate** — rewrite `mergeRemote` ([src/store/sync.ts](src/store/sync.ts)): base vs local vs remote → silent-adopt / keep-local-push / real-conflict; validate-before-adopt (halt on missing **required**, default optional); never advance base on a rejected blob; skip only the bad row. | 2 | ✅ Done 2026-06-19 — pure `reconcileDecision` ([src/store/reconcile.ts](src/store/reconcile.ts), 12 Vitest cases) drives DB effects. **Sentinel base 0 = LWW fallback** (no first-boot conflict storm). Push-ack advances base to the server's `updatedAt`. Corrupt remote rejected (kept local) even in the conflict branch. |
| H6 | **Conflict prompt modal** — fires only on true divergence; campaign-aware default (cloud/DM for campaign chars, local for solo); whole-character choice v1. | 2 | ✅ Done 2026-06-19 — `ConflictResolutionModal` (non-dismissable forced choice, mounted in App); deduped queue; quarantine warning banner for rejected blobs. |
| H7 | **Local rollback snapshots** — local-only `character_backups` (last N per character) written before any adopt-over-local; minimal restore affordance. | 2 | ✅ Done 2026-06-19 — migration v14 `character_backups` (cap 5, no FK so it survives a delete); snapshot before adopt/delete/keep-cloud/resurrect; **Restore UI** in `DataManagementDialog` (snapshots current first → reversible). |
| H8 | *(Optional/defer)* **Field-scoped client merge** mirroring the server, so non-overlapping edits auto-resolve and the prompt fires only on same-field collisions. Updates the codebase-invariants system-map if built. | 3 | Deferred (per plan scope notes). |

**Deploy-time verification still owed** (need a running Pages/D1 backend, can't be exercised from the local build): H2 — a PUT whose merged result drops `abilities` returns 400 with nothing written; a normal field-scoped patch still succeeds. H3 — seed one corrupt D1 row, GET returns the rest. Session 2 — two-browser-profile DM↔player conflict flow (silent adopt / keep-mine / both-changed prompt / corrupt-remote quarantine + restore).

**Already protected (no work needed):** transport-level garbage — `syncApi.request` only treats
parseable `application/json` as data; truncated/non-JSON/redirect responses are classified
`offline` and never merge.

---

## Distributed-App Feedback (2026-06-18)

First round of feedback after distributing the app to the friend group (Cloudflare Pages +
D1 + Zero Trust Access). Fixes are grouped into three sessions (see
`.claude/plans/app-was-distributed-to-glimmering-lecun.md` for the full plan and the
Cloudflare free-tier capacity analysis).

| # | Item | Session | Status |
|---|---|---|---|
| 1 | **DM can't finalize/propagate sheet edits** — the DM edit flow already exists in [CampaignCharacterPage.tsx](src/pages/CampaignCharacterPage.tsx) (Edit/View toggle, debounced push, server `isDmEditor` auth) but lacks a clean commit step and players don't see changes. Need: red **Edit→Done** button at the top, a "click Done when finished" popup, **apply-on-Done** (buffer edits, single push), and **live propagation** to the player's open sheet (visibility-gated 1-row poll listener → pull+merge on change). | 2 | Built ✓ (verify in-browser) |
| 2 | **App is local-first on open** — `runInitialSync()` fires after first paint ([src/main.tsx](src/main.tsx)), so opening/refreshing paints the local IndexedDB cache and never authoritatively shows the latest cloud data. Make the initial pull gate first render (cloud-authoritative, ~3–4 s timeout, offline fallback to local). | 1 | Built ✓ (verify in-browser) |
| 3 | **Currency not typable + no fine-tune modal** — currency is only adjustable via a single ± stepper in [EquipmentBlock.tsx](src/components/sheet/EquipmentBlock.tsx). Make each value typable (EditableField) and add a "+" button opening a modal with place-value steppers (1 / 10 / 100 / 1000 / 10000) side by side + Done/Cancel. | 3 | Built ✓ (verify in-browser) |
| 4 | **Tools section misplaced** — Tools lives in the Proficiencies tabs ([ProficienciesBlock.tsx](src/components/sheet/ProficienciesBlock.tsx)). Move it into the Equipment block between Items and Currency; remove the Tools tab from Proficiencies. | 3 | Built ✓ (verify in-browser) |
| 5 | **Refresh doesn't pull from DB** — page refresh re-reads the local cache instead of re-fetching D1 and showing pushed updates. Same root cause as #2; fixed by the same cloud-authoritative-load change. | 1 | Built ✓ (verify in-browser) |

**Implementation note (live updates, item 1):** rather than add a new server endpoint, the
player's open campaign sheet polls the existing `GET /api/characters` (visibility-gated, ~10 s)
and reuses the boot pull + LWW merge via `pullLatest()` in [src/store/sync.ts](src/store/sync.ts)
— well within the D1 read budget at friend-group scale. True WebSocket push (a Durable Object
per campaign) is the future upgrade if instant propagation is ever wanted.

**Known limitation (future, not in these sessions):** the client boot merge is whole-character
last-write-wins; a player's newer local edit can still clobber a DM-edited field on the next
push. Acceptable for friend-group play — revisit with a field-aware/CRDT merge if it bites.

---

## ✅ Character Creation Bugs

| Priority | Bug | Status |
|---|---|---|
| 1 | **Feats missing entirely** — feats don't appear on the creation screen or in the level-up dialog. Blocks the entire feat system. | ✅ Fixed — LevelUpDialog now has ASI/Feat toggle at ASI levels; FeatsBlock on sheet handles ad-hoc adds |
| 2 | **Tool selection locked** — bards (and other classes) cannot select or change tools (musical instruments, thieves' tools, etc.); tool fields are not editable. | ✅ Fixed — `toolProficiencies` field added to Character; Tools tab in ProficienciesBlock with catalog picker; CharacterPage propagates class/background tools on selection |
| 3 | **Skills locked post-creation** — skill proficiency selection works during setup but becomes uneditable on the character sheet afterward. | ✅ Fixed — hard class-option lock removed; skills are always interactive; non-class skills shown at reduced opacity |

---

## ✅ Level-Up Dialog Bugs (found in code review 2026-06-03)

| Priority | Bug | Status |
|---|---|---|
| 1 | **Level-up HP gate missing** — `canApply` has no `hpAdd > 0` guard; a player can confirm level-up without rolling or entering HP, permanently gaining +0 max HP with no warning. | ✅ Fixed — defaults to average HP on open |
| 2 | **ASI apply cap is 30, not 20** — `Math.min(30, ...)` in `handleApply` allows scores above 20 if the button-disable check diverges from apply logic. | ✅ Fixed — `Math.min(20, ...)` |
| 3 | **Multiclass old-level mismatch** — `parseClassSlots` and `getSpellsKnownIncrease` receive `character.level` (total) as the "old class level". For a multiclass character whose class level is lower than total, the spell-slot diff display and spell-known delta are wrong. | ✅ Fixed — derives class-specific level from `character.classes` |
| 4 | **HP roll uses `Math.random()` not `rollDie()`** — `rollHp()` uses the weaker PRNG instead of the app-standard `rollDie()` from `src/lib/dice.ts`. | ✅ Fixed — uses `rollDie(hitDie as DieType)` |

---

## ✅ Character Sheet Bugs

| Priority | Bug | Status |
|---|---|---|
| 1 | **Armor doesn't affect AC** — equipping armor has no effect on the AC field; magical armor, garments, and weapons also don't apply their stated bonuses, and don't revert them on removal. | ✅ Fixed — `deriveCharacterStats` computes `effectiveAC` from equipped armor; CombatBlock shows it in gold |
| 2 | **Feats don't apply their effects** — feat choices don't update scores, proficiencies, or grant advantage (e.g. Tough not adding HP). | ✅ Fixed — `computeFeatStatDelta` handles ASI (fixed/choice), initiative, speed, save proficiency; `getCharacterAdvantages` covers feat/race/item advantage; `applyFeatAsi` writes to abilities; `featChoices` persisted to DB |
| 3 | **Magical weapons missing attack bonus display** — attack bonus from a magical weapon (+1, +2, etc.) is absent from the weapon card. | ✅ Fixed — `computeWeaponBonus` uses `weapon.bonus ?? 0` in both to-hit and damage; catalog has 95 weapons with bonus populated |
| 4 | **Weapon damage dice rolling incorrectly** — a 1d8 weapon returns values above 8; likely using the wrong die. | ✅ Fixed — `DiceRollModal` two-phase attack flow now rolls actual damage dice via `parseDamageDice` |
| 5 | **Rings/cloaks/garments in wrong category** — wondrous items and garments appearing under Weapons instead of Items. | ✅ Fixed — wondrous item rarity tabs removed from Weapon/Armor pickers; all magic items now only addable via Items picker |
| 6 | **Death save failure has no "dead" state** — 3 failures should display a "Dead" indicator in the same location where 3 successes shows "Stable/Alive." | ✅ Already implemented — `CombatBlock` shows full DEAD panel when failures ≥ 3 and HP ≤ 0 |
| 7 | **Dice rolls don't open a popup** — all roll results should appear in a modal window rather than only the history tray. | ✅ Fixed — `DiceRollModal` + `useRollDispatch` wired to all roll call sites |
| 8 | **Attack rolls need a two-phase popup** — rolling to attack should open a window for the to-hit roll first, then a damage roll if it connects. | ✅ Fixed — `DiceRollModal` hit/damage phases; nat 20 auto-advances; nat 1 shows Critical Miss |
| 9 | **Natural 20/1 highlighting inconsistent** — gold/red styling only applies in the history tray; d20 raw rolls and hit rolls don't trigger it. | ✅ Fixed — `DiceRollModal` applies gold/red on nat 20/1 for all roll types; raw d20 excluded from crit logic |
| 10 | **No critical success/failure label in popup** — a natural 20 or 1 rolled inside the popup should show "Critical Hit" or "Critical Miss." | ✅ Fixed — `CritLabel` component in `DiceRollModal` shows these for all non-raw roll types |
| 11 | **Feat ASIs don't affect weapon attack rolls** — `computeWeaponBonus` read `character.abilities` instead of `effectiveAbilities`; a STR +1 from a feat had zero effect on to-hit and damage. | ✅ Fixed — `computeWeaponBonus` accepts optional `effectiveAbilities` param; `EquipmentBlock` passes `derived.effectiveAbilities` |
| 12 | **Bloodied threshold uses raw maxHp, not feat-adjusted maxHp** — `HpSection` compared `currentHp <= maxHp / 2` using the stored base value; a character with Tough would show Bloodied at the wrong threshold. | ✅ Fixed — `HpSection` now uses `adjustedMaxHp / 2` for the bloodied colour threshold |

---

## Planned Systems

### Unified Dice Roll Modal
✅ Done — `src/components/sheet/DiceRollModal.tsx` + `src/lib/useRollDispatch.ts`

### `deriveCharacterStats(character, catalog)` — `src/lib/characterStats.ts`
✅ Done — full render-time derivation: ability scores (base + race + feat ASIs), AC, speed, initiative, prof bonus, HP, skill/save modifiers, passive perception/investigation, spell attack bonus, spell save DC, stealth disadvantage, advantages; all sheet blocks and dice rolls now consume `DerivedStats`

### `useRollDispatch()` — `src/lib/useRollDispatch.ts`
✅ Done — replaces all 6 scattered `useDiceStore(s => s.roll)` call sites

### Item + Feat Effect Pipeline
✅ Partial — FEAT_EFFECTS registry in `characterStats.ts` (Tough, Alert, Mobile, Observant, Resilient, Skilled implemented); armor AC from equipment; full magical item pipeline deferred until item bonus data exists

---

## ✅ Render-Time Stat Pipeline Extensions

| Item | Description |
|---|---|
| ~~**Feat data audit**~~ | ✅ Done — all 105 feats audited; `squat-nimbleness` speed +5 added; FEAT_EFFECTS/FEAT_ADVANTAGES registries verified correct. |
| ~~**Equipped/attuned toggle**~~ | ✅ Out of scope — conditional AC bonuses (Dual Wielder, etc.) are tactical state the app can't know; player manages via the manual AC stepper. Always-on assumption is correct for how players use the sheet. |
| ~~**Conditional/situational bonuses**~~ | ✅ Out of scope — Sharpshooter, GWM, etc. are per-roll opt-in decisions; auto-applying them would be less accurate than manual play. No per-roll toggle UI planned. |
| ~~**Active conditions**~~ | ✅ Out of scope — Bless, Rage, Concentration, etc. are runtime game state, not character record state. Player tracks these at the table. |
| ~~**Spell attack bonus override**~~ | ✅ Out of scope for now — deferred indefinitely; player can note bonus manually if needed. |

---

## ✅ Import / Export Bugs (found in code review 2026-06-04)

| Priority | Bug | File | Status |
|---|---|---|---|
| 1 | **Character import validation too thin** — `validateCharacterPayload` in `src/lib/importExport.ts` checks only 5 fields (`name`, `abilities` ×6, `spells` array, `maxHp`, `level`). `insertCharacter` reads ~30 fields without nullish coalesces: `currentHp`, `tempHp`, `armorClass`, `speed`, `deathSaves`, `hitDiceUsed`, `inspiration`, `skillProficiencies`, `savingThrowProficiencies`, `spellSlotsUsed`, `equipment`, `currency`, `languages`, `personalityTraits`, `ideals`, `bonds`, `flaws`, `notes`, `feats`, `race`, `class`, `background`, `xp`, `progressionType`, `alignment`, `backstory`, `classes`. A crafted or trimmed JSON file omitting any of these passes validation, and `insertCharacter` writes `undefined`/`null` to those SQLite columns silently — no error shown. **Fix:** extend `validateCharacterPayload` to cover all required fields, or add defensive defaults inside `insertCharacter`. | `src/lib/importExport.ts` (validateCharacterPayload, ~line 16) | ✅ Fixed — `insertCharacter` now has `??` defaults for all ~25 optional fields; minimal 5-field import verified in-browser |
| 2 | **Spell element shape not validated** — `validateCharacterPayload` only checks `Array.isArray(spells)`, not element shape. `syncSpells` in `characterRepo.ts` reads `spell.slug` with no guard. If an import file contains `"spells": [{"prepared": true}]` (no slug), sql.js binds `undefined` as `NULL`, writing a row with `spell_slug=NULL` to `character_spells`. On reload, spell lookups by slug fail silently or crash `SpellBlock`. **Fix:** add `for (const s of char.spells) { if (typeof s.slug !== 'string') throw new Error(...) }` inside `validateCharacterPayload`. | `src/lib/importExport.ts` (~line 33) / `src/storage/characterRepo.ts` (~line 100) | ✅ Fixed — slug loop added; `[{prepared:true}]` import verified to show "Spell entry is missing a slug field." |
| 3 | **tempDb leaked on import error** — `replaceDb` in `src/storage/db.ts` creates a `tempDb`, runs migrations, saves to IDB, closes tempDb, then reloads. If `runMigrations()` or `saveToIdb()` throws, execution leaves the function and `tempDb.close()` is skipped — the WASM heap allocation is held for the rest of the tab session. **Fix:** wrap the body in `try { ... } finally { tempDb.close() }`. | `src/storage/db.ts` (replaceDb, ~line 55) | ✅ Fixed — `try/finally { tempDb.close() }` wraps migration + saveToIdb |
| 4 | **Stale `_db` singleton after DB import** — `replaceDb` writes the migrated blob to IDB then calls `window.location.reload()`. Between those two lines, any pending Zustand `flush()` call resolves, calls `getDb().export()` on the old `_db`, and overwrites IDB with the old database — silently discarding the import. **Fix:** set `_db = null` immediately after `await saveToIdb(...)` so any intervening `getDb()` call throws instead of returning stale data. | `src/storage/db.ts` (replaceDb, ~line 60) | ✅ Fixed — `_db = null` set after `saveToIdb`, before `reload()` |
| 5 | **Version check too strict — breaks all past exports** — `importCharacter` rejects any file whose `version !== CHAR_EXPORT_VERSION` (currently `1`). When the app bumps to v2, every v1 backup becomes permanently unimportable even if the schema change is additive. **Fix:** change to `version > CHAR_EXPORT_VERSION` (reject files from the future, accept files from the past) and apply defaults for any new optional fields missing from old exports. | `src/lib/importExport.ts` (importCharacter, ~line 116) | ✅ Fixed — check is now `>`; v0 import verified accepted; v99 import verified rejected with "newer version" message |
| 6 | **Blob URL revoked before browser fetches it (desktop export)** — `triggerDownload`'s desktop fallback calls `a.click()` then immediately `URL.revokeObjectURL(url)` in the same synchronous call stack. On Firefox (and some Safari versions) the download manager fetches the blob URL asynchronously, after the URL has already been revoked — producing a failed or zero-byte download. **Fix:** delay the revoke: `setTimeout(() => URL.revokeObjectURL(url), 100)`. | `src/lib/importExport.ts` (triggerDownload, ~line 57) | ✅ Fixed — `setTimeout(..., 100)` in place |
| 7 | **Real export errors silently swallowed** — All export call sites use `.catch(console.error)` with no `setError`. If `navigator.share()` throws a non-`AbortError` (e.g. `NotAllowedError`, `DataError`) or if `getDb().export()` fails, the user sees nothing. Note: swallowing `AbortError` (user cancelled the share sheet) is intentional and correct. **Fix:** in `.catch`, check `if (err?.name !== 'AbortError') setError(...)` and surface real errors in the dialog's error state. | `src/components/DataManagementDialog.tsx` (~lines 83, 148, 209) | ✅ Fixed — `handleExportCurrentDb` and `handleExportCharacter` call `setError` on non-`AbortError` failures |
| 8 | **Duplicate export call — two spellings of the same side-effect** — `handleExportCurrentDb` (passed to `ConfirmDbImportView`) and the MainView "Export all" button each independently call `exportDb().catch(console.error)`. If error handling is improved on one (e.g. showing a toast), the other will be missed. **Fix:** use `handleExportCurrentDb` from both call sites, or inline both and update both when the error handling changes. | `src/components/DataManagementDialog.tsx` (~lines 82 and 143) | ✅ Fixed — `onExportDb` prop passed to `MainView`; single handler used for all "Export all" call sites |

---

## Future Features

| Feature | Description |
|---|---|
| **Side-by-side comparison view** | Allow players to compare two or more races, subraces, classes, or subclasses side-by-side during character creation or browsing — showing stat differences, traits, and features in a columnar layout. |
| **Print CSS — subrace row** | Subrace row in IdentitySection needs the same `@media print` treatment as other identity rows when the print layer (Step 10) is built. |

---

## ✅ Code Duplication Fixed

| Duplication | Files affected | Fix |
|---|---|---|
| `ORDINALS`, `spellGroup`, `componentStr` | `SetupScreen3`, `SpellBlock`, `LevelUpDialog` | ✅ `src/lib/spells.ts` — all three files now import from here |
| Ability full-name → short map (`"strength" → "str"`) | `characterSetup.ts`, `characterStats.ts`, `LevelUpDialog.tsx`, `CharacterPage.tsx`, `SetupScreen1.tsx`, `FeatsBlock.tsx`, `ProficienciesBlock.tsx` | ✅ `ABILITY_FULL_TO_SHORT` exported from `characterSetup.ts`; all other sites import it |
| `formatBonus(n)` — `+N` / `-N` formatting | `ProficienciesBlock` ×2, `DiceTray` ×2 | ✅ `formatBonus()` added to `src/lib/dice.ts`; all call sites use import |
| Roll button markup | `ProficienciesBlock` ×2, `EquipmentBlock`, `SpellBlock`, `CombatBlock` | ✅ `<RollButton>` in `src/components/sheet/RollButton.tsx`; all five sites use it |
| ~~`saveBonus` / `skillBonus` logic~~ | ~~`ProficienciesBlock`~~ | ✅ Resolved — deleted; `derived.skillModifiers` / `derived.saveModifiers` used directly |
| Roll entry rendering | `DiceTray` inline JSX | Dropped — `DiceRollModal` went a different direction; no real duplication remains |
