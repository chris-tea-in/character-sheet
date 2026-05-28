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

- **Never push directly to `main`.** All work happens on a feature branch.
- Create a new branch for every step or discrete piece of work: `git checkout -b step/3-tailwind-shadcn` (or `fix/`, `feat/`, etc.).
- Open a PR to merge into `main` when the work is complete and tested.

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
  races/               # 9 .json files
  spells/              # 567 .json files
  subclasses/          # 122 .json files (keyed classSlug:subclassSlug)
  equipment/           # Three files: weapons.json, armor.json, gear.json (arrays)
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
    DetailBody.tsx      # Shared detail content renderer (used by DetailPopup)
    DetailPopup.tsx     # Dialog wrapper — view mode + selection mode
    SelectionList.tsx   # Searchable/sortable list with popup; used across all screens
    setup/
      SetupScreen1.tsx  # Identity & stats (name, level, race, class, subclass, HP, ability scores, ASI)
      SetupScreen2.tsx  # Background & details (alignment, personality, backstory, appearance)
      SetupScreen3.tsx  # Proficiencies (languages, skills, tools, armor/weapon display)
      SetupScreen4.tsx  # Starting equipment
      SetupScreen5.tsx  # Progression system (XP vs Milestone)
    ui/                 # shadcn/ui primitives (badge, button, dialog, …)
  lib/
    characterSetup.ts   # Setup wizard state, HP calculation, point buy logic
    data.ts             # Typed data-loading helpers (classes, races, spells, etc.)
    dice.ts             # rollDie(), abilityModifier(), proficiencyBonus(), SKILL_ABILITY_MAP
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
- Equipment is an exception: `weapons.json`, `armor.json`, `gear.json` are top-level arrays; they merge into a single `equipment.json` output keyed by type.
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
- `skillProficiencies` — `Partial<Record<SkillName, 'proficient' | 'expertise'>>`
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

## CSS Variables

Defined in [src/styles/globals.css](src/styles/globals.css):

```
--color-bg          #1a1a2e   dark navy background
--color-surface     #16213e   card/panel background
--color-surface-2   #0f3460   elevated surface
--color-accent      #e94560   red — CTAs, danger
--color-accent-2    #c4a35a   gold — warnings, highlights
--color-text        #eaeaea   primary text
--color-text-muted  #9a9ab0   secondary text
--color-border      #2a2a4a   borders
--radius            6px
--font-body         system-ui, -apple-system, sans-serif
```

## Implementation Status

| # | Step | Status |
|---|---|---|
| 1 | Storage layer: sql.js + IndexedDB + migration runner | Done |
| 2 | Character data model + Zustand stores | Done |
| 2a | Dice engine: types, utility lib, session store | Done |
| 3 | shadcn/ui + Tailwind CSS setup | Done |
| 4 | Universal Detail Popup component (view + selection modes) | Done |
| 5 | Character list page | Done |
| 6 | Assisted character creation wizard (5 screens) | Done |
| 7 | Manual character creation form | **Next** |
| 8 | Character sheet view | Pending |
| 9 | Export / import (full DB + single-character JSON) | Pending |
| 10 | @media print CSS layer | Pending |

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

### Step 10 — Print CSS
Radix UI Dialog and Popover render in `position: fixed` DOM portals at `<body>` level. Add `@media print { display: none !important }` targeting dialog overlay, dialog content, and popover content elements — they will not hide automatically.

## Reference Data Notes

- Spell slot counts in class level data are stored as **strings**, not integers. `"-"` means 0 slots.
- Warlock slot data is under `class_specific` with keys `"Spell Slots"` and `"Slot Level"`, not the standard `"1st"`–`"9th"` keys.
- A `parseClassSlots()` helper is required before any UI component renders spell slot data. Build this before Step 6.
- Copyright: SRD content is cleared for personal use. **Artificer and Blood Hunter are non-SRD** — formal copyright audit required before any public distribution.

## Data Content

Current entry counts in `data/` (as of 2026-05-27):

| Category | Count | Notes |
|---|---|---|
| backgrounds | 48 | |
| classes | 14 | 12 SRD + `artificer` + `blood-hunter` |
| feats | 105 | |
| races | 9 | |
| spells | 567 | |
| subclasses | 122 | Includes Artificer + Blood Hunter subclasses |

Class roster: `barbarian`, `bard`, `cleric`, `druid`, `fighter`, `monk`, `paladin`, `ranger`, `rogue`, `sorcerer`, `warlock`, `wizard`, `artificer`, `blood-hunter`

**`data/` is gitignored** — these files are not version-controlled. Manual backup required when changing machines.
