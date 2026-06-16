# D&D Character Sheet — Bug & Refactor Backlog

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
