# Combat Resource Recovery

## Purpose

Let a player recover spent combat resources from the Combat tab. A class-only
control must recover Hexblade's Curse and other tracked class resources.

## User interface

The Combat tab places a recovery row immediately below the Spell Slots card.
The row contains three controls:

- Restore all spell slots
- Restore class resources
- Restore all tracked resources

The Spell Slots card retains its pip editing help. It no longer contains a
restore button. Each control is disabled when it cannot change the character.

## Data flow

Recovery operates only on stored usage trackers. It does not apply or remove
derived effects. A pure helper builds the smallest `NewCharacter` patch.

- Spell slots clears `spellSlotsUsed`.
- Class resources clears `featureResourcesUsed`.
- All tracked resources clears spell slots and class resources, resets each
  equipment entry's `chargesUsed` to zero, and clears both hit-dice usage
  representations (`hitDiceUsed` and `hitDiceUsedByClass`).

The Combat tab passes the helper output to `onSave` once per click. This keeps
the local persistence and cloud-sync patch atomic.

## Boundaries

Recovery does not change HP, temporary HP, death saves, conditions, currency,
equipment quantity, prepared spells, or character statistics. The feature
does not implement short-rest or long-rest rules.

## Verification

Unit tests cover class-only recovery, including a Hexblade-style class
resource, all-resource recovery, empty-state enablement, and preservation of
unrelated character data. The production build verifies type checking and the
Combat UI integration.
