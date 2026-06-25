# D&D 5e Character Sheet — Working Document

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript + Vite 6 |
| Routing | React Router v7 (`react-router-dom`) |
| State | Zustand 5 |
| Storage | sql.js (SQLite in WASM) + IndexedDB blob |
| UI | shadcn/ui + Tailwind CSS |
| Icons | lucide-react (ships with shadcn/ui) |
| PWA | vite-plugin-pwa + Workbox |

## Git Workflow

- **Every implementation lands on a feature branch first.** Create a new branch for
  each step or discrete piece of work (`git checkout -b feat/...`, `fix/`, `step/`,
  etc.) and push it there as work completes. A feature-branch push is the default
  endpoint for any task.
- **`main` is the last step and is gated on the user — every time.** Do NOT push to
  `main`, force-push it, or merge into it without the user's explicit go-ahead **in
  that same turn**. Promoting to `main` is always a separate, explicitly-approved
  action, never the automatic continuation of finishing the work.
- Prefer a PR (or an explicit merge the user approves) over a direct push when
  integrating into `main`.

  > The old hard block (a `deny` rule + PreToolUse hook in `.claude/settings.json`)
  > was removed 2026-06-21 at the user's request; this per-turn-approval discipline
  > replaces it. Treat the rule above as binding even though nothing now enforces it
  > mechanically.

## Commands

```bash
npm run dev        # builds data files then starts Vite dev server
npm run build      # builds data files, type-checks, then Vite production build
npm run build:data # data pipeline only (node scripts/build-data.js)
npm run preview    # serve the production dist
```

`npm run dev` and `npm run build` both call `build-data.js` first. If the data
build fails (validation errors), the process exits and Vite does not start.

## Project Layout

```
data/                  # Source data — gitignored, local disk only (see Data Content below)
  backgrounds/         # 48 .json files
  classes/             # 14 .json files (12 SRD + artificer + blood-hunter)
  feats/               # 105 .json files
  races/               # 46 .json files (one per race; subrace variants defined inside each file)
  spells/              # 567 .json files
  subclasses/          # 122 .json files (keyed classSlug:subclassSlug)
  equipment/           # exactly the 11 pipeline category files (staging files removed 2026-06-13; build now warns on strays)
  rules.json           # Flat rules reference
public/
  data/                # Compiled output of build-data.js — do not edit by hand
    backgrounds.json
    classes.json
    feats.json
    races.json
    spells.json
    subclasses.json
    equipment.json
    rules.json
  sql-wasm.wasm        # Copied from node_modules by build-data.js
scripts/
  build-data.js        # Data pipeline: validates, compiles data/ → public/data/
  scrape-background.js # Scraper script (untracked)
src/
  components/
    DataManagementDialog.tsx  # Import/export modal — full DB (.sqlite) and single character (.json)
    DetailBody.tsx      # Shared detail content renderer (used by DetailPopup)
    DetailPopup.tsx     # Dialog wrapper — view mode + selection mode
    InfoPopup.tsx       # Minimal title + description dialog with optional action row (e.g. spell-bonus item prompt)
    SelectionList.tsx   # Searchable/sortable list with popup; used across all screens
    setup/
      SetupScreen1.tsx  # Identity & stats (name, level, race, class, subclass, HP, ability scores, ASI)
      SetupScreen2.tsx  # Background & details (alignment, personality, backstory, appearance)
      SetupScreen3.tsx  # Proficiencies (languages, skills, tools, armor/weapon display)
      SetupScreen4.tsx  # Starting equipment
      SetupScreen5.tsx  # Progression system (XP vs Milestone)
      Field.tsx         # Labeled form field wrapper (label + optional error message)
    sheet/
      AbilityBlock.tsx       # 6-ability grid — StepperField per score, click modifier to roll ability check
      CombatBlock.tsx        # AC, Speed, Initiative, ProfBonus, HP (current/max/temp), DeathSaves, HitDice, Inspiration
      ProficienciesBlock.tsx # Tabbed saves/skills — P+E dots, class-lock enforcement, click row to roll
      EquipmentBlock.tsx     # Weapons (attack roll, finesse/ranged/melee calc, custom override), Armor, Items, Currency
      SpellBlock.tsx         # Spell slot tracker (pip UI), spell list with prepared toggle, spell attack roll button
      DescriptionBlock.tsx   # Languages toggle grid + personality/ideals/bonds/flaws/backstory/notes textareas
      FeatsBlock.tsx         # Feat management: add/remove feats, record per-feat choices (featChoices); effects derive at render time
      LevelUpDialog.tsx      # Level-up flow — HP roll/manual, spell/cantrip picks, ASI/feat toggle; blocks confirm until done
      DiceTray.tsx           # Fixed bottom bar — d4/d6/d8/d10/d12/d20/d100 buttons + expandable roll history
      DiceRollModal.tsx      # Two-phase attack popup: hit roll → damage roll; nat 20 auto-advances; nat 1 shows Critical Miss
      EditableField.tsx      # Click-to-edit inline field (text/number) + EditableTextarea; commits on blur/Enter
      StepperField.tsx       # − value + stepper control, reused across all numeric fields
      RollButton.tsx         # Small "Roll" / "Roll (Adv)" button used by weapon, spell, and proficiency rows
    ui/                 # shadcn/ui primitives (badge, button, dialog, …)
  lib/
    characterSetup.ts   # Setup wizard draft state, draftToNewCharacter()/characterToDraft(), HP calculation, point buy logic
    characterStats.ts   # deriveCharacterStats() — the single render-time application point for racial ASIs + feat effects; computeWeaponBonus(), computeFeatStatDelta(), FEAT_EFFECTS registry (see Character State — Render-Time Derivation)
    data.ts             # Typed data-loading helpers (classes, races, spells, etc.)
    dice.ts             # rollDie(), abilityModifier(), proficiencyBonus(), SKILL_ABILITY_MAP, formatBonus()
    spellcasting.ts     # parseClassSlots(), getSpellcastingInfo(), getSpellsKnownIncrease() — warlock vs. standard format
    importExport.ts     # exportDb(), importDb(), exportCharacter(), importCharacter() — download/upload helpers
    useRollDispatch.ts  # useRollDispatch() — single dispatch point for all roll types; opens DiceRollModal for attacks
    utils.ts            # shadcn/ui cn() helper
    uuid.ts             # generateId() — UUID v4 using crypto.getRandomValues
  pages/
    CharacterListPage.tsx
    CharacterPage.tsx
    CreateCharacterPage.tsx  # Wizard shell — hosts all 5 screens + back/next navigation
  storage/
    db.ts              # initDb(), flush(), getDb() — sql.js lifecycle
    idb.ts             # loadFromIdb(), saveToIdb() — IndexedDB blob persistence
    migrations.ts      # Migration runner + schema definitions
    characterRepo.ts   # SQL CRUD: listCharacters, getCharacter, insertCharacter, updateCharacter, deleteCharacter
    index.ts           # Re-exports from db.ts
  store/
    characters.ts      # Zustand store: useCharacterStore
    dice.ts            # Zustand store: useDiceStore — session-scoped roll history
  styles/
    globals.css        # CSS variables + body styles
  types/
    character.ts       # Character, NewCharacter, Abilities, etc.
    data.ts            # TypeScript types for reference data (classes, races, spells, etc.)
    detail-item.ts     # DetailItem type used by DetailPopup + SelectionList
    dice.ts            # DieType, RollKind, RollResult, RollEntry
  App.tsx              # Route definitions + persistent/storageError banners
  main.tsx             # bootstrap(): initDb() → render App
```

## Storage Architecture

`initDb()` runs once at startup in `main.tsx` before React renders.

```
IndexedDB blob ──→ sql.js (WASM) ──→ app reads/writes via characterRepo
                        │
                   on every write: flush() ──→ IndexedDB blob
```

- `getDb()` returns the singleton `Database` instance; throws if `initDb()` was not called.
- `flush()` is called automatically after every write in the Zustand store.
- Migrations run in `initDb()` before `flush()` on every startup, so new columns/tables appear before the first page renders.
- Each migration is atomic: version bump and schema change share one `BEGIN/COMMIT`.
- `navigator.storage.persist()` is called in `initDb()`; App.tsx shows a warning banner if it returns `false`.

### Adding a migration

Append to the `migrations` array in [src/storage/migrations.ts](src/storage/migrations.ts). Set `version` to one higher than the current last entry. Never modify existing migration entries.

## Data Pipeline

`scripts/build-data.js` reads `data/**/*.json` → validates → writes `public/data/*.json`.

- Per-entry files (races, classes, spells, feats, backgrounds, subclasses) are keyed by slug (filename without `.json`).
- Equipment is an exception: each category file is a top-level array; they merge into a single `equipment.json` output keyed by category name. Files that don't exist on disk are skipped with a warning (no build error).

### Equipment Categories

| File | Category key | Required fields |
|---|---|---|
| `weapons.json` | `weapons` | name, weapon_type |
| `armor.json` | `armor` | name, armor_type, ac_formula |
| `adventuring_gear.json` | `adventuring_gear` | name, subcategory |
| `trinkets.json` | `trinkets` | name, source |
| `firearms.json` | `firearms` | name, era, weapon_type |
| `explosives.json` | `explosives` | name, era |
| `wondrous_items.json` | `wondrous_items` | name, rarity |
| `currency.json` | `currency` | name, abbreviation, value_in_cp |
| `poisons.json` | `poisons` | name, poison_type, cost |
| `tools.json` | `tools` | name, tool_category |
| `siege_equipment.json` | `siege_equipment` | name |
- `damage_dice`/`damage_type` are **nullable** on weapons and firearms (Net, ammunition entries, generic magic weapons) — display code must null-guard.
- The build reads **only** the 11 files above (`EQUIPMENT_CATEGORIES` allowlist in `build-data.js`). Any other `*.json` in `data/equipment/` is not compiled, but the build now emits a `not in EQUIPMENT_CATEGORIES` **warning** for it (stray-file guard) so staging files can't strand silently. All prior staging files were resolved 2026-06-13 (BUG-42/43/44 fixed): the 11 new graded variants merged into `wondrous_items.json`; the `_gap_*`, `gear.json`, and `_new_wondrous_*` files deleted.
- `_review` arrays in any entry produce warnings but do not block the build.
- Validation errors exit with code 1 — the build stops.
- Subclass files use `key: "classSlug:subclassSlug"` — the build validates this matches the entry's own `classSlug` + `subclassSlug` fields.

**Do not edit `public/data/` by hand.** Always edit `data/` source files and re-run `build:data`.

**`data/` is gitignored.** All source JSON lives only on local disk — not committed, not pushed. Back up this directory manually if moving machines.

## Types

All domain types live in [src/types/character.ts](src/types/character.ts).

- `Character` — full character with `id`, `createdAt`, `updatedAt`
- `NewCharacter` — `Omit<Character, 'id' | 'createdAt' | 'updatedAt'>` — used for insert/update payloads
- `defaultCharacter(name)` — returns a safe zero-state `NewCharacter`
- Slugs (`race`, `class`, `background`) are strings that key into the compiled data files
- `classes` — `ClassEntry[]` (`{ classSlug, subclassSlug, level }`); `classes[0]` is the primary class. **Source of truth**: `updateCharacter` re-derives the legacy `class`/`subclass`/`level` columns from it on every write, so any class-structure edit must write `classes[]`, not just the legacy fields
- `abilities` — **base scores** (point-buy/rolled + permanent level-up ASI +1s). Racial ASIs and feat bonuses are NOT baked in — they derive at render time
- `raceAsiChoices` — `AbilityName[]` — flexible racial ASI picks, ordered race pool slots first, then subrace pools
- `feats` / `featChoices` — feat slugs + per-feat player choices (`asiAbility`, `skillChoices`, `expertiseSkill`)
- `spellBonusModifier` — **manual override only** (default 0) for homebrew/un-cataloged spell focuses; added to spell attack and save DC. Catalog focus items (Rod of the Pact Keeper, Wand of the War Mage, …) carry a `spell_focus` annotation and derive their bonus at render time in `deriveCharacterStats` — leave this at 0 for them (BUG-09/21 render-time refactor, 2026-06-13)
- `toolProficiencies` — free-form tool names from the equipment catalog
- `skillProficiencies` — `Partial<Record<SkillName, 'proficient' | 'expertise'>>` (records *that*, not *why* — no source tracking yet; see bugs.md BUG-29 family)
- `savingThrowProficiencies` — `AbilityName[]`
- `spellSlotsUsed` — `Partial<Record<number, number>>` (slot level → count used)

## Zustand Store

`useCharacterStore` ([src/store/characters.ts](src/store/characters.ts)):

| Action | Effect |
|---|---|
| `load()` | Reads all characters from SQLite into store (call once after `initDb()`) |
| `create(data)` | Inserts to SQLite, flushes IDB, prepends to `characters[]` |
| `update(id, changes)` | Merges changes, updates SQLite, flushes, updates store |
| `remove(id)` | Deletes from SQLite (cascades `character_spells`), flushes, removes from store |
| `setActive(id)` | Sets `activeId` — used for navigation |

`storageError` is set when `flush()` fails. Show this to the user via the App banner and call `clearStorageError()` on dismiss.

## Character State — Render-Time Derivation

**Settled policy (2026-06-12, branch `render-time-character-stats-instead-of-write-time`):**
stored character fields are **base values**. All racial ASIs and feat effects are applied
**exactly once** — at render time, inside `deriveCharacterStats()`
([src/lib/characterStats.ts](src/lib/characterStats.ts)). Write sites record *choices only*
(`feats`, `featChoices`, `raceAsiChoices`), never the resulting stat changes.

- `abilities` = base scores; `speed` = race base; `initiativeBonus` = 0 unless manually edited; `maxHp` = rolled/average HP only (Tough, Dwarven Toughness derive into `adjustedMaxHp`).
- Sheet blocks read `derived.effective*` fields (`effectiveAbilities`, `effectiveSpeed`, `effectiveInitiativeBonus`, `adjustedMaxHp`, `effectiveSkillProficiencies`, `weaponProficiencies`, …) — never compute stats from stored fields directly.
- `deriveCharacterStats(character, ctx)` takes a `DeriveContext` with **all** class records (ordered to match `character.classes`), race, armor catalog, and feat data. Weapon proficiency and spell attack/DC consider every class, not just the primary.
- Both violation directions are known bug families: applying an effect at write time **double-counts** (bake + derive); applying it nowhere **silently ignores data**. When adding any new feat/race/item effect, invoke the `feature-effect-system` skill and apply the effect in `deriveCharacterStats` only.

### Design principle — Transparent, Editable Derivation (the "Modifier Ledger")

**Standing direction (2026-06-24):** anything the app auto-derives or auto-grants must be (1) **traceable to its source**, (2) **individually disableable / re-enableable**, and (3) **augmentable with the player's own entry**. Nothing is silently always-on or uneditable. This holds for all three kinds of auto-applied thing — **numeric modifiers** (summed), **boolean states** (advantage/disadvantage, netted per RAW), and **set-membership grants** (proficiencies, languages, resistances, senses). The mechanism: `deriveCharacterStats` emits per-target **provenance** (`{ id, label, sourceKind, value, removable }`); a stored override layer (`disabledModifiers` + `modifierOverrides` + `customGrants`) applies as the **last** derive step — still INV-1, no write-time baking. Full spec: [BACKLOG.md](BACKLOG.md) → "Modifier Ledger"; it resolves ~15 of the Part 2 findings in [DND_RULES_REFERENCE.md](DND_RULES_REFERENCE.md) by construction. When adding any new derived value or grant, expose its provenance and make it ledger-editable — do not add a silent always-on bonus.

## Bug Log & Codebase Invariants

- [bugs.md](bugs.md) is the live bug log (audit of 2026-06-11, 52 findings; fixed entries move to its ✅ section). Its "Systemic root-cause families" table is the distilled failure-pattern catalog for this codebase.
- The **`codebase-invariants` project skill** (`.claude/skills/codebase-invariants/`) encodes those families as checkable invariants plus the system map and tracing protocol for bug hunting and single-pass implementation. Invoke it before editing anything touching character state, multiclass logic, effects, or the data pipeline — and append a new invariant whenever a fix session closes a bug family.

## CSS Variables

Defined in [src/styles/globals.css](src/styles/globals.css). The D&D palette is the single
source of truth; the shadcn/ui semantic tokens (`--background`, `--primary`, `--border`, …)
reference it — no independent hex values.

```
--color-bg            #1c1c1c   page background
--color-surface       #242424   card/panel background
--color-surface-2     #2e2e2e   elevated surface
--color-accent-red    #e94560   red — CTAs, danger (feeds --primary, --destructive, --ring)
--color-accent-gold   #c4a35a   gold — warnings, highlights
--color-text          #eaeaea   primary text
--color-text-muted    #9a9a9a   secondary text
--color-border-raw    #3a3a3a   borders (feeds --border, --input)
--radius              6px
--font-body           system-ui, -apple-system, sans-serif
```

**The old names `--color-accent` and `--color-accent-2` no longer exist.** `var(--color-accent)`
now resolves to a shadcn token mapped to `--color-surface-2` (gray), and `var(--color-accent-2)`
resolves to nothing. Any reference to the old names is a bug — known stragglers are logged as
BUG-25/BUG-32 in bugs.md. The `@media print` block redefines the palette for ink-friendly output.

## Implementation Status

| # | Step | Status |
|---|---|---|
| 1 | Storage layer: sql.js + IndexedDB + migration runner | Done |
| 2 | Character data model + Zustand stores | Done |
| 2a | Dice engine: types, utility lib, session store | Done |
| 3 | shadcn/ui + Tailwind CSS setup | Done |
| 4 | Universal Detail Popup component (view + selection modes) | Done |
| 5 | Character list page | Done |
| 6 | Assisted character creation wizard (5 screens) incl. spell selection (SetupScreen3) | Done |
| 6a | Level-up dialog — HP roll/manual entry, spell selection, ASI prompt; blocks confirm until all choices made | Done |
| 6b | Identity field UX — clicking a set value shows description popup with Back + Change buttons | Done |
| 7 | ~~Manual character creation form~~ | Dropped |
| 8 | Character sheet view — dice tray, ability/skill/save rolls, SpellBlock (slot pip tracker + spell list + prepared toggle), weapon cards (attack roll, STR/DEX/finesse + proficiency), spell attack rolls; class-specific weapon extras (e.g. Warlock Agonizing Blast) not implemented | Done |
| 8a | Bug fixes & enhancements — feats system (FeatsBlock, FEAT_EFFECTS, featChoices DB field), armor AC derivation (deriveCharacterStats), two-phase dice roll modal (DiceRollModal + useRollDispatch), weapon bonus display (+1/+2/etc.), tool proficiency picker, skills always editable, LevelUpDialog ASI/feat toggle, multiclass level fix, HP gate, rollDie() for HP rolls | Done |
| 8b | Render-time stats refactor + severity-first bug-fix session — racial ASIs and feat effects derived in `deriveCharacterStats` (BUG-01/02/05/13/36), `classes[]` split-brain (BUG-34/35), edit-wizard data corruption (BUG-12/13/14), primary-class spell pickers and spell stats (BUG-03/11/15), magic shield AC (BUG-17), warlock `spellcasting` data (BUG-41). 16 code bugs + 1 data bug fixed; remaining findings open in bugs.md | Done |
| 9 | Export / import (full DB + single-character JSON) | Done |
| 10 | @media print CSS layer — light palette, Radix portal hiding, tab-panel forcing, section break avoidance in `globals.css` | Done |
| 11 | Deployment: Cloudflare Pages (Wrangler direct upload) + Cloudflare Zero Trust Access for friend-group access control — see Pre-conditions | Pending |
| 12 | `codebase-invariants` project skill — system map + invariant catalog distilled from bugs.md root-cause families, for bug hunting and single-pass implementation | Done |

## Pre-conditions & Hazards

### Step 2a — Dice engine

**No SQLite migration needed** — roll history is session-only (in-memory Zustand, never flushed to IndexedDB).

#### Files

| File | Purpose |
|---|---|
| `src/types/dice.ts` | `DieType`, `RollKind`, `RollResult`, `RollEntry` |
| `src/lib/dice.ts` | Pure utility functions + skill→ability map |
| `src/store/dice.ts` | `useDiceStore` — session-scoped history |

#### `src/types/dice.ts`

```ts
import type { AbilityName, SkillName } from './character'

export type DieType = 4 | 6 | 8 | 10 | 12 | 20 | 100

export type RollKind =
  | { type: 'raw';    die: DieType }
  | { type: 'skill';  skill: SkillName }
  | { type: 'save';   ability: AbilityName }
  | { type: 'ability'; ability: AbilityName }
  | { type: 'attack'; label: string; modifier: number }

export interface RollResult {
  natural:  number  // raw die value
  modifier: number  // 0 for raw rolls
  total:    number  // natural + modifier
}

export interface RollEntry {
  id:        string
  kind:      RollKind
  result:    RollResult
  label:     string   // e.g. "Deception (CHA +5)" or "d20"
  timestamp: number   // Date.now()
}
```

#### `src/lib/dice.ts`

- `rollDie(sides: DieType): number` — uses `crypto.getRandomValues`, returns 1–sides
- `abilityModifier(score: number): number` — `Math.floor((score - 10) / 2)`
- `proficiencyBonus(level: number): number` — `Math.ceil(level / 4) + 1` (1→+2, 5→+3, 9→+4, 13→+5, 17→+6)
- `SKILL_ABILITY_MAP: Record<SkillName, AbilityName>` — all 18 skills mapped to their governing ability

#### `src/store/dice.ts`

```ts
interface DiceState {
  rolls: RollEntry[]                                // capped at 50, newest first
  roll(kind: RollKind, character: Character): void  // computes result, prepends entry
  clear(): void
}
```

`roll()` logic:
- `'raw'` → `rollDie(kind.die)`, modifier 0
- `'skill'` → d20 + `abilityModifier(abilities[SKILL_ABILITY_MAP[kind.skill]])` + proficiency if `skillProficiencies[kind.skill]` is set (×2 for expertise)
- `'save'` → d20 + `abilityModifier(abilities[kind.ability])` + proficiency if ability is in `savingThrowProficiencies`
- `'ability'` → d20 + `abilityModifier(abilities[kind.ability])`
- `'attack'` → d20 + `kind.modifier` (caller pre-computes the attack bonus)

#### Character sheet integration (built in Step 8)

| Location | Trigger | `RollKind` |
|---|---|---|
| Dice tray at top of sheet | Click die button | `{ type: 'raw', die }` |
| Each skill row | Click row | `{ type: 'skill', skill }` |
| Each saving throw row | Click row | `{ type: 'save', ability }` |
| Ability score block | Click score | `{ type: 'ability', ability }` |
| Weapon card | "Roll Attack" button | `{ type: 'attack', label: weapon.name, modifier }` |
| Spell card | "Roll Attack" button (attack spells only) | `{ type: 'attack', label: spell.name, modifier }` |

**Attack modifier for weapons:** melee → STR mod + proficiency; ranged → DEX mod + proficiency; finesse (`properties` includes `"Finesse"`) → max(STR, DEX) mod + proficiency. Detect finesse from the weapon's `properties` array in `equipment.json`. Compute the modifier in the weapon card component before calling `roll()`.

**Roll history panel:** render `useDiceStore().rolls` as a list below or beside the dice tray. Each entry shows the label, natural roll (in a badge), modifier (if non-zero), and total. Cap display at 50 entries; the store enforces this on write.

---

### Step 3 — Tailwind + shadcn/ui
Delete the `*, *::before, *::after { box-sizing; margin; padding }` reset block from `globals.css` **before** installing Tailwind. Tailwind's preflight covers this reset; shadcn/ui depends on preflight being active. The CSS variables, body background, font, and `min-height` lines stay.

### Step 6 — Spell selection
Before touching spell selection UI, write a `SpellcastingProfile` typed parsing layer. Warlock `class_specific` uses different keys (`"Spell Slots"` + `"Slot Level"`) vs all other casters (`"1st"`–`"9th"` slot counts). Formats exist across all 14 classes — detection is purely key-based:

| Format | Classes |
|---|---|
| No spell slots | Barbarian, Blood Hunter, Fighter, Monk, Rogue |
| Full caster (prepared) | Cleric, Druid, Wizard |
| Full caster (known) | Bard, Sorcerer |
| Half caster (prepared) | Artificer, Paladin |
| Half caster (known) | Ranger |
| Pact Magic | Warlock |

Proposed discriminated union:
```ts
type SpellcastingProfile =
  | { kind: "none" }
  | { kind: "slots"; slotsByLevel: Record<1|2|3|4|5|6|7|8|9, number>; spellsKnown: number | "prepared"; cantripsKnown: number }
  | { kind: "pact"; slotCount: number; slotLevel: number; spellsKnown: number; cantripsKnown: number; invocationsKnown: number }
```

### Step 9 — Import/export
Full-DB import must run the migration runner on the incoming blob **before** writing it to IndexedDB. Load blob into a temporary sql.js instance → run `runMigrations()` → write to IDB and reload. This hook must exist even if only schema v1 exists when Step 9 is built.

### Step 10 — Print CSS (implemented)
Radix UI Dialog and Popover render in `position: fixed` DOM portals at `<body>` level — they will not hide automatically. Implemented in the `@media print` block in `globals.css`: `[role="presentation"]`/`[role="dialog"]` hidden, inactive `[role="tabpanel"]`s forced visible (so all ProficienciesBlock tabs print), light palette override, `break-inside: avoid` on sections.

### Step 11 — Deployment

**Approach: Wrangler direct upload → Cloudflare Pages + Cloudflare Zero Trust Access**

`data/` and `public/data/` are both gitignored — git-connected CI/CD cannot build this project (the source data won't exist on the cloud runner). Always build locally where `data/` exists, then upload `dist/` directly via Wrangler CLI.

#### One-time setup

1. **Install Wrangler CLI and authenticate**
   ```bash
   npm install -g wrangler
   wrangler login   # opens browser OAuth — sign in to Cloudflare account
   ```

2. **Build and deploy**
   ```bash
   npm run build
   wrangler pages deploy dist/ --project-name dnd-character-sheet --branch main --commit-dirty=true
   ```
   ⚠️ **ALWAYS pass `--branch main`.** This is a direct-upload (non-git) Pages project
   whose **production** environment is the `main` branch label. `wrangler pages deploy`
   otherwise tags the deployment with your *current git branch*, and any branch other
   than `main` lands as a throwaway **Preview** URL that the friend group never sees —
   the live site `dnd-character-sheet-e9k.pages.dev` stays stale. The git branch you're
   on is irrelevant to where it ships; only `--branch main` puts it in production.
   `--commit-dirty=true` just silences the "uncommitted changes" warning (the build is
   from your working tree, by design — `data/` is gitignored). The Pages **project name
   is `dnd-character-sheet`**. The bare `dnd-character-sheet.pages.dev` *subdomain* was taken by an unrelated project, so Cloudflare assigned the **subdomain** `https://dnd-character-sheet-e9k.pages.dev` — note the `-e9k` suffix is on the subdomain only, NOT the project name passed to `--project-name`. No `wrangler.toml` needed — the `--project-name` flag is sufficient.

3. **Set up Cloudflare Zero Trust Access**
   - Go to `https://one.dash.cloudflare.com` → Access → Applications → Add an application
   - Type: **Self-hosted**
   - Application domain: `dnd-character-sheet-e9k.pages.dev`, Path: blank (protects entire domain, including `/data/*.json`)
   - Policy: Action = Allow, rule = Emails → enter each friend's email address
   - Session duration: 24 hours or 1 week (so friends don't re-auth every visit)
   - Enable One-time PIN as an identity provider if any friend lacks Google/GitHub
   - Free tier allows up to 50 users in Zero Trust

#### Verification — do this before sharing the URL

```bash
curl -I https://dnd-character-sheet-e9k.pages.dev/data/classes.json
```

**Expected (correct):** `HTTP/2 302` redirecting to the Cloudflare Access login page.

**Wrong (misconfigured):** `HTTP/2 200` with `content-type: application/json` — the data files are unprotected. If this happens, verify the Access Application domain exactly matches the Pages URL and the policy is set to Allow only the allowlisted emails.

#### Redeployment (any future update)
```bash
npm run build
wrangler pages deploy dist/ --project-name dnd-character-sheet --branch main --commit-dirty=true
```
**Never omit `--branch main`** — without it a deploy from any feature branch goes to a
Preview URL, not the live production site (see the warning above). Confirm afterward with
`wrangler pages deployment list --project-name dnd-character-sheet` that the newest row is
`Environment: Production`.

#### Notes
- PWA `CacheFirst` strategy caches `/data/*.json` after the first authenticated visit. Subsequent loads serve from the browser cache — this is not an auth bypass, the initial fetch was gated.
- Custom domain: add a domain to Cloudflare DNS and CNAME it at the Pages deployment if a cleaner URL is wanted. Cloudflare Access works identically on custom domains.

## Reference Data Notes

- Spell slot counts in class level data are stored as **strings**, not integers. `"-"` means 0 slots.
- Warlock slot data is under `class_specific` with keys `"Spell Slots"` and `"Slot Level"`, not the standard `"1st"`–`"9th"` keys.
- A `parseClassSlots()` helper is required before any UI component renders spell slot data. Build this before Step 6.
- Copyright: SRD content is cleared for personal use. **Artificer and Blood Hunter are non-SRD** — formal copyright audit required before any public distribution.

## Data Content

Current entry counts in `data/` (as of 2026-06-12):

| Category | Count | Notes |
|---|---|---|
| backgrounds | 48 | |
| classes | 14 | 12 SRD + `artificer` + `blood-hunter` |
| feats | 105 | |
| races | 46 | One file per race; subrace variants inside each file |
| spells | 567 | class refs normalized to bare slugs; 0 unselectable (BUG-48 fixed, verified 2026-06-21) |
| subclasses | 122 | Includes Artificer + Blood Hunter subclasses |
| equipment/weapons | 198 | Simple & Martial + magic weapons; 88 entries have null `damage_dice`/`damage_type` |
| equipment/armor | 82 | 14 mundane + magic armors; `ac_formula` normalized, 0 unparseable (BUG-49 fixed 2026-06-21) |
| equipment/adventuring_gear | 99 | Packs, containers, clothing, focuses, usables |
| equipment/trinkets | 100 | PHB d100 table |
| equipment/firearms | 13 | Renaissance, Modern, Futuristic |
| equipment/explosives | 7 | Renaissance & Modern |
| equipment/wondrous_items | 592 | DMG/XGE/TCE + adventure-sourced; 9 carry `spell_focus` for render-time spell attack/DC |
| equipment/currency | 5 | cp, sp, ep, gp, pp |
| equipment/poisons | 14 | DMG poison table |
| equipment/tools | 37 | Artisan tools, gaming sets, instruments, other |
| equipment/siege_equipment | 6 | Ballista, Cannon, Mangonel, Ram, Siege Tower, Trebuchet |

All former staging files resolved 2026-06-13 (BUG-42/43/44 fixed): `_gap_*` were obsolete name-only checklists (all 217 already live → deleted), the 11 genuinely-new graded variants from `_new_wondrous_*` merged into `wondrous_items.json`, and `gear.json` deleted (only Fargab/Narycrash were unique; dropped). `data/equipment/` now holds exactly the 11 allowlist files.

Class roster: `barbarian`, `bard`, `cleric`, `druid`, `fighter`, `monk`, `paladin`, `ranger`, `rogue`, `sorcerer`, `warlock`, `wizard`, `artificer`, `blood-hunter`

**`data/` is gitignored** — these files are not version-controlled. Manual backup required when changing machines.
