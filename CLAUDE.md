# D&D 5e Character Sheet — Working Document

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript + Vite 6 |
| Routing | React Router v7 (`react-router-dom`) |
| State | Zustand 5 |
| Storage | sql.js (SQLite in WASM) + IndexedDB blob |
| UI | shadcn/ui + Tailwind CSS (Step 3 — not yet installed) |
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
data/                  # Source data (raw, one JSON file per entry)
  backgrounds/         # One .json per background slug
  classes/             # One .json per class slug
  feats/               # One .json per feat slug
  races/               # One .json per race slug
  spells/              # One .json per spell slug
  subclasses/          # One .json per subclass (keyed classSlug:subclassSlug)
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
src/
  lib/uuid.ts          # generateId() — UUID v4 using crypto.getRandomValues
  pages/
    CharacterListPage.tsx
  storage/
    db.ts              # initDb(), flush(), getDb() — sql.js lifecycle
    idb.ts             # loadFromIdb(), saveToIdb() — IndexedDB blob persistence
    migrations.ts      # Migration runner + schema definitions
    characterRepo.ts   # SQL CRUD: listCharacters, getCharacter, insertCharacter, updateCharacter, deleteCharacter
    index.ts           # Re-exports from db.ts
  store/
    characters.ts      # Zustand store: useCharacterStore
  styles/
    globals.css        # CSS variables + body reset (see Pre-condition below)
  types/
    character.ts       # Character, NewCharacter, Abilities, etc.
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
| 3 | shadcn/ui + Tailwind CSS setup | **Next** |
| 4 | Universal Detail Popup component (view + selection modes) | Pending |
| 5 | Character list page | Pending |
| 6 | Assisted character creation wizard (5 screens) | Pending |
| 7 | Manual character creation form | Pending |
| 8 | Character sheet view | Pending |
| 9 | Export / import (full DB + single-character JSON) | Pending |
| 10 | @media print CSS layer | Pending |

## Pre-conditions & Hazards

### Step 3 — Tailwind + shadcn/ui
Delete the `*, *::before, *::after { box-sizing; margin; padding }` reset block from `globals.css` **before** installing Tailwind. Tailwind's preflight covers this reset; shadcn/ui depends on preflight being active. The CSS variables, body background, font, and `min-height` lines stay.

### Step 6 — Spell selection
Before touching spell selection UI, write a `SpellcastingProfile` typed parsing layer. Warlock `class_specific` uses different keys (`"Spell Slots"` + `"Slot Level"`) vs all other casters (`"1st"`–`"9th"` slot counts). Five distinct formats exist across 12 classes — detection is purely key-based:

| Format | Classes |
|---|---|
| No spell slots | Barbarian, Fighter, Monk, Rogue |
| Full caster (prepared) | Cleric, Druid, Wizard |
| Full caster (known) | Bard, Sorcerer |
| Half caster (prepared) | Paladin |
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
- Copyright: all content in `public/data/` is SRD-licensed. Personal use only until a formal copyright audit is done.
