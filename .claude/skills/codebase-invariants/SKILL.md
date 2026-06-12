---
name: codebase-invariants
description: Use this skill before bug hunting or before implementing any change that touches character state, multiclass logic, feat/race/item effects, spellcasting, the edit wizard, or the data pipeline in this project. Encodes the system map, the invariant catalog distilled from bugs.md root-cause families, and the tracing protocol for single-pass implementation. Trigger when editing Character fields, deriveCharacterStats, characterSetup, LevelUpDialog, sheet blocks, characterRepo, or build-data.js — or when asked to find bugs.
---

# Codebase Invariants — Bug Hunting & Single-Pass Implementation

Internal project skill. The 2026-06-11 audit (bugs.md) found 52 bugs that collapse
into a handful of architectural failure families. This skill ships the distilled
system model and invariants so any session can find family members mechanically
and implement changes without missing consumers.

Read both reference files BEFORE opening target source files:

- [references/system-map.md](references/system-map.md) — character-state dataflow, stored-vs-derived ledger, known dualities
- [references/invariants.md](references/invariants.md) — invariant catalog with member bugs and grep recipes

## Implementation Protocol (single-pass changes)

1. **Load the system map.** Locate the change on the dataflow: is it a write site,
   a derive site, or a render site? A change in the wrong tier is the root of the
   double-application and silently-ignored-data families.

2. **Pre-edit trace.** For every `Character` field the change reads or writes,
   enumerate before editing:
   - **Writers** — `grep` the field name across `src/` (wizard, LevelUpDialog, sheet blocks, repo)
   - **Readers** — every consumer, including display-only ones
   - **Derivers** — does `deriveCharacterStats` already touch it?
   - **Persistence** — new field or shape change ⇒ migration in `src/storage/migrations.ts`
     (append-only) and round-trip support in `characterToDraft`/edit merge + import/export.

   Write the result down (a small table in your working notes). Only then edit.
   The predictable failure is not wrong code — it's correct code that misses two
   of five consumers.

3. **Invariant check.** Walk [references/invariants.md](references/invariants.md);
   run the grep recipe for every invariant the change could touch. If the change
   *requires* violating one (e.g. a deliberate write-time value), update the
   invariant file in the same PR — never silently violate.

4. **Whole-delta audit.** When one field of a shared structure (e.g. `FeatStatDelta`)
   is found mishandled, audit every sibling field of that structure — they usually
   share the fate (this is how the feat-ASI double-count was found from a
   speed/initiative symptom).

5. **Duplication sweep.** Check the duplication map in invariants.md. If the logic
   you're fixing exists in a second location, fix both or extract a shared helper.

## Bug-Hunting Protocol

1. Load both reference files, then read the target slice **whole** (the full
   vertical: write site → storage → derive → render), not file-by-file in isolation.
2. For each invariant, run its grep recipe over the slice and inspect hits.
3. **Concrete-example requirement:** a finding is only reportable with a worked
   scenario ("Fighter 3 / Wizard 2 → loop sees Rogue levels 1 and 6 → cap 4,
   should be 2"). Simulating the path is the false-positive filter — bugs.md
   discarded three auditor false-positives this way. No scenario, no report.
4. Check the RAW assertions section of invariants.md against any game-mechanics code.
5. **Pre-flight verification:** before reporting, re-open each cited file and confirm
   the quoted code exists at the cited lines in the current working tree.
6. Report in the bugs.md entry format: severity (🔴 wrong outcome/data corruption,
   🟡 incorrect behavior in specific scenarios, 🟢 polish), `**Files:**` with
   `path:line`, description with code excerpt + concrete example, `**Fix:**` proposal.
   Append to bugs.md; never renumber existing entries.
7. For a full-codebase hunt, fan out one Explore subagent per slice, each primed
   with both reference files and the report format. Many full reads of small
   slices beat one skim of everything.

## Maintenance

- When a fix session closes a bug family, append the invariant it establishes to
  references/invariants.md (statement, member bugs, grep recipe) and flip member
  statuses.
- When the dataflow changes (new tier, new source of truth), update system-map.md
  in the same PR.
- Keep both files lean: an invariant that can't be checked mechanically (grep,
  scenario, or assertion) is a blog post, not an invariant.
