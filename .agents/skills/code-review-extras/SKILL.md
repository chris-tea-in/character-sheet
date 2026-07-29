---
name: code-review-extras
description: Additional review angles that complement the built-in /code-review skill. Use when reviewing PRs that touch multi-class/multi-level calculations (cross-file tracer angle) or that replace existing code with new implementations (removed-behavior auditor angle). Trigger alongside /code-review when the diff replaces or substantially rewrites existing logic.
metadata:
  type: internal
---

# Code Review Extras

This skill extends `/code-review` with two additional review angles discovered during real PR reviews on this project. Load it alongside `/code-review` when either trigger applies.

---

## Angle 1: Cross-File Tracer

**When to apply:** Any diff that changes a function's signature, parameter semantics, or return value. The review isn't complete until every call site has been traced.

### The Problem

A function is fixed at its definition, but all callers continue passing the old type/unit/shape. TypeScript catches type mismatches but not semantic mismatches — e.g., passing `character.level` (total across all classes) where the function expects a class-specific level. The bug compiles cleanly and only manifests at runtime with a multiclass character.

### Review Steps

1. For each changed function, grep for all call sites across the codebase (not just the file being reviewed)
2. At each call site, verify that the arguments match the function's **semantic** contract, not just its TypeScript types
3. Pay special attention to "level" parameters — this codebase has two level concepts:

   | Concept | Source | When to use |
   |---|---|---|
   | Total character level | `character.level` | Proficiency bonus, XP thresholds |
   | Class-specific level | `character.classes.find(c => c.classSlug === slug)?.level` | Spell slot tables, spells known, class features |

4. Flag any call site passing the wrong level concept as a medium-severity bug

### Known Historical Instance

`LevelUpDialog.tsx` passed `character.level` (total) to `getSpellsKnownIncrease()` which expected class-specific level. For a multiclass character, `oldSpellsKnown` came back inflated, making the delta zero or negative and blocking the spell picker. Fixed by passing the class-specific level from `character.classes`.

---

## Angle 2: Removed-Behavior Auditor

**When to apply:** Any diff that deletes or replaces existing code — particularly when old functions are swapped for new ones, or when files are substantially rewritten.

### The Problem

New code that replaces old code often loses implicit invariants the old code enforced incidentally. A forward-reading reviewer sees what was added and tends to evaluate it in isolation. The deleted lines are easy to skip. But each deleted line may have enforced a constraint that the new code doesn't re-establish.

### Review Steps

1. For every deleted line or deleted block, explicitly ask: **"What invariant did this enforce?"**
2. Search the new code for where that invariant is re-established
3. If it isn't re-established, flag it as a gap

### Checklist for Import/Export Code (Known High-Risk Area)

The import/export feature ([src/lib/importExport.ts](src/lib/importExport.ts), [src/storage/db.ts](src/storage/db.ts)) was the first time this pattern was applied. Known invariant gaps to verify remain closed:

- [ ] `replaceDb()` closes the old `_db` instance before replacing it (not just GC-reliant)
- [ ] `validateCharacterPayload` enforces game-valid ability score range (1–30), not just presence
- [ ] Import version check handles future versions gracefully (warn or downgrade path, not hard throw)
- [ ] `handleCharacterImported` patches the store with the returned `Character` rather than doing a full DB re-read
- [ ] `triggerDownload` revokes the blob URL with a delay (e.g. `setTimeout`) not synchronously after `.click()`
- [ ] DB import validates SQLite magic bytes before passing the blob to sql.js

### General Removed-Behavior Audit Format

When reporting gaps, use this format:

> **Removed:** `[the deleted code or behavior]`
> **Invariant it enforced:** `[what constraint it upheld]`
> **Re-established?:** No — `[where you looked and what you found]`
> **Severity:** Low / Medium / High

This format makes gaps easy to action and easy to verify once fixed.
