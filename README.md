# An offline-first dnd 5e character sheet, with optional cloud sync for a group that shares a campaign that prioritizes the character creation process.

A browser-based D&D 5e character sheet for guided character creation, play at the table, and campaign collaboration. It keeps a full working copy on the device so the sheet remains useful without a connection; cloud sync is an optional layer for groups sharing a campaign.

## What it does

- Guides players through character creation and level progression.
- Tracks abilities, combat, equipment, spells, feats, proficiencies, notes, and dice rolls.
- Derives character statistics from base choices, class features, race, feats, and equipment at render time.
- Supports import/export for portable character backups.
- Provides optional authenticated campaign sync, including shared campaign records.

## Tech stack

- **Frontend:** React 19, TypeScript, and Vite
- **Routing and state:** React Router and Zustand
- **UI:** Tailwind CSS, shadcn/ui, and Lucide
- **Local persistence:** sql.js (SQLite in WebAssembly) with IndexedDB storage
- **Offline behavior:** Vite PWA and Workbox
- **Optional cloud sync:** Cloudflare Pages Functions and D1

## Run locally

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run test
npm run build
npm run typecheck:functions
```

The reference-data source and generated catalog files are intentionally not included in this public repository. Local development that runs the data build requires a separately provisioned data set.

## Privacy and data

Character data is stored locally in the browser by default. Browser storage can be cleared by the browser or device owner, so exported character files and database backups are the portable backup mechanism; they may include private notes and should be handled accordingly.

When cloud sync is configured, it is an authenticated, optional mirror of the local character store for campaign use. The repository excludes reference-data sources, credentials, and provider-specific deployment configuration.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design, persistence model, synchronization boundary, and tradeoffs.
