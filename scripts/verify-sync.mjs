// One-off runtime verification for the cloud-sync-hardening change.
// Run A: seed a DB stamped at schema_version 10 → the app must migrate it
//        through v11..v14 (incl. the new last_synced_updated_at column and
//        character_backups table) and render the seeded character.
// Run B: seed a v14 DB with a pre-existing backup row → drive the H7 Restore UI
//        end-to-end (which also exercises the rewritten update()/sync write path).
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'
import initSqlJs from 'sql.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'verify-shots')
const BASE = process.env.BASE_URL || 'http://localhost:4173'
const CHAR_ID = 'seed-mira-0000-0000-0000-000000000001'
mkdirSync(OUT, { recursive: true })

const now = Date.now()
const equipment = [
  { id: 'eq1', name: 'Quarterstaff', quantity: 1, displayCategory: 'weapon' },
  { id: 'eq3', name: 'Spellbook', quantity: 1, displayCategory: 'item' },
]
// Full NewCharacter used for the backup-row JSON (Run B). Mirrors the inserted
// row but with an obvious marker so a successful restore is visible.
const miraBackup = {
  name: 'Mira OLD BACKUP', race: 'elf', subrace: null, class: 'wizard', subclass: 'evocation',
  background: 'sage', level: 5, classes: [{ classSlug: 'wizard', subclassSlug: 'evocation', level: 5 }],
  xp: 0, progressionType: 'milestone', alignment: 'Neutral Good',
  languages: ['Common', 'Elvish'], backstory: 'snapshot',
  abilities: { str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 }, raceAsiChoices: [],
  maxHp: 32, currentHp: 3, tempHp: 0, armorClass: 12, speed: 30, initiativeBonus: 0, spellBonusModifier: 0,
  deathSaves: { successes: 0, failures: 0 }, hitDiceUsed: 1, hitDiceUsedByClass: {}, inspiration: false,
  skillProficiencies: { arcana: 'proficient' }, savingThrowProficiencies: ['int', 'wis'],
  spells: [{ slug: 'fire-bolt', prepared: true }], spellSlotsUsed: { 1: 1 },
  personalityTraits: '', ideals: '', bonds: '', flaws: '', notes: '',
  equipment, currency: { cp: 0, sp: 4, ep: 0, gp: 85, pp: 1 },
  feats: [], featChoices: {}, toolProficiencies: [],
  campaignId: null, disguiseClass: false, disguiseAs: '',
}

async function makeBlob({ version, withBackup }) {
  const SQL = await initSqlJs({ locateFile: () => join(ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm') })
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')
  // Schema as of migrations 1–10 (copied from scripts/mobile-shots.mjs).
  db.run(`CREATE TABLE characters (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    race_slug TEXT NOT NULL DEFAULT '', subrace TEXT,
    class_slug TEXT NOT NULL DEFAULT '', subclass TEXT,
    background_slug TEXT NOT NULL DEFAULT '',
    level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0,
    alignment TEXT NOT NULL DEFAULT '',
    abilities TEXT NOT NULL DEFAULT '{"str":10,"dex":10,"con":10,"int":10,"wis":10,"cha":10}',
    max_hp INTEGER NOT NULL DEFAULT 0, current_hp INTEGER NOT NULL DEFAULT 0, temp_hp INTEGER NOT NULL DEFAULT 0,
    armor_class INTEGER NOT NULL DEFAULT 10, speed INTEGER NOT NULL DEFAULT 30,
    death_saves TEXT NOT NULL DEFAULT '{"successes":0,"failures":0}',
    hit_dice_used INTEGER NOT NULL DEFAULT 0, inspiration INTEGER NOT NULL DEFAULT 0,
    skill_proficiencies TEXT NOT NULL DEFAULT '{}',
    saving_throw_proficiencies TEXT NOT NULL DEFAULT '[]',
    spell_slots_used TEXT NOT NULL DEFAULT '{}',
    personality_traits TEXT NOT NULL DEFAULT '', ideals TEXT NOT NULL DEFAULT '',
    bonds TEXT NOT NULL DEFAULT '', flaws TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
    equipment TEXT NOT NULL DEFAULT '[]',
    currency TEXT NOT NULL DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    progression_type TEXT NOT NULL DEFAULT 'milestone',
    languages TEXT NOT NULL DEFAULT '[]', backstory TEXT NOT NULL DEFAULT '',
    feats TEXT NOT NULL DEFAULT '[]', tool_proficiencies TEXT NOT NULL DEFAULT '[]',
    feat_choices TEXT NOT NULL DEFAULT '{}', initiative_bonus INTEGER NOT NULL DEFAULT 0,
    classes TEXT NOT NULL DEFAULT '[]', spell_bonus_modifier INTEGER NOT NULL DEFAULT 0,
    race_asi_choices TEXT NOT NULL DEFAULT '[]', stats_normalized INTEGER NOT NULL DEFAULT 0,
    hit_dice_used_by_class TEXT NOT NULL DEFAULT '{}'
  )`)
  db.run(`CREATE TABLE character_spells (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    spell_slug TEXT NOT NULL, prepared INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id, spell_slug)
  )`)
  db.run(`CREATE INDEX idx_character_spells_char ON character_spells(character_id)`)

  // For a v14 seed, hand-apply the v11..v14 schema so the runner is a no-op.
  if (version >= 14) {
    db.run(`ALTER TABLE characters ADD COLUMN campaign_id TEXT`)
    db.run(`ALTER TABLE characters ADD COLUMN disguise_class INTEGER NOT NULL DEFAULT 0`)
    db.run(`ALTER TABLE characters ADD COLUMN disguise_as TEXT NOT NULL DEFAULT ''`)
    db.run(`ALTER TABLE characters ADD COLUMN last_synced_updated_at INTEGER NOT NULL DEFAULT 0`)
    db.run(`CREATE TABLE character_backups (
      id TEXT PRIMARY KEY, character_id TEXT NOT NULL, data TEXT NOT NULL,
      updated_at INTEGER NOT NULL, backed_up_at INTEGER NOT NULL
    )`)
    db.run(`CREATE INDEX idx_character_backups_char ON character_backups(character_id, backed_up_at)`)
  }

  db.run(`CREATE TABLE schema_version (version INTEGER NOT NULL DEFAULT 0)`)
  db.run(`INSERT INTO schema_version (version) VALUES (?)`, [version])

  // Insert the character using only the v1..10 columns; later columns default.
  db.run(
    `INSERT INTO characters (
      id, name, race_slug, subrace, class_slug, subclass, background_slug,
      level, xp, progression_type, alignment, languages, backstory,
      abilities, max_hp, current_hp, temp_hp,
      armor_class, speed, initiative_bonus, spell_bonus_modifier, death_saves, hit_dice_used, inspiration,
      skill_proficiencies, saving_throw_proficiencies, spell_slots_used,
      personality_traits, ideals, bonds, flaws, notes,
      equipment, currency, feats, feat_choices, tool_proficiencies, classes,
      race_asi_choices, hit_dice_used_by_class, stats_normalized, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      CHAR_ID, 'Mira Tealeaf', 'elf', null, 'wizard', 'evocation', 'sage',
      5, 0, 'milestone', 'Neutral Good', JSON.stringify(['Common', 'Elvish']),
      'A curious scholar.', JSON.stringify({ str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 }),
      32, 27, 0, 12, 30, 0, 0, JSON.stringify({ successes: 0, failures: 0 }), 1, 0,
      JSON.stringify({ arcana: 'proficient' }), JSON.stringify(['int', 'wis']),
      JSON.stringify({ 1: 1 }), '', '', '', '', '',
      JSON.stringify(equipment), JSON.stringify({ cp: 0, sp: 4, ep: 0, gp: 85, pp: 1 }),
      JSON.stringify([]), JSON.stringify({}), JSON.stringify([]),
      JSON.stringify([{ classSlug: 'wizard', subclassSlug: 'evocation', level: 5 }]),
      JSON.stringify([]), JSON.stringify({}), 1, now, now,
    ],
  )
  db.run('INSERT INTO character_spells (character_id, spell_slug, prepared) VALUES (?,?,?)', [CHAR_ID, 'fire-bolt', 1])

  if (withBackup) {
    db.run(
      `INSERT INTO character_backups (id, character_id, data, updated_at, backed_up_at) VALUES (?,?,?,?,?)`,
      ['bk-0001', CHAR_ID, JSON.stringify(miraBackup), now - 60000, now - 60000],
    )
  }
  const bytes = db.export()
  db.close()
  return Array.from(bytes)
}

async function seedAndLoad(context, blob) {
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()) })
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.evaluate(async (bytes) => {
    const data = new Uint8Array(bytes)
    await new Promise((resolve, reject) => {
      const open = indexedDB.open('dnd-character-sheet', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('app-db')
      open.onsuccess = () => {
        const tx = open.result.transaction('app-db', 'readwrite')
        tx.objectStore('app-db').put(data, 'main')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }
      open.onerror = () => reject(open.error)
    })
  }, blob)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  return { page, errors }
}

async function main() {
  const browser = await chromium.launch()

  // ── Run A: v10 seed → migrate to v14 on a populated DB ──────────────────────
  console.log('\n=== Run A: migrate v10 → v14 (populated DB) ===')
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' })
    const { page, errors } = await seedAndLoad(ctx, await makeBlob({ version: 10, withBackup: false }))
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const miraVisible = await page.getByText('Mira Tealeaf').first().isVisible().catch(() => false)
    await page.screenshot({ path: join(OUT, 'A1-list-after-migrate.png'), fullPage: true })
    // Dismiss the "What's New" modal (it aria-hides the page behind it).
    await page.getByRole('button', { name: /Got it/i }).click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(300)
    // Open the Data dialog (no Restore expected — backups table is empty).
    await page.getByRole('button', { name: /^Data$/ }).first().click({ timeout: 8000 })
    await page.waitForTimeout(400)
    const restoreCountA = await page.getByRole('button', { name: /Restore/ }).count()
    await page.screenshot({ path: join(OUT, 'A2-data-dialog.png'), fullPage: true })
    console.log('  Mira renders after migration:', miraVisible)
    console.log('  Restore buttons in dialog (expect 0):', restoreCountA)
    console.log('  page errors:', errors.length ? errors : 'none')
    await ctx.close()
  }

  // ── Run B: v14 seed + backup row → drive the Restore UI ─────────────────────
  console.log('\n=== Run B: H7 Restore UI (v14 + backup row) ===')
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' })
    const { page, errors } = await seedAndLoad(ctx, await makeBlob({ version: 14, withBackup: true }))
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: /Got it/i }).click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, 'B0-list.png'), fullPage: true })
    await page.getByRole('button', { name: /^Data$/ }).first().click({ timeout: 8000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, 'B1-data-with-restore.png'), fullPage: true })
    const restoreBtn = page.getByRole('button', { name: /Restore/ }).first()
    const hasRestore = await restoreBtn.count()
    console.log('  Restore button visible (expect >=1):', hasRestore)
    if (hasRestore) {
      await restoreBtn.click()
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(OUT, 'B2-restore-view.png'), fullPage: true })
      // Click the snapshot's Restore (the inner list button).
      const snapBtn = page.getByRole('button', { name: /^Restore$/ }).last()
      await snapBtn.click()
      await page.waitForTimeout(800)
      await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      const restored = await page.getByText('Mira OLD BACKUP').first().isVisible().catch(() => false)
      await page.screenshot({ path: join(OUT, 'B3-after-restore.png'), fullPage: true })
      console.log('  Character renamed to backup ("Mira OLD BACKUP") after restore:', restored)
    }
    console.log('  page errors:', errors.length ? errors : 'none')
    await ctx.close()
  }

  await browser.close()
  console.log('\nDone. Shots in', OUT)
}
main().catch((e) => { console.error(e); process.exit(1) })
