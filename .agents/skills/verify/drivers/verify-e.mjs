// Phase E runtime verification — combat tab, turn queue, spell categorization.
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
  await page.getByText('Your Turn').first().waitFor()
}

const tabBtn = (name) => page.getByRole('tab', { name })
// Section card inside CombatTab, by its heading text.
const sectionCard = (title) =>
  page.locator('div.rounded-lg').filter({ has: page.locator(`p:text-is("${title}")`) }).last()
const rowIn = (card, text) => card.locator('div.py-1\\.5').filter({ hasText: text }).first()

try {
  // ── Paladin: sections, queue, commit-spends-once, parity, filters ────────────
  await importChar('verify-epaladin.json', 'Verify EPaladin')

  const actionCard = sectionCard('Action')
  const baCard = sectionCard('Bonus Action')
  const reactionCard = sectionCard('Reaction')

  const swordRow = rowIn(actionCard, 'Longsword')
  await swordRow.waitFor()
  const swordText = (await swordRow.textContent() ?? '')
  const toHitMatch = swordText.match(/([+-]\d+)\s*·/)
  step(!!toHitMatch, 'combat: Longsword listed under Action with a to-hit', swordText.slice(0, 60))

  await rowIn(baCard, 'Healing Word').waitFor()
  step(true, 'combat: Healing Word listed under Bonus Action')
  await rowIn(reactionCard, 'Counterspell').waitFor()
  step(true, 'combat: Counterspell listed under Reaction')
  const csRow = rowIn(reactionCard, 'Counterspell')
  step(/no slots/i.test(await csRow.textContent() ?? ''), 'combat: Counterspell (3rd) flags "no slots" for a paladin 3')
  await rowIn(actionCard, 'Dash').waitFor()
  step(true, 'combat: generic SRD actions render (Dash)')

  // Queue Longsword (action) + Healing Word (bonus action)
  await swordRow.getByRole('button', { name: 'Queue' }).click()
  await rowIn(baCard, 'Healing Word').getByRole('button', { name: 'Queue' }).click()
  const queueCard = page.locator('div.rounded-lg').filter({ hasText: 'Commit turn' }).last()
  const queueText = (await queueCard.textContent() ?? '')
  step(/Longsword/.test(queueText) && /Healing Word/.test(queueText), 'queue: both slots filled', queueText.slice(0, 120))

  // Healing Word's slot select shows 3 left before commit
  const baSelect = rowIn(baCard, 'Healing Word').locator('select')
  step(/3 left/.test(await baSelect.locator('option').first().textContent() ?? ''), 'queue: slot select shows 3 left pre-commit')

  await queueCard.getByRole('button', { name: 'Commit turn' }).click()
  await page.getByText('Turn History').waitFor()
  step(true, 'commit: history panel appears')
  const historyCard = page.locator('div.rounded-lg').filter({ hasText: 'Turn History' }).last()
  const hist = (await historyCard.textContent() ?? '')
  step(/Longsword \+ Healing Word/.test(hist) && /spent 1st slot/.test(hist), 'commit: history logs labels + cost', hist.slice(0, 140))
  step(!/Longsword/.test((await queueCard.textContent() ?? '').split('Commit')[0]), 'commit: queue cleared')

  // Exactly ONE slot spent — the select now shows 2 left, and the Spells tab pips agree
  // (<option> is never "visible" to Playwright — wait for attachment instead)
  await baSelect.locator('option', { hasText: '2 left' }).first().waitFor({ state: 'attached' })
  step(true, 'commit: exactly one 1st-level slot spent (select shows 2 left)')
  await tabBtn('Spells').click()
  await page.getByText('2/3').first().waitFor()
  step(true, 'spells tab: slot tracker shows 2/3 after commit')

  // SpellBlock categorization: BA badge + Healing/Damage filters
  const spellsCard = page.locator('div.rounded-lg').filter({ hasText: 'Spells Known' }).last()
  const hwRow = spellsCard.locator('div.border-b, div.last\\:border-0').filter({ hasText: 'Healing Word' }).first()
  step(await hwRow.locator('span[title="Bonus action"]').count() === 1, 'spell list: Healing Word carries a BA badge')
  await spellsCard.getByRole('button', { name: 'Healing', exact: true }).click()
  step(/Healing Word/.test(await spellsCard.textContent() ?? '') && !/Guiding Bolt/.test(await spellsCard.textContent() ?? ''),
    'spell filter: Healing shows Healing Word, hides Guiding Bolt')
  await spellsCard.getByRole('button', { name: 'Damage', exact: true }).click()
  step(/Guiding Bolt/.test(await spellsCard.textContent() ?? '') && !/Healing Word/.test(await spellsCard.textContent() ?? ''),
    'spell filter: Damage shows Guiding Bolt, hides Healing Word')
  await spellsCard.getByRole('button', { name: 'Utility', exact: true }).click()
  step(/Bless/.test(await spellsCard.textContent() ?? '') && !/Guiding Bolt/.test(await spellsCard.textContent() ?? ''),
    'spell filter: Utility shows Bless only')
  await spellsCard.getByRole('button', { name: 'All', exact: true }).click()

  // Attack-number parity: Inventory tab Longsword shows the same to-hit
  await tabBtn('Inventory').click()
  const invSword = page.locator('div.border-b, div.last\\:border-0').filter({ hasText: 'Longsword' }).first()
  const invText = (await invSword.textContent() ?? '')
  step(toHitMatch !== null && invText.includes(toHitMatch[1]),
    'parity: EquipmentBlock and Combat tab show the same to-hit', `combat=${toHitMatch?.[1]} inventory has it: ${invText.slice(0, 40)}`)

  // RAW warning: two leveled spells queued
  await tabBtn('Combat').click()
  await rowIn(sectionCard('Action'), 'Guiding Bolt').getByRole('button', { name: 'Queue' }).click()
  await rowIn(sectionCard('Bonus Action'), 'Healing Word').getByRole('button', { name: 'Queue' }).click()
  await page.getByText(/two leveled spells in one turn is homebrew/).waitFor()
  step(true, 'queue: soft RAW warning for two leveled spells (non-blocking)')
  await page.screenshot({ path: SHOT('e1-combat-tab'), fullPage: false })

  // History is session-only: reload clears it
  await page.reload()
  await page.getByText('Your Turn').first().waitFor()
  step(await page.getByText('Turn History').count() === 0, 'history: cleared by refresh (session-only)')

  // ── Monk: ki-costed bonus action queues + spends from the pool ───────────────
  await importChar('verify-monk.json', 'Verify Monk')
  const monkBa = sectionCard('Bonus Action')
  await rowIn(monkBa, 'Flurry of Blows').getByRole('button', { name: 'Queue' }).click()
  await page.locator('div.rounded-lg').filter({ hasText: 'Commit turn' }).last().getByRole('button', { name: 'Commit turn' }).click()
  await page.getByText('Turn History').waitFor()
  const otherCard = sectionCard('No Action / Special')
  await rowIn(otherCard, 'Ki').getByText('2/3').waitFor()
  step(true, 'monk: committing queued Flurry spends 1 ki (2/3)')
  const monkHist = (await page.locator('div.rounded-lg').filter({ hasText: 'Turn History' }).last().textContent() ?? '')
  step(/Flurry of Blows/.test(monkHist) && /1 ki point/.test(monkHist), 'monk: history logs the ki cost', monkHist.slice(0, 120))
  await page.screenshot({ path: SHOT('e2-monk-combat'), fullPage: false })
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('e9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
