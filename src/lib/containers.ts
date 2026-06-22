import type { Currency, EquipmentItem } from '@/types/character'

// Items that act as storage containers: they get a "View Inventory" button and can
// receive moved items. Bag of Holding & kin are extradimensional general storage;
// quivers store ammunition (arrows). Matched by exact (lowercased) name so a magic
// "Bag of Tricks" or a "+1 sword" never counts as a container.
const CONTAINER_NAMES = new Set<string>([
  'bag of holding',
  "heward's handy haversack",
  'bag of devouring',
  'portable hole',
  'quiver of ehlonna',
  'efficient quiver',
  'quiver',
])

// The subset of containers that can also hold coins (a coin pouch). Quivers hold
// arrows, not money, so they are excluded.
const COIN_CONTAINER_NAMES = new Set<string>([
  'bag of holding',
  "heward's handy haversack",
  'bag of devouring',
  'portable hole',
])

export function isContainerName(name: string): boolean {
  return CONTAINER_NAMES.has(name.trim().toLowerCase())
}

export function isCoinContainer(name: string): boolean {
  return COIN_CONTAINER_NAMES.has(name.trim().toLowerCase())
}

// Shared coin field order + labels (highest denomination first). Used by the main
// Currency block and by a container's coin pouch so they stay in lockstep.
export const COIN_FIELDS: Array<{ key: keyof Currency; label: string }> = [
  { key: 'pp', label: 'PP' },
  { key: 'gp', label: 'GP' },
  { key: 'ep', label: 'EP' },
  { key: 'sp', label: 'SP' },
  { key: 'cp', label: 'CP' },
]

// Total number of coins in a (possibly absent) pouch — for the "N coins" badge.
export function totalCoins(c: Partial<Currency> | undefined): number {
  if (!c) return 0
  return COIN_FIELDS.reduce((sum, { key }) => sum + (c[key] ?? 0), 0)
}

// Items currently stored inside the given container.
export function contentsOf(equipment: EquipmentItem[], containerId: string): EquipmentItem[] {
  return equipment.filter(e => e.containerId === containerId)
}

// Display order for the wondrous-item type groups (rings, instruments, …). Shared
// by the Equipment "Items" picker tabs and a container's grouped inventory view.
export const ITEM_TYPE_ORDER = [
  'Rings', 'Rods', 'Scrolls', 'Staffs', 'Wands',
  'Amulets & Jewelry', 'Bags & Containers', 'Belts',
  'Books & Tomes', 'Cloaks & Robes', 'Footwear',
  'Gloves & Bracers', 'Headwear', 'Instruments',
  'Tattoos', 'Other Wondrous',
] as const

// Classify a wondrous item into a display "type" from its name. Heuristic, name-based
// — the catalog has no structured subtype. Shared by the Items picker and containers.
export function getWondrousItemType(name: string): string {
  const n = name.toLowerCase()
  // \bring\b, not /ring/ — the bare substring matched "devou-ring" so Bag of
  // Devouring was sorted as a Ring (#13). Word boundaries keep "Ring of …" while
  // excluding words that merely contain "ring".
  if (/\bring\b/.test(n) || /signet$/.test(n) || n === 'band of loyalty') return 'Rings'
  if (/staff/.test(n)) return 'Staffs'
  if (n.startsWith('wand') || n === 'spindle of fate' || n === 'radiance') return 'Wands'
  if (/\brod\b/.test(n) || /scepter/.test(n)) return 'Rods'
  if (/scroll/.test(n)) return 'Scrolls'
  if (/tattoo/.test(n)) return 'Tattoos'
  if (/^instrument/.test(n) || /^pipes? of/.test(n) || /lyre/.test(n) || /\bharp\b/.test(n) || /^horn of/.test(n) || /\bdrum\b/.test(n) || /concertina/.test(n)) return 'Instruments'
  if (/^helm/.test(n) || /^hat/.test(n) || /^headband/.test(n) || /^circlet/.test(n) || /^crown/.test(n) || /^cap /.test(n) || /^goggles/.test(n) || /^mask/.test(n) || n === 'dread helm' || /nimbus coronet/.test(n) || n === 'skull helm' || n === 'peregrine mask') return 'Headwear'
  if (/^cloak/.test(n) || /^robe/.test(n) || /^cape/.test(n) || /^mantle/.test(n) || /piwafwi/.test(n) || /shroud/.test(n)) return 'Cloaks & Robes'
  if (/^boots/.test(n) || /^slippers/.test(n) || /^horseshoes/.test(n) || /greaves/.test(n)) return 'Footwear'
  if (/^gauntlets/.test(n) || /^gloves/.test(n) || /^bracers/.test(n) || /^bracelet/.test(n) || /^bracer/.test(n) || /\bclaws\b/.test(n)) return 'Gloves & Bracers'
  if (/^belt/.test(n) || /girdle/.test(n)) return 'Belts'
  if (/^amulet/.test(n) || /^necklace/.test(n) || /^medallion/.test(n) || /^periapt/.test(n) || /^brooch/.test(n) || /^scarab/.test(n) || /^talisman/.test(n) || /^badge/.test(n) || /\binsignia\b/.test(n) || /\bemblem\b/.test(n) || /^charm of/.test(n)) return 'Amulets & Jewelry'
  if (/^bag/.test(n) || /quiver/.test(n) || /haversack/.test(n) || n === 'portable hole' || n === 'chest of preserving') return 'Bags & Containers'
  if (/^tome/.test(n) || /^manual/.test(n) || /^book/.test(n) || /^grimoire/.test(n) || /^libram/.test(n) || /^codex/.test(n) || /compendium/.test(n) || /\barchive\b/.test(n) || /treatise/.test(n) || /manuscript/.test(n) || /primer$/.test(n) || /^atlas/.test(n)) return 'Books & Tomes'
  return 'Other Wondrous'
}
