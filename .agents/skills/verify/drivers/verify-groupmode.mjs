// Combat tab Type ⇄ Effect grouping toggle verification.
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

const combatCard = (title) =>
  page.locator('#sheet-panel-combat div.rounded-lg').filter({ has: page.locator(`p:text-is("${title}")`) }).first()
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

  // Default: Type mode, toggle sits top-right of the Action card
  const actionCard = combatCard('Action')
  await actionCard.getByRole('button', { name: 'Effect' }).waitFor()
  step(await actionCard.getByRole('button', { name: 'Type', exact: true }).getAttribute('aria-pressed') === 'true',
    'default: Type mode active, toggle lives in the Action card header')

  // Switch to Effect mode
  await actionCard.getByRole('button', { name: 'Effect' }).click()
  await combatCard('Damage').waitFor()
  const dmg = combatCard('Damage')
  const healing = combatCard('Healing')
  const general = combatCard('General')
  const utility = combatCard('Utility')
  const reaction = combatCard('Reaction')

  const [yD, yH, yG, yU, yR] = [await yOf(dmg), await yOf(healing), await yOf(general), await yOf(utility), await yOf(reaction)]
  step(yD > 0 && yD < yH && yH < yG && yG < yU && yU < yR,
    'effect mode: Damage → Healing → General → Utility, Reaction LAST', `${yD} < ${yH} < ${yG} < ${yU} < ${yR}`)

  // Within Damage: Action sub-header holds weapon + attack spell
  const dmgText = (await dmg.textContent() ?? '')
  step(/Action/.test(dmgText) && /Longsword/.test(dmgText) && /Guiding Bolt/.test(dmgText),
    'Damage card: Longsword + Guiding Bolt under Action')
  // Healing: Lay on Hands (action) + Healing Word (bonus action sub-header)
  const healText = (await healing.textContent() ?? '')
  step(/Lay on Hands/.test(healText) && /Healing Word/.test(healText) && /Bonus Action/.test(healText),
    'Healing card: Lay on Hands (Action) + Healing Word under a Bonus Action sub-header')
  // Utility: Bless + Divine Sense; NOT Healing Word
  const utilText = (await utility.textContent() ?? '')
  step(/Bless/.test(utilText) && /Divine Sense/.test(utilText) && !/Healing Word/.test(utilText),
    'Utility card: Bless + Divine Sense')
  // Reaction card grouped by effect: Counterspell under Utility, Opportunity Attack under General
  const rText = (await reaction.textContent() ?? '')
  step(/Utility/.test(rText) && /Counterspell/.test(rText) && /General/.test(rText) && /Opportunity Attack/.test(rText),
    'Reaction card: sub-grouped by effect (Counterspell → Utility, Opportunity Attack → General)')
  // Card TITLES are p.text-xs; the gold sub-headers inside effect cards are
  // p.text-[10px] — only the former would indicate a standalone card.
  step(await page.locator('#sheet-panel-combat p.text-xs:text-is("Bonus Action")').count() === 0,
    'effect mode: no standalone Bonus Action card (only sub-headers)')
  await page.screenshot({ path: SHOT('g1-effect-mode'), fullPage: false })

  // Queueing still works from the Damage card
  await rowIn(dmg, 'Longsword').getByRole('button', { name: 'Queue', exact: true }).click()
  step(/Longsword/.test(await page.locator('div.rounded-lg').filter({ hasText: 'Commit turn' }).last().textContent() ?? ''),
    'effect mode: queueing from the Damage card fills the Action slot')

  // Persists across reload; toggle back restores Type mode
  await page.reload()
  await combatCard('Damage').waitFor()
  step(true, 'effect mode persists across a reload (sessionStorage)')
  await combatCard('Damage').getByRole('button', { name: 'Type', exact: true }).click()
  await combatCard('Action').waitFor()
  step(/Class Abilities/.test(await combatCard('Action').textContent() ?? ''), 'toggling back restores Type mode')

  // Fighter: Second Wind classifies as Healing (new effect tag)
  await importChar('verify-champion.json', 'Verify Champion')
  await combatCard('Action').getByRole('button', { name: 'Effect' }).click()
  const champHealing = combatCard('Healing')
  await champHealing.waitFor()
  const chText = (await champHealing.textContent() ?? '')
  step(/Second Wind/.test(chText) && /Bonus Action/.test(chText),
    'fighter: Second Wind lands in Healing under Bonus Action')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
  await page.screenshot({ path: SHOT('g9-failure'), fullPage: true }).catch(() => {})
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
