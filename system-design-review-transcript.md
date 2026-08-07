The application is running at `http://127.0.0.1:5173`. Verification passed:

- 22 test files, 355 tests passed.
- Local server returned HTTP 200.
- Headless Chromium rendered “Characters” with no page errors.
- The dev server remains running.

# Character Sheet System Design Review

## Executive assessment

This is a strong small-scale, local-first architecture. It is substantially more interesting than a conventional CRUD character sheet because it combines:

- Offline browser persistence.
- Cross-device synchronization.
- Shared campaign data with role-based visibility.
- A validated static D&D reference-data pipeline.
- A domain-specific derived-state engine.
- Progressive Web App behavior.

The architecture is appropriately optimized for a private friend group rather than hypothetical internet scale. That is a good interview signal: the design responds to actual requirements instead of adding distributed-system components by habit. This follows the Interviewing.io approach of establishing requirements, data/access patterns, and scale before choosing architecture. [System design framework](https://interviewing.io/guides/system-design-interview/part-three)

My verdict is: **sound design for the stated scale, with one high-priority offline-delete durability gap and a few reasonable scaling limits.**

## 1. Requirements

### Primary users

- Players who create and manage D&D characters.
- Dungeon Masters who manage campaigns and view permitted player data.
- Campaign members who share notes, locations, NPCs, items, and companions.

### Core functional requirements

The system supports:

- Creating, editing, deleting, importing, and exporting characters.
- Tracking abilities, combat state, equipment, spells, features, conditions, and progression.
- Applying race, class, feat, and item effects.
- Operating without a network connection.
- Synchronizing a user’s characters between devices.
- Creating and joining shared campaigns.
- Enforcing DM, owner, member, and author permissions.
- Sharing selected campaign information without exposing private character or note data.
- Installing the application as a PWA.

The routes reflect these primary workflows in [App.tsx](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/App.tsx:55).

### Non-functional priorities

The design implicitly prioritizes:

1. **Local responsiveness.** Character interaction should not wait for the network.
2. **Offline availability.** A player should be able to use their sheet during a game with poor connectivity.
3. **Data durability.** Character edits are more important than immediate synchronization.
4. **Privacy.** Users should only receive campaign data they are authorized to see.
5. **Correct rule derivation.** Bonuses must not be baked into stored values and accidentally applied twice.
6. **Low operational cost.** The application targets a small friend group and Cloudflare’s inexpensive/serverless primitives.

Strong global consistency is deliberately not a universal requirement. Briefly stale character data is acceptable; losing a character or exposing hidden campaign information is not.

## 2. Data, access patterns, and scale

### Main data types

| Data | Storage | Characteristics |
|---|---|---|
| Character working state | Local SQLite via sql.js | Structured, frequently edited |
| Local persistence | IndexedDB | Complete exported SQLite database blob |
| Cloud character mirror | Cloudflare D1 | Character JSON plus ownership, timestamps, tombstone, and campaign index |
| Campaign metadata | D1 relational tables | Shared, authorization-sensitive |
| Rule catalogs | Compiled static JSON | Read-heavy and mostly immutable |
| Derived statistics | Computed in memory | Not independently persisted |
| Dice history | Zustand memory | Session-only and disposable |

The cloud schema keeps character content as a JSON document while extracting fields needed for ownership and campaign queries in [schema.sql](/C:/Users/buyp1/Workspace/dnd-character-sheet/db/schema.sql:7). That is a sensible hybrid:

- The character model can evolve without a cloud schema change for every new field.
- D1 still has indexes for owner and campaign access.
- Campaign relationships and shared resources remain relational.

### Important access patterns

The dominant paths are:

- Load all characters belonging to the current user.
- Retrieve and frequently update one active character.
- Load a campaign and its permitted roster or shared resources.
- Have the DM inspect or edit an authorized campaign character.
- Load immutable reference records by slug.
- Derive the complete effective sheet after character or catalog data changes.
- Push recently changed character fields to the cloud.
- Pull and reconcile changes made by another device or the DM.

This is overwhelmingly a small-data, read-heavy application with bursts of writes during play. An individual character may receive many UI edits, but the total user and character counts are low.

### Scale assumptions

The design is appropriate for approximately:

- Tens of active users.
- Tens or hundreds of characters per user at most.
- Small campaigns.
- Modest write frequency, coalesced by a three-second synchronization debounce.
- Reference catalogs measured in thousands rather than millions of entries.

At this scale, neither sharding nor microservices would improve the system.

## 3. High-level architecture

```text
                         Build time
Local source JSON ── validation/compiler ──▶ public reference JSON
                                                │
                                                ▼
┌──────────────────────── Browser / PWA ────────────────────────┐
│ React UI                                                     │
│      │                                                       │
│      ▼                                                       │
│ Zustand stores ──▶ deriveCharacterStats()                    │
│      │                  │                                    │
│      ▼                  └──▶ effective sheet and provenance  │
│ Local sql.js SQLite                                          │
│      │                                                       │
│      ▼                                                       │
│ IndexedDB SQLite blob                                        │
│      │                                                       │
│      └──────── push/pull and three-way reconciliation ───┐   │
└───────────────────────────────────────────────────────────│───┘
                                                            ▼
                                             Cloudflare Access
                                                            │
                                                            ▼
                                                Pages Functions
                                                            │
                                                            ▼
                                                   Cloudflare D1
```

## 4. Design strengths

### Local-first execution

The browser’s SQLite database is the working database. IndexedDB stores its serialized representation, while the cloud acts as a synchronized mirror. Database initialization and migrations complete before React renders in [db.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/storage/db.ts:33).

This gives the application:

- Immediate local reads and writes.
- Offline operation.
- A real transactional local data model.
- Independence from transient API latency.
- A natural full-database export format.

Startup allows cloud synchronization four seconds to complete, then falls back to local rendering while the pull continues in the background. This bounds network impact on first paint in [main.tsx](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/main.tsx:19).

### Derived-state architecture

The stored character contains base values and player choices. Race, feat, class, condition, and item effects are calculated by `deriveCharacterStats()` in [characterStats.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/lib/characterStats.ts:1118).

This is one of the best architectural decisions in the application:

- An effect is applied once.
- Removing an item or feat naturally removes its effects.
- Derived values cannot drift independently from their inputs.
- The modifier ledger explains where a value came from.
- Users can disable, override, or augment individual contributions.

The trade-off is that `deriveCharacterStats()` is now a major complexity hotspot. Its extensive test coverage and explicit provenance model are therefore essential.

### Defensive synchronization

Character changes are written locally first and then accumulated into field-scoped, debounced cloud patches in [sync.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/store/sync.ts:145).

The synchronization design includes:

- Three-way reconciliation using a stored synchronization base.
- Explicit user resolution when both sides changed.
- Remote tombstones.
- Validation before adopting cloud documents.
- Quarantine of structurally invalid remote data.
- Local rollback snapshots before destructive reconciliation.
- Server timestamp clamping to prevent a bad client clock from permanently winning.

The pure reconciliation decision table in [reconcile.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/store/reconcile.ts:23) makes the most dangerous branching logic independently testable.

### Security boundaries

Identity comes from a verified Cloudflare Access JWT, not a client-provided email. JWT issuer and audience are checked in [auth.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/functions/_lib/auth.ts:29).

The server also recomputes authority for every request:

- Owners control their characters.
- DMs may edit permitted character data but cannot transfer ownership or campaign membership.
- Campaign membership is checked against D1.
- Hidden-note visibility is enforced server-side.
- Roster responses expose a reduced projection rather than complete character documents.

The character update endpoint shallow-merges the patch, validates the merged result, and clamps timestamps in [characters/[id].ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/functions/api/characters/[id].ts:18).

That is materially better than trusting UI restrictions.

### Reference-data pipeline

The application does not directly ship arbitrary source JSON. The build pipeline validates reference records before generating the files consumed by the app. Validation errors stop the build before partially updated output is published in [build-data.js](/C:/Users/buyp1/Workspace/dnd-character-sheet/scripts/build-data.js:635).

This treats D&D content as a real data product rather than an untyped collection of files.

## 5. Concerns and failure modes

### 1. Offline deletes are not durable across a reload — high risk

The local character is hard-deleted first in [characters.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/store/characters.ts:73). The pending cloud deletion is then stored only in the module-level `pendingDeletes` set in [sync.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/store/sync.ts:33).

If the user deletes a character while offline and reloads or closes the application before the cloud request succeeds:

1. The local row is already gone.
2. The in-memory pending-delete set is lost.
3. The cloud still contains the character.
4. On a later pull, the remote row appears to be a new character.
5. The synchronization layer can adopt it locally again.

This conclusion is an inference from the persistence and reconciliation paths, not an observed failing test. It should nevertheless be treated as the highest-priority design correction.

The robust design is to persist local tombstones or a durable synchronization outbox in SQLite. A delete should remain locally represented until the server acknowledges it.

### 2. Every local write serializes the full database — medium risk

`flush()` exports the entire sql.js database and writes it as one IndexedDB value in [db.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/src/storage/db.ts:74).

This is simple and appropriate for a small database, but write cost grows with the total local dataset rather than the changed character. It may become visible if users accumulate many characters, backups, spells, or large custom content.

I would retain the design until measurements show a problem. The natural upgrade would be direct IndexedDB records or SQLite OPFS persistence, not a server-side database dependency for ordinary sheet interaction.

### 3. Nested concurrent edits remain last-writer-wins — medium risk

Cloud pushes operate on top-level character fields. Two users changing different top-level fields can merge successfully, but simultaneous edits inside the same nested object overwrite one another.

Examples:

- Two entries inside `skillProficiencies`.
- Two spell-slot levels inside `spellSlotsUsed`.
- Different parts of `ledgerOverrides`.

Per-property versions or an operation log would address this, but a CRDT would be excessive for the current scale. The limitation should be explicitly accepted and tested.

### 4. Cloud schema evolution is manual — medium risk

Local SQLite has an ordered, transactional migration runner. D1 uses an idempotent schema file plus manually applied exceptions.

This asymmetry creates deployment risk: application code can expect a cloud column or table that production D1 does not yet have. Introduce a versioned D1 migration directory and make migration application a release step before the application grows further.

### 5. Authentication and authorization failures share HTTP 403 — low risk

`unauthorized()` and `forbidden()` both return 403 in [auth.ts](/C:/Users/buyp1/Workspace/dnd-character-sheet/functions/_lib/auth.ts:129). The client consequently treats some genuine permission failures as expired authentication.

This fails closed and is not a data-exposure issue, but it produces misleading recovery behavior. Unauthenticated requests should return 401; authenticated-but-disallowed requests should remain 403.

### 6. Deployment is not fully reproducible from Git — medium operational risk

The reference-data source directory is local and gitignored, so a standard clean CI runner cannot reproduce the application build. Deployment depends on a particular machine having the correct unpublished dataset.

That may be acceptable for private copyrighted material, but it means:

- Git alone is not a complete disaster-recovery source.
- CI cannot independently validate production data.
- A deployment can accidentally use a locally modified dataset.

The project should at least maintain an encrypted or access-controlled backup and a recorded dataset version or manifest.

## 6. Interview-level trade-off discussion

A strong candidate should be prepared to defend these choices:

- **Why SQLite in the browser?** Rich local transactions, offline operation, migrations, and easy export are more valuable than remote-only simplicity.
- **Why D1 plus JSON documents?** Cloud queries need ownership and campaign indexes, while character fields evolve frequently and are usually read as one aggregate.
- **Why no message queue?** Synchronization volume is small, writes are direct, and browser retry behavior already supplies the necessary asynchronous boundary.
- **Why no microservices?** The system has one team, one deployment, low scale, and closely related domain operations.
- **Why compute statistics at render time?** Derived values must remain consistent with base state and explainable through provenance.
- **Why allow eventual consistency?** Sheet availability during a game matters more than immediate cross-device convergence.
- **Why use Cloudflare Access?** It removes the need to build credential storage and authentication while the backend still independently validates identity.

## 7. Recommended priorities

1. Persist deletion tombstones or a durable synchronization outbox.
2. Add an automated offline-delete/reload/reconnect test.
3. Version D1 schema migrations.
4. Separate 401 authentication failures from 403 authorization failures.
5. Add character-document payload limits and rate controls before widening access.
6. Measure IndexedDB flush time and bundle size before optimizing either.
7. Preserve the local-first monolith; do not split it into microservices at the current scale.

## Example review summary

> The candidate designed the character-sheet application as a local-first PWA rather than a conventional server-dependent CRUD application. Character edits are committed to an in-browser SQLite database and persisted to IndexedDB, providing fast interaction and offline availability during play. A Cloudflare Pages Functions and D1 tier acts as a synchronized cross-device mirror and stores online-only campaign data.
>
> The candidate made a strong distinction between stored and derived state. Character records contain base values and player choices, while race, class, feat, item, and condition effects are applied through a centralized derivation engine that emits modifier provenance. This prevents double application of effects and makes automatic bonuses explainable and editable.
>
> The cloud design uses verified Cloudflare Access identity, server-side authorization, field-scoped character patches, three-way reconciliation, remote validation, conflict prompts, rollback snapshots, and delete tombstones. These choices are well matched to the friend-group scale and avoid unnecessary queues, caches, and microservices.
>
> The main weakness is deletion durability. A locally deleted character is removed from SQLite immediately, while the pending cloud tombstone exists only in memory. An offline reload can therefore lose the deletion intent and allow the remote copy to be adopted again. The candidate should persist a local tombstone or synchronization outbox before treating offline deletion as reliable. Secondary limitations include whole-database IndexedDB flushes, last-writer-wins behavior within nested fields, and manually managed D1 schema evolution.
>
> **Recommendation: Strong hire for a senior application-engineering role.** The design demonstrates disciplined requirement-driven architecture, thoughtful offline behavior, strong domain modeling, and credible security boundaries. I would expect the candidate to identify and correct the offline-delete gap before expanding the synchronization system or increasing its user base.

## 1. “Strong global consistency is not a universal requirement”

“Strong global consistency” means that after a write succeeds, every device and every user immediately sees exactly the same value.

For example:

1. A player changes their HP from 20 to 15 on a phone.
2. At that instant, the player’s laptop and the DM’s screen must also show 15.
3. No device may temporarily show 20.

The character sheet does not guarantee that. Instead:

```text
Phone changes HP
      │
      ▼
Phone's local database immediately shows 15
      │
      ▼
Cloud synchronization happens
      │
      ▼
Other devices receive 15 on their next pull
```

For a short period, the phone may show 15 while the laptop still shows 20. That is eventual consistency: all copies should converge, but not necessarily immediately.

This is a deliberate trade-off because the player must be able to use the sheet while offline or on a poor connection. Requiring cloud confirmation for every hit-point change would make the application slower and potentially unusable without internet access.

Some parts still require strong consistency:

- A local character update uses a SQLite transaction.
- A username must be uniquely claimed in D1.
- Campaign membership and DM authority are checked against current server data.
- A player must not join the same campaign twice.
- Hidden campaign notes must never be returned to unauthorized users.

So the more precise statement is:

> Strong consistency is required for authorization, uniqueness, and important local database operations. Temporary inconsistency is accepted for cross-device character synchronization and cached reference data.

## 2. The main data types and storage choices

“Data type” in the system-design discussion means a category of application data—not a TypeScript type such as `string` or `number`.

The application has several categories because they have different lifecycles:

```text
Reference data ──────────────▶ Static JSON files
Character working data ─────▶ SQLite running in the browser
Local durable storage ──────▶ SQLite file saved inside IndexedDB
Cross-device character copy ▶ Cloudflare D1
Campaign-shared data ───────▶ Cloudflare D1
Temporary UI state ─────────▶ Zustand / browser memory
Calculated character values ▶ Derived in memory
```

### A. Reference data: static JSON

Examples include:

- Races
- Classes
- Subclasses
- Spells
- Feats
- Equipment
- Rules

The source JSON files are validated and compiled during the build. The application downloads the resulting files from `/data/*.json`.

Static JSON is appropriate because this content:

- Is read frequently.
- Changes only when a new application version is deployed.
- Does not need user-specific database queries.
- Can be cached efficiently by the PWA.
- Is naturally looked up by stable slugs such as `wizard` or `fireball`.

A character stores references such as:

```ts
{
  race: "dwarf",
  classes: [{ classSlug: "fighter", level: 5 }],
  spells: [{ slug: "fireball", prepared: true }]
}
```

It does not duplicate the full race, class, and spell descriptions. When rendering, the application loads the corresponding catalog entries.

### B. Character working data: SQLite

SQLite holds a player’s local characters, including:

- Base ability scores
- Current and maximum HP
- Classes and levels
- Equipment
- Spell selections and used slots
- Feats and choices
- Notes
- Campaign association
- Modifier-ledger overrides

SQLite provides:

- Transactions
- Tables and indexes
- Schema migrations
- Foreign keys
- Structured queries
- A portable database file for export and recovery

This is more disciplined than placing a large collection of unrelated JSON objects directly into browser key-value storage.

For example, deleting a character and its associated spell rows can be handled transactionally. If the operation fails, SQLite can roll the whole operation back instead of leaving a partially deleted character.

### C. WASM: allowing SQLite to run in the browser

Browsers cannot directly run the normal native SQLite executable. The project uses `sql.js`, which compiles SQLite into WebAssembly, or WASM.

WASM is a portable binary format that browsers can execute. In this application:

```text
SQLite C implementation
        │ compiled to
        ▼
sql-wasm.wasm
        │ loaded by
        ▼
sql.js JavaScript wrapper
        │
        ▼
SQLite database running inside the browser
```

WASM is not itself a database and does not provide persistence. It is the mechanism that lets the browser execute the SQLite engine.

The active SQLite database primarily lives in the page’s memory while the application is open. That is why IndexedDB is also needed.

### D. IndexedDB: durable browser storage

IndexedDB is the browser’s built-in persistent database facility. It is client-side, not server-side.

This application uses IndexedDB as a container for the exported SQLite database:

```text
Application changes character
        │
        ▼
SQLite database in browser memory
        │
        ▼
db.export() produces SQLite bytes
        │
        ▼
IndexedDB stores those bytes
```

When the application opens:

```text
IndexedDB returns SQLite bytes
        │
        ▼
sql.js reconstructs the SQLite database
        │
        ▼
Migrations run
        │
        ▼
React application loads the characters
```

This is a slightly unusual but coherent combination:

- SQLite provides the relational database behavior.
- WASM lets SQLite run in the browser.
- IndexedDB keeps the SQLite database after the browser tab closes.

### E. Cloudflare D1: server-side cloud storage

D1 is a separate server-side database. It is not the same SQLite instance that runs in the browser.

It stores:

- Cloud copies of characters
- Character ownership
- Synchronization timestamps
- Delete tombstones
- Campaigns and members
- Usernames
- Shared notes
- Locations
- NPCs
- Companions
- Campaign items

The local and cloud databases serve different purposes:

| Local SQLite | Cloud D1 |
|---|---|
| Immediate working copy | Cross-device shared copy |
| Works offline | Requires a network connection |
| Belongs to one browser profile | Available to authenticated users |
| Drives the local character sheet | Drives synchronization and campaigns |
| Persists through IndexedDB | Persists on Cloudflare servers |

### F. Zustand: temporary application state

Zustand is the React-facing state layer. It holds things such as:

- Characters currently loaded into the UI.
- The active character ID.
- Synchronization status.
- Conflict dialogs.
- Campaigns loaded for the signed-in user.
- Session-only dice history.

Zustand is not the durable source of truth. It makes React update efficiently after the underlying database changes.

The normal write path is:

```text
UI action
   │
   ▼
Zustand action
   │
   ▼
Local SQLite transaction
   │
   ▼
SQLite exported to IndexedDB
   │
   ▼
Zustand updates React
   │
   ▼
Cloud synchronization begins
```

### G. Derived character data

Many displayed values are calculated rather than stored:

- Effective ability scores
- Armor class
- Initiative
- Skill and saving-throw modifiers
- Maximum HP after feats and effects
- Spell attack bonus
- Spell save DC
- Resistances and proficiencies

For example:

```text
Stored base Constitution
+ racial bonus
+ feat bonus
+ item effect
+ player override
────────────────────────
Effective Constitution
```

The application performs this calculation through `deriveCharacterStats()`.

That avoids storing both “base Constitution” and “effective Constitution,” which could become inconsistent when an item or feat is removed.

## 3. Was IndexedDB introduced for cloud persistence?

No. IndexedDB is entirely client-side and is not part of the server or Cloudflare persistence.

It was needed because the WASM SQLite database would otherwise disappear when the page closed.

Without IndexedDB:

1. The application loads SQLite into browser memory.
2. The player creates a character.
3. The player closes the tab.
4. Browser memory is destroyed.
5. The character is lost.

With IndexedDB:

1. The player changes a character.
2. SQLite exports its database bytes.
3. The application saves those bytes in IndexedDB.
4. The player closes the tab.
5. On the next visit, the application reconstructs SQLite from those bytes.

Therefore, IndexedDB supports local durability and offline use. It would still be required if cloud synchronization were completely removed.

Cloud persistence was added later as another layer:

```text
                    ┌──▶ IndexedDB: durability on this device
Character change ───┤
                    └──▶ D1: cross-device and shared durability
```

This redundancy is intentional. If the cloud is unavailable, the IndexedDB copy still works. If a device is lost, the D1 copy may allow characters to be recovered on another device.

One current limitation is that every flush exports and stores the entire SQLite database. That is simple and safe for a small character collection, but could become costly if the database grew very large.

## 4. Read-heavy constraints and potential problems

“Read-heavy” means the application performs significantly more reads than writes.

A typical game session may involve:

- Reading ability modifiers repeatedly.
- Reading equipment descriptions.
- Looking up spells.
- Rendering skill and save values.
- Opening character details.
- Viewing campaign notes and roster information.
- Reading a feed of synchronization updates.

Writes occur less frequently:

- HP changes.
- Spell slot usage.
- Equipment additions.
- Level progression.
- Notes and campaign edits.

Read-heavy does not automatically mean the system has a problem. It tells us which operations must stay inexpensive.

### Problem 1: Large reference-data downloads

The application has hundreds of spells and more than a thousand equipment entries. Loading all of them can increase:

- Initial download time.
- Browser memory consumption.
- JSON parsing time.
- Time before the UI becomes interactive.

The PWA cache reduces repeat-download cost, but the first visit still needs the files. Possible future improvements include loading catalogs on demand or splitting them into smaller files.

### Problem 2: Stale cached reference data

The PWA uses `StaleWhileRevalidate` for reference JSON:

1. Return the cached file immediately.
2. Fetch a newer copy in the background.
3. Use the new copy on a future request.

This improves read latency, but a user may briefly see the previous data version immediately after a deployment.

That is acceptable for ordinary description changes. It becomes dangerous if application code and data schemas change incompatibly. In that situation, the cache version must be changed so old data is not used with new code.

### Problem 3: Repeated derived-stat computation

Reading a character is not simply reading a row. The application must combine:

- Character state
- Race data
- Every class record
- Feats
- Equipment
- Conditions
- Ledger overrides

If this calculation runs unnecessarily on every minor React render, it can create UI lag.

The current approach relies on memoization and stable Zustand object references so derivation generally reruns only after a meaningful character change. As the effect system grows, this remains an important performance boundary.

### Problem 4: Main-thread blocking

sql.js and much of the application execute on the browser’s main JavaScript thread. A sufficiently large query, database export, JSON parse, or derivation can delay:

- Button responses
- Animations
- Text entry
- Sheet scrolling

This is unlikely with tens of characters. It becomes relevant if local data reaches thousands of large records. A future version could move heavy work into a Web Worker.

### Problem 5: Unbounded result sets

Some server endpoints return complete collections, such as all of a user’s characters or campaign resources. That is acceptable for small friend-group data.

At larger scale, endpoints would need:

- Pagination.
- Maximum page sizes.
- Stable ordering.
- Continuation tokens.
- More targeted queries.

Otherwise, one request could produce a very large D1 query and response.

### Problem 6: Polling multiplies cloud reads

An open campaign character can periodically pull for recent changes. One user polling every ten seconds is trivial. Many simultaneous users would create continuing D1 reads even when nothing changed.

At larger scale, alternatives include:

- Slower adaptive polling.
- Polling only after recent activity.
- Conditional requests based on a version.
- Server-sent events or WebSockets.
- A “changes since version X” endpoint.

Real-time connections would be unnecessary complexity at the current scale.

### Problem 7: Database indexes become essential

Read-heavy systems depend on indexes because frequently scanning entire tables becomes expensive.

The cloud schema already indexes important paths such as:

- Characters by owner.
- Characters by campaign.
- Campaign membership by email.
- Notes by campaign and subject.
- Items and companions by campaign.

The cost is that every index makes writes slightly more expensive and consumes storage. This is the standard read-versus-write trade-off: the design accepts moderately more expensive writes to keep common reads fast.

### Problem 8: Cache invalidation complexity

Adding caches can improve repeated reads, but every cache creates another potentially stale copy.

This application already has several representations:

```text
D1 cloud row
Local SQLite row
IndexedDB SQLite blob
Zustand character object
Derived statistics
PWA-cached reference JSON
```

Each additional cache would make correctness harder to reason about. At the current scale, local-first storage already supplies most of the performance benefit a server cache would provide.

The best current strategy is therefore:

- Cache immutable reference data.
- Index frequently queried D1 columns.
- Memoize expensive character derivation.
- Avoid adding a general server cache until measurements justify it.
