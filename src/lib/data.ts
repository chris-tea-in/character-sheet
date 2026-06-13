import type { Race, ClassData, SubclassData, Background, FeatData, SpellData, EquipmentData } from '@/types/data'

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export interface SetupData {
  races: Record<string, Race>
  classes: Record<string, ClassData>
  subclasses: Record<string, SubclassData>
  backgrounds: Record<string, Background>
}

let setupCache: Promise<SetupData> | null = null
let featsCache: Promise<Record<string, FeatData>> | null = null
let spellsCache: Promise<Record<string, SpellData>> | null = null
let equipmentCache: Promise<EquipmentData> | null = null

// Cache the result promise, but evict it on rejection so a later call can retry
// instead of replaying a stale failure forever (BUG-26 — e.g. an offline blip
// before the service worker has cached /data, or a 401 from an auth gate).
function memoize<T>(get: () => Promise<T>, set: (p: Promise<T> | null) => void): Promise<T> {
  const p = get().catch(err => { set(null); throw err })
  set(p)
  return p
}

export function loadSetupData(): Promise<SetupData> {
  return setupCache ??= memoize(
    () => Promise.all([
      fetchJson<Record<string, Race>>('/data/races.json'),
      fetchJson<Record<string, ClassData>>('/data/classes.json'),
      fetchJson<Record<string, SubclassData>>('/data/subclasses.json'),
      fetchJson<Record<string, Background>>('/data/backgrounds.json'),
    ]).then(([races, classes, subclasses, backgrounds]) => ({ races, classes, subclasses, backgrounds })),
    p => { setupCache = p },
  )
}

export function loadFeatsData(): Promise<Record<string, FeatData>> {
  return featsCache ??= memoize(
    () => fetchJson<Record<string, FeatData>>('/data/feats.json'),
    p => { featsCache = p },
  )
}

export function loadSpellsData(): Promise<Record<string, SpellData>> {
  return spellsCache ??= memoize(
    () => fetchJson<Record<string, SpellData>>('/data/spells.json'),
    p => { spellsCache = p },
  )
}

export function loadEquipmentData(): Promise<EquipmentData> {
  return equipmentCache ??= memoize(
    () => fetchJson<EquipmentData>('/data/equipment.json'),
    p => { equipmentCache = p },
  )
}
