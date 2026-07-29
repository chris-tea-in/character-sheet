// Sheet-privacy runtime verification — hide name/class/race on the sheet.
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

const header = () => page.locator('header')
const eyeBtn = () => page.getByRole('button', { name: 'Sheet privacy' })
const privacyDialog = () => page.getByRole('dialog').filter({ hasText: 'Sheet Privacy' })

try {
  await page.goto('http://localhost:5173/')
  try {
    const gotIt = page.getByRole('button', { name: 'Got it' })
    await gotIt.waitFor({ timeout: 2500 })
    await gotIt.click()
  } catch { /* once per profile */ }
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(`${SCRATCH}/verify-private.json`)
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await page.getByText('Verify Private').first().click()
  await page.waitForURL('**/character/**')
  await page.getByRole('tab', { name: 'Combat' }).waitFor()

  const before = (await header().textContent() ?? '')
  step(/Verify Private/.test(before) && /Paladin 3/.test(before) && /Human/.test(before),
    'baseline: header shows name, class+level, race', before.slice(0, 80))

  // Hide all three via the eye dialog
  await eyeBtn().click()
  await privacyDialog().waitFor()
  await privacyDialog().getByLabel('Hide name').click()
  await privacyDialog().getByLabel('Hide class & subclass').click()
  await privacyDialog().getByLabel('Hide race & subrace').click()
  await privacyDialog().getByRole('button', { name: 'Done' }).click()

  await header().getByText('•••').waitFor()
  const hidden = (await header().textContent() ?? '')
  step(!/Verify Private/.test(hidden), 'hide name: real name gone from header (••• shown)')
  step(/Level 3/.test(hidden) && !/Paladin/.test(hidden), 'hide class: subtitle reads "Level 3", no class', hidden.slice(0, 60))
  step(!/Human/.test(hidden), 'hide race: race gone from header')
  await page.screenshot({ path: SHOT('p1-header-hidden'), fullPage: false })

  // Identity card masks + not tappable
  await page.getByRole('tab', { name: 'Character' }).click()
  // Scope to the Character panel — inactive tab panels stay mounted, so an
  // unscoped 'Class' filter matches the hidden Spells panel's Class Abilities card.
  const identity = page.locator('#sheet-panel-character div.rounded-lg').filter({ hasText: 'Progression' }).first()
  const idText = (await identity.textContent() ?? '')
  step((idText.match(/Hidden/g) ?? []).length >= 2 && !/Paladin/.test(idText) && !/Human/.test(idText),
    'identity card: Class and Race rows masked as "Hidden"', idText.slice(0, 100))
  step(!/Subrace/.test(idText), 'identity card: Subrace row suppressed while race hidden')
  await page.screenshot({ path: SHOT('p2-identity-hidden'), fullPage: false })

  // Persists across reload (migration v22 column round-trip through the real app)
  await page.reload()
  await header().getByText('•••').waitFor()
  step(!/Verify Private|Paladin|Human/.test(await header().textContent() ?? ''),
    'persistence: masks survive a reload (sheet_privacy column)')

  // Eye shows the gold "hidden" state
  step(await eyeBtn().locator('svg').count() === 1, 'eye button present in hidden state')

  // Unhide everything → real values return
  await eyeBtn().click()
  await privacyDialog().waitFor()
  await privacyDialog().getByLabel('Hide name').click()
  await privacyDialog().getByLabel('Hide class & subclass').click()
  await privacyDialog().getByLabel('Hide race & subrace').click()
  await privacyDialog().getByRole('button', { name: 'Done' }).click()
  await header().getByText('Verify Private').waitFor()
  const restored = (await header().textContent() ?? '')
  step(/Paladin 3/.test(restored) && /Human/.test(restored), 'unhide: name, class, and race all return', restored.slice(0, 80))

  // 🔍 probe: rolls unaffected while hidden — hide name again, roll a weapon hit
  await eyeBtn().click()
  await privacyDialog().getByLabel('Hide name').click()
  await privacyDialog().getByRole('button', { name: 'Done' }).click()
  await page.getByRole('tab', { name: 'Combat' }).click()
  await page.locator('div.py-1\\.5').filter({ hasText: 'Longsword' }).first().getByRole('button', { name: /^Hit/ }).click()
  await page.getByRole('dialog').filter({ hasText: 'Longsword' }).waitFor()
  step(true, 'probe: attack roll works normally while identity is hidden')
  await page.keyboard.press('Escape')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('p9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
