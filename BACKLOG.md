# D&D Character Sheet — Bug & Refactor Backlog

## Character Creation Bugs

| Priority | Bug | Status |
|---|---|---|
| 1 | **Feats missing entirely** — feats don't appear on the creation screen or in the level-up dialog. Blocks the entire feat system. | ✅ Fixed — LevelUpDialog now has ASI/Feat toggle at ASI levels; FeatsBlock on sheet handles ad-hoc adds |
| 2 | **Tool selection locked** — bards (and other classes) cannot select or change tools (musical instruments, thieves' tools, etc.); tool fields are not editable. | ✅ Fixed — `toolProficiencies` field added to Character; Tools tab in ProficienciesBlock with catalog picker; CharacterPage propagates class/background tools on selection |
| 3 | **Skills locked post-creation** — skill proficiency selection works during setup but becomes uneditable on the character sheet afterward. | ✅ Fixed — hard class-option lock removed; skills are always interactive; non-class skills shown at reduced opacity |

---

## Level-Up Dialog Bugs (found in code review 2026-06-03)

| Priority | Bug | Status |
|---|---|---|
| 1 | **Level-up HP gate missing** — `canApply` has no `hpAdd > 0` guard; a player can confirm level-up without rolling or entering HP, permanently gaining +0 max HP with no warning. | ✅ Fixed — defaults to average HP on open |
| 2 | **ASI apply cap is 30, not 20** — `Math.min(30, ...)` in `handleApply` allows scores above 20 if the button-disable check diverges from apply logic. | ✅ Fixed — `Math.min(20, ...)` |
| 3 | **Multiclass old-level mismatch** — `parseClassSlots` and `getSpellsKnownIncrease` receive `character.level` (total) as the "old class level". For a multiclass character whose class level is lower than total, the spell-slot diff display and spell-known delta are wrong. | ✅ Fixed — derives class-specific level from `character.classes` |
| 4 | **HP roll uses `Math.random()` not `rollDie()`** — `rollHp()` uses the weaker PRNG instead of the app-standard `rollDie()` from `src/lib/dice.ts`. | ✅ Fixed — uses `rollDie(hitDie as DieType)` |

---

## Character Sheet Bugs

| Priority | Bug | Status |
|---|---|---|
| 1 | **Armor doesn't affect AC** — equipping armor has no effect on the AC field; magical armor, garments, and weapons also don't apply their stated bonuses, and don't revert them on removal. | ✅ Fixed — `deriveCharacterStats` computes `effectiveAC` from equipped armor; CombatBlock shows it in gold |
| 2 | **Feats don't apply their effects** — feat choices don't update scores, proficiencies, or grant advantage (e.g. Tough not adding HP). | ⚠️ Partial — Tough (+2 HP/level) implemented in `deriveCharacterStats.adjustedMaxHp`; broader feat effect registry extensible |
| 3 | **Magical weapons missing attack bonus display** — attack bonus from a magical weapon (+1, +2, etc.) is absent from the weapon card. | Pending — requires magic weapon bonus field in equipment data |
| 4 | **Weapon damage dice rolling incorrectly** — a 1d8 weapon returns values above 8; likely using the wrong die. | ✅ Fixed — `DiceRollModal` two-phase attack flow now rolls actual damage dice via `parseDamageDice` |
| 5 | **Rings/cloaks/garments in wrong category** — wondrous items and garments appearing under Weapons instead of Items. | ✅ Fixed — wondrous item rarity tabs removed from Weapon/Armor pickers; all magic items now only addable via Items picker |
| 6 | **Death save failure has no "dead" state** — 3 failures should display a "Dead" indicator in the same location where 3 successes shows "Stable/Alive." | ✅ Already implemented — `CombatBlock` shows full DEAD panel when failures ≥ 3 and HP ≤ 0 |
| 7 | **Dice rolls don't open a popup** — all roll results should appear in a modal window rather than only the history tray. | ✅ Fixed — `DiceRollModal` + `useRollDispatch` wired to all roll call sites |
| 8 | **Attack rolls need a two-phase popup** — rolling to attack should open a window for the to-hit roll first, then a damage roll if it connects. | ✅ Fixed — `DiceRollModal` hit/damage phases; nat 20 auto-advances; nat 1 shows Critical Miss |
| 9 | **Natural 20/1 highlighting inconsistent** — gold/red styling only applies in the history tray; d20 raw rolls and hit rolls don't trigger it. | ✅ Fixed — `DiceRollModal` applies gold/red on nat 20/1 for all roll types; raw d20 excluded from crit logic |
| 10 | **No critical success/failure label in popup** — a natural 20 or 1 rolled inside the popup should show "Critical Hit" or "Critical Miss." | ✅ Fixed — `CritLabel` component in `DiceRollModal` shows these for all non-raw roll types |

---

## Planned Systems

### Unified Dice Roll Modal
✅ Done — `src/components/sheet/DiceRollModal.tsx` + `src/lib/useRollDispatch.ts`

### `deriveCharacterStats(character, catalog)` — `src/lib/characterStats.ts`
✅ Done — effectiveAC, adjustedMaxHp (Tough feat), computeWeaponBonus extracted from EquipmentBlock

### `useRollDispatch()` — `src/lib/useRollDispatch.ts`
✅ Done — replaces all 6 scattered `useDiceStore(s => s.roll)` call sites

### Item + Feat Effect Pipeline
✅ Partial — FEAT_EFFECTS registry in `characterStats.ts` (Tough implemented); armor AC from equipment; full magical item pipeline deferred until item bonus data exists

---

## Code Duplication to Fix

| Duplication | Files affected | Fix |
|---|---|---|
| `ORDINALS`, `spellGroup`, `componentStr` | `SetupScreen3`, `SpellBlock`, `LevelUpDialog` | New `src/lib/spells.ts` |
| Ability full-name → short map (`"strength" → "str"`) defined 5+ times | `characterSetup.ts`, `characterStats.ts`, `LevelUpDialog.tsx`, `CharacterPage.tsx`, `SetupScreen1.tsx`, `FeatsBlock.tsx`, `ProficienciesBlock.tsx` | Export `toAbilityName()` from `characterSetup.ts` and use everywhere |
| `formatBonus(n)` — `+N` / `-N` formatting | `ProficienciesBlock` ×2, `AbilityBlock`, `EquipmentBlock`, `dice.ts` | Add to `src/lib/dice.ts` |
| Roll button markup | `ProficienciesBlock` ×2, `EquipmentBlock`, `SpellBlock` | `<RollButton>` in `src/components/sheet/` |
| `saveBonus` / `skillBonus` logic | `ProficienciesBlock` | Move to `characterStats.ts` pre-emptively |
| Roll entry rendering | `DiceTray` inline JSX | Extract `<RollEntry>` component for reuse in popup |
