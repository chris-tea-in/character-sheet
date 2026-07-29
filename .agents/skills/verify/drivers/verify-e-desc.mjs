// Combat tab description expansion — tap spell/ability/action names to read them.
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
const page = await browser.newPage({ viewport: { width: 900, height: 1500 } })
page.setDefaultTimeout(12000)

const sectionCard = (title) =>
  page.locator('div.rounded-lg').filter({ has: page.locator(`p:text-is("${title}")`) }).last()
const rowIn = (card, text) => card.locator('div.py-1\\.5').filter({ hasText: text }).first()

try {
  await page.goto('http://localhost:5173/')
  try {
    const gotIt = page.getByRole('button', { name: 'Got it' })
    await gotIt.waitFor({ timeout: 2500 })
    await gotIt.click()
  } catch { /* once per profile */ }
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(`${SCRATCH}/verify-epaladin.json`)
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await page.getByText('Verify EPaladin').first().click()
  await page.waitForURL('**/character/**')
  await page.getByText('Your Turn').first().waitFor()

  const actionCard = sectionCard('Action')

  // Spell description: tap Guiding Bolt's name → range/duration/components + text
  const gb = rowIn(actionCard, 'Guiding Bolt')
  await gb.getByRole('button', { name: 'Guiding Bolt' }).click()
  await gb.getByText('Range:').waitFor()
  const gbText = (await gb.textContent() ?? '')
  step(/Duration:/.test(gbText) && /Components:/.test(gbText) && /radiant damage/i.test(gbText),
    'spell: Guiding Bolt expands with range/duration/components + description')
  step(/next attack roll/i.test(gbText) || /advantage/i.test(gbText), 'spell: full rules text present', gbText.slice(120, 200))

  // Toggling another row closes the first (one open at a time)
  const loh = rowIn(actionCard, 'Lay on Hands')
  await loh.getByRole('button', { name: 'Lay on Hands' }).click()
  await loh.getByText(/pool of healing/i).waitFor()
  step(true, 'ability: Lay on Hands expands with its authored description')
  step(!/Duration:/.test(await gb.textContent() ?? ''), 'one description open at a time (Guiding Bolt closed)')
  await page.screenshot({ path: SHOT('ed1-descriptions'), fullPage: false })

  // Generic action: Dash
  const dash = rowIn(actionCard, 'Dash')
  await dash.getByRole('button', { name: 'Dash' }).click()
  await dash.getByText(/extra movement/i).waitFor()
  step(true, 'generic: Dash expands with its SRD text')

  // Second tap closes
  await dash.getByRole('button', { name: 'Dash' }).click()
  await page.waitForTimeout(200)
  step(!/extra movement/i.test(await dash.textContent() ?? ''), 'second tap collapses the description')

  // Channel Divinity in the No Action section
  const other = sectionCard('No Action / Special')
  const cd = rowIn(other, 'Channel Divinity')
  await cd.getByRole('button', { name: 'Channel Divinity' }).click()
  await cd.getByText(/channel divine energy/i).waitFor()
  step(true, 'other-section ability: Channel Divinity expands (paladin description)')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('ed9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
