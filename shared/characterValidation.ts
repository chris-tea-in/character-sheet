// Shared, dependency-free character validation.
//
// Imported by BOTH sides of the sync boundary:
//   • the browser client — src/lib/importExport.ts (import gate),
//     src/store/sync.ts (adopt-over-local gate, H5);
//   • the Cloudflare Pages Functions — functions/api/characters/[id].ts
//     (server-side PUT gate, H2).
//
// It therefore MUST stay free of any browser- or node-only imports, and must be
// reachable by relative path from both tsconfigs (added to tsconfig.app.json's
// include; pulled into functions/tsconfig.json's program via its import).
//
// Scope: this checks only the small, STABLE set of REQUIRED fields — enough to
// prove a blob is a real character and not a corrupt/gutted one. It deliberately
// does NOT gate optional/additive fields (notes, flaws, campaignId,
// toolProficiencies, …): those are defaulted by normalizeNewCharacter at render
// time, so an older or partial-but-legitimate record still loads. Keeping the
// required set small is what lets the schema keep evolving without this validator
// rejecting valid old data. Validation catches corruption; the conflict prompt
// (H6) catches valid-but-unwanted.

const REQUIRED_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

export type ValidationResult = { ok: true } | { ok: false; reason: string }

export function validateCharacter(c: unknown): ValidationResult {
  if (!c || typeof c !== 'object' || Array.isArray(c))
    return { ok: false, reason: 'not an object' }
  const o = c as Record<string, unknown>

  if (typeof o.name !== 'string')
    return { ok: false, reason: 'name missing or not a string' }

  if (typeof o.level !== 'number' || !Number.isFinite(o.level) || o.level < 1)
    return { ok: false, reason: 'level missing or < 1' }

  if (typeof o.maxHp !== 'number' || !Number.isFinite(o.maxHp) || o.maxHp < 0)
    return { ok: false, reason: 'maxHp missing or < 0' }

  const ab = o.abilities
  if (!ab || typeof ab !== 'object' || Array.isArray(ab))
    return { ok: false, reason: 'abilities missing or not an object' }
  const abilities = ab as Record<string, unknown>
  for (const key of REQUIRED_ABILITIES) {
    const score = abilities[key]
    if (typeof score !== 'number' || !Number.isFinite(score))
      return { ok: false, reason: `ability score "${key}" missing or not a number` }
  }

  // classes[] is the source of truth (INV-3); a bare legacy `class` string is the
  // fallback for very old records. One of the two must be present.
  if (!Array.isArray(o.classes) && typeof o.class !== 'string')
    return { ok: false, reason: 'no classes[] array and no legacy class string' }

  if (!Array.isArray(o.equipment))
    return { ok: false, reason: 'equipment is not an array' }

  // spells must be an array, and every entry must carry a string slug — a gutted
  // blob commonly drops this shape.
  if (!Array.isArray(o.spells))
    return { ok: false, reason: 'spells is not an array' }
  for (const s of o.spells as unknown[]) {
    if (!s || typeof s !== 'object' || typeof (s as Record<string, unknown>).slug !== 'string')
      return { ok: false, reason: 'a spell entry is missing a string slug' }
  }

  return { ok: true } // optional/additive fields are intentionally NOT gated
}
