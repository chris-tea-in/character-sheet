import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultCharacter, type Character } from '@/types/character'
import type { ClassFeatureData } from '@/types/data'

const { spellBlockSpy } = vi.hoisted(() => ({ spellBlockSpy: vi.fn(() => null) }))

vi.mock('./AbilityBlock', () => ({ AbilityBlock: () => null }))
vi.mock('./CombatBlock', () => ({ CombatBlock: () => null }))
vi.mock('./ProficienciesBlock', () => ({ ProficienciesBlock: () => null }))
vi.mock('./EquipmentBlock', () => ({ EquipmentBlock: () => null }))
vi.mock('./FeatsBlock', () => ({ FeatsBlock: () => null }))
vi.mock('./FeaturesBlock', () => ({ FeaturesBlock: () => null }))
vi.mock('./DescriptionBlock', () => ({ DescriptionBlock: () => null }))
vi.mock('./SpellBlock', () => ({ SpellBlock: spellBlockSpy }))
vi.mock('./useDerivedSheet', () => ({
  useDerivedSheet: () => ({
    classRecord: { name: 'Warlock' },
    classRecords: [],
    classHitDice: [],
    backgroundSkills: [],
    primaryClassLevel: 5,
    derived: {},
    multiclassSlotProfile: null,
    multiclassCasterKind: undefined,
  }),
}))

import { CharacterSheetBlocks } from './CharacterSheetBlocks'

const character: Character = {
  ...defaultCharacter('Shared Warlock'),
  id: 'shared-warlock',
  createdAt: 0,
  updatedAt: 0,
}

const classFeatures: ClassFeatureData = {
  'warlock:invocations': {
    key: 'warlock:invocations',
    label: 'Invocations',
    source: { classSlug: 'warlock' },
    known: [{ level: 2, count: 2 }],
    options: [{ slug: 'eldritch-smite', name: 'Eldritch Smite', description: 'Spend a Pact slot.' }],
  },
}

describe('CharacterSheetBlocks spell feature wiring', () => {
  beforeEach(() => spellBlockSpy.mockClear())

  it('passes shared setup class features to SpellBlock and preserves the read-only save guard', () => {
    const onSave = vi.fn()

    renderToStaticMarkup(createElement(CharacterSheetBlocks, {
      character,
      data: {
        setupData: { classFeatures } as never,
        equipmentCatalog: null,
        featData: null,
      },
      onSave,
      readOnly: true,
    }))

    const props = spellBlockSpy.mock.calls[0]?.[0]
    expect(props?.classFeatures).toBe(classFeatures)
    expect(props?.onSave).not.toBe(onSave)
    props?.onSave({ spellSlotsUsed: { '-1': 1 } })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('passes an explicit null while setup reference data is unavailable', () => {
    renderToStaticMarkup(createElement(CharacterSheetBlocks, {
      character,
      data: { setupData: null, equipmentCatalog: null, featData: null },
      onSave: vi.fn(),
    }))

    expect(spellBlockSpy.mock.calls[0]?.[0]?.classFeatures).toBeNull()
  })
})
