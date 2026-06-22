import { describe, it, expect } from 'vitest'
import { condenseCurrency, totalCopper, canCondense } from './currency'
import type { Currency } from '@/types/character'

const c = (o: Partial<Currency>): Currency => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...o })

describe('totalCopper', () => {
  it('sums denominations at standard rates', () => {
    expect(totalCopper(c({ cp: 320 }))).toBe(320)
    expect(totalCopper(c({ gp: 3, sp: 2 }))).toBe(320)
    expect(totalCopper(c({ ep: 1 }))).toBe(50)
    expect(totalCopper(c({ pp: 1 }))).toBe(1000)
  })
})

describe('condenseCurrency', () => {
  it('320 cp becomes 3 gp 2 sp', () => {
    expect(condenseCurrency(c({ cp: 320 }))).toEqual(c({ gp: 3, sp: 2 }))
  })

  it('folds electrum into the standard coins (1 ep = 5 sp)', () => {
    expect(condenseCurrency(c({ ep: 3 }))).toEqual(c({ gp: 1, sp: 5 }))
  })

  it('rolls up into platinum', () => {
    expect(condenseCurrency(c({ cp: 1000 }))).toEqual(c({ pp: 1 }))
  })

  it('preserves total worth (including electrum)', () => {
    const messy = c({ cp: 57, sp: 23, ep: 4, gp: 9, pp: 1 })
    expect(totalCopper(condenseCurrency(messy))).toBe(totalCopper(messy))
  })
})

describe('canCondense', () => {
  it('is false when already in fewest standard coins', () => {
    expect(canCondense(c({ pp: 1, gp: 3, sp: 2, cp: 5 }))).toBe(false)
  })
  it('is true when coins can roll up', () => {
    expect(canCondense(c({ cp: 320 }))).toBe(true)
  })
  it('is true when electrum is present (it folds away)', () => {
    expect(canCondense(c({ ep: 1 }))).toBe(true)
  })
})
