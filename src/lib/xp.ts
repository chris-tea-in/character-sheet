// Standard 5e XP thresholds — total accumulated XP required to BE at each level.
// Index i ⇒ level i+1. XP is stored as a cumulative total on the character;
// "carryover" is automatic because the total is the single source and this table
// is the only level mapping.
export const XP_THRESHOLDS: number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
]
export const MAX_LEVEL = 20

// Highest level whose XP threshold is met by `xp`.
export function levelForXp(xp: number): number {
  let lvl = 1
  for (let i = 0; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) lvl = i + 1
  }
  return lvl
}

// Progress toward the next level. Returns null at max level.
//   needed = XP still required to reach the next threshold
//   into   = XP accumulated within the current level's band
//   span   = size of the current level's band
export function xpToNext(xp: number): { needed: number; into: number; span: number } | null {
  const lvl = levelForXp(xp)
  if (lvl >= MAX_LEVEL) return null
  const cur = XP_THRESHOLDS[lvl - 1]
  const next = XP_THRESHOLDS[lvl]
  return { needed: next - xp, into: xp - cur, span: next - cur }
}
