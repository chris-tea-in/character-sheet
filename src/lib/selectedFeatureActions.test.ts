import { describe, expect, it } from 'vitest'
import { defaultCharacter, type Character } from '@/types/character'
import type { ClassFeatureData } from '@/types/data'
import { selectedFeatureOptions, eldritchSmiteDamage } from './selectedFeatureActions'

const features: ClassFeatureData = {
  'warlock:invocations': {
    key: 'warlock:invocations', label: 'Invocations', source: { classSlug: 'warlock' },
    known: [{ level: 2, count: 2 }],
    options: [
      { slug: 'eldritch-smite', name: 'Eldritch Smite', description: 'Pact weapon hit.' },
      { slug: 'mask-of-many-faces', name: 'Mask of Many Faces', description: 'Disguise self at will.' },
    ],
  },
}
const character: Character = {
  ...defaultCharacter('Warlock'), id: 'test', createdAt: 0, updatedAt: 0,
  classes: [{ classSlug: 'fighter', subclassSlug: null, level: 2 }, { classSlug: 'warlock', subclassSlug: null, level: 5 }],
  classFeatureChoices: { 'warlock:invocations': ['eldritch-smite', 'eldritch-smite', 'missing'] },
}

describe('selected feature play controls', () => {
  it('includes only selected catalog options from applicable owning classes, once', () => {
    expect(selectedFeatureOptions(character, features).map(x => x.option.slug)).toEqual(['eldritch-smite'])
    expect(selectedFeatureOptions({ ...character, classes: character.classes.slice(0, 1) }, features)).toEqual([])
    expect(selectedFeatureOptions(character, null)).toEqual([])
  })

  it('adds one damage die to the Pact slot level, independent of standard slots', () => {
    expect(eldritchSmiteDamage({ kind: 'slots+pact', slotsByLevel: { 5: 2 }, pactSlotCount: 2, pactSlotLevel: 3, cantripsKnown: 2 }, { '-1': 1, 5: 0 }))
      .toMatchObject({ key: -1, dice: '4d8', remaining: 1 })
  })

  it('preserves exhausted Pact pools without substituting standard spell slots', () => {
    expect(eldritchSmiteDamage({ kind: 'slots+pact', slotsByLevel: { 5: 2 }, pactSlotCount: 2, pactSlotLevel: 3, cantripsKnown: 2 }, { '-1': 2 }))
      .toMatchObject({ remaining: 0 })
    expect(eldritchSmiteDamage({ kind: 'slots', slotsByLevel: { 3: 2 }, cantripsKnown: 2 }, {})).toBeNull()
  })

  it('normalizes legacy pure-warlock usage and scales fifth-level Pact slots to 6d8', () => {
    expect(eldritchSmiteDamage({ kind: 'pact', slotCount: 2, slotLevel: 5, cantripsKnown: 3 }, { '-1': 1 }))
      .toMatchObject({ key: 5, dice: '6d8', remaining: 1 })
  })

  it('removes deselected invocations without copying them into the spell list', () => {
    const removed = { ...character, classFeatureChoices: {} }
    expect(selectedFeatureOptions(removed, features)).toEqual([])
    expect(removed.spells).toEqual(character.spells)
  })

  it('includes selected maneuvers only for their owning subclass', () => {
    const group = {
      ...features['warlock:invocations'], key: 'fighter:maneuvers', label: 'Maneuvers',
      source: { classSlug: 'fighter', subclassSlug: 'battle-master' },
      known: [{ level: 3, count: 3 }],
      options: [{ slug: 'riposte', name: 'Riposte', description: 'Reaction after a miss.' }],
    }
    const fighter = { ...character,
      classes: [{ classSlug: 'fighter', subclassSlug: 'battle-master', level: 3 }],
      classFeatureChoices: { [group.key]: ['riposte'] },
    }
    expect(selectedFeatureOptions(fighter, { [group.key]: group }).map(x => x.option.name)).toEqual(['Riposte'])
    expect(selectedFeatureOptions({ ...fighter, classes: [{ classSlug: 'fighter', subclassSlug: 'champion', level: 3 }] }, { [group.key]: group })).toEqual([])
  })
})
