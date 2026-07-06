// Roll-time situational advantage/disadvantage chips (EFFECT_AUDIT 2026-07, Phase 2).
// Condition-bearing sources are never auto-netted; at roll time the applicable ones
// for the rolled target become opt-in chips in the dice modal. Chips group by
// mode+condition, NOT by source — advantage doesn't stack per RAW, so one applicable
// source is mechanically identical to three; the contributors ride along as labels.

import type { RollAdvSource } from './characterStats'

export interface SituationalOption {
  key: string            // `${mode}:${condition lowercased}` — stable within one roll
  mode: 'adv' | 'dis'
  condition: string      // full RAW clause (tooltip / breakdown / history)
  short: string          // chip-length display label
  sources: string[]      // contributing source labels (Fey Ancestry, Piwafwi, …)
  active: boolean
}

// Chip-length display forms for the recurring RAW clauses (the audit's ~14-phrase
// vocabulary). First match wins; unknown clauses fall back to truncation.
const SHORT_FORMS: Array<[RegExp, string]> = [
  [/charmed or frightened/i, 'vs. charm/fear'],
  [/charmed, frightened, paralyzed/i, 'vs. conditions'],
  [/illusions/i, 'vs. illusion/charm/paralysis'],
  [/being charmed/i, 'vs. charm'],
  [/being frightened/i, 'vs. fear'],
  [/being poisoned/i, 'vs. poisoned'],
  [/poison/i, 'vs. poison'],
  [/spells|magic/i, 'vs. magic'],
  [/concentration/i, 'concentration'],
  [/impersonating/i, 'impersonating'],
  [/rely on sight/i, 'sight-based'],
  [/moving silently/i, 'silent movement'],
  [/hood is up/i, 'hood up, to hide'],
  [/lying|lies/i, 'discern lies'],
  [/natural (environments|terrain|settings)/i, 'natural terrain'],
  [/you can see/i, 'effects you can see'],
  [/direct sunlight/i, 'sunlight'],
]

export function shortConditionLabel(condition: string): string {
  for (const [re, short] of SHORT_FORMS) if (re.test(condition)) return short
  const trimmed = condition.trim()
  return trimmed.length > 24 ? `${trimmed.slice(0, 23).trimEnd()}…` : trimmed
}

// Build the modal's chip list from one target's rollStateSources: enabled,
// condition-bearing sources only, merged by mode+condition.
export function buildSituationalOptions(sources: RollAdvSource[] | undefined): SituationalOption[] {
  const out: SituationalOption[] = []
  for (const s of sources ?? []) {
    if (!s.condition || s.disabled) continue
    const key = `${s.mode}:${s.condition.toLowerCase()}`
    const existing = out.find(o => o.key === key)
    if (existing) {
      if (!existing.sources.includes(s.label)) existing.sources.push(s.label)
      continue
    }
    out.push({
      key,
      mode: s.mode,
      condition: s.condition,
      short: shortConditionLabel(s.condition),
      sources: [s.label],
      active: false,
    })
  }
  return out
}

// RAW netting for the modal: the standing base mode + every active chip's mode;
// any advantage + any disadvantage cancel to a normal roll.
export function netModes(modes: Array<'adv' | 'dis' | undefined>): 'adv' | 'dis' | undefined {
  const adv = modes.includes('adv')
  const dis = modes.includes('dis')
  return adv === dis ? undefined : adv ? 'adv' : 'dis'
}
