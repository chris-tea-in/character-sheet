---
name: feature-effect-system
description: Use this skill when adding game mechanics that apply structured bonuses or effects to a character (feats, racial traits, class features, magic items). Activates the project's effect application pattern to avoid the "data exists, application missing" failure mode. Trigger when a data file has an `effects` array, when a new feat/trait/item type is introduced, or when a character stat is unexpectedly not updating.
metadata:
  type: internal
---

# Feature Effect System

This skill documents the pattern for applying structured game-mechanic effects (feat bonuses, racial trait bonuses, class feature modifiers) to the D&D character sheet. It exists because this pattern has a recurring failure mode: the data files have structured `effects` arrays, but the application layer is missing or incomplete.

## The Core Pattern

Every feature type that can modify a character stat follows three layers:

```
Data file (data/*.json)
  └── effects[] array  →  TypeScript type includes it  →  Application layer in characterStats.ts
                                                             └── Single entry-point helper called from all UI flows
```

If any layer is missing, the effect is silently ignored.

## Feat Effects (Reference Implementation)

### Data Format

Each feat in `data/feats/*.json` has an `effects` array:

```json
{
  "effects": [
    { "type": "ability_score", "ability": "strength", "value": 1 },
    { "type": "ability_score", "ability": "constitution", "value": 1 }
  ]
}
```

Effect types currently in use: `ability_score`, `choice` (player picks which ability to boost).

### TypeScript Type

`FeatData` in [src/types/data.ts](src/types/data.ts) includes the `effects` field. Do not add a new feat mechanic without first adding it to the type.

### Application Layer

`FEAT_EFFECTS` registry and `computeFeatStatDelta()` in [src/lib/characterStats.ts](src/lib/characterStats.ts) translate `effects` entries into stat mutations.

For choice-based ASIs, the player's chosen ability is stored in `character.featChoices` (a `Record<featSlug, AbilityName>`), persisted via the `feat_choices` DB column (migration 6).

### Single Entry-Point Rule

All feat application flows call the same helper rather than inlining the logic. The three entry points are:

| Flow | Location |
|---|---|
| Sheet feat management | [src/components/sheet/FeatsBlock.tsx](src/components/sheet/FeatsBlock.tsx) |
| Level-up dialog | [src/components/sheet/LevelUpDialog.tsx](src/components/sheet/LevelUpDialog.tsx) |
| Setup wizard finalization | [src/pages/CreateCharacterPage.tsx](src/pages/CreateCharacterPage.tsx) |

All three call `computeFeatStatDelta()` / the shared helper — never inline the effect logic.

## Adding a New Effect Type

1. Add the new effect shape to the `effects` array type in `src/types/data.ts`
2. Add a handler branch in `computeFeatStatDelta()` in `src/lib/characterStats.ts`
3. If the effect requires a player choice (e.g., "pick any ability"), add the choice to `featChoices` — no new DB column needed unless the choice data is structurally different
4. Verify all 3 entry points above still work correctly

## Adding a New Feature Category (Racial Traits, Class Features, etc.)

Follow the same three-layer pattern:

1. Ensure the data file's JSON has an `effects` array (even if empty for non-mechanical entries)
2. Add the `effects` field to the TypeScript type immediately — do not defer
3. Build the application layer in `characterStats.ts` before the first UI flow that writes the feature

**Do not ship a UI that lets a player add a feature without also shipping the application layer.** A feature that exists in the DB but has no effect silently breaks the character.

## Checklist Before Closing Any Feature-Effect PR

- [ ] `effects` field present in the TypeScript type
- [ ] Application layer handles every `type` value in the data files
- [ ] All UI entry points that write the feature call the shared helper
- [ ] DB migration added if new choice/state needs persistence
- [ ] `deriveCharacterStats()` output reflects the effect correctly for a test character
