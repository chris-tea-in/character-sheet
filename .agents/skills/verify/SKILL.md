---
name: verify
description: Runtime-verify UI changes in this app by driving headless Chromium (Playwright is a devDependency) against the Vite dev server. Use when verifying sheet/equipment/dialog behavior end-to-end.
---

# Verifying this app at runtime

## Handle

- `npm run dev` (background) → http://localhost:5173 — up in ~2s. Data build runs first; if it
  fails, check that you're on a branch whose `scripts/build-data.js` matches the local `data/`
  format (the gitignored `data/` dir moves ahead of `main` — branch from the newest data-touching
  branch when the build rejects effect types).
- Playwright ≥1.61 is in `node_modules` with Chromium installed. From a script OUTSIDE the repo,
  import it by absolute URL: `import { chromium } from 'file:///C:/Users/buyp1/Workspace/dnd-character-sheet/node_modules/playwright/index.mjs'`.
- Fresh headless profile = empty IndexedDB every run (clean DB, idempotent reruns) and the
  first-run **"What's New" modal blocks everything** — dismiss `Got it` before anything else.

## Seeding a character (fastest path)

Don't drive the 5-screen wizard. Craft a character JSON and import it through the real UI:

1. File shape: `{ "version": 2, "type": "dnd-character", "character": { ...NewCharacter } }`.
   Copy the full field set from `defaultCharacter()` in `src/types/character.ts` (validation in
   `shared/characterValidation.ts` is lenient but `insertCharacter` binds every column — include
   all fields). A `Bag of Holding` equipment item + a sibling with `containerId` seeds container flows.
2. List page → `Data` button → `input[type="file"][accept=".json"]` → `setInputFiles`.
3. Click the character name to open the sheet.

## Selector gotchas (learned the hard way)

- **Steppers**: value is `span.tabular-nums`; scope to the owning row — the bag dialog's coin
  pouch and the always-visible EffectBuilder amount input (Custom Effects block, bottom of sheet)
  poison global `input[type="number"]` / `tabular-nums` queries.
- **Custom Item dialog** has TWO exact-name `Add` buttons (EffectBuilder's + the footer submit) —
  use `.last()`.
- The Items-section `Custom` button: `getByRole('button', { name: 'Add Item', exact: true })
  .locator('xpath=following-sibling::button[normalize-space()="Custom"]')` — bare `Custom`
  matches other blocks (Feats, Tools).
- **Saves land async** (store → sql.js → IndexedDB): after committing an edit, poll for the
  expected text instead of reading the DOM immediately.
- **`.last()` is document order, not depth** — a `div` filter chain can land on an unrelated
  later container. Prefer unique handles: StatBreakdown pencils have
  `title="What's affecting <Stat>?"` (getByTitle); skill rows = innermost div holding the
  skill name + its Roll button. Sheet labels are CSS-uppercased — match case-insensitively.
- Banners: "Storage is not persistent" is normal in headless; `/api/*` calls fail silently in
  plain `npm run dev` (no wrangler) — harmless for local-feature verification.

## Prior art

Working drivers and seed characters live in this skill's `drivers/` directory:
- `verify-a.mjs` — import-seed, paragraph rendering, container dialog, typeable steppers,
  picker Back buttons, custom-item create→edit→rename, probes (clamping, garbage input,
  level-stepper regression guard).
- `verify-b.mjs` — derivation checks: skill-row modifiers, StatBreakdown provenance via the
  pencil `getByTitle`, roll-modal itemization, initiative tiles, per-class seed characters.
- `verify-c.mjs` — class-abilities section (inside the Spellcasting section): row scoping via
  the `div.rounded-lg` box → `div.py-2` rows, pips counted by `button[title^="Use a"]`, pool
  stepper spend/type/Reset, cost-button drain, reload-persistence probe, slot-count invariance.
- `verify-dummy/bard/champion/paladin/multi/barbarian/monk.json` — importable seed characters
  (full NewCharacter shape; multi = bard 5 / paladin 3 for owning-level sizing checks).
Update the seed paths inside a copied driver (`SCRATCH` const) to your own scratchpad or to
this drivers/ dir before running.
