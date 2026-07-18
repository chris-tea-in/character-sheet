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
| `classFeatureChoices` (group key → chosen option slugs) | `effectiveAC` (Fighting Style: Defense) | selected feature options' passive `effects` via `computeFeatureEffects` (render time, INV-1). `ac` folds into `effectiveAC`; weapon-conditional `weapon_attack`/`weapon_damage` ride on `derived.featureWeaponEffects` and apply per-weapon in `computeWeaponBonus` (Archery to-hit, Dueling damage). Applicability + known-count resolved by `src/lib/classFeatures.ts` from the OWNING class's level, not total (INV-2). **Three write surfaces, all using the same helpers:** the wizard's Class Features screen (`SetupScreenFeatures`, round-tripped via the draft), `LevelUpDialog` (prompts only the per-level delta via `levelUpFeatureChoices`), and the sheet's `FeaturesBlock` (edit anytime) |
| `featureResourcesUsed` (group key → spent) | — | NOT a stat effect: choice-attached resource tracker (Battle Master Superiority Dice), parallels `spellSlotsUsed`/`chargesUsed`; rendered/edited in FeaturesBlock, never touches `deriveCharacterStats` |
| `customWeapons[]`, `customArmor[]` (homebrew catalog-shaped defs) | resolved via the merged catalog → `effectiveAC` (custom armor), weapon to-hit/damage (custom weapons) | per-character homebrew folded into `EquipmentData` by `mergeCustomEquipment` (`src/lib/customContent.ts`) at the SAME point for both the derive (`useDerivedSheet`) and the UI (`EquipmentBlock`), so a custom item resolves by name exactly like a catalog entry (INV-1). The "Custom" buttons store the def AND add an `equipment[]` instance referencing its name. Migration v18. Sheet-managed (edit merge preserves) |
| `customFeats[]` (homebrew FeatData) | `effectiveAbilities` etc. via `computeFeatStatDelta` | per-character homebrew feats merged into the feat map by `mergeCustomFeats` (`src/lib/customContent.ts`) for both the derive (`useDerivedSheet`) and `FeatsBlock`'s list. ASI effect derives like a built-in feat's `effects`. Adding pushes the slug into `feats[]`; removing prunes both. Migration v18. Sheet-managed |
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
  on duplicate DDL. One BEGIN/COMMIT per migration. Latest is **v18**
  (`custom_weapons` + `custom_armor` + `custom_feats` columns for per-character
  homebrew content; v17 added per-spell damage columns; v16 added
  `homebrew_all_weapons_proficient`; v15 added `class_feature_choices` +
  `feature_resources_used` for selectable class features; v14 added
  `character_backups`; v13 added the `last_synced_updated_at` reconcile-base column
  — see Cloud sync tier). They run in `initDb()` before first render and must
  also run on imported DB blobs (importExport.ts) before the blob is adopted.
- Roll history is session-only (Zustand `useDiceStore`) — never persisted.
- `storageError` covers IndexedDB flush failures AND SQL-write rejections: the
  store wraps insert/update/delete in try/catch and sets `storageError` (create
  rethrows so the wizard doesn't navigate to a non-existent character). BUG-40 fixed.

## Cloud sync tier (added 2026-06-16, branch `feat/prepared-spell-limits`)

Local-first is unchanged — sql.js/IndexedDB stays the source of truth. The cloud
(Cloudflare Pages Functions + D1) is a synced **mirror**. As of the shared-campaigns
work (Phase 2) writes are a **field-scoped merge**, not whole-blob LWW. Wiring:

- `useCharacterStore.create/update/remove` fire fire-and-forget pushes after the
  local write: create → immediate push (full patch); update → **debounced**
  (`src/store/sync.ts`, 3s coalesce per id) push of **only the changed fields**
  (`syncOnUpdate(character, changes)` accumulates a per-id `pendingPatch`);
  remove → cloud tombstone. Failures queue + retry on `online`/`visibilitychange`.
- **PUT body is `{ createdAt?, updatedAt, patch }`** where `patch` is a partial
  `NewCharacter` (the whole character for a new row). The server (`functions/api/
  characters/[id].ts`) shallow-merges `patch` over the stored JSON and advances
  `updated_at = max(stored, incoming)`, so concurrent edits to *different* top-level
  fields both survive. The client push shape and this server shape are **coupled** —
  change them together (`src/lib/syncApi.ts pushCharacter`, `src/store/sync.ts`).
  `pushOne` falls back to the full character when no `pendingPatch` exists (boot
  "local is newer" push), so the boot path stays whole-document.
- Boot (`main.tsx`) runs `runInitialSync()` AFTER first render: `getMe` →
  `pullCharacters` → **3-way reconcile** (`mergeRemote`) → `flush()` → `store.load()`.
  `useCampaignStore.load()` runs alongside. Cloud-sync-hardening (2026-06-19, branch
  `feat/cloud-sync-hardening`) **replaced the whole-character LWW boot-merge** with a
  per-row reconcile against a device-local **base** (`last_synced_updated_at` column,
  migration v13 — NOT on the `Character`/`NewCharacter` type, never pushed; INV-4):
  - The pure decider `src/store/reconcile.ts` (`reconcileDecision`) compares
    base vs local.updatedAt vs remote.updatedAt → `adopt`/`push`/`conflict`/`delete`/
    `resurrect`/`set-base`/`none`. `mergeRemote` maps each onto DB effects. **Base 0 is
    the "never reconciled" sentinel** (fresh migration / new local row) → fall back to
    LWW for that row so the first post-migration boot can't mass-fire conflicts.
  - **Adopt-gate:** before overwriting local with remote, the shared
    `validateCharacter` (`shared/characterValidation.ts`) gates the blob; a corrupt
    remote is **rejected (local kept), base NOT advanced**, surfaced via a quarantine
    banner — never adopted, even in the conflict branch.
  - **Both-sides changed → `ConflictResolutionModal`** (forced choice, App-mounted;
    campaign chars default to Keep cloud). A remote tombstone vs a local edit
    **resurrects** (keeps + re-pushes local) rather than silently deleting.
  - **Rollback:** `character_backups` (migration v14, local-only, never synced) is
    snapshotted before any adopt-over-local / delete / keep-cloud; Restore UI lives in
    `DataManagementDialog`.
  - The base advances when a remote row is adopted (`upsertSyncedCharacter` takes it as
    a 3rd arg) and on a push ack — the PUT now **echoes the server's authoritative
    `updated_at`**, which the client stores as the base (`setSyncBase`).
- `src/lib/syncApi.ts` classifies every response into good-read / auth-expired /
  offline; only a good read merges, so a truncated/non-JSON/redirect response can
  never be misread as data, and **absence is never a delete** (deletes travel only as
  explicit `deleted` tombstones). Auth-expired → App reconnect banner → full reload.
- The synced `data` blob is the full base-stats `NewCharacter` (id+timestamps
  preserved so the same character matches across devices) — **INV-4 applies**: any new
  `Character` field rides along via `data`, but a field needing a dedicated column in
  `upsertSyncedCharacter` must be added there too (mirrors `insertCharacter`). The
  legacy `class`/`subclass`/`level` inside the blob may go stale under field-scoped
  merge, but `upsertSyncedCharacter` re-derives the columns from `classes[]` on the
  receiving side, so they never surface (legacy-columns duality, INV-3).
- **The cloud `data` blob is untrusted JSON despite its `NewCharacter` type.**
  `normalizeNewCharacter` (src/types/character.ts) coalesces an arbitrary blob over
  `defaultCharacter()` and MUST be applied at every boundary that builds a
  `Character` from it — `fromSynced` (sync.ts) and `CampaignCharacterPage` — so a
  record missing a field (older client, partial write, import) can't reach
  `deriveCharacterStats` and crash it (spreading an `undefined`
  `savingThrowProficiencies` → "not iterable"). Owner paths round-trip through the
  local DB (columns are `NOT NULL DEFAULT`), which normalizes them; the **DM
  campaign view is the one path that skips that round-trip**, so it is the load-
  bearing consumer of the boundary normalizer.
- **Campaigns (Phase 2):** `campaignId: string | null` is a player-owned synced
  `Character` field; the server mirrors it to an indexed `characters.campaign_id`
  column on owner writes only. Authority is recomputed server-side from the verified
  email per request: a character row may be written by its `owner_email` OR the
  `dm_email` of its campaign; a DM patch is stripped of `campaignId`/owner. `campaigns`
  + `campaign_members` tables back `/api/campaigns/*`. The old global DM view
  (`DM_EMAILS`, `isDm`, `/api/dm/characters`, `/dm`, `DmViewPage`) is **removed**.
- Backend lives in `functions/` (Pages Functions, file-routed; `functions/_lib/auth.ts`
  exports no `onRequest` so it is never routed). Identity = verified email from the
  Cloudflare Access JWT; `owner_email` scopes every character query. See CLOUD_SYNC.md.

## Data pipeline

`scripts/build-data.js`: `data/**` → validate → `public/data/*.json`. Equipment is
read from the fixed 11-file `EQUIPMENT_CATEGORIES` allowlist — any other file in
`data/equipment/` is not compiled, but as of 2026-06-13 the build **warns** on it
(stray-file guard after the equipment IIFE) so staging files can't strand
silently. Weapon/firearm `damage_dice`/`damage_type` are nullable; consumers must
null-guard. `data/` and `public/data/`
are gitignored: data fixes have no commits and must be re-applied if `data/` is
restored from backup.
