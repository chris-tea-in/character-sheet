import { describe, it, expect } from 'vitest'
import { parseBackgroundSkills, backgroundGrantedSkills } from './characterSetup'

describe('parseBackgroundSkills', () => {
  it('returns only fixed grants for a plain skill list', () => {
    expect(parseBackgroundSkills(['Insight', 'Religion'])).toEqual({
      fixed: ['insight', 'religion'],
      choice: null,
    })
  })

  it('parses a fixed grant plus a "choose 1 from list" clause (Cloistered Scholar)', () => {
    const r = parseBackgroundSkills(['History', 'Your choice from: Arcana, Nature, or Religion'])
    expect(r.fixed).toEqual(['history'])
    expect(r.choice).toEqual({ count: 1, options: ['arcana', 'nature', 'religion'] })
  })

  it('parses a "choose two from list" clause (Investigator)', () => {
    const r = parseBackgroundSkills(['Your choice of two from: Insight, Investigation, or Perception'])
    expect(r.fixed).toEqual([])
    expect(r.choice).toEqual({ count: 2, options: ['insight', 'investigation', 'perception'] })
  })

  it('merges two identical choice clauses into one combined choice (Haunted One)', () => {
    const clause = 'Your choice from: Arcana, Investigation, Religion, or Survival'
    const r = parseBackgroundSkills([clause, clause])
    expect(r.fixed).toEqual([])
    expect(r.choice).toEqual({ count: 2, options: ['arcana', 'investigation', 'religion', 'survival'] })
  })

  it('expands an ability-scoped clause and excludes the fixed skill (Faction Agent)', () => {
    const r = parseBackgroundSkills(['Insight', 'One Intelligence, Wisdom, or Charisma skill of your choice'])
    expect(r.fixed).toEqual(['insight'])
    expect(r.choice?.count).toBe(1)
    // every INT/WIS/CHA skill, minus the already-granted insight (a WIS skill)
    expect(r.choice?.options).not.toContain('insight')
    expect(r.choice?.options).toEqual(expect.arrayContaining(['arcana', 'medicine', 'persuasion']))
    expect(r.choice?.options).not.toContain('acrobatics') // dex skill excluded
  })

  it('caps the choice count at the number of available options', () => {
    const r = parseBackgroundSkills(['Your choice of two from: Insight, or Perception'])
    expect(r.choice).toEqual({ count: 2, options: ['insight', 'perception'] })
  })
})

describe('backgroundGrantedSkills', () => {
  const list = ['History', 'Your choice from: Arcana, Nature, or Religion']

  it('returns fixed skills plus any choice-option the character is proficient in', () => {
    expect(backgroundGrantedSkills(list, { history: 'proficient', arcana: 'proficient' }))
      .toEqual(expect.arrayContaining(['history', 'arcana']))
  })

  it('does not count an unchosen option', () => {
    const granted = backgroundGrantedSkills(list, { history: 'proficient' })
    expect(granted).toContain('history')
    expect(granted).not.toContain('arcana')
  })

  it('does not count a proficient skill that is not part of the background', () => {
    const granted = backgroundGrantedSkills(list, { history: 'proficient', stealth: 'proficient' })
    expect(granted).not.toContain('stealth')
  })
})
