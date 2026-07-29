// Campaign notes page redesign — runtime verification against
// `wrangler pages dev dist --port 8788` (local D1, x-dev-email identities).
// Covers: campaign-page button placement (above Players, inline blocks gone),
// /campaign/:id/notes with General tab first, "+" adds a location tab and
// auto-selects it (created row returned by POST), location description + NPC
// probes inside the tab, hidden-note visibility, sessionStorage tab
// persistence across reload, location delete snapping back to General, the
// sheet's Notes tab navigating to the page, and 4 tabs on non-campaign chars.
import { chromium } from 'file:///C:/Users/buyp1/Workspace/dnd-character-sheet/node_modules/playwright/index.mjs'
import fs from 'node:fs'

const SCRATCH = 'C:/Users/buyp1/AppData/Local/Temp/claude/c--Users-buyp1-Workspace-dnd-character-sheet/0b760faa-f2f6-4255-9f37-2af7647ee9ad/scratchpad'
const DRIVERS = 'C:/Users/buyp1/Workspace/dnd-character-sheet/.claude/skills/verify/drivers'
const SHOT = (n) => `${SCRATCH}/shots/${n}.png`
const BASE = 'http://localhost:8788'
const RUN = String(process.pid % 100000)
const CHAR_NAME = 'Verify NotesPage ' + RUN
const results = []
function step(ok, label, detail = '') {
  results.push(`${ok ? 'OK ' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`)
  console.log(results[results.length - 1])
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()

// Username onboarding / What's New / sync-conflict dialogs can appear seconds
// after load on a cold wrangler — sweep after every navigation.
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

async function addNoteIn(scope, text, hidden = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ta = scope.locator('textarea').last()
    await ta.fill(text)
    if (hidden) {
      const cb = scope.locator('input[type="checkbox"]').last()
      if (!(await cb.isChecked())) await cb.click()
    }
    try {
      await scope.getByRole('button', { name: 'Add note' }).last().click({ timeout: 6000 })
      // Wait for the saved note ROW, not the draft textarea.
      await scope.locator('p.whitespace-pre-wrap').filter({ hasText: text.slice(0, 24) }).first().waitFor({ timeout: 10000 })
      return
    } catch { /* re-fill and retry */ }
  }
  throw new Error('addNoteIn failed: ' + text)
}

try {
  const dm = await makeUser('dm@test.local', 'Dungeon Master')
  const player = await makeUser('p1@test.local', 'Player One')

  // Fresh campaign per run (idempotent against the persistent local D1).
  const campaign = await dm.evaluate(async (name) => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return res.json()
  }, 'NotesPage Campaign ' + RUN)
  step(!!campaign.id && !!campaign.inviteCode, 'DM created a campaign', campaign.id)

  const joined = await player.evaluate(async (code) => {
    const res = await fetch('/api/campaigns/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    return res.status
  }, campaign.inviteCode)
  step(joined === 200, 'player joined via invite code')

  // ── Campaign page: button placement, inline blocks gone ─────────────────────
  await goTo(dm, `${BASE}/campaign/${campaign.id}`)
  const viewBtn = dm.getByRole('button', { name: 'View Campaign Notes' })
  await viewBtn.waitFor()
  step(true, 'campaign page shows the View Campaign Notes button')
  step(await dm.getByRole('button', { name: 'Add note' }).count() === 0,
    'inline campaign-notes panel is GONE from the campaign page')
  step(await dm.locator('section').filter({ hasText: 'Locations' }).count() === 0,
    'inline Locations section is GONE from the campaign page')
  const order = await dm.evaluate(() => {
    const headings = [...document.querySelectorAll('h2')]
    const myChars = headings.find(h => /My Characters/i.test(h.textContent))
    const players = headings.find(h => /^Players$/i.test(h.textContent.trim()))
    const btn = [...document.querySelectorAll('button')].find(b => /View Campaign Notes/.test(b.textContent))
    if (!myChars || !players || !btn) return 'missing'
    const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    return after(myChars, btn) && after(btn, players) ? 'ok' : 'wrong-order'
  })
  step(order === 'ok', 'button sits BETWEEN My Characters and Players', order)
  await dm.screenshot({ path: SHOT('np1-campaign-page'), fullPage: false })

  // ── Notes page: General first + active; DM notes ─────────────────────────────
  await viewBtn.click()
  await dm.waitForURL('**/notes')
  const dmTabs = dm.getByRole('tablist', { name: 'Notes sections' })
  await dmTabs.getByRole('tab', { name: 'General' }).waitFor()
  const firstTab = dmTabs.getByRole('tab').first()
  step(/general/i.test(await firstTab.textContent() ?? ''), 'General is the FIRST tab')
  step((await firstTab.getAttribute('aria-selected')) === 'true', 'General starts active')

  const dmGeneral = dm.locator('section').filter({ hasText: 'General Notes' }).first()
  await addNoteIn(dmGeneral, 'Welcome to the campaign — session 0 on Friday.')
  step(true, 'DM added a public note in General')
  await addNoteIn(dmGeneral, 'The twist: the mayor is the villain.', true)
  step(true, 'DM added a hidden note in General')

  // ── Player: button → page; sees public, not hidden ───────────────────────────
  await goTo(player, `${BASE}/campaign/${campaign.id}`)
  await player.getByRole('button', { name: 'View Campaign Notes' }).click()
  await player.waitForURL('**/notes')
  const plGeneral = player.locator('section').filter({ hasText: 'General Notes' }).first()
  await plGeneral.getByText('session 0 on Friday').waitFor()
  step(!/mayor is the villain/.test(await plGeneral.textContent() ?? ''),
    'player sees the public note but NOT the DM’s hidden note')

  // ── Player adds a location via "+" → tab auto-selected ──────────────────────
  await player.getByRole('button', { name: 'Add location' }).click()
  await player.locator('input[placeholder="New location name…"]').fill('The Yawning Portal')
  await player.getByRole('button', { name: 'Add', exact: true }).click()
  const ypTab = player.getByRole('tab', { name: 'The Yawning Portal' })
  await ypTab.waitFor()
  step((await ypTab.getAttribute('aria-selected')) === 'true',
    'new location tab appears AND is auto-selected (created row from POST)')

  // Location content inside the tab: description edit, notes, NPCs.
  await player.getByText('No description yet').waitFor()
  await player.getByRole('button', { name: 'Edit' }).click()
  await player.locator('input[placeholder="Location name"]').waitFor()
  await player.locator('textarea[placeholder="What is this place?"]').fill('A famous inn built over a well that descends into Undermountain.')
  await player.getByRole('button', { name: 'Save', exact: true }).click()
  await player.getByText('descends into Undermountain').waitFor()
  step(true, 'location description edited inside the tab')

  await player.locator('input[placeholder="NPC name…"]').fill('Durnan')
  await player.locator('textarea[placeholder*="Who are they"]').fill('The grim barkeep.')
  await player.getByRole('button', { name: 'Add NPC' }).click()
  await player.getByRole('button', { name: 'Durnan', exact: true }).waitFor()
  step(true, 'NPC quick-added inside the location tab')

  await player.getByRole('button', { name: 'Durnan', exact: true }).click()
  await player.getByText('The grim barkeep.').waitFor()
  const npcNotes = player.locator('section').filter({ hasText: 'NPCs here' }).first().locator('div.pl-5').first()
  await addNoteIn(npcNotes, 'Durnan winked at me — he knows something.', true)
  step(true, 'player added a hidden note on the NPC')
  await player.screenshot({ path: SHOT('np2-location-tab'), fullPage: false })

  // ── Reload keeps the active tab (sessionStorage) ──────────────────────────────
  await player.reload()
  await settleDialogs(player, 'Player One')
  const ypTabAfter = player.getByRole('tab', { name: 'The Yawning Portal' })
  await ypTabAfter.waitFor()
  step((await ypTabAfter.getAttribute('aria-selected')) === 'true',
    'reload restores the active location tab (sessionStorage)')

  // ── DM opens the location tab: sees the NPC + the player's hidden note ──────
  await goTo(dm, `${BASE}/campaign/${campaign.id}/notes`)
  await dm.getByRole('tab', { name: 'The Yawning Portal' }).click()
  await dm.getByRole('button', { name: 'Durnan', exact: true }).click()
  await dm.getByText('he knows something').waitFor()
  step(true, 'DM sees the player’s hidden NPC note in the location tab')
  await dm.screenshot({ path: SHOT('np3-dm-location'), fullPage: false })

  // ── Delete a location → tab disappears, snaps back to General ────────────────
  await player.getByRole('button', { name: 'Add location' }).click()
  await player.locator('input[placeholder="New location name…"]').fill('Doomed Hamlet')
  await player.getByRole('button', { name: 'Add', exact: true }).click()
  await player.getByRole('tab', { name: 'Doomed Hamlet' }).waitFor()
  await player.getByRole('button', { name: 'Delete Doomed Hamlet' }).click()
  await player.getByRole('tab', { name: 'Doomed Hamlet' }).waitFor({ state: 'detached' })
  const generalAfter = player.getByRole('tab', { name: 'General' })
  step((await generalAfter.getAttribute('aria-selected')) === 'true',
    'deleting the open location drops its tab and snaps back to General')

  // ── Sheet: Notes tab NAVIGATES to the notes page ─────────────────────────────
  const seed = JSON.parse(fs.readFileSync(`${DRIVERS}/verify-epaladin.json`, 'utf8'))
  seed.character.name = CHAR_NAME
  fs.writeFileSync(`${SCRATCH}/verify-notespage-seed.json`, JSON.stringify(seed, null, 2))
  await goTo(dm, BASE + '/')
  await dm.getByRole('button', { name: 'Data' }).click()
  await dm.locator('input[type="file"][accept=".json"]').setInputFiles(`${SCRATCH}/verify-notespage-seed.json`)
  await dm.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await settleDialogs(dm, 'Dungeon Master')
  // Imports strip campaignId by design — attach via the real Add Character flow.
  await goTo(dm, `${BASE}/campaign/${campaign.id}`)
  await dm.getByRole('button', { name: 'Add Character' }).click()
  const row = dm.getByRole('dialog').locator('div').filter({ hasText: CHAR_NAME }).filter({ has: dm.getByRole('button', { name: 'Move' }) }).last()
  await row.getByRole('button', { name: 'Move' }).click()
  await dm.waitForTimeout(1000)
  await goTo(dm, BASE + '/')
  await dm.getByText(CHAR_NAME).first().click()
  await dm.waitForURL('**/character/**')
  await settleDialogs(dm, 'Dungeon Master')

  await dm.getByRole('tab', { name: 'Notes' }).waitFor()
  step(await dm.getByRole('tab').count() === 6, 'campaign character shows Personal + Notes tabs (6 tabs)')
  await dm.getByRole('tab', { name: 'Notes' }).click()
  await dm.waitForURL('**/notes')
  await dm.getByRole('tab', { name: 'General' }).waitFor()
  step(true, 'sheet Notes tab NAVIGATES to the campaign notes page')
  await dm.screenshot({ path: SHOT('np4-sheet-to-notes'), fullPage: false })

  // ── Non-campaign character: 4 tabs, no Notes ─────────────────────────────────
  await goTo(dm, BASE + '/')
  await dm.getByRole('button', { name: 'Data' }).click()
  await dm.locator('input[type="file"][accept=".json"]').setInputFiles(`${DRIVERS}/verify-paladin.json`)
  await dm.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await settleDialogs(dm, 'Dungeon Master')
  await dm.getByText('Verify Paladin').first().click()
  await dm.waitForURL('**/character/**')
  await dm.getByRole('tab', { name: 'Combat' }).waitFor()
  step(await dm.getByRole('tab').count() === 4, 'non-campaign character has NO Notes tab (4 tabs)')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
