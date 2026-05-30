import type { Race, ClassData, SubclassData, Background, FeatData } from '@/types/data'

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

export async function loadFeatsData(): Promise<Record<string, FeatData>> {
  return fetchJson<Record<string, FeatData>>('/data/feats.json')
}

export async function loadSetupData(): Promise<SetupData> {
  const [races, classes, subclasses, backgrounds] = await Promise.all([
    fetchJson<Record<string, Race>>('/data/races.json'),
    fetchJson<Record<string, ClassData>>('/data/classes.json'),
    fetchJson<Record<string, SubclassData>>('/data/subclasses.json'),
    fetchJson<Record<string, Background>>('/data/backgrounds.json'),
  ])
  return { races, classes, subclasses, backgrounds }
}
