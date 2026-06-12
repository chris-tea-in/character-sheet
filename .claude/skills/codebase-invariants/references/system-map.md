# System Map — Character State Dataflow

Where every character value comes from and who consumes it. Verified against the
working tree on 2026-06-12 (branch `render-time-character-stats-instead-of-write-time`).

## The pipeline

```
CREATE   SetupScreen1–5 ──▶ draft (characterSetup.ts) ──▶ draftToNewCharacter()
                                                              │
EDIT     characterToDraft() ◀── stored record                 ▼
         └─▶ wizard ─▶ draftToNewCharacter() ─▶ edit merge   store.create/update
             (CreateCharacterPage.handleFinish — preserves        │
              sheet-managed fields: feats, featChoices,           ▼
              armorClass, initiativeBonus, savingThrow-      characterRepo
              Proficiencies, notes, expertise)               (updateCharacter re-derives
                                                              class/subclass/level from
SHEET    blocks call save() ─▶ store.update() ───────────▶   classes[] on EVERY write)
                                                                  │ flush()
RENDER   CharacterPage ─▶ deriveCharacterStats(character,        ▼
         DeriveContext{classes[], race, catalog, featData})  IndexedDB blob
         ─▶ DerivedStats ─▶ all sheet blocks
```

## Stored vs. derived ledger

**Stored fields are BASE values.** All effect application happens exactly once, in
`deriveCharacterStats()` (src/lib/characterStats.ts). Write sites record choices only.

| Stored (base) | Derived (effective) | Effect sources applied at derive time |
|---|---|---|
| `abilities` (point-buy/rolled + level-up ASI +1s) | `effectiveAbilities` | racial ASIs (`raceAsiChoices` + race/subrace fixed), feat ASIs (cap 20) |
| `speed` (race base) | `effectiveSpeed` | feat speed bonuses |
| `initiativeBonus` (0 unless manually edited) | `effectiveInitiative(Bonus)` | feat initiative bonuses |
| `maxHp` (rolled/average only) | `adjustedMaxHp` | Tough (`FEAT_EFFECTS`), `SUBRACE_HP_BONUS` (hill-dwarf) |
| `skillProficiencies` | `effectiveSkillProficiencies`, `skillModifiers` | feat skill grants (Skilled, Prodigy) |
| `savingThrowProficiencies` | `effectiveSaveProficiencies`, `saveModifiers` | feat save proficiencies (Resilient) |
| `armorClass` (manual fallback) | `effectiveAC` | equipped armor `ac_formula` + `bonus`, shield + `bonus` |
| — | `weaponProficiencies` | lowercased union across ALL class records |
| — | `spellAttackBonus`, `spellSaveDC` | first class record with `spellcasting.ability` + `spellBonusModifier` |

`DeriveContext`: `{ classes?: (ClassData|null)[], race?, catalog?: { armor? }, featData? }` —
`classes` ordered to match `character.classes`, `[0]` = primary.

## The three dualities (where bugs breed)

1. **Stored vs. derived.** Anything rendering or mutating a stat from the stored
   field when a derived counterpart exists is suspect (e.g. P/E dots render stored
   `skillProficiencies` while modifiers use derived — BUG-30).

2. **Legacy columns vs. `classes[]`.** `classes[]` (`{classSlug, subclassSlug, level}[]`)
   is the source of truth. `updateCharacter` re-derives `class`/`subclass`/`level`
   from it on every write — any edit writing only the legacy fields silently
   reverts on reload (BUG-34 family, fixed for class/subclass/level-down; watch
   new call sites).

3. **Display vs. behavior.** Display templates and behavior code consume the same
   field independently (customDamage shown but calc.* rolled — BUG-20; "(feat)"
   label vs. mixed bonus sources — BUG-07; help text promises +2 ASI the toggle
   can't produce — BUG-28/33).

## Spellcasting model

- Slot counts in class data are **strings**; `"-"` = 0. Warlock uses
  `class_specific` keys (`"Spell Slots"`, `"Slot Level"`) — always go through
  `parseClassSlots()` (src/lib/spellcasting.ts).
- `computeMulticlassSlots` runs for any `classes.length > 1` and currently
  misapplies the PHB multiclass table to lone half-casters (BUG-38, open) and
  drops warlock pact slots when multiclassed (BUG-16, open).
- One `SpellBlock` per casting class is rendered; `overrideSlotProfile` (multiclass
  profile) REPLACES the per-class profile when passed.

## Persistence specifics

- Migrations (src/storage/migrations.ts) are append-only; version = last + 1;
  one BEGIN/COMMIT per migration. They run in `initDb()` before first render and
  must also run on imported DB blobs (importExport.ts) before the blob is adopted.
- Roll history is session-only (Zustand `useDiceStore`) — never persisted.
- `storageError` covers IndexedDB flush failures only; SQL-write rejections are
  currently unhandled (BUG-40, open).

## Data pipeline

`scripts/build-data.js`: `data/**` → validate → `public/data/*.json`. Equipment is
read from the fixed 11-file `EQUIPMENT_CATEGORIES` allowlist — any other file in
`data/equipment/` is invisible (no warning). Weapon/firearm `damage_dice`/
`damage_type` are nullable; consumers must null-guard. `data/` and `public/data/`
are gitignored: data fixes have no commits and must be re-applied if `data/` is
restored from backup.
