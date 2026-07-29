// Nine-item feedback batch verification: combat layout, loadout, grouping,
// soft-lock, commit roll walkthrough, notes-tab merge, always-on loadout,
// privacy decoys, expanded class-abilities data.
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

const tabBtn = (name) => page.getByRole('tab', { name })
const sectionCard = (title) =>
  page.locator('div.rounded-lg').filter({ has: page.locator(`p:text-is("${title}")`) }).last()
const rowIn = (card, text) => card.locator('div.py-1\\.5').filter({ hasText: text }).first()
const yOf = async (loc) => (await loc.boundingBox())?.y ?? -1

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
  await page.getByText('Your Turn').first().waitFor()
}

try {
  await importChar('verify-epaladin.json', 'Verify EPaladin')

  // #6 — Notes tab gone; Description lives at the bottom of Character
  step(await page.getByRole('tab').count() === 4, 'no Notes tab (4 tabs remain)')
  await tabBtn('Character').click()
  await page.getByText('BACKSTORY', { exact: false }).first().waitFor()
  const descY = await yOf(page.getByText('First paragraph of the backstory.').first())
  const featsY = await yOf(page.locator('#sheet-panel-character').getByText('FEATS', { exact: false }).first())
  step(descY > featsY && featsY > 0, 'description renders at the bottom of the Character tab', `feats y=${featsY} desc y=${descY}`)
  await tabBtn('Combat').click()

  // #3 — combat block order: HP → death saves → hit dice → defenses → stat tiles last
  const hpY = await yOf(page.getByText('CURRENT HP', { exact: false }).first())
  const deathY = await yOf(page.getByText('DEATH SAVES', { exact: false }).first())
  const hitDiceY = await yOf(page.getByText('HIT DICE', { exact: false }).first())
  const defensesY = await yOf(page.getByText('DEFENSES', { exact: false }).first())
  const tilesY = await yOf(page.getByText('PROF BONUS', { exact: false }).first())
  step(hpY < deathY && deathY < hitDiceY, 'combat block: HP → death saves → hit dice', `${hpY} < ${deathY} < ${hitDiceY}`)
  step(hitDiceY < defensesY, 'combat block: defenses sit below hit dice', `${hitDiceY} < ${defensesY}`)
  step(defensesY < tilesY, 'combat block: AC/Speed/Init/PB tiles are LAST', `${defensesY} < ${tilesY}`)

  // #4 — loadout between the combat block and the queue (scope to the combat
  // panel — the hidden Inventory panel has its own Loadout block in the DOM)
  const loadout = page.locator('#sheet-panel-combat div.rounded-lg').filter({ has: page.locator('p:text-is("Loadout")') }).first()
  const loadoutY = await yOf(loadout)
  const queueY = await yOf(page.locator('div.rounded-lg').filter({ hasText: 'Commit turn' }).last())
  step(loadoutY > tilesY && loadoutY < queueY, 'loadout card sits between combat block and Your Turn', `${tilesY} < ${loadoutY} < ${queueY}`)
  step(/Longsword/.test(await loadout.textContent() ?? '') && /\+5/.test(await loadout.textContent() ?? ''),
    'loadout lists the equipped Longsword with its to-hit')

  // #5 — grouped sub-headers in order within Action
  const actionCard = sectionCard('Action')
  const abilHdr = await yOf(actionCard.locator('p:text-is("Class Abilities")'))
  const spellsHdr = await yOf(actionCard.locator('p:text-is("Spells")'))
  const weaponsHdr = await yOf(actionCard.locator('p:text-is("Weapon Attacks")'))
  const generalHdr = await yOf(actionCard.locator('p:text-is("General")'))
  step(abilHdr > 0 && abilHdr < spellsHdr && spellsHdr < weaponsHdr && weaponsHdr < generalHdr,
    'Action groups: Class Abilities → Spells → Weapon Attacks → General', `${abilHdr} < ${spellsHdr} < ${weaponsHdr} < ${generalHdr}`)

  // #9 — Divine Sense now appears (1 + CHA mod = 3 uses for CHA 14)
  const ds = rowIn(actionCard, 'Divine Sense')
  step(/3\/3/.test(await ds.textContent() ?? ''), 'Divine Sense shows 3/3 uses (1 + CHA mod)', (await ds.textContent() ?? '').slice(0, 50))

  // #1 — soft-lock: queue Guiding Bolt, then Healing Word warns + needs a confirm tap
  await rowIn(actionCard, 'Guiding Bolt').getByRole('button', { name: 'Queue', exact: true }).click()
  const baCard = sectionCard('Bonus Action')
  const hwRow = rowIn(baCard, 'Healing Word')
  await hwRow.getByRole('button', { name: '⚠ Queue' }).waitFor()
  step(true, 'soft-lock: second leveled spell shows ⚠ Queue')
  await hwRow.getByRole('button', { name: '⚠ Queue' }).click()
  await hwRow.getByRole('button', { name: 'Homebrew?' }).waitFor()
  step(true, 'soft-lock: first tap flips to a Homebrew? confirm (not queued yet)')
  await hwRow.getByRole('button', { name: 'Homebrew?' }).click()
  await hwRow.getByRole('button', { name: 'Queued' }).waitFor()
  await page.getByText(/two leveled spells in one turn is homebrew/).waitFor()
  step(true, 'soft-lock: second tap queues; panel warning still shown')
  await page.screenshot({ path: SHOT('b1-softlock'), fullPage: false })

  // #2 — commit walks through the rolls: GB hit → GB damage → HW heal
  await page.locator('div.rounded-lg').filter({ hasText: 'Commit turn' }).last().getByRole('button', { name: 'Commit turn' }).click()
  const dlg = () => page.getByRole('dialog')
  await dlg().filter({ hasText: 'Guiding Bolt' }).first().waitFor()
  step(true, 'commit: first modal is the Guiding Bolt attack roll')
  await page.keyboard.press('Escape')
  await dlg().filter({ hasText: 'Guiding Bolt' }).first().waitFor()
  step(true, 'commit: second modal follows (Guiding Bolt damage)')
  await page.screenshot({ path: SHOT('b2-walkthrough'), fullPage: false })
  await page.keyboard.press('Escape')
  await dlg().filter({ hasText: 'Healing Word' }).first().waitFor()
  step(true, 'commit: third modal is the Healing Word heal roll')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  step(await dlg().count() === 0, 'commit: walkthrough ends after the queued rolls')
  step(/spent/.test(await page.locator('div.rounded-lg').filter({ hasText: 'Turn History' }).last().textContent() ?? ''),
    'commit: costs still spent + logged')

  // #8 — decoys: appear as a different name/class
  await page.getByRole('button', { name: 'Sheet privacy' }).click()
  const privDlg = page.getByRole('dialog').filter({ hasText: 'Sheet Privacy' })
  await privDlg.getByLabel('Hide name').click()
  await privDlg.locator('input[type="text"]').first().waitFor()
  await privDlg.locator('input[type="text"]').first().fill('Bob the Baker')
  await privDlg.locator('input[type="text"]').first().blur()
  await privDlg.getByLabel('Hide class & subclass').click()
  await page.waitForTimeout(300)
  await privDlg.locator('input[type="text"]').nth(1).fill('Fighter')
  await privDlg.locator('input[type="text"]').nth(1).blur()
  await privDlg.getByRole('button', { name: 'Done' }).click()
  await page.locator('header').getByText('Bob the Baker').waitFor()
  const header = (await page.locator('header').textContent() ?? '')
  step(/Fighter 3/.test(header) && !/Paladin/.test(header) && !/Verify EPaladin/.test(header),
    'decoys: header reads "Bob the Baker / Fighter 3" with no real values', header.slice(0, 60))
  await tabBtn('Character').click()
  const identity = page.locator('#sheet-panel-character div.rounded-lg').filter({ hasText: 'Progression' }).first()
  const idText = (await identity.textContent() ?? '')
  step(/Fighter/.test(idText) && !/Paladin/.test(idText) && !/Hidden/.test(idText.split('Race')[0]),
    'decoys: Identity card shows the decoy class as plain text (no hidden marker)', idText.slice(0, 70))
  await page.screenshot({ path: SHOT('b3-decoy'), fullPage: false })

  // #7 — Inventory loadout block always renders (empty state on a bare character)
  await importChar('verify-barbarian.json', 'Verify Barbarian')
  await tabBtn('Inventory').click()
  const invLoadout = page.locator('#sheet-panel-inventory div.rounded-lg').filter({ hasText: 'Loadout' }).first()
  await invLoadout.waitFor()
  step(/Nothing equipped or attuned yet/.test(await invLoadout.textContent() ?? ''),
    'inventory: Loadout block renders with an empty state when nothing is equipped')

  // barbarian combat tab: Rage grouped under Class Abilities in Bonus Action
  await tabBtn('Combat').click()
  const barbBa = sectionCard('Bonus Action')
  step((await barbBa.locator('p:text-is("Class Abilities")').count()) === 1 && /Rage/.test(await barbBa.textContent() ?? ''),
    'barbarian: Rage grouped under a Class Abilities sub-header')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('b9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
