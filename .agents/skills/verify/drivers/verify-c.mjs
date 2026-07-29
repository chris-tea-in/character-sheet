// Phase C runtime verification — class abilities in the Spells area.
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
  } catch { /* once per profile */ }
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(`${SCRATCH}/${file}`)
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await page.getByText(name).first().click()
  await page.waitForURL('**/character/**')
  await page.getByText('Class Abilities').first().waitFor()
}

// The Class Abilities card (innermost rounded-lg containing the header).
const abilitiesBox = () =>
  page.locator('div.rounded-lg').filter({ hasText: 'Class Abilities' }).last()
// A row inside it, by ability name.
const row = (name) =>
  abilitiesBox().locator('div.py-2').filter({ hasText: name }).first()

const availPips = (r) => r.locator('button[title^="Use a"]')
const availSlotPips = () => page.locator('button[title="Use a slot"]')

try {
  // ── Paladin 3 — Lay on Hands pool 15, spend/type/reset, CD pip, no slot use ──
  await importChar('verify-paladin.json', 'Verify Paladin')
  const loh = row('Lay on Hands')
  step(/15\/15/.test(await loh.textContent() ?? ''), 'paladin 3: Lay on Hands pool renders 15/15 (5 × paladin level)')
  step(await loh.locator('span[title="Action"]').count() === 1, 'paladin 3: Lay on Hands has the Action badge')

  const slotsBefore = await availSlotPips().count()
  step(slotsBefore > 0, 'paladin 3: half-caster slot pips render', `${slotsBefore} available`)

  // spend 1 via the − button, then type 7 directly, then Reset
  await loh.getByRole('button', { name: '−' }).click()
  await loh.getByText('14/15').waitFor()
  step(true, 'paladin 3: − spends 1 from the pool (14/15)')
  await loh.locator('span.tabular-nums').click()
  await loh.locator('input[type="number"]').fill('7')
  await loh.locator('input[type="number"]').press('Enter')
  await loh.getByText('7/15').waitFor()
  step(true, 'paladin 3: typing 7 into the pool stepper lands (7/15)')
  await page.screenshot({ path: SHOT('c1-paladin-loh-spent'), fullPage: false })
  await loh.getByRole('button', { name: 'Reset' }).click()
  await loh.getByText('15/15').waitFor()
  step(true, 'paladin 3: Reset restores the pool (15/15)')

  const slotsAfter = await availSlotPips().count()
  step(slotsAfter === slotsBefore, 'paladin 3: pool spend/restore consumed NO spell slots', `${slotsBefore} → ${slotsAfter}`)

  // Channel Divinity: 1 use pip, short rest
  const cd = row('Channel Divinity')
  step(/1\/1/.test(await cd.textContent() ?? '') && /short rest/.test(await cd.textContent() ?? ''),
    'paladin 3: Channel Divinity shows 1/1 · short rest')
  await availPips(cd).first().click()
  await cd.getByText('0/1').waitFor()
  step(true, 'paladin 3: Channel Divinity pip spends (0/1)')

  // Not a spell row: the Spells Known card must not list it
  const spellsCard = page.locator('div.rounded-lg').filter({ hasText: 'Spells Known' }).last()
  step(!/Lay on Hands/.test(await spellsCard.textContent() ?? ''), 'paladin 3: Lay on Hands is NOT in the Spells Known list')

  // Expandable description
  await loh.getByRole('button', { name: 'Lay on Hands' }).click()
  const desc = loh.locator('p.whitespace-pre-wrap')
  await desc.waitFor()
  const descText = (await desc.textContent() ?? '').trim()
  step(descText.length > 40 && !/No description authored/.test(descText), 'paladin 3: description expands with authored text', descText.slice(0, 50))
  await page.screenshot({ path: SHOT('c2-paladin-abilities'), fullPage: false })

  // ── Bard 5 / Paladin 3 — owning-level sizing + CHA-mod dice ──────────────────
  await importChar('verify-multi.json', 'Verify Multi')
  const lohMulti = row('Lay on Hands')
  step(/15\/15/.test(await lohMulti.textContent() ?? ''), 'bard5/paladin3: Lay on Hands still 15/15 (paladin level, not total 40)')
  const insp = row('Bardic Inspiration')
  step(await availPips(insp).count() === 3 && /3\/3/.test(await insp.textContent() ?? ''),
    'bard5/paladin3: Bardic Inspiration = 3 dice (CHA 16 mod)')
  step(await insp.locator('span[title="Bonus action"]').count() === 1, 'bard5/paladin3: Bardic Inspiration has BA badge')
  await page.screenshot({ path: SHOT('c3-multiclass'), fullPage: false })

  // ── Bard 2 (CHA 10) — "minimum of once" ──────────────────────────────────────
  await importChar('verify-bard.json', 'Verify Bard')
  const inspMin = row('Bardic Inspiration')
  step(await availPips(inspMin).count() === 1, 'bard 2 CHA 10: Bardic Inspiration floors at 1 die')

  // ── Barbarian 3 — non-caster still gets the section ──────────────────────────
  await importChar('verify-barbarian.json', 'Verify Barbarian')
  const rage = row('Rage')
  step(await availPips(rage).count() === 3 && /3\/3/.test(await rage.textContent() ?? ''),
    'barbarian 3: Rage shows 3/3 uses')
  step(await rage.locator('span[title="Bonus action"]').count() === 1, 'barbarian 3: Rage has BA badge')
  step(await page.getByText('Spell Slots').count() === 0, 'barbarian 3: no spell-slot tracker (non-caster)')
  await page.screenshot({ path: SHOT('c4-barbarian'), fullPage: false })

  // ── Champion fighter 7 — Second Wind + Action Surge, persistence across reload ─
  await importChar('verify-champion.json', 'Verify Champion')
  const sw = row('Second Wind')
  step(await availPips(sw).count() === 1 && await sw.locator('span[title="Bonus action"]').count() === 1,
    'fighter 7: Second Wind 1 use, BA badge')
  const surge = row('Action Surge')
  step(await availPips(surge).count() === 1, 'fighter 7: Action Surge 1 use (2 only at 17)')
  step(await surge.locator('span[title="No action / special"]').count() === 1, 'fighter 7: Action Surge badge is "—" (not an action)')
  await availPips(surge).first().click()
  await surge.getByText('0/1').waitFor()
  await page.waitForTimeout(800) // let the async save flush
  await page.reload()
  await page.getByText('Class Abilities').first().waitFor()
  const surgeAfter = row('Action Surge')
  await surgeAfter.getByText('0/1').waitFor()
  step(true, 'fighter 7: spent Action Surge persists across reload (featureResourcesUsed)')
  await page.screenshot({ path: SHOT('c5-champion'), fullPage: false })

  // ── Monk 3 — Ki pool + ki-costed techniques ──────────────────────────────────
  await importChar('verify-monk.json', 'Verify Monk')
  const ki = row('Ki')
  step(/3\/3/.test(await ki.textContent() ?? ''), 'monk 3: Ki pool 3/3 (1 × monk level)')
  const flurry = row('Flurry of Blows')
  const useBtn = flurry.getByRole('button', { name: /^Use \(1/ })
  step(await useBtn.count() === 1, 'monk 3: Flurry of Blows has a "Use (1 …)" cost button')
  await useBtn.click()
  await ki.getByText('2/3').waitFor()
  step(true, 'monk 3: Flurry spends 1 ki (2/3)')
  await row('Patient Defense').getByRole('button', { name: /^Use \(1/ }).click()
  await ki.getByText('1/3').waitFor()
  await row('Step of the Wind').getByRole('button', { name: /^Use \(1/ }).click()
  await ki.getByText('0/3').waitFor()
  step(true, 'monk 3: three techniques drain the pool to 0/3')
  step(await useBtn.isDisabled(), 'monk 3: cost button disables at 0 ki')
  await page.screenshot({ path: SHOT('c6-monk'), fullPage: false })
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('c9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
