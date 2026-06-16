// Mobile UX screenshot harness.
//
// Captures the four in-scope surfaces (list page, creation wizard, character
// sheet, dice tray + modals) at a 375px phone viewport so we can review and
// iterate on mobile UX.
//
// It seeds a fully-migrated SQLite blob directly into IndexedDB (rather than
// driving the equipment picker flow) so the character sheet renders populated
// and deterministically. Run with the dev server already up:
//
//   npm run dev          # in one shell (note the port it prints)
//   BASE_URL=http://localhost:5174 npm run shots
//
// Screenshots land in mobile-shots/ (gitignored).

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'
import initSqlJs from 'sql.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const OUT = join(ROOT, 'mobile-shots')
const BASE_URL = process.env.BASE_URL || 'http://localhost:5174'
const CHAR_ID = 'seed-mira-0000-0000-0000-000000000001'
const VW = Number(process.env.WIDTH || 375) // viewport width; 320 = smallest common phone

mkdirSync(OUT, { recursive: true })

// ---------------------------------------------------------------------------
// Build a fully-migrated SQLite blob with one rich character.
// ---------------------------------------------------------------------------
async function buildSeedBlob() {
  const SQL = await initSqlJs({
    locateFile: () => join(ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
  })
  const db = new SQL.Database()
  db.run('PRAGMA foreign_keys = ON')

  // Final schema (state after migrations 1–10).
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
  db.run(`CREATE TABLE schema_version (version INTEGER NOT NULL DEFAULT 0)`)
  db.run(`INSERT INTO schema_version (version) VALUES (10)`)

  const now = Date.now()
  const equipment = [
    { id: 'eq1', name: 'Quarterstaff', quantity: 1, displayCategory: 'weapon' },
    { id: 'eq2', name: 'Dagger', quantity: 2, displayCategory: 'weapon' },
    { id: 'eq3', name: 'Spellbook', quantity: 1, displayCategory: 'item' },
    { id: 'eq4', name: 'Component Pouch', quantity: 1, displayCategory: 'item' },
    { id: 'eq5', name: 'Potion of Healing', quantity: 3, displayCategory: 'item' },
    { id: 'eq6', name: "Explorer's Pack", quantity: 1, displayCategory: 'item' },
  ]
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
      5, 0, 'milestone', 'Neutral Good', JSON.stringify(['Common', 'Elvish', 'Draconic']),
      'A curious scholar who left the academy to chase forbidden lore.',
      JSON.stringify({ str: 8, dex: 14, con: 14, int: 15, wis: 12, cha: 10 }),
      32, 27, 0, 12, 30, 0, 0, JSON.stringify({ successes: 0, failures: 0 }), 1, 0,
      JSON.stringify({ Arcana: 'proficient', History: 'proficient', Investigation: 'expertise', Perception: 'proficient' }),
      JSON.stringify(['int', 'wis']),
      JSON.stringify({ 1: 1, 2: 0, 3: 0 }),
      'I am eternally curious about how things work.', 'Knowledge is the path to power and self-improvement.',
      'I work to preserve a library that holds the world’s knowledge.', 'I overlook obvious solutions in favor of complicated ones.',
      'Notes go here.',
      JSON.stringify(equipment),
      JSON.stringify({ cp: 0, sp: 4, ep: 0, gp: 85, pp: 1 }),
      JSON.stringify([]), JSON.stringify({}), JSON.stringify(['Alchemist’s Supplies']),
      JSON.stringify([{ classSlug: 'wizard', subclassSlug: 'evocation', level: 5 }]),
      JSON.stringify([]), JSON.stringify({}), 1, now, now,
    ],
  )

  const spells = [
    ['fire-bolt', 1], ['mage-hand', 1], ['prestidigitation', 1],
    ['magic-missile', 1], ['shield', 1], ['mage-armor', 1],
    ['misty-step', 1], ['scorching-ray', 1],
    ['fireball', 1], ['counterspell', 0],
  ]
  for (const [slug, prepared] of spells) {
    db.run('INSERT INTO character_spells (character_id, spell_slug, prepared) VALUES (?,?,?)', [CHAR_ID, slug, prepared])
  }

  const bytes = db.export()
  db.close()
  return Array.from(bytes) // plain array survives Playwright serialization
}

// ---------------------------------------------------------------------------
// Screenshot run
// ---------------------------------------------------------------------------
async function shoot(page, name) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true })
  console.log('  shot:', name)
}

async function safe(label, fn) {
  try { await fn() } catch (err) { console.warn(`  ! ${label}:`, err.message) }
}

// Objective check: any horizontal scroll means content overflows the 375px viewport.
async function checkOverflow(page, label) {
  const o = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    offenders: [...document.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 40)}`),
  }))
  const overflow = o.scroll - o.client
  console.log(`  [overflow] ${label}: ${overflow > 0 ? `+${overflow}px` : 'none'}${o.offenders.length ? ' :: ' + o.offenders.join(' | ') : ''}`)
}

async function main() {
  console.log('Building seed DB blob…')
  const seed = await buildSeedBlob()

  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: VW, height: 812 }, // iPhone SE / 12 mini class
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.warn('  [pageerror]', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.warn('  [console.error]', m.text()) })

  console.log('Seeding IndexedDB at', BASE_URL)
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
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
  }, seed)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  // 1. List page (populated by seed).
  await safe('list', async () => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
    await shoot(page, '01-list')
    await checkOverflow(page, 'list')
  })

  // 2. Character sheet — navigate by clicking the list card (ensures store loaded).
  await safe('sheet', async () => {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' })
    await page.getByText('Mira Tealeaf').first().click({ timeout: 3000 })
    await page.waitForTimeout(800)
    await shoot(page, '02-sheet-full')
    await checkOverflow(page, 'sheet')
    // readable element-level crops of each content block
    for (const [name, rx] of [
      ['combat', /combat|hit points|armor class/i],
      ['equipment', /equipment/i],
      ['spells', /spell/i],
    ]) {
      const sec = page.locator('section', { has: page.getByRole('heading', { name: rx }) }).first()
      if (await sec.count()) {
        await sec.scrollIntoViewIfNeeded()
        await page.waitForTimeout(200)
        await sec.screenshot({ path: join(OUT, `02-block-${name}.png`) })
        console.log(`  shot: 02-block-${name}`)
      }
    }
  })

  // 3. Dice tray (fixed bottom bar) — viewport-only shot so it's visible.
  await safe('dice-tray', async () => {
    await page.screenshot({ path: join(OUT, '03-dice-tray.png'), fullPage: false })
    console.log('  shot: 03-dice-tray')
    // expand roll history
    const hist = page.getByRole('button', { name: /history|last roll/i }).first()
    await hist.click({ timeout: 2000 })
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(OUT, '04-dice-history.png'), fullPage: false })
    console.log('  shot: 04-dice-history')
    await page.keyboard.press('Escape').catch(() => {})
  })

  // 4. Proficiencies tabs (Saves / Skills / Tools).
  await safe('prof-tabs', async () => {
    const profSec = page.locator('section').filter({ hasText: /skills|saving|proficien/i }).first()
    for (const tab of ['Skills', 'Saves', 'Tools']) {
      const t = page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') }).first()
      if (await t.count()) {
        await t.click({ timeout: 1500 })
        await page.waitForTimeout(250)
        if (await profSec.count()) {
          await profSec.scrollIntoViewIfNeeded()
          await profSec.screenshot({ path: join(OUT, `05-prof-${tab.toLowerCase()}.png`) })
          console.log(`  shot: 05-prof-${tab.toLowerCase()}`)
        }
      }
    }
  })

  // 5. A weapon attack roll modal (two-phase DiceRollModal).
  await safe('attack-modal', async () => {
    const rollBtn = page.getByRole('button', { name: /^roll$/i }).first()
    if (await rollBtn.count()) {
      await rollBtn.click({ timeout: 2000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(OUT, '06-attack-modal.png'), fullPage: false })
      console.log('  shot: 06-attack-modal')
      await page.keyboard.press('Escape').catch(() => {})
    }
  })

  // 6. Creation wizard — screen 1 empty + a selection modal open.
  await safe('wizard', async () => {
    await page.goto(`${BASE_URL}/create`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    await shoot(page, '07-wizard-step1')
    await checkOverflow(page, 'wizard')
    // open a picker (race/class) to capture the SelectionList modal on mobile
    const picker = page.getByRole('button', { name: /choose|select/i }).first()
    if (await picker.count()) {
      await picker.click({ timeout: 2000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(OUT, '08-wizard-picker.png'), fullPage: false })
      console.log('  shot: 08-wizard-picker')
      await page.keyboard.press('Escape').catch(() => {})
    }
  })

  await browser.close()
  console.log('Done. Screenshots in', OUT)
}

main().catch((err) => { console.error(err); process.exit(1) })
