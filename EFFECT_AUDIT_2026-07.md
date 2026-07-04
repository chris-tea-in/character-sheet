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
---

## Part A — applied-effects verification (manual run, 2026-07-03)

Method: full-description read per entry (dig protocol); local descriptions are the wiki-derived evidence base; wiki-verify flagged at fix time. Channels already fully covered by Part 0 + Phases 1–5: hardcoded rows (#1–12), class-feature-effects (#13–18), item advantage entries (#19–39) + item under-authoring (#40–49).

### A-feats (105 files; effects verified against descriptions)

**OK (verified):** all authored ASIs match their descriptions (incl. dragon-fear, dwarven-fortitude, fey-touched, gunner, keen-mind, resilient, shadow-touched, skill-expert, squat-nimbleness ASI+speed, weapon-master, heavily/lightly/moderately-armored, prodigy's skill+expertise, skilled count=3, tough, observant, mobile, sentinel-alert initiative, infernal-constitution, war-caster, actor).

**UNAUTHORED (modelable now — Batch-2 fixes):**
| Feat | Missing effect |
|---|---|
| poisoner | `tool_proficiency tools:["Poisoner's kit"]` |
| squat-nimbleness | `skill_proficiency count:1` (RAW restricts to Acrobatics/Athletics — restriction unenforced, noted) + situational adv on Athletics & Acrobatics · "to escape a grapple" |
| mage-slayer | situational adv, all saves · "vs. spells cast within 5 feet of you" |
| dungeon-delver | situational adv, all saves · "vs. traps" |

**GAP (no channel — matrix backlog):** gunner firearms proficiency (weapon-prof matcher has no category support — DND-WPN1 family); weapon-master 4-weapon choice + prodigy/artificer-initiate tool-or-language *choice* grants (fixed-array channels only); medium-armor-master (+3 medium AC cap); dual-wielder +1 AC while dual-wielding (weapon-state AC); shield-master shield-bonus-to-DEX-saves; blind-fighting blindsight (no feat sense channel); dungeon-delver trap-damage resistance (conditional resistance); planar-wanderer / scion-of-the-outer-planes choice resistances; skulker dim-light Perception-dis suppression; grappler / mounted-combatant attack-roll advantage (attack targets pending).

**WITHDRAWN → corrected:** an initial "description truncation family" finding was an artifact of the audit's own extraction regex (a Source-prefix strip that ate through the first period), not data corruption — raw files re-read and confirmed intact (dual-wielder, charger, and the rest are complete). During the false alarm, 5 files were normalized to canonical PHB text (`defensive-duelist`, `savage-attacker`, `skilled` rewritten; `blind-fighting`, `polearm-master` leads prepended) — all five re-verified coherent and RAW-correct afterward. **Method lesson (now part of the audit protocol): re-read the raw file before declaring data corrupt; never classify from a transformed display.**

### A-races (46 files — authored effects + structured fields vs trait text)

All authored effects match their trait text. Findings: **UNAUTHORED:** sea-elf cold resistance (Child of the Sea) — *fixed*. **TIER:** grung + yuan-ti are immune to the *poisoned condition*, not just poison damage → `poisoned (condition)` chips — *fixed*. **GAP:** choice-based grants (centaur/changeling/kenku/orc/minotaur/lizardfolk/half-elf versatility/variant human — policy: player-managed, OOS); harengon Hare-Trigger (+PB initiative — no race initiative channel, PB-derived); fly/climb speeds (aarakocra/fairy/owlin/tabaxi); natural weapons (aarakocra/tabaxi); Stonecunning (situational expertise); hobgoblin 2-martial-weapon choice; dwarf/duergar artisan-tool choice; satyr instrument choice.

### A-backgrounds (48 grant lists)

**WRONG:** fisher tools were "Vehicles (water)"; RAW grants fishing tackle — *fixed*. **Verified OK:** marine ("Vehicles (land & water)" is RAW), all other 46 grant lists match their sources. **Notes:** gladiator lists an instrument where RAW swaps it for an "unusual weapon" (minor, left as-is); `"None"` as a literal string in `languages` arrays is a data smell feeding the known literal-language bug; haunted-one's exotic-language prose + `language_choices:1` double-encodes one grant (wizard behavior should be confirmed when the language-choice UI is revisited).

### A-items wrap-up

Remaining 7 equipment categories scanned: zero effect-bearing entries — channel closed. **Platinum Scarf source-mismatch (user review):** the wikidot item of this name (Breath of Life / Platinum Shield / Radiant Hammer) is a completely different item from our local text (all-saves advantage + pullable threads); either our entry is homebrew/adventure-variant (then its effect matches its own text → OK-as-homebrew) or it needs replacing. Piwafwi of Fire Resistance + Cloak of the Bat verdicts (#30/#34) re-confirmed FLAT per RAW recall; low-risk.

### Part A fixes applied (2026-07-03, hybrid Batch 1/2)

fisher tools · sea-elf cold resistance · grung/yuan-ti poisoned-condition chips · poisoner tool prof · squat-nimbleness skill pick + 2 conditional grapple-escape advantages · mage-slayer conditional save adv · dungeon-delver conditional save adv · 5 feat descriptions normalized to canonical PHB text. Build + validators green; 94/94 characterStats tests.

---

## Part B — proposals for unmodeled prose (user review before authoring)

Full sweep of 122 subclasses + 14 base classes (keyword extraction + manual classification). Actions, resources, rerolls, spellcasting, ally-facing and target-side effects are tier 4 (not listed). Ready-to-author unless marked otherwise.

**Tier 1 — standing grants (authorable in `class-feature-effects.json` today; needs subclass-key support for subclass rows):**
- *Proficiencies:* artificer specialists (alchemist alchemist's supplies · armorer heavy armor + smith's · artillerist woodcarver's · battle-smith smith's + martial weapons) · bard swords (medium armor + scimitar) · bard valor (medium + shields + martial) · cleric domains (arcana → Arcana skill; death/tempest/war/twilight → martial+heavy; forge → heavy + smith's; life/nature/order → heavy) · fighter banneret Persuasion · rune-knight smith's tools + Giant language · **samurai L7 WIS save proficiency** · drunken-master Performance + brewer's supplies · mercy Insight + Medicine + herbalism kit · assassin disguise + poisoner's kits · mastermind disguise + forgery kits · scout Nature + Survival (expertise rider needs a FeatureEffect `expertise` variant) · bladesinger light armor + Performance · **hexblade medium armor + shields + martial weapons**
- *Resistances/immunities:* alchemist L15 acid+poison resist (+poisoned chip) · forge L6 fire resist, L17 fire immunity · ghostslayer necrotic · psi-warrior L10 psychic · mutant L7 poison immunity (+poisoned chip) · great-old-one L10 psychic · celestial L6 radiant · fathomless L6 cold · storm-sorcery L6 lightning+thunder resist, L18 immunities · aberrant-mind L6 psychic · undead-warlock L10 necrotic · land-druid L10 poison immunity · war-cleric L17 / oathbreaker L15 nonmagical B/P/S (free-string) · ancients L7 + abjurer L14 "spell damage" resistance (free-string)
- *Numerics:* **draconic sorcerer +1 HP/level (`max_hp perLevel:1`)** · scout L9 +10 speed · glory-paladin L7 +10 speed · **blood-hunter Dark Augmentation: +5 speed AND +CON to STR/DEX saves (`derived_save` channel exists)**

**Tier 2 — situational advantage entries (condition-tagged):** crown-paladin L15 "vs. becoming paralyzed or stunned" · aberrant-mind + blood-hunter Hardened Soul "vs. being charmed or frightened" · undying-warlock "vs. disease" · abjurer L14 "vs. spells" · land-druid L6 + ranger Land's Stride "vs. plants magically impeding movement" · cavalier "vs. falling off your mount" · lycan Perception "relying on hearing or smell" · inquisitive L9 Perception/Investigation + thief L9 Stealth "if you move no more than half your speed" · assassin Impostor Deception "to avoid detection while impersonating" · ranger Favored Enemy + blood-hunter Hunter's Bane tracking checks "vs. chosen/fey-fiend-undead foes" · totem L6 bear STR checks "to push, pull, lift, or break"

**Tier 3 — exemption chips:** archfey L10 `charmed` · devotion aura `charmed` ("while conscious" noted) · spores L14 `blinded`+`deafened`+`frightened`+`poisoned` · land-druid L10 `disease` (+ charm/fear vs elementals/fey as a qualified note)

**Tier 1b — state-gated (needs the named toggle first):** **Rage bundle** (adv STR checks+saves, B/P/S resistance; berserker charm/fear chips; totem bear all-but-psychic — needs rage toggle + set-with-exception) · shifter Shifting bundles (Beasthide +1 AC, Swiftstride +10, Wildhunt WIS-check adv) · rune-knight Giant's Might · bladesinger Bladesong (+INT AC, +10 speed, adv Acrobatics) · monk Unarmored Movement (+10/+ scaling — needs an `unarmored` whileNot value) · astral-self/undead-warlock form gates · stars-druid Starry Form B/P/S resist · forge L6 "+1 AC in heavy armor" / L17 heavy-armor B/P/S resist (needs heavy-specific armored gate)

**GAP register (new model work; matrix backlog):** initiative advantage (Feral Instinct, Ambush Master — joins Sentinel Shield #24/25) · derived initiative (+CHA Rakish Audacity, +PB Watchers aura, harengon) · half-proficiency (Jack of All Trades, Remarkable Athlete, artificer Tool Expertise) · feature-granted senses (twilight 300 ft, shadow-magic 120 ft, blindsight) · unarmored AC bases from features (Draconic Resilience 13+DEX) · feature `expertise` variant (scout, knowledge domain) · choice grants (lore bard 3 skills, kensei weapons, fiend/genie/drakewarden chosen resistances) · attack-roll adv/dis family (Reckless Attack, Assassinate, Steady Aim, Pack Tactics, Demon Armor's attack half)

- **Phase 5 (maps → data):** `FEAT_ADVANTAGES`/`RACE_ADVANTAGES`/`SUBRACE_ADVANTAGES`/`getCharacterAdvantages` deleted from code; `RaceEffect` (label required) + `FeatEffect` advantage/disadvantage variants added; all 17 races + stout subrace + war-caster/actor authored in `data/` (gnome/deep-gnome as 3 per-ability entries per RAW scope; verdan flat). **#46 Infernal Constitution authored** (all saves · "vs. being poisoned"). Ledger ids preserved (`advdis:race:<trait-slug>` unchanged; war-caster rename covered by an alias shim). NEW `validateFeatEffects` closes the feats-unvalidated hole — all 105 feat files pass. Custom races can now carry advantage traits via race data (BUG-70 path unblocked).
