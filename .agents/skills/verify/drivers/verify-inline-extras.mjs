// Damage-modal inline extra-damage presets: ≤3 shown up front, More(N) when
// there are extras beyond 3, Custom always reachable.
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
}

async function openDamageModal() {
  await page.getByRole('tab', { name: 'Combat' }).click()
  await page.getByText('Your Turn').first().waitFor()
  // Skip the Loadout card's Longsword row (no Dmg button) — take the action row.
  await page.locator('#sheet-panel-combat div.py-1\\.5').filter({ hasText: 'Longsword' })
    .filter({ has: page.getByRole('button', { name: 'Dmg' }) }).first()
    .getByRole('button', { name: 'Dmg' }).click()
  const dlg = page.getByRole('dialog').filter({ hasText: 'Damage' }).first()
  // The Dmg dispatch lands on the damage-setup step; the picker renders after rolling.
  await dlg.getByRole('button', { name: 'Roll Damage' }).click()
  return dlg
}

try {
  // Rogue with 4 detected damage extras → 3 inline chips + More (1)
  await importChar('verify-xrogue.json', 'Verify XRogue')
  let dlg = await openDamageModal()
  await dlg.getByRole('button', { name: /Sneak Attack/ }).waitFor()
  step(true, 'rogue: Sneak Attack chip shown inline (no Extra damage click needed)')
  step(await dlg.getByRole('button', { name: /Hunter's Mark/ }).count() === 1, "rogue: Hunter's Mark chip inline")
  step(await dlg.getByRole('button', { name: /^Hex/ }).count() === 1, 'rogue: Hex chip inline')
  step(await dlg.getByRole('button', { name: /Divine Favor/ }).count() === 0, 'rogue: 4th preset NOT inline')
  await dlg.getByRole('button', { name: 'More (1)' }).waitFor()
  step(true, 'rogue: More (1) button offered for the remaining preset')
  await page.screenshot({ path: SHOT('x1-inline-chips'), fullPage: false })

  // Tapping an inline chip adds the rolled extra immediately
  await dlg.getByRole('button', { name: /Sneak Attack/ }).click()
  await dlg.getByText(/Sneak Attack \[/).waitFor()
  step(true, 'rogue: tapping the inline chip rolls + itemizes the extra damage')

  // More opens the full panel: 4th preset + Custom bonus
  await dlg.getByRole('button', { name: 'More (1)' }).click()
  await dlg.getByRole('button', { name: /Divine Favor/ }).waitFor()
  step(true, 'More: full panel lists the remaining preset')
  await dlg.getByRole('button', { name: 'Custom bonus' }).click()
  await dlg.getByRole('button', { name: 'Add roll' }).waitFor()
  step(true, 'More: Custom bonus entry still available')
  await page.screenshot({ path: SHOT('x2-more-panel'), fullPage: false })
  await page.keyboard.press('Escape')

  // Paladin: 1 detected preset → inline chip + a Custom button (no More)
  await importChar('verify-epaladin.json', 'Verify EPaladin')
  dlg = await openDamageModal()
  await dlg.getByRole('button', { name: /Divine Smite/ }).waitFor()
  step(true, 'paladin: single Divine Smite preset inline')
  step(await dlg.getByRole('button', { name: /^More/ }).count() === 0, 'paladin: no More button when nothing is hidden')
  await dlg.getByRole('button', { name: 'Custom', exact: true }).click()
  await dlg.getByRole('button', { name: 'Custom bonus' }).waitFor()
  step(true, 'paladin: Custom button opens the panel with the custom entry')
  await page.keyboard.press('Escape')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('x9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
