import { describe, expect, it } from 'vitest'
import { validateCampaignItem } from './itemValidation'

describe('validateCampaignItem', () => {
  const wondrous = {
    category: 'wondrous_item', name: 'Safe charm', rarity: 'Common', attunement: false,
  }

  it('accepts a valid catalog-shaped wondrous item', () => {
    expect(validateCampaignItem('wondrous_item', wondrous).ok).toBe(true)
  })

  it('rejects a null effect before it reaches derivation', () => {
    expect(validateCampaignItem('wondrous_item', { ...wondrous, effects: [null] }).ok).toBe(false)
  })

  it('rejects a category with missing required catalog fields', () => {
    expect(validateCampaignItem('weapon', { category: 'weapon', name: 'Broken sword' }).ok).toBe(false)
  })

  it.each([
    { description: { invalid: true } },
    { bonus: '3' },
    { special_properties: [null] },
  ])('rejects malformed optional fields consumed by rendering or math: %j', fields => {
    expect(validateCampaignItem('weapon', {
      category: 'weapon', name: 'Sword', weapon_type: 'Martial Melee',
      damage_dice: '1d8', damage_type: 'slashing', properties: [], ...fields,
    }).ok).toBe(false)
  })
})
