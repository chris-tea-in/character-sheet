// Action-economy bucketing shared by the Spells list (sort/badges) and the Combat
// tab (Action / Bonus Action / Reaction sections). The four buckets deliberately
// match ClassAbility['action'] so spells and class abilities group together.
//
// Spell casting_time strings audited across all 567 spells (2026-07-04):
// "1 Action" (427, incl. "1 action or 8 hours" variants), "1 Bonus Action" (46),
// "1 Reaction, which you take when …" (10 — always carries a trigger clause, hence
// prefix matching), and long times ("1 minute", "10 minutes", "1/8/12/24 hours")
// which all land in 'other'.

import type { ClassAbilityAction } from '@/types/data'

export type ActionEconomy = ClassAbilityAction

export const ACTION_ECONOMY_ORDER: Record<ActionEconomy, number> = {
  action: 0,
  bonus_action: 1,
  reaction: 2,
  other: 3,
}

export function normalizeCastingTime(castingTime: string | null | undefined): ActionEconomy {
  const ct = (castingTime ?? '').trim().toLowerCase()
  if (/^1 action\b/.test(ct)) return 'action'
  if (/^1 bonus action\b/.test(ct)) return 'bonus_action'
  if (/^1 reaction/.test(ct)) return 'reaction'
  return 'other'
}
