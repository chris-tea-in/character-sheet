// Phase A runtime verification driver — drives the real app in headless Chromium.
import { chromium } from 'file:///C:/Users/buyp1/Workspace/dnd-character-sheet/node_modules/playwright/index.mjs'

const SCRATCH = 'C:/Users/buyp1/AppData/Local/Temp/claude/c--Users-buyp1-Workspace-dnd-character-sheet/0b760faa-f2f6-4255-9f37-2af7647ee9ad/scratchpad'
const SHOT = (n) => `${SCRATCH}/shots/${n}.png`
const results = []
function step(ok, label, detail = '') {
  results.push(`${ok ? 'OK ' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`)
  console.log(results[results.length - 1])
  if (!ok) process.exitCode = 1
}

// Poll a locator's text until it matches (saves land async through the store).
async function waitText(locator, expected, ms = 4000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = ((await locator.textContent().catch(() => '')) ?? '').trim()
    if (last === expected) return last
    await new Promise(r => setTimeout(r, 120))
  }
  return last
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
page.setDefaultTimeout(10000)

try {
  await page.goto('http://localhost:5173/')
  // First-run "What's New" modal blocks the page in a fresh profile — dismiss it.
  try {
    const gotIt = page.getByRole('button', { name: 'Got it' })
    await gotIt.waitFor({ timeout: 4000 })
    await gotIt.click()
  } catch { /* not shown — fine */ }
  await page.getByRole('button', { name: 'Data' }).waitFor()

  // Seed via the real import UI
  await page.getByRole('button', { name: 'Data' }).click()
  const fileInput = page.locator('input[type="file"][accept=".json"]')
  await fileInput.setInputFiles(`${SCRATCH}/verify-dummy.json`)
  await page.getByText('Verify Dummy').first().waitFor()
  step(true, 'import character via Data dialog')

  // Open the sheet
  if (!page.url().includes('/character/')) {
    await page.getByText('Verify Dummy').first().click()
    await page.waitForURL('**/character/**')
  }
  await page.getByText('Backstory').first().waitFor()

  // ── A1: paragraph breaks ────────────────────────────────────────────────
  const backstoryDiv = page.locator('div.whitespace-pre-wrap', { hasText: 'First paragraph of the backstory' })
  await backstoryDiv.waitFor()
  const ws = await backstoryDiv.evaluate(el => getComputedStyle(el).whiteSpace)
  const box = await backstoryDiv.boundingBox()
  step(ws === 'pre-wrap', 'A1 backstory display uses white-space: pre-wrap', `computed=${ws}, height=${Math.round(box?.height ?? 0)}px`)
  await page.locator('section', { hasText: 'Backstory' }).last().screenshot({ path: SHOT('01-description-paragraphs') })

  // ── A2/A3 setup: open the bag ───────────────────────────────────────────
  const bagPill = page.getByRole('button', { name: /Inventory \(\d+\)/ })
  await bagPill.scrollIntoViewIfNeeded()
  await bagPill.click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Bag of Holding' })
  await dialog.getByText('Torch').waitFor()
  step(true, 'open Bag of Holding inventory dialog')
  await dialog.screenshot({ path: SHOT('02-bag-contents') })

  // ── A2: typeable qty on a contained row (Torch ×2 → type 7) ─────────────
  // Scope to the Torch row — the bag's coin pouch has its own number inputs.
  const torchRow = dialog.locator('div.flex.items-center.gap-2', { hasText: 'Torch' }).first()
  await torchRow.locator('span.tabular-nums').click()
  const qtyInput = torchRow.locator('input[type="number"]')
  await qtyInput.waitFor()
  await qtyInput.fill('7')
  await qtyInput.press('Enter')
  await dialog.getByText('×7').waitFor()
  step(true, 'A2 typed 7 into contained-row stepper → ×7')
  await dialog.screenshot({ path: SHOT('03-qty-typed-7') })

  // 🔍 probe: type a negative number → clamps to min 1 (save lands async — poll)
  await torchRow.locator('span.tabular-nums').click()
  await torchRow.locator('input[type="number"]').fill('-3')
  await torchRow.locator('input[type="number"]').press('Enter')
  const after = await waitText(torchRow.locator('span.tabular-nums'), '1')
  step(after === '1', 'PROBE typed -3 → clamped to 1', `shows ${after}`)

  // 🔍 probe: garbage input → reverts (no crash, value unchanged)
  await torchRow.locator('span.tabular-nums').click()
  await torchRow.locator('input[type="number"]').fill('')
  await torchRow.locator('input[type="number"]').press('Enter')
  const after2 = await waitText(torchRow.locator('span.tabular-nums'), '1')
  step(after2 === '1', 'PROBE empty input → reverts, still 1', `shows ${after2}`)

  // ── A3: Back to bag from a catalog picker ───────────────────────────────
  await dialog.getByRole('button', { name: 'Add Item', exact: true }).click()
  const picker = page.getByRole('dialog').filter({ hasText: 'Add Item' })
  const backLink = picker.getByText('Back to bag')
  await backLink.waitFor()
  step(true, 'A3 picker opened from bag shows "Back to bag"')
  await picker.screenshot({ path: SHOT('04-picker-back-to-bag') })
  await backLink.click()
  await dialog.getByText('Torch').waitFor()
  step(true, 'A3 Back to bag returns to the bag dialog')
  await dialog.screenshot({ path: SHOT('05-bag-after-back') })

  // ── A2: custom form inside the bag — typeable quantity ──────────────────
  await dialog.getByRole('button', { name: /Custom/i }).first().click()
  await dialog.getByPlaceholder(/Arrow of Slaying/).fill('Verify Arrows')
  const qtyRow = dialog.locator('div.flex.items-center.gap-3', { hasText: 'Quantity' }).first()
  await qtyRow.locator('span.tabular-nums').click()
  await qtyRow.locator('input[type="number"]').fill('12')
  await qtyRow.locator('input[type="number"]').press('Enter')
  await dialog.getByRole('button', { name: 'Add to bag' }).click()
  await dialog.getByText('×12').waitFor()
  step(true, 'A2 bag custom form: typed quantity 12 → item ×12')
  await dialog.screenshot({ path: SHOT('06-bag-custom-qty12') })

  // Close the bag dialog (Escape)
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})

  // ── A2b: sheet-level Custom item dialog has a Quantity field ────────────
  // The Items section's Custom button sits right next to "Add Item".
  const itemsCustom = page.getByRole('button', { name: 'Add Item', exact: true })
    .locator('xpath=following-sibling::button[normalize-space()="Custom"]')
  await itemsCustom.scrollIntoViewIfNeeded()
  await itemsCustom.click()
  const customDialog = page.getByRole('dialog').filter({ hasText: 'Custom Item' })
  await customDialog.getByText('Quantity').waitFor()
  await customDialog.getByPlaceholder(/Lucky Coin/).fill('Verify Tokens')
  await customDialog.locator('input[type="number"]').first().fill('5')
  await customDialog.getByPlaceholder(/What it is/).fill('Para one of the custom item description.\n\nPara two — must render after a blank line.')
  await customDialog.screenshot({ path: SHOT('07-custom-item-dialog-qty') })
  // Two "Add" buttons exist (EffectBuilder's small one + the footer submit) — take the footer.
  await customDialog.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByText('Verify Tokens').first().waitFor()
  const x5 = page.locator('div', { hasText: 'Verify Tokens' }).getByText('×5').first()
  await x5.waitFor()
  step(true, 'A2b sheet Custom Item dialog has Quantity; created Verify Tokens ×5')

  // ── A1 (user-reported gap): custom item description keeps paragraph breaks ──
  await page.getByText('Verify Tokens').first().click() // expand the MagicItemRow
  const itemDesc = page.locator('p.whitespace-pre-wrap', { hasText: 'Para one of the custom item' })
  await itemDesc.waitFor()
  const itemWs = await itemDesc.evaluate(el => getComputedStyle(el).whiteSpace)
  const descBox = await itemDesc.boundingBox()
  step(itemWs === 'pre-wrap', 'A1 custom item description renders paragraphs', `computed=${itemWs}, height=${Math.round(descBox?.height ?? 0)}px`)
  await page.locator('section', { hasText: 'Items' }).last().screenshot({ path: SHOT('09-custom-item-description') }).catch(async () => {
    await page.screenshot({ path: SHOT('09-custom-item-description') })
  })

  // ── Edit a custom item after creation (user request) ────────────────────
  await page.getByRole('button', { name: 'Edit item' }).first().click()
  const editDialog = page.getByRole('dialog').filter({ hasText: 'Edit Item' })
  const nameInput = editDialog.getByPlaceholder(/Lucky Coin/)
  const prefilled = await nameInput.inputValue()
  const descPrefilled = await editDialog.getByPlaceholder(/What it is/).inputValue()
  step(prefilled === 'Verify Tokens' && descPrefilled.includes('Para one'),
    'EDIT dialog prefills name + description', `name="${prefilled}", desc starts "${descPrefilled.slice(0, 12)}…"`)
  await nameInput.fill('Verified Relics')
  await editDialog.locator('select').first().selectOption('Rare')
  await editDialog.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Verified Relics').first().waitFor()
  const renamedX5 = await waitText(page.locator('div', { hasText: 'Verified Relics' }).getByText('×5').first().locator('..').getByText('×5'), '×5').catch(() => '')
  const stillX5 = (await page.locator('div', { hasText: 'Verified Relics' }).getByText('×5').count()) > 0
  step(stillX5, 'EDIT rename propagates to the instance, quantity ×5 preserved', `renamed row shows ×5: ${stillX5} (${renamedX5})`)
  await page.getByText('Rare', { exact: true }).first().waitFor()
  step(true, 'EDIT rarity change saved (row shows Rare)')

  // Typeable qty on the magic-item row itself (was uneditable before).
  // The row may still be expanded from earlier — only click to expand if collapsed.
  if (!(await page.getByRole('button', { name: 'Edit item' }).first().isVisible().catch(() => false))) {
    await page.getByText('Verified Relics').first().click()
  }
  const relicsQtyRow = page.locator('div.flex.items-center.gap-3', { hasText: 'qty' }).first()
  await relicsQtyRow.locator('span.tabular-nums').click()
  await relicsQtyRow.locator('input[type="number"]').fill('9')
  await relicsQtyRow.locator('input[type="number"]').press('Enter')
  const q9 = await waitText(relicsQtyRow.locator('span.tabular-nums'), '9')
  step(q9 === '9', 'MagicItemRow qty is now editable — typed 9', `shows ${q9}`)
  await page.locator('section', { hasText: 'Items' }).last().screenshot({ path: SHOT('10-edited-custom-item') }).catch(async () => {
    await page.screenshot({ path: SHOT('10-edited-custom-item') })
  })

  // 🔍 probe: Cancel in the edit dialog changes nothing
  await page.getByRole('button', { name: 'Edit item' }).first().click()
  await editDialog.getByPlaceholder(/Lucky Coin/).fill('Should Not Persist')
  await editDialog.getByRole('button', { name: 'Cancel' }).click()
  const notRenamed = (await page.getByText('Should Not Persist').count()) === 0
  step(notRenamed, 'PROBE Cancel in edit dialog discards changes', `"Should Not Persist" on page: ${!notRenamed}`)

  // 🔍 probe: the Level stepper must NOT be typeable (regression guard).
  // Scope to the Identity section — the Custom Effects block at the page bottom
  // has an always-visible number input that poisons a global count.
  const identity = page.locator('section', { hasText: 'Identity' }).first()
  const levelValue = identity.locator('span.tabular-nums').first()
  await levelValue.scrollIntoViewIfNeeded()
  await levelValue.click()
  await page.waitForTimeout(300)
  const levelInputs = await identity.locator('input[type="number"]:visible').count()
  step(levelInputs === 0, 'PROBE level stepper value click opens NO input (typeable off)', `number inputs inside Identity: ${levelInputs}`)
  await page.screenshot({ path: SHOT('08-full-sheet'), fullPage: true })
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('99-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
