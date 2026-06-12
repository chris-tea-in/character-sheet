import type { Database } from 'sql.js'
import { getCharacter } from './characterRepo'
import { computeFeatStatDelta } from '../lib/characterStats'
import { getRacialBonuses } from '../lib/racialBonuses'
import { toAbilityName } from '../lib/characterSetup'
import type { SetupData } from '../lib/data'
import type { AbilityName, Character, NewCharacter } from '../types/character'
import type { FeatData } from '../types/data'

// One-time conversion to the render-time stats model: stored abilities/speed/
// initiative had racial and feat bonuses baked in at write time; the new model
// stores BASE values and derives those bonuses on render (deriveCharacterStats).
//
// Best-effort caveats (the AbilityBlock stepper edits base, so users can correct):
// - Flexible racial ASI picks were never recorded — they stay baked into base.
// - Feats added via FeatsBlock were never baked — subtracting their delta
//   undercounts base by that amount.
// - A feat ASI that capped at 20 when applied subtracts its full amount here.

interface NormalizedFields {
  abilities: Character['abilities']
  speed: number
  initiativeBonus: number
  savingThrowProficiencies: AbilityName[]
}

export function normalizeCharacterPayload(
  c: NewCharacter,
  setupData: SetupData,
  featData: Record<string, FeatData>,
): NormalizedFields {
  const abilities = { ...c.abilities }

  // Remove fixed race + subrace bonuses (no recorded flexible picks for legacy rows)
  const racial = getRacialBonuses(setupData.races[c.race], [], c.subrace ?? undefined)
  for (const [ab, amount] of Object.entries(racial) as [AbilityName, number][]) {
    abilities[ab] = Math.max(1, abilities[ab] - amount)
  }

  // Remove feat-applied ability/speed/initiative bonuses and save proficiencies
  let featSpeed = 0
  let featInitiative = 0
  const featSaves: AbilityName[] = []
  for (const slug of c.feats) {
    const feat = featData[slug]
    if (!feat) continue
    const delta = computeFeatStatDelta(slug, feat, c.featChoices)
    for (const [ab, amount] of Object.entries(delta.abilities) as [AbilityName, number][]) {
      abilities[ab] = Math.max(1, abilities[ab] - amount)
    }
    featSpeed += delta.speed
    featInitiative += delta.initiativeBonus
    if (delta.saveProficiency) featSaves.push(delta.saveProficiency)
  }

  // Keep a feat-granted save only if a class also grants it (derivation re-adds
  // it while the feat is present)
  const classSlugs = c.classes?.length ? c.classes.map(e => e.classSlug) : [c.class]
  const classSaves = new Set<AbilityName>()
  for (const slug of classSlugs) {
    for (const display of setupData.classes[slug]?.saving_throw_proficiencies ?? []) {
      const ab = toAbilityName(display)
      if (ab) classSaves.add(ab)
    }
  }
  const savingThrowProficiencies = c.savingThrowProficiencies.filter(
    ab => !featSaves.includes(ab) || classSaves.has(ab),
  )

  return {
    abilities,
    speed: Math.max(5, c.speed - featSpeed),
    initiativeBonus: (c.initiativeBonus ?? 0) - featInitiative,
    savingThrowProficiencies,
  }
}

// Converts every row still flagged stats_normalized=0. Returns true when any
// row changed (caller should flush). Idempotent — converted rows are skipped.
export function normalizeCharacterStats(
  db: Database,
  setupData: SetupData,
  featData: Record<string, FeatData>,
): boolean {
  const result = db.exec(`SELECT id FROM characters WHERE stats_normalized = 0`)
  const ids = result.length ? result[0].values.map(row => row[0] as string) : []
  if (!ids.length) return false

  db.run('BEGIN')
  try {
    for (const id of ids) {
      const character = getCharacter(db, id)
      if (!character) continue
      const fields = normalizeCharacterPayload(character, setupData, featData)
      db.run(
        `UPDATE characters SET
          abilities=?, speed=?, initiative_bonus=?, saving_throw_proficiencies=?, stats_normalized=1
        WHERE id=?`,
        [
          JSON.stringify(fields.abilities),
          fields.speed,
          fields.initiativeBonus,
          JSON.stringify(fields.savingThrowProficiencies),
          id,
        ],
      )
    }
    db.run('COMMIT')
  } catch (err) {
    db.run('ROLLBACK')
    throw err
  }
  return true
}
