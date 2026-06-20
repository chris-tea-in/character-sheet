import { describe, it, expect } from 'vitest'
import { reconcileDecision, type ReconcileInput } from './reconcile'

// Base case: local and remote both at 100, base at 100 (in sync). Each test
// overrides only the fields it exercises.
function decide(over: Partial<ReconcileInput>) {
  return reconcileDecision({
    localExists: true,
    localUpdatedAt: 100,
    base: 100,
    remoteUpdatedAt: 100,
    remoteDeleted: false,
    ...over,
  })
}

describe('reconcileDecision — no local row', () => {
  it('adopts a brand-new remote row', () => {
    expect(decide({ localExists: false, base: 0, remoteUpdatedAt: 200 })).toBe('adopt-new')
  })
  it('ignores a tombstone for a character we never had', () => {
    expect(decide({ localExists: false, base: 0, remoteUpdatedAt: 200, remoteDeleted: true })).toBe('none')
  })
})

describe('reconcileDecision — sentinel base 0 (never reconciled: fresh migration / new local row)', () => {
  it('adopts when remote is newer (last-write-wins)', () => {
    expect(decide({ base: 0, localUpdatedAt: 100, remoteUpdatedAt: 200 })).toBe('adopt')
  })
  it('deletes when remote is a newer tombstone', () => {
    expect(decide({ base: 0, localUpdatedAt: 100, remoteUpdatedAt: 200, remoteDeleted: true })).toBe('delete')
  })
  it('pushes when local is newer', () => {
    expect(decide({ base: 0, localUpdatedAt: 200, remoteUpdatedAt: 100 })).toBe('push')
  })
  it('records the base when equal — no conflict storm on the first post-migration boot', () => {
    expect(decide({ base: 0, localUpdatedAt: 100, remoteUpdatedAt: 100 })).toBe('set-base')
  })
})

describe('reconcileDecision — real base (true 3-way)', () => {
  it('adopts when only the cloud moved', () => {
    expect(decide({ remoteUpdatedAt: 200 })).toBe('adopt')
  })
  it('deletes when only the cloud moved and it is a tombstone', () => {
    expect(decide({ remoteUpdatedAt: 200, remoteDeleted: true })).toBe('delete')
  })
  it('pushes when only this device moved', () => {
    expect(decide({ localUpdatedAt: 200 })).toBe('push')
  })
  it('conflicts when both sides moved', () => {
    expect(decide({ localUpdatedAt: 200, remoteUpdatedAt: 300 })).toBe('conflict')
  })
  it('resurrects (keeps local) when a local edit races a remote delete', () => {
    expect(decide({ localUpdatedAt: 200, remoteUpdatedAt: 300, remoteDeleted: true })).toBe('resurrect')
  })
  it('does nothing when neither side moved', () => {
    expect(decide({ localUpdatedAt: 100, remoteUpdatedAt: 100 })).toBe('none')
  })
})
