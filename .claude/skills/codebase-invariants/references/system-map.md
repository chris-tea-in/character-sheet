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
| `armorClass` (manual fallback); `equipment[].equipped`/`attuned`/`baseArmor` | `effectiveAC` | only *worn* armor (`equipped \|\| attuned`) contributes — unworn armor is inert inventory. `ac_formula` (parser handles magic shapes) + `bonus`, shield + `bonus`. Variable-base armor (`Varies`/"any armor") is resolved to its chosen mundane base via `resolveArmor` (`EquipmentItem.baseArmor`) before parsing; unset → `Varies` → manual-AC fallback. Body-armor/shield equip is exclusive (EquipmentBlock `toggleActive` unwears the same slot). |
| `skillProficiencies` (also) | `effectiveSkillProficiencies`, `featSkillGrants` | feat skill/expertise grants; UI renders + locks from these, not the raw record |
| `hitDiceUsed` (single-class) / `hitDiceUsedByClass` (multiclass) | — | per-class hit-dice pools; migration v10 added the keyed field |
| — | `weaponProficiencies` | lowercased union across ALL class records |
| `languages` (user-toggled) | `itemGrantedLanguages` (DescriptionBlock renders locked) | active items' `language` effects (e.g. Demon Armor → Abyssal); never written to `languages` |
| — | `unarmedStrike` (die/type/atk/dmg) | active items' `unarmed` effects (Demon Armor → 1d8 slashing +1/+1); base is 1 + STR bludgeoning |
| — | `resistances`, `immunities` (CombatBlock "Defenses" readout) | active items' `resistance`/`immunity` effects (Brooch of Shielding → force; Periapt of Proof Against Poison → poison); deduped, lowercased, read-only |
| `equipment[].chargesUsed` (usage tracker) | — | NOT a stat effect: catalog `charges.max − chargesUsed` = remaining pips (Pearl of Power, Wand of Magic Missiles, Rod of the Pact Keeper); rendered/edited in EquipmentBlock, never touches `deriveCharacterStats` |
| `spellBonusModifier` (manual override, default 0); `equipment[].attuned`, `equipment[].equipped` | `spellAttackBonus`, `spellSaveDC`, `effectiveAC`, `effectiveAbilities`, `saveModifiers`, `skillModifiers`, `effectiveSpeed`, `effectiveInitiativeBonus`, `adjustedMaxHp`, `resistances`, `immunities` | first class record with `spellcasting.ability` + **active** items' `effects` (via `computeActiveItemEffects`) + manual override. An item is *active* when attune-required & `attuned`, OR non-attune & `equipped`. Magic-item `effects` (ac/save/ability/skill/speed/init/damage/max_hp/resistance/immunity/unarmored_ac) fold into the matching derived field (damage → `itemDamageBonus`; `max_hp` → `adjustedMaxHp`; `ac` with `condition:'unarmored'` and `unarmored_ac` apply only when no body armor); item ability changes are uncapped (replaced `wondrous_items.spell_focus`, 2026-06-14) |

`DeriveContext`: `{ classes?: (ClassData|null)[], race?, catalog?: { weapons?, armor?, wondrous_items? }, featData? }` —
`classes` ordered to match `character.classes`, `[0]` = primary. `catalog` is the
full `EquipmentData`; `weapons`/`armor`/`wondrous_items` are read for item-effect
derivation (`computeActiveItemEffects`).

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
- `computeMulticlassSlots(classes, classData)` (takes class records as of
  2026-06-13): a lone standard caster uses its own class slot table; ≥2 use the
  PHB multiclass table; a multiclassed warlock contributes a separate pact pool
  via the `slots+pact` profile variant (tracked under `PACT_SLOT_KEY = -1` so it
  never collides with same-level standard slots). BUG-16/38 fixed.
- `SpellBlock` renders the override profile when passed; `slots+pact` shows both
  the standard slot rows and a separate pact pip row.

## Persistence specifics

- Migrations (src/storage/migrations.ts) run in **array order**, and the runner
  (db.ts) stamps `schema_version` to each migration's version as it goes. A new
  migration MUST be appended at the END of the array (version = last + 1), never
  inserted by number — an out-of-order entry leaves `schema_version` at the last
  array element's version and re-runs the higher migration on next boot, crashing
  on duplicate DDL. One BEGIN/COMMIT per migration. Latest is v10
  (`hit_dice_used_by_class`). They run in `initDb()` before first render and must
  also run on imported DB blobs (importExport.ts) before the blob is adopted.
- Roll history is session-only (Zustand `useDiceStore`) — never persisted.
- `storageError` covers IndexedDB flush failures AND SQL-write rejections: the
  store wraps insert/update/delete in try/catch and sets `storageError` (create
  rethrows so the wizard doesn't navigate to a non-existent character). BUG-40 fixed.

## Data pipeline

`scripts/build-data.js`: `data/**` → validate → `public/data/*.json`. Equipment is
read from the fixed 11-file `EQUIPMENT_CATEGORIES` allowlist — any other file in
`data/equipment/` is not compiled, but as of 2026-06-13 the build **warns** on it
(stray-file guard after the equipment IIFE) so staging files can't strand
silently. Weapon/firearm `damage_dice`/`damage_type` are nullable; consumers must
null-guard. `data/` and `public/data/`
are gitignored: data fixes have no commits and must be re-applied if `data/` is
restored from backup.
