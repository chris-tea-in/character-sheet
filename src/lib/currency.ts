import type { Currency } from '@/types/character'

// Copper value of each coin (standard 5e: 1gp=10sp=100cp, 1pp=10gp, 1ep=5sp).
export const COIN_VALUES_CP: Record<keyof Currency, number> = {
  pp: 1000, gp: 100, ep: 50, sp: 10, cp: 1,
}

// Total worth of a purse, in copper.
export function totalCopper(c: Currency): number {
  return (c.pp ?? 0) * 1000 + (c.gp ?? 0) * 100 + (c.ep ?? 0) * 50 + (c.sp ?? 0) * 10 + (c.cp ?? 0)
}

// Normalize a purse into the fewest standard coins. Electrum is folded into the
// total (its worth is preserved) but not re-emitted — it's a non-canonical
// residue most tables don't hand out as change. e.g. 320cp → 3gp 2sp.
export function condenseCurrency(c: Currency): Currency {
  let cp = totalCopper(c)
  const pp = Math.floor(cp / 1000); cp -= pp * 1000
  const gp = Math.floor(cp / 100); cp -= gp * 100
  const sp = Math.floor(cp / 10); cp -= sp * 10
  return { pp, gp, ep: 0, sp, cp }
}

// Whether condensing would change anything (so the UI can disable a no-op).
export function canCondense(c: Currency): boolean {
  const n = condenseCurrency(c)
  return n.pp !== (c.pp ?? 0) || n.gp !== (c.gp ?? 0) || n.ep !== (c.ep ?? 0)
    || n.sp !== (c.sp ?? 0) || n.cp !== (c.cp ?? 0)
}
