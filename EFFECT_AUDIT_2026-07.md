# Effect Audit 2026-07

Companion to [MODIFIER_SOURCE_MATRIX.md](MODIFIER_SOURCE_MATRIX.md) and [DND_RULES_REFERENCE.md](DND_RULES_REFERENCE.md).
Canonical edition: **2014 5e**. Descriptions quoted from local `data/` (wiki-verify each at fix time per `dnd-data-verification`).

- **Part 0 (this doc, 2026-07-03): Conditionality survey** — the pre-implementation dig (user directive): for every *currently-applied* effect, read the full source description and classify whether it applies flat/always or only under conditions. Establishes the case inventory the situational-effects mechanism is designed against.
- Part A (full applied-effect verification) and Part B (unmodeled-prose proposals) follow per the approved plan.

## Classification key

| Class | Meaning | Handling (per plan taxonomy) |
|---|---|---|
| `FLAT` | Unconditional while the source is active | Tier 1 — standing, auto-netted (current behavior is correct) |
| `COND` | Applies only under a roll-time condition **only the player can adjudicate** | Tier 2 — situational: `condition` text, never auto-netted, roll-time opt-in chip |
| `STATE` | Condition is **app-adjudicable from tracked state** (equipped armor, active conditions, toggles) | Tier 1b — gate in derive; no roll-time UI. Precedent already in repo: Defense fighting style gates on `hasBodyArmor` ([characterStats.ts:1603](src/lib/characterStats.ts#L1603)); Bracers of Defense gate on unarmored |
| `HYBRID` | Player-known condition + trackable suppressors | Tier 2 chip + derive-side suppression |
| `EXEMPT` | No-roll passive exemption | Tier 3 — Defenses chip via the immunity channel |
| `UNAUTHORED` | Benefit present in the description but absent from `effects[]` | Author it (with the classification above) |
| `GAP` | Not representable yet (e.g. initiative advantage) | Log only |

**Survey verdict in one line: of the 20 hardcoded advantage rows, 19 are `COND` and exactly one (Verdan) is `FLAT`.** The flattening is two-dimensional: conditions were dropped AND most "saves against X" traits were narrowed to one ability when RAW grants them on *all* saving throws against X.

---

## Table 1 — Hardcoded advantage maps (`RACE_ADVANTAGES` / `SUBRACE_ADVANTAGES` / `FEAT_ADVANTAGES`, [characterStats.ts:292-320](src/lib/characterStats.ts#L292-L320))

| Source | Trait | Encoded today | RAW (local data quote) | Class | Correct model → condition string |
|---|---|---|---|---|---|
| dwarf | Dwarven Resilience | adv CON saves | "advantage on saving throws against poison, and you have resistance against poison damage" | `COND` | **all** saves · "vs. poison" |
| duergar | Duergar Resilience | adv CON+WIS saves | "advantage on saving throws against illusions and against being charmed or paralyzed" | `COND` | **all** saves · "vs. illusions, and vs. being charmed or paralyzed" |
| duergar | Dwarven Resilience | *(folded into the CON row)* | "advantage on saving throws against poison…" | `COND` | **split into a second source**: all saves · "vs. poison" |
| elf, eladrin, sea-elf, shadar-kai, bugbear, hobgoblin, half-elf | Fey Ancestry | adv WIS saves | "advantage on saving throws against being charmed, and magic can't put you to sleep" | `COND` + `EXEMPT` | **all** saves · "vs. being charmed" **+ immunity chip `sleep (magical)`** |
| gnome, deep-gnome | Gnome Cunning | adv INT/WIS/CHA saves | "advantage on all Intelligence, Wisdom, and Charisma saving throws against magic" | `COND` | INT/WIS/CHA saves (RAW-scoped ✓) · "vs. magic" |
| githzerai | Mental Discipline | adv WIS saves | "advantage on saving throws against the charmed and frightened conditions" | `COND` | **all** saves · "vs. being charmed or frightened" |
| halfling | Brave | adv WIS saves | "advantage on saving throws against being frightened" | `COND` | **all** saves · "vs. being frightened" |
| halfling/Stout | Stout Resilience | adv CON saves | "advantage on saving throws against poison, and you have resistance to poison damage" | `COND` | **all** saves · "vs. poison" |
| locathah | Leviathan Will | adv WIS+CON saves | "advantage on saving throws against being charmed, frightened, paralyzed, poisoned, stunned, or put to sleep" | `COND` | **all** saves · "vs. being charmed, frightened, paralyzed, poisoned, stunned, or put to sleep" |
| satyr, yuan-ti | Magic Resistance | adv ALL saves | "advantage on saving throws against spells and other magical effects" | `COND` | all saves (scope ✓) · "vs. spells and other magical effects" |
| **verdan** | **Telepathic Insight** | adv WIS+CHA saves | "advantage on all Wisdom and Charisma saving throws" | **`FLAT`** | **correct as-is — the only standing racial row** |
| war-caster (feat) | War Caster | adv CON saves | PHB: adv on CON saves "to maintain concentration on a spell when you take damage" (no `effects` entry in feat data — hardcoded only) | `COND` | CON saves (scope ✓) · "to maintain concentration when you take damage" |
| actor (feat) | Actor | adv Deception+Performance | "advantage on Charisma (Deception) and Charisma (Performance) checks **when trying to pass yourself off as a different person**" | `COND` | those skills (scope ✓) · "when impersonating another person" |

## Table 2 — `data/class-feature-effects.json` (all 6 entries)

| Feature | Encoded today | RAW clause | Class | Action |
|---|---|---|---|---|
| paladin: Aura of Protection | derived_save all +CHA (min 1) | "**as long as you aren't incapacitated**" | `STATE` | suppress while `incapacitated` condition active (tracked in-app) |
| monk: Diamond Soul | save prof all | — (ki reroll = manual) | `FLAT` | none ✓ |
| monk: Purity of Body | immunity poison | "immune to **disease** and poison" | `FLAT` + `UNAUTHORED` | add `disease` immunity chip (plan Phase 3 ✓) |
| barbarian: Fast Movement | speed +10 | "**while you aren't wearing heavy armor**" | `STATE` | gate on equipped-armor category — **currently over-grants in heavy armor** |
| barbarian: Danger Sense | adv DEX saves | "against effects **you can see**… can't gain while **blinded, deafened, or incapacitated**" | `HYBRID` | condition "vs. effects you can see" + suppress on those tracked conditions |
| rogue: Slippery Mind | save prof WIS | — | `FLAT` | none ✓ |

## Table 3 — Item `advantage`/`disadvantage` effects (all authored entries, `data/equipment/`)

| Item | Effect | Class | Condition string (if COND) |
|---|---|---|---|
| Sentinel Shield (armor.json + wondrous dup) | adv Perception | `FLAT` | — (initiative-adv half = `GAP`) |
| Boots of Elvenkind | adv Stealth | `COND` | "checks that rely on moving silently" |
| Cloak of Elvenkind | adv Stealth | `COND` | "while the hood is up, to hide" (enemy-Perception dis = DM-side, OOS) |
| Cloak of the Bat | adv Stealth | `FLAT` | — (the dim-light clause governs *flying*, not Stealth) |
| Crown of the Wrath Bringer | adv Intimidation | `FLAT` | — |
| Eyes of the Eagle | adv Perception | `COND` | "checks that rely on sight" |
| Gavel of the Venn Rune | adv Persuasion | `FLAT` | — |
| Inquisitive's Goggles | adv Insight | `COND` | "to determine if a creature is lying" |
| Kagonesti Forest Shroud | adv Stealth | `COND` | "in natural environments" |
| Nature's Mantle | adv Stealth | `COND` | "in natural terrain" |
| Orb of the Stein Rune | adv STR saves | `FLAT` | — |
| Piwafwi | adv Stealth | `COND` | "while the hood is up, to hide" |
| Piwafwi of Fire Resistance | adv Stealth | `FLAT` (per local text — wiki-verify) | — |
| Platinum Scarf | adv all saves | `FLAT` (per local text — wiki-verify) | — |
| Reveler's Concertina | adv Performance | `COND` | "while playing the concertina" |
| Ring of Truth Telling | adv Insight | `COND` | "to determine whether someone is lying" |
| Robe of Eyes | adv Perception | `COND` | "checks that rely on sight" |
| Rod of Alertness | adv Perception | `FLAT` | — (initiative `GAP`; protective aura = manual) |
| Shadowfell Brand Tattoo | adv Stealth | `FLAT` | — |
| Skull Helm | adv Intimidation | `FLAT` | — |
| Watchful Helm | adv Perception | `FLAT` | — (see Table 4 for its exemptions) |

≈10 of 21 conditional. No `disadvantage` effects are authored anywhere yet (the type exists).

## Table 4 — NEW: unauthored benefits found inside applied sources' descriptions

The dig's second failure mode: `effects[]` arrays that cover only part of the description. (Part A must diff **full descriptions** against authored effects, not merely verify what is authored.)

| Source | Missing benefit | Class |
|---|---|---|
| Piwafwi | "advantage on saving throws against spells and other magical effects" | `UNAUTHORED COND` (all saves · "vs. magic") |
| Staff of the Magi | "advantage on saving throws against spells" | `UNAUTHORED COND` |
| Robe of the Archmagi | "advantage on saving throws against spells and other magical effects" | `UNAUTHORED COND` |
| Staff of Power | "+2 bonus to Armor Class, saving throws" (only spell_attack authored) | `UNAUTHORED FLAT` (ac +2, save all +2) |
| Belt of Dwarvenkind | non-dwarf bundle: adv saves vs. poison; poison resistance; adv Persuasion "to interact with dwarves"; darkvision 60; Dwarvish | `UNAUTHORED` (mixed COND/FLAT; "if you aren't a dwarf" gate is race-STATE) |
| Demon Armor (cursed) | "disadvantage on attack rolls **against demons** and on saving throws **against their abilities**" | `UNAUTHORED COND` **disadvantage** |
| Watchful Helm | "can't be surprised"; "can't be put to sleep by magical means" | `EXEMPT` chips (`surprise`, `sleep (magical)`) |
| Alert (feat) | "can't be surprised **while you are conscious**" | `EXEMPT` chip + STATE clause |
| Infernal Constitution (feat) | "advantage on saving throws against being poisoned" | `UNAUTHORED COND` (all saves · "vs. being poisoned") |
| Matalotok | "grants cold immunity" | `UNAUTHORED FLAT` immunity |
| Windvane | "lightning resistance" | `UNAUTHORED FLAT` resistance |
| Akmon, Hammer of Purphoros | fire resistance; exhaustion immunity; smith's-tools prof (+adv on related checks) | `UNAUTHORED` (mixed) |

## Table 5 — Unapplied conditional traits surfaced incidentally (Part-B seeds, adv/dis only)

| Source | Trait | Class |
|---|---|---|
| elf/Dark Elf, duergar, kobold | **Sunlight Sensitivity** — disadvantage on attack rolls and sight-based Perception "in direct sunlight" | `COND` **disadvantage** (attack + skill) — the flagship conditional-dis family |
| deep-gnome | Stone Camouflage — adv Stealth "to hide in rocky terrain" | `COND` |
| kobold | Pack Tactics — adv on attack rolls when an ally is within 5 ft of the target | `COND` **attack-target** (needs the deferred attack extension) |
| firbolg | Speech of Beast and Leaf — adv on CHA checks to influence beasts/plants | `COND` (multi-skill) |
| kenku | Expert Forgery — adv on checks to produce forgeries | `COND` |
| shifter/Wildhunt | adv on WIS checks **while shifted** | `STATE` (needs a shift toggle — rage-like) |
| tortle | Shell Defense — +4 AC, adv STR/CON saves, dis DEX saves, prone, speed 0 while withdrawn | `STATE` bundle (action toggle) / manual |
| kobold | Grovel, Cower, and Beg — ally-facing | Tier 4 |

## Design implications (build off these)

1. **`ability: 'all'` + condition is the dominant correct shape** for racial save advantages — the WIS/CON narrowing was part of the misread. Only Gnome Cunning (INT/WIS/CHA) and War Caster (CON) keep RAW ability scopes. The situational chip therefore appears on *any* save roll for those traits.
2. **A third handling class is required: `STATE`** (app-adjudicable). Fast Movement over-grants today and is fixable in derive alone; Aura of Protection needs an incapacitated suppression; Defense style and Bracers of Defense already do this correctly and are the pattern to follow. The plan's taxonomy decision rule already implies this tier — make it explicit as Tier 1b.
3. **Conditional disadvantage is real and symmetric** (Sunlight Sensitivity ×3 races, Demon Armor). The mechanism's `condition` field and chips must work for `dis` exactly as for `adv` — including the netting question when a situational dis is applied against a standing adv.
4. **Attack-roll conditional sources exist near-scope** (Pack Tactics, Reckless Attack, Sunlight Sensitivity's attack half). Keep the attack extension designed-for (plan Phase 5e) even though its UI is deferred.
5. **The condition-string vocabulary is small and reusable** (~14 phrases): vs. being charmed / frightened / paralyzed / poisoned / stunned / put to sleep; vs. poison; vs. magic (spells and magical effects); vs. illusions; checks that rely on sight / on moving silently; to discern lies; while impersonating; concentration (when damaged); in natural terrain; in direct sunlight; vs. demons. A soft enum + free-text fallback would keep labels consistent.
6. **`sleep (magical)` has many carriers** (7 Fey Ancestry races, Watchful Helm; Leviathan Will covers it via the save clause) — the Tier-3 chip pays for itself immediately. `surprise` (Alert, Watchful Helm) and `disease` (Purity of Body, Divine Health) join it.
7. **Under-authoring is the second systemic failure mode** (Table 4): verifying only what's authored would miss half the findings. Part A's method must be "read the whole description, then diff against `effects[]`" — per the user directive that triggered this survey.

**Case count for the mechanism to be designed against: ~36 concrete conditional adv/dis cases** (19 hardcoded rows + Danger Sense + ~10 items + 3 unauthored vs-magic saves + Infernal Constitution + Belt of Dwarvenkind + Demon Armor), **4+ state-gated cases, and 3 exemption-chip families.**

---

## Approval checklist (numbered map — reviewed item-by-item and APPROVED by user 2026-07-03)

All 63 items approved as proposed. Chip UX approved same date: chips **group by condition, not source**; short display labels (full RAW clause in the breakdown); >3 chips collapse to a `Situational (n)…` expander; redundant same-mode chips dim once the net flips; empty = no UI.

**A — hardcoded advantages → situational:**
1. Fey Ancestry (elf, eladrin, sea-elf, shadar-kai, bugbear, hobgoblin, half-elf) → **all** saves · "vs. being charmed" ·
2. Dwarven Resilience (dwarf; duergar via split) → all saves · "vs. poison" ·
3. Duergar Resilience → second source: all saves · "vs. illusions, and vs. being charmed or paralyzed" ·
4. Gnome Cunning (gnome, deep-gnome) → INT/WIS/CHA (RAW scope) · "vs. magic" ·
5. Brave → all · "vs. being frightened" ·
6. Stout Resilience → all · "vs. poison" ·
7. Mental Discipline → all · "vs. being charmed or frightened" ·
8. Leviathan Will → all · "vs. being charmed, frightened, paralyzed, poisoned, stunned, or put to sleep" ·
9. Magic Resistance (satyr, yuan-ti) → all · "vs. spells and other magical effects" ·
10. Telepathic Insight (verdan) → **NO CHANGE** (genuinely flat) ·
11. War Caster → CON · "to maintain concentration when you take damage" ·
12. Actor → Deception+Performance · "when impersonating another person"

**B — class features:** 13. Danger Sense → situational "vs. effects you can see" (+ blinded/deafened/incapacitated suppressors) · 14. Fast Movement → heavy-armor state gate · 15. Aura of Protection → incapacitated suppression · 16. Purity of Body → add disease chip · 17. Diamond Soul — no change · 18. Slippery Mind — no change

**C — item advantages:** situational → 19. Boots of Elvenkind "silent movement" · 20. Cloak of Elvenkind "hood up, to hide" · 21. Piwafwi "hood up, to hide" · 22. Eyes of the Eagle "sight-based" · 23. Robe of Eyes "sight-based" · 24. Inquisitive's Goggles "discern lies" · 25. Ring of Truth Telling "discern lies" · 26. Kagonesti Forest Shroud "natural terrain" · 27. Nature's Mantle "natural terrain" · 28. Reveler's Concertina "while playing it" — flat, no change → 29. Sentinel Shield (initiative half = GAP) · 30. Cloak of the Bat · 31. Crown of the Wrath Bringer · 32. Gavel of the Venn Rune · 33. Orb of the Stein Rune · 34. Piwafwi of Fire Resistance (wiki-verify) · 35. Platinum Scarf (wiki-verify) · 36. Rod of Alertness · 37. Shadowfell Brand Tattoo · 38. Skull Helm · 39. Watchful Helm

**D — unauthored, to add:** 40. Piwafwi all-saves adv "vs. magic" · 41. Staff of the Magi ditto · 42. Robe of the Archmagi ditto · 43. Staff of Power flat +2 AC & +2 all saves · 44. Belt of Dwarvenkind non-dwarf bundle · 45. Demon Armor situational **dis** vs. demons · 46. Infernal Constitution all-saves adv "vs. being poisoned" · 47. Matalotok cold immunity · 48. Windvane lightning resistance · 49. Akmon resistance/immunity/tool bundle

**E — exemption chips:** 50. `sleep (magical)` · 51. `disease` · 52. `frightened` (Aura of Courage) · 53. `surprise`

**F — new conditional authoring:** 54. Sunlight Sensitivity (drow, duergar, kobold) **dis** "in direct sunlight" · 55. Stone Camouflage · 56. Pack Tactics (defer — attack targets) · 57. Speech of Beast and Leaf · 58. Expert Forgery · 59. Wildhunt Shifting (defer — shift toggle) · 60. Shell Defense (defer — manual)

**G — plan amendments:** 61. Tier 1b state-gated · 62. `ability:'all'` + condition authoring shape · 63. Part A method = full-description diff vs `effects[]`

### Execution notes (2026-07-03, Phases 1–4 landed on `feat/situational-effects`)

- #1–13, 19–28, 40–45, 47–53 executed as approved. #10/#17/#18/#29–39 confirmed no-change.
- **#45 Demon Armor:** save half authored (`disadvantage save all · "vs. demons' abilities (cursed)"`); the **attack-roll half stays a GAP** (no attack target on adv/dis effects yet — same family as Pack Tactics #56).
- **#46 Infernal Constitution:** deferred to Phase 5 (needs the FeatEffect `advantage` variant that migration introduces).
- **#44 Belt of Dwarvenkind:** adv-vs-poison, poison resistance, conditional Persuasion, Dwarvish authored; **darkvision 60 is a GAP** (no item sense channel).
- **#49 Akmon:** fire resistance + exhaustion-immunity chip authored; **smith's-tools proficiency/advantage is a GAP** (no item tool-prof channel).
- **#53 Alert:** chip authored unconditional; the RAW "while conscious" clause is a noted simplification (set-membership grants have no state gate).
- **Phase 5 (maps → data):** `FEAT_ADVANTAGES`/`RACE_ADVANTAGES`/`SUBRACE_ADVANTAGES`/`getCharacterAdvantages` deleted from code; `RaceEffect` (label required) + `FeatEffect` advantage/disadvantage variants added; all 17 races + stout subrace + war-caster/actor authored in `data/` (gnome/deep-gnome as 3 per-ability entries per RAW scope; verdan flat). **#46 Infernal Constitution authored** (all saves · "vs. being poisoned"). Ledger ids preserved (`advdis:race:<trait-slug>` unchanged; war-caster rename covered by an alias shim). NEW `validateFeatEffects` closes the feats-unvalidated hole — all 105 feat files pass. Custom races can now carry advantage traits via race data (BUG-70 path unblocked).
