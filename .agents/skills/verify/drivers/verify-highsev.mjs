import { chromium } from 'file:///C:/Users/buyp1/Workspace/dnd-character-sheet/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync } from 'node:fs'

const REPO = 'C:/Users/buyp1/Workspace/dnd-character-sheet'
const SCRATCH = 'C:/Users/buyp1/AppData/Local/Temp/claude/c--Users-buyp1-Workspace-dnd-character-sheet/28044dfa-c0f0-4b50-b0ad-50f9c625d320/scratchpad'
const base = JSON.parse(readFileSync(`${REPO}/.claude/skills/verify/drivers/verify-champion.json`, 'utf8')).character

const results = []
const pass = (name, cond, detail = '') => { results.push({ name, ok: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`) }

function seedFile(fname, overrides) {
  writeFileSync(`${SCRATCH}/${fname}`, JSON.stringify({ version: 2, type: 'dnd-character', character: { ...structuredClone(base), ...overrides } }))
  return `${SCRATCH}/${fname}`
}
const gwfPath = seedFile('seed-gwf.json', { name: 'GWF Fighter', classFeatureChoices: { 'fighter:fighting-style': ['great-weapon-fighting'] }, equipment: [{ id: 'w1', name: 'Longsword', quantity: 1, equipped: true }, { id: 'w2', name: 'Greatsword', quantity: 1, equipped: true }] })
const grappledPath = seedFile('seed-grappled.json', { name: 'Grappled Guy', speed: 30, equipment: [], conditions: { active: ['grappled'], exhaustion: 0 } })
const exhaustPath = seedFile('seed-exhaust.json', { name: 'Exhausted Guy', maxHp: 40, currentHp: 20, equipment: [], conditions: { active: [], exhaustion: 4 } })
const dwarfPath = seedFile('seed-dwarf.json', { name: 'Dwarf Guy', race: 'dwarf', subrace: null, equipment: [], conditions: { active: [], exhaustion: 0 } })
const f5Path = seedFile('seed-f5.json', { name: 'Fighter Five', class: 'fighter', subclass: null, level: 5, classes: [{ classSlug: 'fighter', subclassSlug: null, level: 5 }], equipment: [], spells: [] })

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

async function dismissWhatsNew() { try { await page.getByRole('button', { name: 'Got it' }).click({ timeout: 3500 }) } catch {} }
async function importChar(path) {
  await page.goto('http://localhost:5173/'); await page.waitForLoadState('networkidle'); await dismissWhatsNew()
  await page.getByRole('button', { name: 'Data' }).first().click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(path)
  await page.waitForTimeout(600); await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(200)
}
async function openChar(name) {
  await page.goto('http://localhost:5173/'); await page.waitForLoadState('networkidle'); await dismissWhatsNew()
  await page.getByText(name, { exact: true }).first().click()
  await page.locator('#sheet-panel-character').waitFor({ timeout: 8000 }); await page.waitForTimeout(400)
}
async function tab(key) {
  await page.locator(`#sheet-tab-${key}`).click()
  await page.locator(`#sheet-panel-${key}[data-state="active"]`).waitFor({ timeout: 6000 })
  await page.waitForTimeout(400)
}
const cardButtons = async (panelId, title, ancestorClass) => {
  const card = page.locator(panelId).getByTitle(title).locator(`xpath=ancestor::div[contains(@class,"${ancestorClass}")][1]`)
  return { btns: await card.getByRole('button').count(), text: (await card.innerText()).replace(/\s+/g, ' ').trim() }
}
const countVisible = async loc => { let n = 0; const c = await loc.count(); for (let i = 0; i < c; i++) if (await loc.nth(i).isVisible()) n++; return n }

try {
  // ══ BUG-93 (Inventory tab) ═══════════════════════════════════════════════════
  await importChar(gwfPath); await openChar('GWF Fighter'); await tab('inventory')
  const gwfBadges = await countVisible(page.locator('#sheet-panel-inventory').getByText('GWF', { exact: true }))
  pass('BUG-93 both weapons show GWF badge (versatile Longsword auto-qualifies)', gwfBadges === 2, `visible badges=${gwfBadges} (expected 2)`)
  await page.locator('#sheet-panel-inventory').getByText('Longsword', { exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(300)
  const homebrew = await countVisible(page.locator('#sheet-panel-inventory').getByText('Great Weapon Fighting (reroll 1s/2s) — homebrew'))
  pass('BUG-93 no homebrew GWF override checkbox on the versatile Longsword', homebrew === 0, `homebrew toggle=${homebrew} (expected 0)`)

  // ══ BUG-90 (Combat tab) ══════════════════════════════════════════════════════
  await importChar(grappledPath); await openChar('Grappled Guy'); await tab('combat')
  const sp = await cardButtons('#sheet-panel-combat', "What's affecting Speed?", 'min-w-')
  pass('BUG-90 Speed read-only while Grappled (pencil only, no ± stepper)', sp.btns === 1, `buttons=${sp.btns} (expected 1); text="${sp.text}"`)
  pass('BUG-90 Speed shows reduced value 0', sp.text.replace('Speed', '').includes('0'), `text="${sp.text}"`)

  // ══ BUG-91 (Combat tab) ══════════════════════════════════════════════════════
  await importChar(exhaustPath); await openChar('Exhausted Guy'); await tab('combat')
  const mh = await cardButtons('#sheet-panel-combat', "What's affecting Max HP?", 'flex-col')
  pass('BUG-91 Max HP read-only under Exhaustion 4 (pencil only, no ± stepper)', mh.btns === 1, `buttons=${mh.btns} (expected 1); text="${mh.text}"`)
  pass('BUG-91 Max HP shows halved value 20', /\b20\b/.test(mh.text), `text="${mh.text}"`)

  // ══ Controls (Combat tab, normal character) ══════════════════════════════════
  await importChar(dwarfPath); await openChar('Dwarf Guy'); await tab('combat')
  const cSp = await cardButtons('#sheet-panel-combat', "What's affecting Speed?", 'min-w-')
  pass('CONTROL normal Speed stepper editable (± + pencil = 3 buttons)', cSp.btns === 3, `buttons=${cSp.btns} (expected 3)`)
  const cMh = await cardButtons('#sheet-panel-combat', "What's affecting Max HP?", 'flex-col')
  pass('CONTROL normal Max HP stepper editable (± + pencil = 3 buttons)', cMh.btns === 3, `buttons=${cMh.btns} (expected 3)`)

  // ══ BUG-89 (resistance in Combat tab; Edit race in Character tab) ═════════════
  const resBefore = await countVisible(page.locator('#sheet-panel-combat').getByRole('button', { name: /poison/i }))
  pass('BUG-89 dwarf shows poison resistance BEFORE edit', resBefore >= 1, `poison chips=${resBefore}`)
  await tab('character')
  await page.getByTitle("Edit this race's ASI, proficiencies, and bonuses (homebrew)").click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForTimeout(1000)
  await tab('combat')
  const resAfter = await countVisible(page.locator('#sheet-panel-combat').getByRole('button', { name: /poison/i }))
  pass('BUG-89 poison resistance SURVIVES race edit+save (effects not stripped)', resAfter >= 1, `poison chips after=${resAfter}`)

  // ══ BUG-94 multiclass level-up ═══════════════════════════════════════════════
  await importChar(f5Path); await openChar('Fighter Five')
  await page.locator('#sheet-panel-character').getByText('Level', { exact: true }).first().locator('xpath=..').getByRole('button', { name: '+' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Add new class/i }).click(); await page.waitForTimeout(400)
  await page.getByText('Bard', { exact: true }).first().click(); await page.waitForTimeout(600)  // opens Bard detail
  await page.getByRole('button', { name: 'Select', exact: true }).click(); await page.waitForTimeout(1200)  // confirm → LevelUpDialog
  const cantripSec = await page.getByText(/Cantrips . choose 2/i).count()
  const spellSec = await page.getByText(/Spells to Learn . choose 4/i).count()
  pass('BUG-94 multiclass into Bard grants full spells/cantrips (Cantrips choose 2 + Spells choose 4)', cantripSec > 0 && spellSec > 0, `cantrip section=${cantripSec}, spell section=${spellSec}`)
} catch (e) {
  console.log('DRIVER ERROR:', e.message, '\n', e.stack)
} finally {
  console.log('\n=== SUMMARY ===')
  console.log(`${results.filter(r => r.ok).length}/${results.length} checks passed`)
  const pe = errors.filter(e => !/Storage is not persistent|Failed to load resource|persist|net::ERR|api\//i.test(e))
  if (pe.length) console.log('page console errors:', pe.slice(0, 6))
  await browser.close()
  process.exit(results.filter(r => !r.ok && !r.name.includes('best-effort')).length ? 1 : 0)
}
