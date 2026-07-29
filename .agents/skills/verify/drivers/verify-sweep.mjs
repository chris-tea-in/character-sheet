// Class-abilities full-sweep verification (third tranche) — checks the Spells
// tab's Class Abilities section per class.
import { chromium } from 'file:///C:/Users/buyp1/Workspace/dnd-character-sheet/node_modules/playwright/index.mjs'

const SCRATCH = 'C:/Users/buyp1/AppData/Local/Temp/claude/c--Users-buyp1-Workspace-dnd-character-sheet/0b760faa-f2f6-4255-9f37-2af7647ee9ad/scratchpad'
const SHOT = (n) => `${SCRATCH}/shots/${n}.png`
const results = []
function step(ok, label, detail = '') {
  results.push(`${ok ? 'OK ' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`)
  console.log(results[results.length - 1])
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1600 } })
page.setDefaultTimeout(12000)

async function importChar(file, name) {
  await page.goto('http://localhost:5173/')
  try {
    const gotIt = page.getByRole('button', { name: 'Got it' })
    await gotIt.waitFor({ timeout: 2500 })
    await gotIt.click()
  } catch { /* once */ }
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(`${SCRATCH}/${file}`)
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await page.getByText(name).first().click()
  await page.waitForURL('**/character/**')
  await page.getByRole('tab', { name: 'Spells' }).click()
  await page.getByText('Class Abilities').first().waitFor()
}

const abilitiesBox = () =>
  page.locator('#sheet-panel-spells div.rounded-lg').filter({ hasText: 'Class Abilities' }).last()

try {
  // Paladin: Divine Sense (counted) AND Divine Smite (informational) both listed
  await importChar('verify-epaladin.json', 'Verify EPaladin')
  let text = (await abilitiesBox().textContent() ?? '')
  step(/Divine Sense/.test(text), 'paladin: Divine Sense listed')
  step(/Divine Smite/.test(text), 'paladin: Divine Smite listed (informational, no counter)')
  step(/Lay on Hands/.test(text) && /Channel Divinity/.test(text), 'paladin: earlier entries intact')
  const smiteRow = abilitiesBox().locator('div.py-2').filter({ hasText: 'Divine Smite' }).first()
  await smiteRow.getByRole('button', { name: 'Divine Smite' }).click()
  await smiteRow.getByText(/expend one spell slot|smite/i).first().waitFor()
  step(true, 'paladin: Divine Smite expands with its description')
  await page.screenshot({ path: SHOT('s1-paladin-sweep'), fullPage: false })

  // Rogue 5: Sneak Attack (other), Cunning Action (BA), Uncanny Dodge (reaction)
  await importChar('verify-rogue.json', 'Verify Rogue')
  text = (await abilitiesBox().textContent() ?? '')
  step(/Sneak Attack/.test(text), 'rogue 5: Sneak Attack listed')
  step(/Cunning Action/.test(text), 'rogue 5: Cunning Action listed')
  step(/Uncanny Dodge/.test(text), 'rogue 5: Uncanny Dodge listed')
  step(!/Stroke of Luck/.test(text), 'rogue 5: Stroke of Luck gated until 20')
  const cunning = abilitiesBox().locator('div.py-2').filter({ hasText: 'Cunning Action' }).first()
  step(await cunning.locator('span[title="Bonus action"]').count() === 1, 'rogue: Cunning Action has BA badge')

  // Monk 3: Deflect Missiles (reaction) now; Stunning Strike gated until 5
  await importChar('verify-monk.json', 'Verify Monk')
  text = (await abilitiesBox().textContent() ?? '')
  step(/Deflect Missiles/.test(text), 'monk 3: Deflect Missiles listed')
  step(!/Stunning Strike/.test(text), 'monk 3: Stunning Strike gated until 5')

  // Wizard 1: Arcane Recovery
  const fs = await import('fs')
  const base = JSON.parse(fs.readFileSync(`${SCRATCH}/verify-bard.json`, 'utf8'))
  base.character.name = 'Verify Wizard'
  base.character.class = 'wizard'
  base.character.level = 2
  base.character.classes = [{ classSlug: 'wizard', subclassSlug: 'divination', level: 2 }]
  base.character.skillProficiencies = {}
  fs.writeFileSync(`${SCRATCH}/verify-wizard.json`, JSON.stringify(base, null, 2))
  await importChar('verify-wizard.json', 'Verify Wizard')
  text = (await abilitiesBox().textContent() ?? '')
  step(/Arcane Recovery/.test(text), 'wizard: Arcane Recovery listed')
  step(/Portent/.test(text) && /2\/2/.test(text), 'diviner 2: Portent listed with 2 dice (subclass-gated)')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('s9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
