// Run against npm run dev -- --host 127.0.0.1 --port 5177.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import initSqlJs from 'sql.js'
import { mkdir } from 'node:fs/promises'

const SQL = await initSqlJs()
async function savedCharacter(page) {
  const bytes = await page.evaluate(async () => Array.from(await (await import('/src/storage/idb.ts')).loadFromIdb()))
  const db = new SQL.Database(new Uint8Array(bytes))
  try {
    const result = db.exec('SELECT languages, legacy_languages, ledger_overrides, level FROM characters')[0]
    const row = result.values[0]
    const spells = db.exec('SELECT spell_slug, prepared FROM character_spells')[0]
    return { languages: JSON.parse(row[0]), legacyLanguages: JSON.parse(row[1]),
      ledgerOverrides: JSON.parse(row[2]), level: row[3],
      spells: spells.values.map(([slug, prepared]) => ({ slug, prepared: Boolean(prepared) })) }
  } finally { db.close() }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } })
page.setDefaultTimeout(10_000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto('http://127.0.0.1:5177')
  await page.getByRole('button', { name: 'Got it', exact: true }).click()
  const character = await page.evaluate(async () => {
    const { defaultCharacter } = await import('/src/types/character.ts')
    return { ...defaultCharacter('Regression Cleric'), race: 'dwarf', class: 'cleric',
      classes: [{ classSlug: 'cleric', subclassSlug: null, level: 1 }],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 },
      maxHp: 8, currentHp: 8, legacyLanguages: ['Dwarvish', 'Draconic'],
      spells: ['bless', 'cure-wounds', 'guiding-bolt', 'healing-word'].map(slug => ({ slug, prepared: true })) }
  })
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: 'regression.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 2, type: 'dnd-character', character })),
  })
  await page.getByText('Regression Cleric', { exact: true }).first().click()
  await page.waitForURL('**/character/**')
  await page.getByRole('button', { name: 'Dwarvish was granted by a race', exact: true }).click()
  await page.getByRole('button', { name: 'Keep Draconic as learned separately', exact: true }).click()
  const dwarfSource = page.locator('button[title*="tap to disable"]').filter({ hasText: 'Dwarvish' })
  await dwarfSource.click()
  await page.reload()
  await page.getByTitle(/tap to enable/).filter({ hasText: 'Dwarvish' }).waitFor()
  const stored = await savedCharacter(page)
  assert.deepEqual(stored.languages, ['Draconic'])
  assert.deepEqual(stored.legacyLanguages, [])
  assert.ok(stored.ledgerOverrides.disabled.includes('lang:race:Dwarvish'))
  const levelRow = page.getByText('Level', { exact: true }).locator('..')
  await levelRow.getByRole('button', { name: '+', exact: true }).click()
  const classChoice = page.getByRole('dialog').getByRole('button', { name: /Cleric.*Level/s })
  if (await classChoice.count()) await classChoice.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('Spells to Prepare — choose 1', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Roll d8', exact: true }).click()
  await dialog.getByRole('button', { name: 'Choose spell', exact: true }).click()
  await page.getByRole('dialog').last().getByText('Bane', { exact: true }).click()
  await page.getByRole('dialog').last().getByRole('button', { name: /Select|Choose/ }).last().click()
  await page.getByRole('button', { name: 'Level Up!', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.reload()
  await page.getByText('Regression Cleric', { exact: true }).first().waitFor()
  const leveled = await savedCharacter(page)
  assert.equal(leveled.level, 2)
  assert.equal(leveled.spells.find(spell => spell.slug === 'bane').prepared, true)
  assert.equal(leveled.spells.filter(spell => spell.prepared).length, 5)
  assert.deepEqual(errors, [])
  await mkdir('docs/audits', { recursive: true })
  await page.screenshot({ path: 'docs/audits/bugs-108-109-browser.png', fullPage: true })
  console.log('PASS: legacy language choices and disabled racial grant persist; Cleric level-up saves fifth preparation')
} finally { await browser.close() }
