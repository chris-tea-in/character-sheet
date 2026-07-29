---
name: dnd-data-verification
description: Use this skill when verifying D&D 5e reference data JSON files against official sources (wiki, rulebooks). Activates a structured content-accuracy review checklist for subclass, spell, and equipment entries. Trigger when sourcing new data, auditing existing JSON files, or investigating reported discrepancies between app behavior and rules.
metadata:
  type: internal
---

# D&D Data Verification

This skill defines a content-accuracy review layer for the project's `data/` JSON files. The build-data.js validator only checks schema shape — it cannot catch semantic errors like wrong feature names, missing spells, or incorrect source restrictions.

## When to Activate

- Adding new subclass, race, class, or spell JSON files
- Auditing existing entries after a bug report
- Cross-referencing any field against the wiki or rulebook

## Primary Reference

Use [dnd5e.wikidot.com](https://dnd5e.wikidot.com) as the verification source. It consolidates PHB, XGTE, TCE, and other official sources. Where the wiki and a rulebook differ, prefer the most-permissive official source (often relevant for Tasha's subclass spell lists).

## Subclass Verification Checklist

Run this checklist for each subclass file being added or audited.

### Feature Names
- [ ] Every feature name matches the wiki exactly (not paraphrased, not book-only variant)
- [ ] If the wiki and book differ, use the wiki name and add a `_review` note with both variants

### Spell Lists (Tasha's / expanded spell list subclasses)
- [ ] All spells at each tier are present — compare count against the wiki table
- [ ] Spell names are spelled correctly (e.g. "Rary's Telepathic Bond", not "rarys telepathic bond")
- [ ] Cantrips (if any) are included at the correct tier

### Replacement Spell Source Restrictions
- [ ] The `source_classes` field for replacement spells matches the most-permissive official ruling
- [ ] For Tasha's subclasses (Aberrant Mind, Clockwork Soul, etc.), source is typically `["sorcerer", "warlock", "wizard"]` — not sorcerer-only
- [ ] Cross-check this against the wiki's "Replacement Spells" section specifically

### Class-Specific Fields
- [ ] `classSlug` and `subclassSlug` fields match the filename slug exactly
- [ ] The `key` field uses `classSlug:subclassSlug` format

### _review Convention
Add a `_review` array to any entry where the wiki and book disagree, or where a field could not be verified:

```json
"_review": [
  "Feature name differs: book says 'Otherworldly Wings', wiki says 'Angelic Form' — using wiki"
]
```

`_review` arrays produce warnings at build time but do not block the build.

## Spell File Verification

- [ ] School of magic matches the official source
- [ ] Casting time, range, components, duration are all present
- [ ] Concentration flag is set correctly
- [ ] Ritual flag is set if applicable
- [ ] Classes list includes all official classes that have access (including Tasha's expansions)

## Why Content Validation Is Separate From Schema Validation

build-data.js validates that files match the expected shape (required fields present, correct types). It cannot validate that field values are correct — e.g., that a feature is named correctly or that a spell list is complete. These are two orthogonal error classes:

- **Schema errors** → caught automatically at build time
- **Content errors** → only caught by human cross-reference against the source material

Always run both layers when adding new data.
