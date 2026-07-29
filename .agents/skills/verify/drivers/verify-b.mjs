// Phase B runtime verification — Jack of All Trades + Remarkable Athlete.
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
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } })
page.setDefaultTimeout(12000)

async function importChar(file) {
  await page.goto('http://localhost:5173/')
  try {
    const gotIt = page.getByRole('button', { name: 'Got it' })
    await gotIt.waitFor({ timeout: 3000 })
    await gotIt.click()
  } catch { /* only shows once per profile */ }
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(`${SCRATCH}/${file}`)
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
}

// Reads the modifier text shown on a ProficienciesBlock skill row: the INNERMOST
// div that contains the skill name and a Roll button (rows start with a dot button,
// and every ancestor also matches — .last() = deepest).
async function skillRowMod(name) {
  const row = page.locator('div')
    .filter({ hasText: new RegExp(name) })
    .filter({ has: page.getByRole('button', { name: /^Roll/ }) })
    .last()
  return (await row.textContent() ?? '').trim()
}

try {
  // ── Bard 2 ────────────────────────────────────────────────────────────────
  await importChar('verify-bard.json')
  if (!page.url().includes('/character/')) {
    await page.getByText('Verify Bard').first().click()
    await page.waitForURL('**/character/**')
  }
  await page.getByText('SKILLS', { exact: false }).first().waitFor()

  const athletics = await skillRowMod('Athletics')
  step(/\+1/.test(athletics), 'bard 2: non-proficient Athletics shows +1 (floor PB/2)', athletics.slice(0, 60))
  const deception = await skillRowMod('Deception')
  step(/\+2/.test(deception) && !/\+3/.test(deception), 'bard 2: proficient Deception shows +2 (PB only, no stacking)', deception.slice(0, 60))

  const initPencil = page.getByTitle("What's affecting Initiative?")
  const initText = (await initPencil.locator('..').textContent() ?? '').trim()
  step(/\+1/.test(initText), 'bard 2: Initiative tile shows +1', initText.slice(0, 40))
  // Provenance: the breakdown must list the JoAT row (ledger transparency).
  await initPencil.click()
  const bd = page.getByRole('dialog').filter({ hasText: 'Initiative' })
  await bd.getByText(/Jack of All Trades/).waitFor()
  step(true, 'bard 2: Initiative breakdown lists "Jack of All Trades (half PB)" row')
  await bd.screenshot({ path: SHOT('b1b-initiative-breakdown') })
  await page.keyboard.press('Escape')
  await page.screenshot({ path: SHOT('b1-bard-sheet'), fullPage: false })

  // Raw STR ability check: tap the STR modifier → modal itemizes the JoAT row.
  await page.getByText('Tap modifier to roll ability check').waitFor()
  const strBox = page.locator('div', { hasText: /^STR/ }).filter({ hasText: '+0' }).first()
  await strBox.getByText('+0').first().click()
  const modal = page.getByRole('dialog')
  await modal.getByText(/Jack of All Trades/).waitFor()
  const modalText = (await modal.textContent() ?? '')
  step(/Jack of All Trades/.test(modalText), 'bard 2: raw STR check modal itemizes "Jack of All Trades (half PB) +1"')
  const totalMatch = modalText.match(/Total\s*(-?\d+)/i)
  await modal.screenshot({ path: SHOT('b2-str-check-modal') })
  await page.keyboard.press('Escape')
  step(true, 'modal total captured', totalMatch ? `Total ${totalMatch[1]}` : 'total text layout differs (screenshot)')

  // ── Champion Fighter 7 ────────────────────────────────────────────────────
  await importChar('verify-champion.json')
  if (!page.url().includes('/character/')) {
    await page.getByText('Verify Champion').first().click()
    await page.waitForURL('**/character/**')
  }
  await page.getByText('SKILLS', { exact: false }).first().waitFor()

  const champAth = await skillRowMod('Athletics')
  step(/\+2/.test(champAth), 'champion 7: STR-based Athletics shows +2 (ceil PB/2)', champAth.slice(0, 60))
  const champArcana = await skillRowMod('Arcana')
  step(/\+0/.test(champArcana), 'champion 7: INT-based Arcana unchanged (+0)', champArcana.slice(0, 60))
  const champInit = (await page.getByTitle("What's affecting Initiative?").locator('..').textContent() ?? '').trim()
  step(/\+2/.test(champInit), 'champion 7: Initiative tile shows +2 (DEX check, ceil PB/2)', champInit.slice(0, 40))
  await page.screenshot({ path: SHOT('b3-champion-sheet'), fullPage: false })
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('b9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
