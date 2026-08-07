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
PUBLIC_BUILD_MODE=1 npm run dev
```

Useful checks:

```bash
npm run test
PUBLIC_BUILD_MODE=1 npm run build
npm run typecheck:functions
```

The reference-data source and generated catalog files are intentionally not included in this public repository. `PUBLIC_BUILD_MODE=1` creates a minimal empty catalog for contributor checks; it does not include game content. See [development notes](docs/DEVELOPMENT.md) and [data and licensing](docs/DATA_AND_LICENSING.md).

## Privacy and data

Character data is stored locally in the browser by default. Browser storage can be cleared by the browser or device owner, so exported character files and database backups are the portable backup mechanism; they may include private notes and should be handled accordingly.

When cloud sync is configured, it is an authenticated, optional mirror of the local character store for campaign use. Secrets are not stored in the repository. See the sanitized [cloud-sync guide](docs/CLOUD_SYNC.md).

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the system design, persistence model, synchronization boundary, and tradeoffs.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change and [SECURITY.md](SECURITY.md) to report vulnerabilities privately.
