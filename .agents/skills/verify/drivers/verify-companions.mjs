// Companions feature — runtime verification against
// `wrangler pages dev dist --port 8788` (local D1, x-dev-email identities).
// Three identities (dm / p1 / p2). Covers: the 7-tab sheet with Companions
// between Combat and Personal (absent on solo characters), player-created
// companions with free-form damage parsing (bad input rejected inline),
// automated attack rolls through the two-phase modal, the SEPARATE companion
// roll history (main tray excludes companion rolls and vice versa), HP-stepper
// persistence, visibility (p2 blind to p1's companion; DM pool invisible to
// players; a pooled AUTHORED companion stays visible to its author), the
// campaign page's Players|Companions tabs with DM assign/reassign, co-edit by
// the assignee, the DM read-view companions section, kicked-member 403, and
// the cross-campaign 404 probe.
import { chromium } from 'file:///C:/Users/buyp1/Workspace/dnd-character-sheet/node_modules/playwright/index.mjs'
import fs from 'node:fs'

const SCRATCH = 'C:/Users/buyp1/AppData/Local/Temp/claude/c--Users-buyp1-Workspace-dnd-character-sheet/dec6e53e-d689-42f2-830f-ec8dc8c75868/scratchpad'
const DRIVERS = 'C:/Users/buyp1/Workspace/dnd-character-sheet/.claude/skills/verify/drivers'
fs.mkdirSync(`${SCRATCH}/shots`, { recursive: true })
const SHOT = (n) => `${SCRATCH}/shots/${n}.png`
const BASE = 'http://localhost:8788'
const RUN = String(process.pid % 100000)
const P1_NAME = 'P1 Ranger ' + RUN
const P2_NAME = 'P2 Cleric ' + RUN
const SOLO_NAME = 'Solo Loner ' + RUN
const results = []
function step(ok, label, detail = '') {
  results.push(`${ok ? 'OK ' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`)
  console.log(results[results.length - 1])
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()

async function settleDialogs(page, username) {
  for (let i = 0; i < 10; i++) {
    let acted = false
    try {
      const gotIt = page.getByRole('button', { name: 'Got it' })
      if (await gotIt.isVisible({ timeout: 400 })) { await gotIt.click(); acted = true }
    } catch { /* absent */ }
    try {
      const dlg = page.getByRole('dialog').filter({ hasText: 'username' })
      if (await dlg.isVisible({ timeout: 400 })) {
        await dlg.locator('input').fill(username)
        await dlg.getByRole('button', { name: 'Save' }).click()
        await page.waitForTimeout(400)
        acted = true
      }
    } catch { /* absent */ }
    try {
      const conflict = page.getByRole('dialog').filter({ hasText: 'Sync conflict' })
      if (await conflict.isVisible({ timeout: 400 })) {
        await conflict.getByRole('button', { name: 'Keep my version' }).click()
        acted = true
      }
    } catch { /* absent */ }
    if (!acted && i >= 3) break
    await page.waitForTimeout(400)
  }
}

async function makeUser(email, username) {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-dev-email': email } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page._username = username
  await page.goto(BASE + '/')
  await settleDialogs(page, username)
  return page
}

async function goTo(page, url) {
  await page.goto(url)
  await settleDialogs(page, page._username)
}

async function importChar(page, name) {
  const seed = JSON.parse(fs.readFileSync(`${DRIVERS}/verify-epaladin.json`, 'utf8'))
  seed.character.name = name
  const file = `${SCRATCH}/verify-companions-${name.replace(/\W+/g, '-')}.json`
  fs.writeFileSync(file, JSON.stringify(seed, null, 2))
  await goTo(page, BASE + '/')
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(file)
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await settleDialogs(page, page._username)
}

async function seedCampaignChar(page, campaignId, name) {
  await importChar(page, name)
  await goTo(page, `${BASE}/campaign/${campaignId}`)
  await page.getByRole('button', { name: 'Add Character' }).click()
  const row = page.getByRole('dialog').locator('div').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: 'Move' }) }).last()
  await row.getByRole('button', { name: 'Move' }).click()
  await page.waitForTimeout(1500)
}

async function openSheet(page, name) {
  await goTo(page, BASE + '/')
  await page.getByText(name).first().click()
  await page.waitForURL('**/character/**')
  await settleDialogs(page, page._username)
}

// The Companions tab of the OPEN character sheet.
function companionsPanel(page) {
  return page.locator('#sheet-panel-companions')
}
async function openCompanionsTab(page) {
  await page.getByRole('tab', { name: 'Companions' }).click()
  await page.waitForTimeout(600)
}
async function refreshCompanions(scope) {
  await scope.getByLabel('Refresh companions').click()
  await scope.page().waitForTimeout(1200)
}

try {
  const dm = await makeUser('dm@test.local', 'Dungeon Master')
  const p1 = await makeUser('p1@test.local', 'Player One')
  const p2 = await makeUser('p2@test.local', 'Player Two')

  const campaign = await dm.evaluate(async (name) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return res.json()
  }, 'Companion Campaign ' + RUN)
  step(!!campaign.id, 'DM created a campaign', campaign.id)

  for (const page of [p1, p2]) {
    const status = await page.evaluate(async (code) => {
      const res = await fetch('/api/campaigns/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      return res.status
    }, campaign.inviteCode)
    step(status === 200, `${page._username} joined via invite code`)
  }

  await seedCampaignChar(p1, campaign.id, P1_NAME)
  await seedCampaignChar(p2, campaign.id, P2_NAME)
  await importChar(p1, SOLO_NAME) // stays OUT of the campaign
  step(true, 'campaign characters seeded (+1 solo character for p1)')

  // ── Tab bar: 7 tabs, Companions sits between Combat and Personal ────────────
  await openSheet(p1, P1_NAME)
  await p1.getByRole('tab', { name: 'Companions' }).waitFor()
  const tabTexts = await p1.getByRole('tab').allTextContents()
  step(tabTexts.length === 7, 'campaign character shows 7 tabs', tabTexts.join(','))
  const ci = tabTexts.indexOf('Companions')
  step(tabTexts[ci - 1] === 'Combat' && tabTexts[ci + 1] === 'Personal',
    'Companions sits between Combat and Personal')

  // ── Solo character: no Companions tab ────────────────────────────────────────
  await openSheet(p1, SOLO_NAME)
  step(await p1.getByRole('tab', { name: 'Companions' }).count() === 0,
    'solo (non-campaign) character has no Companions tab')

  // ── p1 creates a companion; malformed damage is rejected inline ─────────────
  await openSheet(p1, P1_NAME)
  await openCompanionsTab(p1)
  const panel = companionsPanel(p1)
  await panel.getByText(/No companions yet/).waitFor()
  step(true, 'empty state renders')

  await panel.getByRole('button', { name: 'Add Companion' }).click()
  const editor = p1.getByRole('dialog').filter({ hasText: 'New Companion' })
  await editor.getByLabel('Companion name').fill('Owlbear Cub')
  await editor.getByLabel('Kind line').fill('Medium monstrosity, unaligned')
  await editor.getByLabel('Max HP').fill('30')
  await editor.getByLabel('HP', { exact: true }).fill('30')
  await editor.getByText('Add attack').click()
  await editor.getByLabel('Attack 1 name').fill('Bite')
  await editor.getByLabel('Attack 1 to-hit bonus').fill('4')
  await editor.getByLabel('Attack 1 damage').fill('banana')
  await editor.getByRole('button', { name: 'Save Companion' }).click()
  await editor.getByRole('alert').waitFor()
  step(/damage must look like/.test(await editor.getByRole('alert').textContent() ?? ''),
    'editor rejects malformed damage ("banana") inline, save blocked')

  await editor.getByLabel('Attack 1 damage').fill('1d10+2 slashing')
  await editor.getByRole('button', { name: 'Save Companion' }).click()
  await editor.waitFor({ state: 'detached' })
  const card = panel.locator('section').filter({ hasText: 'Owlbear Cub' }).first()
  await card.waitFor()
  step(/Bite/.test(await card.textContent() ?? '') && /1d10\+2 slashing/.test(await card.textContent() ?? ''),
    'stat-block card renders the structured attack')
  await p1.screenshot({ path: SHOT('comp1-card'), fullPage: false })

  // ── Automated attack roll: two-phase modal + separate history ───────────────
  await card.getByRole('button', { name: /^Hit/ }).click()
  const rollModal = p1.getByRole('dialog').filter({ hasText: 'Owlbear Cub: Bite' })
  await rollModal.waitFor()
  step(/Stat block to-hit/.test(await rollModal.textContent() ?? ''),
    'attack roll opens the two-phase modal with itemized "Stat block to-hit"')
  // Roll the damage phase when offered (nat-1 shows only Close — accept either).
  const dmgBtn = rollModal.getByRole('button', { name: /Roll Damage/ })
  if (await dmgBtn.count() > 0) {
    await dmgBtn.first().click()
    await p1.waitForTimeout(400)
    step(true, 'damage phase rolled (crit doubling handled by the modal)')
  } else {
    step(/Critical Miss/.test(await rollModal.textContent() ?? ''), 'nat 1 — Critical Miss path')
  }
  await p1.keyboard.press('Escape')
  await rollModal.waitFor({ state: 'detached' })

  // Companion save chip → inline modal (result phase) — origin-tagged.
  await card.getByTitle('Roll a DEX save for Owlbear Cub').click()
  await p1.keyboard.press('Escape')
  await p1.waitForTimeout(300)

  const historyPanel = panel.locator('section').filter({ hasText: 'Companion Rolls' })
  await historyPanel.waitFor()
  const historyText = await historyPanel.textContent() ?? ''
  step(/Owlbear Cub: Bite/.test(historyText), 'companion history holds the attack roll')
  step(/Owlbear Cub — DEX Save/i.test(historyText), 'companion history name-prefixes the save roll')

  // Main tray: a control d20 lands there; companion rolls do NOT.
  await p1.locator('div.fixed.bottom-0 button', { hasText: 'd20' }).click()
  await p1.keyboard.press('Escape').catch(() => {})
  await p1.locator('div.fixed.bottom-0 button').last().click() // open tray history
  await p1.waitForTimeout(300)
  const trayText = await p1.locator('div.fixed').filter({ hasText: 'Roll History' }).textContent() ?? ''
  step(/d20/.test(trayText), 'control d20 lands in the main tray history')
  step(!/Owlbear Cub/.test(trayText), 'main tray history contains NO companion rolls')
  await p1.locator('div.fixed.bottom-0 button').last().click() // close tray
  await p1.screenshot({ path: SHOT('comp2-history'), fullPage: false })

  // ── HP stepper persists through PUT + reload ─────────────────────────────────
  await card.locator('button', { hasText: '−' }).first().click()
  await p1.waitForTimeout(1200)
  await p1.reload()
  await settleDialogs(p1, 'Player One')
  await openCompanionsTab(p1)
  const cardAfter = companionsPanel(p1).locator('section').filter({ hasText: 'Owlbear Cub' }).first()
  await cardAfter.waitFor()
  step(/29/.test(await cardAfter.textContent() ?? ''), 'HP stepper decrement persisted across reload (30 → 29)')

  // ── p2 sees nothing of p1's companion ────────────────────────────────────────
  await openSheet(p2, P2_NAME)
  await openCompanionsTab(p2)
  const p2panel = companionsPanel(p2)
  await p2panel.getByText(/No companions yet/).waitFor()
  step(!/Owlbear Cub/.test(await p2panel.textContent() ?? ''), 'p2 cannot see p1’s companion')

  // ── Campaign page: Players|Companions tabs; DM management ───────────────────
  await goTo(dm, `${BASE}/campaign/${campaign.id}`)
  await dm.getByRole('tab', { name: 'Players' }).waitFor()
  step(await dm.getByText(P1_NAME).count() > 0, 'Players tab (default) still shows the roster')
  await dm.getByRole('tab', { name: 'Companions' }).click()
  await dm.getByText('Owlbear Cub').waitFor()
  step(/added by Player One/.test(await dm.textContent('body') ?? ''),
    'DM’s Companions tab shows p1’s companion with authorship')

  // DM creates a pooled companion.
  await dm.getByRole('button', { name: 'Add Companion' }).click()
  const dmEditor = dm.getByRole('dialog').filter({ hasText: 'New Companion' })
  await dmEditor.getByLabel('Companion name').fill('Warhorse')
  await dmEditor.getByLabel('Max HP').fill('19')
  await dmEditor.getByLabel('HP', { exact: true }).fill('19')
  const assignSelect = dmEditor.getByLabel('Assign the new companion')
  step((await assignSelect.inputValue()) === '__pool__', 'DM create defaults to Unassigned (pool)')
  await dmEditor.getByRole('button', { name: 'Save Companion' }).click()
  await dmEditor.waitFor({ state: 'detached' })
  await dm.getByText('Unassigned (DM pool)').waitFor()
  step(true, 'Warhorse created into the DM pool')
  await dm.screenshot({ path: SHOT('comp3-dm-pool'), fullPage: false })

  // Pool rows are invisible to both players.
  await refreshCompanions(p2panel)
  step(!/Warhorse/.test(await p2panel.textContent() ?? ''), 'pool row invisible to p2')
  await openSheet(p1, P1_NAME)
  await openCompanionsTab(p1)
  step(!/Warhorse/.test(await companionsPanel(p1).textContent() ?? ''), 'pool row invisible to p1')

  // ── DM assigns Warhorse → p2; p2 co-edits; DM reassigns → p1 ───────────────
  const charIds = await dm.evaluate(async (cid) => {
    const res = await fetch(`/api/campaigns/${cid}/characters`)
    const body = await res.json()
    return Object.fromEntries(body.characters.map(c => [c.data.name, c.id]))
  }, campaign.id)
  const warhorseCard = dm.locator('section').filter({ hasText: 'Warhorse' }).first()
  await warhorseCard.getByLabel('Assign Warhorse').selectOption(charIds[P2_NAME])
  await dm.waitForTimeout(1200)
  step(true, 'DM assigned Warhorse to p2’s character via the per-card picker')

  await refreshCompanions(companionsPanel(p2))
  const p2horse = companionsPanel(p2).locator('section').filter({ hasText: 'Warhorse' }).first()
  await p2horse.waitFor()
  step(true, 'p2 sees the DM-assigned Warhorse after Refresh')
  await p2horse.locator('button', { hasText: '−' }).first().click() // co-edit: HP 19 → 18
  await p2.waitForTimeout(1200)

  const dmCheck = await dm.evaluate(async (cid) => {
    const res = await fetch(`/api/campaigns/${cid}/companions`)
    const body = await res.json()
    const horse = body.companions.find(c => c.data.name === 'Warhorse')
    return horse?.data.currentHp
  }, campaign.id)
  step(dmCheck === 18, 'p2’s co-edit (HP 19 → 18) persisted server-side', `currentHp=${dmCheck}`)

  await dm.reload()
  await settleDialogs(dm, 'Dungeon Master')
  await dm.getByRole('tab', { name: 'Companions' }).click()
  const warhorseCard2 = dm.locator('section').filter({ hasText: 'Warhorse' }).first()
  await warhorseCard2.getByLabel('Assign Warhorse').selectOption(charIds[P1_NAME])
  await dm.waitForTimeout(1200)
  await refreshCompanions(companionsPanel(p2))
  step(!/Warhorse/.test(await companionsPanel(p2).textContent() ?? ''), 'reassigned away — p2 no longer sees Warhorse')
  await refreshCompanions(companionsPanel(p1))
  step(/Warhorse/.test(await companionsPanel(p1).textContent() ?? ''), 'p1 gained Warhorse after reassignment')

  // ── Author keeps sight of a pooled creation ──────────────────────────────────
  const owlbearId = await dm.evaluate(async (cid) => {
    const res = await fetch(`/api/campaigns/${cid}/companions`)
    const body = await res.json()
    return body.companions.find(c => c.data.name === 'Owlbear Cub')?.id
  }, campaign.id)
  const moveStatus = await dm.evaluate(async ({ cid, id }) => {
    const res = await fetch(`/api/campaigns/${cid}/companions/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedCharacterId: null }),
    })
    return res.status
  }, { cid: campaign.id, id: owlbearId })
  step(moveStatus === 200, 'DM moved p1-authored Owlbear Cub to the pool')
  await refreshCompanions(companionsPanel(p1))
  const p1TextAfterPool = await companionsPanel(p1).textContent() ?? ''
  step(/With the DM \(unassigned\)/.test(p1TextAfterPool) && /Owlbear Cub/.test(p1TextAfterPool),
    'author still sees their pooled creation under "With the DM"')
  await refreshCompanions(companionsPanel(p2))
  step(!/Owlbear Cub/.test(await companionsPanel(p2).textContent() ?? ''), 'pooled authored row still invisible to p2')

  // ── DM read-view of p1's character: rollable companions section ─────────────
  await goTo(dm, `${BASE}/campaign/${campaign.id}`)
  await dm.getByText(P1_NAME).first().click()
  await dm.waitForURL('**/character/**')
  const dmHorse = dm.locator('section').filter({ hasText: 'Warhorse' }).first()
  await dmHorse.waitFor()
  step(true, 'DM read-view shows the character’s companions section')
  // Warhorse has no attacks, so probe rollability via a save chip → modal.
  await dmHorse.getByTitle('Roll a DEX save for Warhorse').click()
  const dmRollModal = dm.getByRole('dialog').filter({ hasText: /DEX Save/i })
  await dmRollModal.waitFor()
  step(true, 'rolls are live on the DM read-view (save chip opened the roll modal)')
  await dm.keyboard.press('Escape')
  await dmRollModal.waitFor({ state: 'detached' })
  await dm.screenshot({ path: SHOT('comp4-dm-readview'), fullPage: false })

  // ── Kicked member loses access ───────────────────────────────────────────────
  const warhorseId = await dm.evaluate(async (cid) => {
    const res = await fetch(`/api/campaigns/${cid}/companions`)
    const body = await res.json()
    return body.companions.find(c => c.data.name === 'Warhorse')?.id
  }, campaign.id)
  const kickStatus = await dm.evaluate(async (cid) => {
    const res = await fetch(`/api/campaigns/${cid}/members/${encodeURIComponent('p2@test.local')}`, { method: 'DELETE' })
    return res.status
  }, campaign.id)
  step(kickStatus === 200, 'DM kicked p2')
  const kickedPut = await p2.evaluate(async ({ cid, id }) => {
    const res = await fetch(`/api/campaigns/${cid}/companions/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedCharacterId: null }),
    })
    return res.status
  }, { cid: campaign.id, id: warhorseId })
  step(kickedPut === 403, 'kicked p2’s direct PUT → 403 (membership-first)', `status=${kickedPut}`)

  // ── Cross-campaign probe: the id is dead outside its campaign ────────────────
  const camp2 = await dm.evaluate(async (name) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return res.json()
  }, 'Decoy Campaign ' + RUN)
  const crossStatus = await dm.evaluate(async ({ cid, id }) => {
    const res = await fetch(`/api/campaigns/${cid}/companions/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ assignedCharacterId: null }),
    })
    return res.status
  }, { cid: camp2.id, id: warhorseId })
  step(crossStatus === 404, 'companion id via another campaign’s URL → 404', `status=${crossStatus}`)

  // ── DM delete propagates ─────────────────────────────────────────────────────
  const delStatus = await dm.evaluate(async ({ cid, id }) => {
    const res = await fetch(`/api/campaigns/${cid}/companions/${id}`, { method: 'DELETE' })
    return res.status
  }, { cid: campaign.id, id: warhorseId })
  step(delStatus === 200, 'DM deleted Warhorse')
  await refreshCompanions(companionsPanel(p1))
  step(!/Warhorse/.test(await companionsPanel(p1).textContent() ?? ''), 'deletion propagated to p1 on refresh')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
