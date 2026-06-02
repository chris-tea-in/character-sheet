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

export function loadSetupData(): Promise<SetupData> {
  setupCache ??= Promise.all([
    fetchJson<Record<string, Race>>('/data/races.json'),
    fetchJson<Record<string, ClassData>>('/data/classes.json'),
    fetchJson<Record<string, SubclassData>>('/data/subclasses.json'),
    fetchJson<Record<string, Background>>('/data/backgrounds.json'),
  ]).then(([races, classes, subclasses, backgrounds]) => ({ races, classes, subclasses, backgrounds }))
  return setupCache
}

export function loadFeatsData(): Promise<Record<string, FeatData>> {
  featsCache ??= fetchJson<Record<string, FeatData>>('/data/feats.json')
  return featsCache
}

export function loadSpellsData(): Promise<Record<string, SpellData>> {
  spellsCache ??= fetchJson<Record<string, SpellData>>('/data/spells.json')
  return spellsCache
}

export function loadEquipmentData(): Promise<EquipmentData> {
  equipmentCache ??= fetchJson<EquipmentData>('/data/equipment.json')
  return equipmentCache
}
