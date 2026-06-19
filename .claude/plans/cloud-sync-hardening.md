# Cloud Sync Hardening — Conflict Handling & Corruption Defense

> **Self-contained execution plan.** A fresh agent with no prior context can run this. Read
> "How to run this" first, then the Architecture primer, then execute the sessions in order.
> Paths are relative to the repo root (`dnd-character-sheet/`).

---

## How to run this (start here)

1. **Working directory** = repo root. The app is React 19 + TS + Vite, Zustand, sql.js +
   IndexedDB locally, Cloudflare Pages Functions + D1 in the cloud.
2. **`data/` and `public/data/` are gitignored but must exist on disk** for the build (the
   pipeline compiles `data/**` → `public/data/*.json`). They're present on the owner's
   machine; do not recreate them. If the data build errors on missing files, stop and ask.
3. **Branch first** — never push to `main`. `git checkout -b feat/cloud-sync-hardening`.
4. **REQUIRED before editing:** invoke the **`codebase-invariants`** skill and read its two
   reference files: `.claude/skills/codebase-invariants/references/system-map.md` and
   `.../invariants.md`. This change touches character state, the local↔cloud merge, and a
   migration — exactly what those invariants guard (esp. INV-4 round-trip, the "Cloud sync
   tier" section, and the append-only migration rule).
5. **Verify with the project's real gate:**
   - `npm run build` — runs the data pipeline, then `tsc -b`, then `vite build`.
   - `npm run typecheck:functions` — typechecks `functions/` (a separate tsconfig the app
     build does NOT cover).
   - **Gotcha:** do NOT use `npx tsc --noEmit` to validate — the root `tsconfig.json` has
     `"files": []` + project references, so `tsc --noEmit` silently checks **nothing** and
     exits 0. Use `npm run build` / `tsc -b` and `npm run typecheck:functions`.
6. Work the sessions **in order** (1 → 2 → optional 3). Each has a Definition of Done.

---

## Context (why)

The app is **local-first with a cloud mirror**: the local sql.js/IndexedDB DB is the working
store; D1 is a synced copy. Two real gaps in the merge:

1. **A corrupt/empty cloud blob can silently overwrite good local data.** The client merge
   (`mergeRemote` in `src/store/sync.ts`) adopts any remote row with a newer `updated_at`.
   `normalizeNewCharacter` only prevents *crashes* (it defaults missing fields), so a
   structurally-parseable-but-gutted blob passes and replaces a good local character.
2. **Conflicts are whole-character last-write-wins** with no detection of *genuine*
   divergence — a player editing offline while the DM edits online can lose data silently.

**Settled design decision:** keep the **uniform local-first + cloud-mirror model** (do NOT
split campaign characters into a separate fully-cloud path — that rebuilds local-first under
another name and doubles the code paths). Add: (a) corruption defenses so a bad file can't
land in D1 or be adopted over local, and (b) a 3-way reconcile that prompts only on true
conflict.

Already protected (no work needed): **transport garbage** — `request()` in `src/lib/syncApi.ts`
only treats parseable `application/json` as a good read; truncated/non-JSON/redirect responses
classify as `offline` and never merge.

---

## Architecture primer (the files this plan touches)

**Client sync** — `src/store/sync.ts`
- `mergeRemote(remote: SyncedCharacter[])` — current whole-character LWW: for each remote
  row, if no local → adopt (unless tombstone); if remote `updatedAt` newer → adopt/delete; if
  local newer → push. Then local-only rows are pushed. If anything changed: `flush()` +
  `useCharacterStore.getState().load()`. **H5 rewrites this.**
- `runInitialSync()` — boot path: `getMe` → `pullCharacters` → `mergeRemote`. Awaited
  (blocking, with a 4 s timeout) in `src/main.tsx` so open/refresh is cloud-authoritative.
- `pullLatest()` — quiet live-refresh used by an open campaign sheet's poll: `pullCharacters`
  → `mergeRemote`. (Added recently; `src/pages/CharacterPage.tsx` polls it every ~10 s while a
  campaign character is visible.)
- `pushOne(id)` — sends `{id, createdAt, updatedAt, patch}`; `patch` = accumulated changed
  fields (`pendingPatch`) or the full character. Module queues: `dirty`, `pendingPatch`.
- `fromSynced(r)` wraps `normalizeNewCharacter(r.data)`. `toData(c)` strips id/timestamps.

**Client API** — `src/lib/syncApi.ts`
- `request<T>(input, init)` — same-origin fetch; classifies into `{ok:true,data}` /
  `{ok:false, reason:'auth-expired'|'offline'}`. Only parseable `application/json` is a good
  read. `redirect:'manual'` detects an expired Access session.
- `pullCharacters()` → `SyncedCharacter[]` — **full blobs** (the server already merged), not
  patches. `pushCharacter({id, createdAt, updatedAt, patch})` → `PUT /api/characters/:id`.
- `SyncedCharacter = { id, createdAt, updatedAt, deleted, data: NewCharacter }`.

**Server (Cloudflare Pages Functions)** — `functions/`
- `functions/api/characters/[id].ts` — `onRequestPut`: auth via `getEmail` + (`isOwner` or
  `isCampaignDm`); body `{createdAt?, updatedAt, patch}`; computes
  `merged = { ...JSON.parse(existing.data), ...incoming }` (or, for a new row, the patch is the
  full character); writes `data = JSON.stringify(merged)`, `updated_at = max(stored, incoming)`.
  A non-owner (DM) patch is stripped of `campaignId`. `onRequestDelete`: owner-only tombstone.
- `functions/api/characters.ts` — `onRequestGet`: returns the caller's own rows
  (`WHERE owner_email = ?`), `data: JSON.parse(r.data)` **per row** (throws the whole response
  on one bad row — **H3 fixes**).
- `functions/api/campaigns/[id]/characters.ts` — campaign characters (DM sees all members';
  player sees own); also parses per row.
- `functions/_lib/auth.ts` — `getEmail`, `isCampaignDm`, `isCampaignMember`, `json`,
  `unauthorized`, `forbidden`, `Env`. (Exports no `onRequest`, so it isn't routed.)
- `functions/tsconfig.json` — Functions have their **own** tsconfig and use **relative
  imports** (no `@/` alias). Anything shared with the client must be importable here too.

**Types / storage**
- `src/types/character.ts` — `NewCharacter`, `Character`, `defaultCharacter()`,
  `normalizeNewCharacter()` (coalesces an untrusted blob over defaults — prevents crashes, not
  data loss), and `campaignId: string | null` (a synced field).
- `src/lib/importExport.ts` — `validateCharacterPayload(c): asserts c is NewCharacter` at
  **line 20** (throws). The validator to refactor for H1.
- `src/storage/migrations.ts` — append-only `migrations` array; **latest is v12**, so the new
  migration is **v13**. Never edit/renumber existing entries; one BEGIN/COMMIT per migration.
- `src/storage/characterRepo.ts` — `listCharacters`, `upsertSyncedCharacter`, `insertCharacter`,
  `updateCharacter`, `deleteCharacter`. (Mirror new columns in `insertCharacter` AND
  `upsertSyncedCharacter` — INV-4.)
- `src/store/characters.ts` — Zustand store: `load`, `create`, `update`, `remove`,
  `storageError`.

**Key facts to keep true:** the PUT body shape and the server merge are **coupled** — change
them together. The pull returns full blobs. `normalizeNewCharacter` must run on every boundary
that builds a `Character` from cloud JSON.

---

## Reconcile model (replaces whole-character LWW)

Per character, track a **base** = the server `updated_at` this device last reconciled to
(`lastSyncedUpdatedAt`). Compare base vs local vs remote:

| Local vs base | Remote vs base | Action |
|---|---|---|
| unchanged | newer | **Validate → adopt cloud silently** (e.g. DM edit; no local work to lose) |
| newer | unchanged | **Keep local, push** (only this device changed) |
| **newer** | **newer** | **Real conflict → prompt** |
| unchanged | unchanged | already in sync |

Preserve the existing edge cases too: **no local row** → new on server → validate then adopt
(unless tombstone); **remote tombstone, newer** → delete locally; **local-only row** (server
never saw it) → push.

## Validation policy — required vs optional (the crux)

- **At the adopt-over-local decision (strict):** a missing/wrong-typed **required** field →
  **halt: do not adopt, keep local.** Defaulting-then-overwriting is the data loss we prevent.
  - Required: `name` (string), `abilities` (all 6 keys str/dex/con/int/wis/cha numeric),
    `level` (≥1), `maxHp` (≥0), `classes` (array) or legacy `class` (string), `equipment`
    (array), `spells` (array; each element has a string `slug`).
- **At render (lenient):** keep `normalizeNewCharacter`/`defaultCharacter` — a missing
  **optional/additive** field (`notes`, `flaws`, `campaignId`, `toolProficiencies`, …) is
  defaulted, so legitimately older records still load. **Keep the required set small and stable.**

Validation catches **corruption**; the conflict prompt catches **valid-but-unwanted** (a DM
legitimately lowering HP is valid — validation must not block it).

---

## Session 1 — Stop bad data at the source (server + read robustness)

Independent, server-side, highest preventive value. No client-merge change.

### H1 — Shared validator returning `{ ok, reason }`
- Add a **dependency-free** `validateCharacter(c): { ok: true } | { ok: false; reason: string }`
  that checks only the **required** fields above. Refactor `validateCharacterPayload`
  (`src/lib/importExport.ts:20`) to call it and throw on `!ok` (keep the `asserts` wrapper for
  the existing import path; fold in any import-specific checks it already has).
- **Placement (so client AND Functions can import it):** Functions use relative imports and
  their own tsconfig (no `@/`). Recommended: a top-level `shared/characterValidation.ts`, added
  to the `include` of both `tsconfig.app.json` and `functions/tsconfig.json`, imported by
  **relative path** from both sides. **Verify** it passes `npm run typecheck:functions` and that
  wrangler bundles it (sketch shape below).
```ts
// shared/characterValidation.ts — no browser/node-only imports
const REQUIRED_ABILITIES = ['str','dex','con','int','wis','cha'] as const
export function validateCharacter(c: unknown): { ok: true } | { ok: false; reason: string } {
  if (!c || typeof c !== 'object') return { ok: false, reason: 'not an object' }
  const o = c as Record<string, unknown>
  if (typeof o.name !== 'string') return { ok: false, reason: 'name missing/not string' }
  if (typeof o.level !== 'number' || o.level < 1) return { ok: false, reason: 'level missing/<1' }
  const ab = o.abilities as Record<string, unknown> | undefined
  if (!ab || typeof ab !== 'object' || REQUIRED_ABILITIES.some(k => typeof ab[k] !== 'number'))
    return { ok: false, reason: 'abilities missing a numeric score' }
  if (!Array.isArray(o.classes) && typeof o.class !== 'string')
    return { ok: false, reason: 'no classes[] and no legacy class' }
  if (!Array.isArray(o.equipment)) return { ok: false, reason: 'equipment not an array' }
  if (Array.isArray(o.spells) && (o.spells as unknown[]).some(s => typeof (s as { slug?: unknown })?.slug !== 'string'))
    return { ok: false, reason: 'a spell entry has no string slug' }
  return { ok: true } // optional/additive fields intentionally NOT gated
}
```
**DoD:** validator unit-tested (full blob ✓; missing `abilities` ✗; spell w/o `slug` ✗; missing
`notes` ✓); import path still works; `npm run typecheck:functions` green.

### H2 — Server-side content validation on `PUT`
- In `functions/api/characters/[id].ts onRequestPut`, after building `merged` (existing row) or
  using the full patch (new row), call `validateCharacter(...)` and **return 400** if invalid —
  before the D1 write.
- **Critical:** validate the **MERGED** blob, never the incoming `patch` (patches are
  legitimately partial/field-scoped). New row → the patch is full → validate it.
**DoD:** a `PUT` with a merged result missing `abilities` → 400, nothing written; a normal
field-scoped patch still succeeds.

### H3 — Per-row defensive parse on reads
- In `functions/api/characters.ts` (GET) and `functions/api/campaigns/[id]/characters.ts`, wrap
  each `JSON.parse(r.data)` in try/catch; on failure **skip/flag that row** (optionally log the
  id / return a count) instead of throwing the whole response. Absence is never a delete
  (deletes are explicit tombstones), so a skipped corrupt row just doesn't sync until fixed.
**DoD:** with one deliberately corrupt D1 row, GET returns the other rows and sync isn't stalled.

---

## Session 2 — Safe client reconcile (base + 3-way + adopt-gate + prompt + rollback)

Depends on H1. Rewrites `mergeRemote` (the convergence point for the adopt-gate and 3-way), so
it's one session.

### H4 — `lastSyncedUpdatedAt` base (migration **v13**)
- Append a migration (`version: 13`) adding
  `last_synced_updated_at INTEGER NOT NULL DEFAULT 0` to `characters` in
  `src/storage/migrations.ts` (append only; one BEGIN/COMMIT).
- Thread it through `src/storage/characterRepo.ts` (select/insert/upsert) and set it whenever a
  remote row is adopted or a local push is acknowledged.
- **INV-4:** this is device-local sync bookkeeping — it must **NOT** be written into the synced
  `data` blob or pushed, and the edit round-trip (`characterToDraft`/import-export) must ignore
  it. Confirm it's a column only, not part of `NewCharacter`'s synced shape.
**DoD:** migration runs on a fresh DB and on an existing one; new column readable/writable;
import/export and the edit wizard round-trip unchanged (no-op diff on Edit→Save).

### H5 — Rewrite `mergeRemote` to 3-way reconcile + adopt-gate
- Replace the LWW body with the reconcile table, using `lastSyncedUpdatedAt` as base. Sketch:
```ts
const base = localChar.lastSyncedUpdatedAt ?? 0
const localChanged  = localChar.updatedAt > base
const remoteChanged = r.updatedAt > base
if (!localChanged && remoteChanged) {            // adopt cloud — but validate first
  const v = validateCharacter(r.data)
  if (!v.ok) { warnAndQuarantine(r, v.reason); continue }  // keep local, DON'T advance base
  snapshotLocal(localChar)                       // rollback safety (H7)
  upsertSyncedCharacter(db, { ...fromSynced(r), lastSyncedUpdatedAt: r.updatedAt }); mutated = true
} else if (localChanged && !remoteChanged) {
  dirty.set(localChar.id, localChar); void pushOne(localChar.id)   // base advances on push ack
} else if (localChanged && remoteChanged) {
  queueConflict(localChar, r)                    // H6 prompt
}                                                // else: in sync (base == both)
```
- Preserve the no-local-row / tombstone / local-only-push cases (validate before adopting a
  brand-new remote row too). On a **rejected** blob: keep local, **do not advance the base**
  (so a later good write re-syncs), surface a soft warning, skip only that character.
**DoD:** scripted scenarios pass (see Verification); a corrupt remote is never adopted; base
never advances on a reject.

### H6 — Conflict prompt modal
- Fires **only** in the both-changed row. Whole-character choice v1: **Keep cloud** vs
  **Keep mine**, reusing the Dialog pattern (`src/components/ui/dialog.tsx`; see `InfoPopup`/
  `DetailPopup` for examples). **Campaign-aware default:** highlight *Keep cloud* when
  `character.campaignId` is set (DM authority), *Keep mine* for solo. Resolving "Keep cloud"
  snapshots local first (H7). Hold queued conflicts in render state (e.g. the sync store) so the
  modal can show them.
**DoD:** both choices verified; prompt does NOT fire on non-conflicting reconciles.

### H7 — Local rollback snapshots
- Local-only (never synced) table `character_backups (id, character_id, data, updated_at,
  backed_up_at)` — add via the same v13 migration or a v14. Cap to last ~5 per character (prune
  on insert). Write a snapshot before any adopt-over-local / conflict-discard. Minimal restore =
  a normal local `update()` of `data` (which then re-syncs).
**DoD:** after an adopt, a prior local version is recoverable; backups are never pushed to D1.

---

## Session 3 — Field-scoped client merge (optional / defer)

### H8 — Mirror the server's field-scoped shallow merge on the client boot/poll merge, so
non-overlapping edits auto-resolve (DM changed HP, player changed spell slots → both kept) and
the H6 prompt fires only on a **same-field** collision. Bigger lift. If built, update the
"Cloud sync tier" section of `.claude/skills/codebase-invariants/references/system-map.md`
(boot-merge granularity changes from whole-document).

---

## Critical correctness callouts

- **Validate the MERGED blob, not the partial patch** (H2) — else legitimate field-scoped
  pushes get rejected.
- **Never advance the base on a rejected blob** (H5) — keeps a bad file from "winning."
- **Required-vs-optional discipline** — halt only on missing *required*; default optional, or
  you reject valid old records and break schema evolution.
- **Append-only migration v13** — never edit/renumber existing migrations; one BEGIN/COMMIT.
- **`lastSyncedUpdatedAt` and backups are device-local** — never in the synced `data` blob,
  never pushed (INV-4 + sync coupling).
- **Keep push/merge shapes coupled** — H2/H8 must keep `syncApi.pushCharacter` ↔ the Function's
  PUT in agreement.

## Verification

- **Session 1:** unit-test `validateCharacter`; `PUT` a malformed merged blob → 400, nothing
  written; seed a corrupt D1 row → GET returns the rest. `npm run build` +
  `npm run typecheck:functions`.
- **Session 2:** scripted 3-way scenarios — (a) DM edits, player idle → silent adopt;
  (b) player edits offline, DM idle → local pushed, no prompt; (c) both edit → prompt, both
  choices; (d) corrupt remote (drop `abilities`) → NOT adopted, local kept, warning, base not
  advanced, backup written, restore returns prior local.
- Run `npm run build` after each session (data pipeline + `tsc -b` + vite). Local manual check
  in two browser profiles for the campaign DM↔player flow.

## Scope notes

- Sessions 1–2 are the core that eliminates silent data loss; ship together-ish (1 enables 2).
- Session 3 (field-scoped merge) and the H7 restore UI are the trimmable parts — the adopt-gate
  + base + prompt already prevent silent data loss without them.
- Builds directly on the `mergeRemote`/`pullLatest`/`runInitialSync`-blocking work from the
  prior session.
- Logged in `BACKLOG.md` under "Cloud Sync Hardening" (items H1–H8).
