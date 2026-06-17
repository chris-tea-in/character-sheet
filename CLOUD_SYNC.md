# Cloud Character Storage — Setup & Runbook

Email-linked, free, cross-device sync for characters, plus a read-only DM view.
The app stays **local-first** (sql.js + IndexedDB remain the working store); the
cloud is a synced mirror. Identity is solved by the existing **Cloudflare Access**
gate on the whole domain — the backend reads the verified email from the signed
`Cf-Access-Jwt-Assertion` header Cloudflare injects, so there is no login to build.

```
Browser (local-first SQLite)  ──same-origin fetch /api/*──▶  Cloudflare Access (already on)
   sync layer (push on edit,                                   │ injects Cf-Access-Jwt-Assertion
   pull+merge on load, LWW)                                    ▼
                                              Pages Function (functions/api/*)
                                                   verify JWT → email → D1 (characters)
```

## What's in the repo

| Path | Purpose |
|---|---|
| `db/schema.sql` | D1 tables + indexes (characters, campaigns, campaign_members) |
| `functions/_lib/auth.ts` | JWT verification (`jose`), `isCampaignDm`/`isCampaignMember`, invite-code + JSON helpers (not a route) |
| `functions/api/me.ts` | `GET /api/me` → `{ email }` |
| `functions/api/characters.ts` | `GET /api/characters` → caller's own rows (incl. tombstones) |
| `functions/api/characters/[id].ts` | `PUT` field-scoped merge (owner OR campaign-DM authority), `DELETE` soft-delete |
| `functions/api/campaigns.ts` | `GET` my campaigns, `POST` create (DM + invite code) |
| `functions/api/campaigns/join.ts` | `POST /api/campaigns/join { code }` → join as player |
| `functions/api/campaigns/[id].ts` | `DELETE` campaign (DM-only) |
| `functions/api/campaigns/[id]/characters.ts` | `GET` campaign sheets — DM sees all, a player sees only their own |
| `functions/api/campaigns/[id]/members.ts` | `GET` member roster (DM-only) |
| `functions/api/campaigns/[id]/code.ts` | `POST` rotate invite code (DM-only) |
| `functions/api/campaigns/[id]/members/[email].ts` | `DELETE` member (DM removes, or member self-leaves) |
| `wrangler.toml` | Pages config: D1 binding (`DB`) + vars (`TEAM_DOMAIN`, `POLICY_AUD`) |
| `src/lib/syncApi.ts`, `src/store/sync.ts`, `src/store/campaigns.ts` | Client sync (response classification, debounced field-scoped push, LWW boot-merge) + campaigns store |

## Prerequisites — values to collect from the Cloudflare dashboard

None are secret, but all are account-specific. Fill the placeholders in `wrangler.toml`.

| Value | Where to get it |
|---|---|
| Pages **project name** = `dnd-character-sheet` | already set as `name` in `wrangler.toml`; live URL `https://dnd-character-sheet-e9k.pages.dev` |
| `TEAM_DOMAIN` = `https://<team>.cloudflareaccess.com` | Zero Trust (`one.dash.cloudflare.com`) → Settings → team domain |
| `POLICY_AUD` = Access **Application Audience (AUD) tag** | Zero Trust → Access → Applications → this app → **Overview → Application Audience (AUD) Tag** |
| D1 `database_id` | printed by `wrangler d1 create` (below) |

> **DM access is per-campaign, not a global allowlist.** Any signed-in user can
> create a campaign (becoming its DM) and share an invite code; there is no
> `DM_EMAILS` var. The whole-domain Cloudflare Access policy still gates who can
> reach the app at all.

## One-time setup

```bash
npm install -g wrangler
wrangler login                       # browser OAuth into the Cloudflare account

# 1. Create the database, then paste the printed UUID into wrangler.toml → database_id
wrangler d1 create dnd-characters

# 2. Apply the schema to the REMOTE (production) database
wrangler d1 execute dnd-characters --remote --file db/schema.sql

# 3. Fill the [vars] placeholders in wrangler.toml (TEAM_DOMAIN, POLICY_AUD)
```

> **Re-applying the schema:** every `CREATE TABLE`/`CREATE INDEX` is
> `IF NOT EXISTS`, so re-running `db/schema.sql` is safe — **except** the single
> `ALTER TABLE characters ADD COLUMN campaign_id TEXT` (SQLite has no
> `ADD COLUMN IF NOT EXISTS`). On a database created before campaigns existed,
> run that one ALTER once; on a re-apply it errors with `duplicate column name`,
> which is harmless to ignore.

D1 binding + vars are read from `wrangler.toml`, so the dashboard needs no extra
binding config. (If you prefer the dashboard instead: Pages project → Settings →
Functions → D1 database bindings (`DB` → `dnd-characters`) and Environment variables.)

## Local testing — `wrangler pages dev` (do this before deploying)

`wrangler pages dev` serves the built `dist/` and runs `functions/` against a
**local** D1 (a SQLite file under `.wrangler/`, never your production data).

Localhost is **not** behind Access, so no JWT is present. The auth helper has a
local-only escape hatch: when there is no JWT *and* `DEV_EMAIL` is set, it uses
`DEV_EMAIL` as the identity. Put it in a **`.dev.vars`** file — gitignored, loaded
automatically by `wrangler pages dev`, and never shipped:

```bash
# .dev.vars  (LOCAL ONLY — gitignored; never commit, never set in the dashboard)
DEV_EMAIL=you@example.com
```

> **Multi-identity local testing (campaign privacy gate).** When `DEV_EMAIL` is set
> (i.e. local dev only), the auth helper also honors an `x-dev-email` request header
> that overrides the identity for that one request. This lets a single
> `wrangler pages dev` be exercised as several users without juggling servers —
> e.g. `curl -H 'x-dev-email: alice@example.com' …`. It is **production-inert**: in
> production the Access JWT is always present and `DEV_EMAIL` is never set, so the
> override is unreachable. A ready-made gate script lives in
> `scripts/campaign-gate.mjs` (run `node scripts/campaign-gate.mjs` against a
> seeded `pages dev` on :8788) and asserts the full membership/authority matrix
> below.

> **Local D1 binding gotcha:** seed with `wrangler d1 execute dnd-characters --local
> --file db/schema.sql` and start the server with a bare `wrangler pages dev dist`
> (let it read the `[[d1_databases]]` binding from `wrangler.toml`). Do **not** pass
> `--d1 DB=dnd-characters` — that keys the local store by name while `d1 execute`
> keys it by the binding's `database_id`, so the server would see an unseeded,
> table-less database.

Then:

```bash
npm run build                                              # builds dist/ (+ functions are compiled by pages dev)
wrangler d1 execute dnd-characters --local --file db/schema.sql   # seed the LOCAL db once
wrangler pages dev                                         # reads dist/ + DB binding + .dev.vars

# In another terminal, against the printed localhost URL (default :8788):
curl -s http://localhost:8788/api/me                       # → {"email":"you@example.com","isDm":true}
# create/edit a character in the browser tab, then:
wrangler d1 execute dnd-characters --local --command "SELECT id, owner_email, deleted FROM characters"
```

> Why a local bypass is safe: in production behind Access, the JWT header is
> **always** present, so the `DEV_EMAIL` branch is never reached. It only matters
> when nothing is gating localhost. Keep `DEV_EMAIL` out of `wrangler.toml` and the
> dashboard.

If `wrangler pages dev` doesn't pick up the output dir, pass it explicitly:
`wrangler pages dev dist`.

## Deploy

Because `data/` and `public/data/` are gitignored, git-connected CI can't build
this project — **always build locally, then upload `dist/` directly**:

```bash
npm run build
wrangler pages deploy            # wrangler.toml provides name + pages_build_output_dir
```

(The older form `wrangler pages deploy dist/ --project-name dnd-character-sheet`
still works; the bare command above is equivalent now that `wrangler.toml` exists.)

## Access configuration

The existing Zero Trust Access application protects the whole domain, which already
covers `/api/*` (and `/data/*.json`). No new Access app or policy is required —
same domain means the Access cookie rides along on same-origin `fetch`, and
Cloudflare passes the signed JWT to the Function. Confirm the Access application's
domain exactly matches the Pages URL and its policy allows your friend-group emails.

## Verification

1. **Auth gate (unauthenticated):**
   ```bash
   curl -i https://dnd-character-sheet-e9k.pages.dev/api/me
   ```
   Expect `302` to the Access login (or `403` if the request reaches the Function
   without a JWT) — **not** `200` with your email.
2. **Authenticated:** open `/api/me` in a signed-in browser tab → your email.
3. **D1 wiring:** create a character in the app, then
   `wrangler d1 execute dnd-characters --remote --command "SELECT count(*) FROM characters"`
   → a row with the right `owner_email`.
4. **Two-way sync:** edit in Browser A → reload Browser B (same Access email) → the
   change appears. Delete in A → it disappears in B on next load (tombstone).
5. **Privacy + campaigns (release gate):** with two identities, player A creates a
   campaign and shares the code; player B joins and adds a character. Confirm via
   `GET /api/campaigns/:id/characters` that A (the DM) sees both A's and B's
   characters, B sees only B's, and a non-member gets `403`. An unrelated email
   `PUT`-ing either character → `403`; the campaign DM `PUT`-ing B's character →
   ok, but it **cannot** change that character's `campaignId`/owner.
6. **Offline:** go offline, edit (local save still works, no blocking error), come
   back online → the queued push reconciles.

## Known limitations

- **Field-scoped merge, with caveats.** Edits push only the changed top-level
  character fields and the server shallow-merges them, so concurrent edits to
  *different* fields (e.g. a player editing HP while the DM edits notes) both
  survive. Residual last-writer-wins cases: (a) two parties editing within the
  *same* nested object at once (two skills inside `skillProficiencies`, two slot
  levels inside `spellSlotsUsed`); (b) a true same-field simultaneous edit;
  (c) edits made while fully offline, which reconcile as whole-document LWW on
  reconnect (the boot pull-merge). Acceptable for a friend group; eliminating
  them would need per-field versioning/CRDT.
- Free-tier headroom is large: the tightest limit is D1 writes (100k/day); debounced
  pushes put ~20 heavy players at ~6% of the cap.
