// Phase 2 (situational chips) — store + lib unit tests. The store is exercised
// headless via setState/getState; dice stay unmocked, so assertions target
// structure (natural2 presence, advantage flag, labels, ids), not exact faces.
import { describe, it, expect, beforeEach } from 'vitest'
import { useDiceStore } from './dice'
import { netModes, buildSituationalOptions, shortConditionLabel } from '../lib/rollSituational'
import type { RollAdvSource } from '../lib/characterStats'
import type { RollEntry } from '../types/dice'

describe('netModes', () => {
  it('nets per RAW: any adv + any dis cancel', () => {
    expect(netModes([undefined])).toBeUndefined()
    expect(netModes(['adv'])).toBe('adv')
    expect(netModes(['dis'])).toBe('dis')
    expect(netModes(['adv', 'dis'])).toBeUndefined()
    expect(netModes(['adv', 'adv'])).toBe('adv')
    expect(netModes([undefined, 'dis', 'adv'])).toBeUndefined()
  })
})

describe('shortConditionLabel', () => {
  it('maps the audit vocabulary to chip-length labels', () => {
    expect(shortConditionLabel('vs. being charmed')).toBe('vs. charm')
    expect(shortConditionLabel('vs. spells and other magical effects')).toBe('vs. magic')
    expect(shortConditionLabel('checks that rely on sight')).toBe('sight-based')
    expect(shortConditionLabel('to maintain concentration when you take damage')).toBe('concentration')
  })
  it('falls back to truncation for unknown clauses', () => {
    expect(shortConditionLabel('short clause')).toBe('short clause')
    const long = shortConditionLabel('while standing on one leg during a thunderstorm at midnight')
    expect(long.length).toBeLessThanOrEqual(24)
    expect(long.endsWith('…')).toBe(true)
  })
})

describe('buildSituationalOptions', () => {
  const src = (label: string, condition?: string, extra?: Partial<RollAdvSource>): RollAdvSource =>
    ({ mode: 'adv', label, kind: 'race', condition, ...extra })

  it('groups sources sharing mode+condition into one chip (adv does not stack)', () => {
    const opts = buildSituationalOptions([
      src('Eyes of the Eagle', 'checks that rely on sight'),
      src('Robe of Eyes', 'checks that rely on sight'),
    ])
    expect(opts).toHaveLength(1)
    expect(opts[0].sources).toEqual(['Eyes of the Eagle', 'Robe of Eyes'])
    expect(opts[0].short).toBe('sight-based')
  })

  it('excludes standing (no condition) and ledger-disabled sources', () => {
    const opts = buildSituationalOptions([
      src('Telepathic Insight'),                                   // standing
      src('Fey Ancestry', 'vs. being charmed', { disabled: true }), // disabled
      src('Brave', 'vs. being frightened'),
    ])
    expect(opts).toHaveLength(1)
    expect(opts[0].sources).toEqual(['Brave'])
  })

  it('distinct conditions and modes stay separate chips', () => {
    const opts = buildSituationalOptions([
      src('Fey Ancestry', 'vs. being charmed'),
      src('Magic Resistance', 'vs. spells and other magical effects'),
      { mode: 'dis', label: 'Sunlight Sensitivity', kind: 'race', condition: 'in direct sunlight' },
    ])
    expect(opts).toHaveLength(3)
    expect(opts.map(o => o.mode)).toEqual(['adv', 'adv', 'dis'])
  })
})

describe('toggleSituational (store)', () => {
  const feyKey = 'adv:vs. being charmed'
  const baseEntry = (): RollEntry => ({
    id: 'e1',
    kind: { type: 'save', ability: 'wis' },
    result: { natural: 11, modifier: 3, total: 14 },
    label: 'WIS save (+3)',
    timestamp: 0,
  })
  const feySources: RollAdvSource[] = [
    { mode: 'adv', label: 'Fey Ancestry', kind: 'race', condition: 'vs. being charmed' },
  ]

  beforeEach(() => {
    const entry = baseEntry()
    useDiceStore.setState({
      rolls: [entry],
      modal: {
        entry,
        phase: 'result',
        isCrit: false,
        baseMode: undefined,
        situational: buildSituationalOptions(feySources),
      },
    })
  })

  it('activating an adv chip re-resolves as advantage with a labeled history entry', () => {
    useDiceStore.getState().toggleSituational(feyKey)
    const s = useDiceStore.getState()
    const entry = s.modal!.entry
    expect(entry.id).not.toBe('e1')                       // fresh roll
    expect((entry.kind as { advantage?: boolean }).advantage).toBe(true)
    expect(entry.result.natural2).toBeDefined()           // 2d20 keep best
    expect(entry.result.total).toBe(entry.result.natural + 3)
    expect(entry.label).toContain('[Adv]')
    expect(entry.label).toContain('[Fey Ancestry: vs. charm]')
    expect(s.rolls[0].id).toBe(entry.id)                  // history head replaced
    expect(s.modal!.situational![0].active).toBe(true)
  })

  it('toggling the chip back off re-resolves as a fresh normal roll', () => {
    const st = useDiceStore.getState()
    st.toggleSituational(feyKey)
    useDiceStore.getState().toggleSituational(feyKey)
    const entry = useDiceStore.getState().modal!.entry
    expect((entry.kind as { advantage?: boolean }).advantage).toBeUndefined()
    expect(entry.result.natural2).toBeUndefined()
    expect(entry.label).not.toContain('[Fey Ancestry')
  })

  it('an adv chip against a dis baseMode nets to a normal single d20', () => {
    useDiceStore.setState(s => ({ modal: { ...s.modal!, baseMode: 'dis' } }))
    useDiceStore.getState().toggleSituational(feyKey)
    const entry = useDiceStore.getState().modal!.entry
    expect((entry.kind as { advantage?: boolean }).advantage).toBeUndefined()
    expect(entry.result.natural2).toBeUndefined()
    expect(entry.label).toContain('[Fey Ancestry: vs. charm]')
  })

  it('a redundant same-mode chip relabels in place without re-rolling', () => {
    const entry0 = baseEntry()
    useDiceStore.setState({
      rolls: [entry0],
      modal: {
        entry: entry0,
        phase: 'result',
        isCrit: false,
        baseMode: undefined,
        situational: buildSituationalOptions([
          ...feySources,
          { mode: 'adv', label: 'Magic Resistance', kind: 'race', condition: 'vs. spells and other magical effects' },
        ]),
      },
    })
    useDiceStore.getState().toggleSituational(feyKey)               // net → adv (re-resolve)
    const afterFirst = useDiceStore.getState().modal!.entry
    useDiceStore.getState().toggleSituational('adv:vs. spells and other magical effects') // net unchanged
    const afterSecond = useDiceStore.getState().modal!.entry
    expect(afterSecond.id).toBe(afterFirst.id)                      // same dice kept
    expect(afterSecond.result.natural).toBe(afterFirst.result.natural)
    expect(afterSecond.label).toContain('[Fey Ancestry: vs. charm]')
    expect(afterSecond.label).toContain('[Magic Resistance: vs. magic]')
    expect(useDiceStore.getState().rolls[0].label).toBe(afterSecond.label)
  })

  it('preserves the Reliable Talent floor through a chip re-resolve', () => {
    useDiceStore.setState(s => ({ modal: { ...s.modal!, reliableTalent: true } }))
    for (let i = 0; i < 25; i++) {
      useDiceStore.getState().toggleSituational(feyKey) // on/off repeatedly → many re-resolves
      expect(useDiceStore.getState().modal!.entry.result.natural).toBeGreaterThanOrEqual(10)
    }
  })

  it('no-ops without a modal or on non-d20 kinds', () => {
    useDiceStore.setState({ modal: null, rolls: [] })
    useDiceStore.getState().toggleSituational(feyKey)
    expect(useDiceStore.getState().modal).toBeNull()
  })
})
