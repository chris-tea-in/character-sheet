// Phase D runtime verification — top-level sheet tabs + sticky header + print.
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
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
page.setDefaultTimeout(12000)

const panel = (k) => page.locator(`#sheet-panel-${k}`)
const tabBtn = (name) => page.getByRole('tab', { name })

async function visiblePanels() {
  const out = []
  for (const k of ['combat', 'spells', 'character', 'inventory', 'notes']) {
    if (await panel(k).isVisible()) out.push(k)
  }
  return out.join(',')
}

try {
  await page.goto('http://localhost:5173/')
  try {
    const gotIt = page.getByRole('button', { name: 'Got it' })
    await gotIt.waitFor({ timeout: 2500 })
    await gotIt.click()
  } catch { /* once per profile */ }
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(`${SCRATCH}/verify-paladin.json`)
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await page.getByText('Verify Paladin').first().click()
  await page.waitForURL('**/character/**')
  await tabBtn('Combat').waitFor()

  // Default tab + single visible panel
  step(await tabBtn('Combat').getAttribute('aria-selected') === 'true', 'default tab is Combat')
  step(await visiblePanels() === 'combat', 'only the Combat panel is visible', await visiblePanels())
  step(await page.getByRole('tab').count() === 5, 'all five tabs render for a classed character')

  // Switch to Character, flip the sub-tab to Saving Throws
  await tabBtn('Character').click()
  await page.getByText('SKILLS', { exact: false }).first().waitFor()
  step(await visiblePanels() === 'character', 'Character tab shows only its panel', await visiblePanels())
  await page.getByRole('button', { name: 'Saving Throws' }).click()
  await page.getByText('Class saves shown in gold').waitFor()
  step(true, 'ProficienciesBlock sub-tab switches to Saving Throws')

  // Sticky header: scroll deep in the Character tab, header must stay at y=0
  await page.evaluate(() => window.scrollTo(0, 2000))
  await page.waitForTimeout(200)
  const box = await page.locator('header').boundingBox()
  step(!!box && Math.abs(box.y) < 1, 'header stays pinned at the top after scrolling', `y=${box?.y}`)
  step(await tabBtn('Notes').isVisible(), 'tab bar still visible mid-scroll')
  await page.screenshot({ path: SHOT('d1-sticky-header'), fullPage: false })

  // Panels stay mounted: leave Character, come back — sub-tab still on Saving Throws
  await tabBtn('Inventory').click()
  step(await visiblePanels() === 'inventory', 'Inventory tab shows only its panel', await visiblePanels())
  await tabBtn('Character').click()
  step(await page.getByText('Class saves shown in gold').isVisible(),
    'sub-tab state survived the tab round-trip (panel stayed mounted)')

  // Spells tab still hosts class abilities
  await tabBtn('Spells').click()
  await page.getByText('Class Abilities').first().waitFor()
  step(await visiblePanels() === 'spells', 'Spells tab shows slot tracker + class abilities', await visiblePanels())

  // sessionStorage persistence: pick Notes, reload, still on Notes
  await tabBtn('Notes').click()
  await page.reload()
  await tabBtn('Notes').waitFor()
  step(await tabBtn('Notes').getAttribute('aria-selected') === 'true', 'active tab survives a reload (sessionStorage)')
  step(await visiblePanels() === 'notes', 'Notes panel visible after reload', await visiblePanels())

  // Dice tray is a tab-independent sibling
  step(await page.getByRole('button', { name: 'd20' }).isVisible(), 'dice tray visible on the Notes tab')

  // Print: every panel forced visible, tab bar hidden, header static
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(150)
  step(await visiblePanels() === 'combat,spells,character,inventory,notes',
    'print media shows ALL panels', await visiblePanels())
  const savesVisible = await page.getByText('Class saves shown in gold').isVisible()
  const skillsVisible = await page.getByText('P = prof · E = expertise', { exact: false }).isVisible()
  step(savesVisible && skillsVisible, 'print shows BOTH ProficienciesBlock sub-tabs (skills + saves)')
  step(!(await page.getByRole('tablist', { name: 'Sheet sections' }).isVisible()), 'tab bar hidden in print')
  await page.screenshot({ path: SHOT('d2-print-preview'), fullPage: false })
  await page.emulateMedia({ media: 'screen' })
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('d9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
