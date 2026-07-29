// Personal tab + notes-page back button — runtime verification against
// `wrangler pages dev dist --port 8788` (local D1, x-dev-email identities).
// Three identities (dm / p1 / p2). Covers: Personal tab on campaign characters
// (6 tabs), Yourself-first picker with NAMES ONLY (no class), Hidden toggle ON
// by default (and re-armed after a save), hidden-note privacy (p2 can't see
// p1's hidden note about them; DM can, with authorship badge), public notes
// crossing over, self-notes round-trip, and the back button returning to
// wherever the page was entered from (campaign page vs character sheet,
// surviving a reload via history state).
import { chromium } from 'file:///C:/Users/buyp1/Workspace/dnd-character-sheet/node_modules/playwright/index.mjs'
import fs from 'node:fs'

const SCRATCH = 'C:/Users/buyp1/AppData/Local/Temp/claude/c--Users-buyp1-Workspace-dnd-character-sheet/0b760faa-f2f6-4255-9f37-2af7647ee9ad/scratchpad'
const DRIVERS = 'C:/Users/buyp1/Workspace/dnd-character-sheet/.claude/skills/verify/drivers'
const SHOT = (n) => `${SCRATCH}/shots/${n}.png`
const BASE = 'http://localhost:8788'
const RUN = String(process.pid % 100000)
const P1_NAME = 'P1 Hero ' + RUN
const P2_NAME = 'P2 Hero ' + RUN
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

// Import a seed character and attach it to the campaign via the real
// Add Character flow (imports strip campaignId by design).
async function seedCampaignChar(page, campaignId, name) {
  const seed = JSON.parse(fs.readFileSync(`${DRIVERS}/verify-epaladin.json`, 'utf8'))
  seed.character.name = name
  const file = `${SCRATCH}/verify-personal-${name.replace(/\W+/g, '-')}.json`
  fs.writeFileSync(file, JSON.stringify(seed, null, 2))
  await goTo(page, BASE + '/')
  await page.getByRole('button', { name: 'Data' }).click()
  await page.locator('input[type="file"][accept=".json"]').setInputFiles(file)
  await page.getByRole('dialog').waitFor({ state: 'detached' }).catch(() => {})
  await settleDialogs(page, page._username)
  await goTo(page, `${BASE}/campaign/${campaignId}`)
  await page.getByRole('button', { name: 'Add Character' }).click()
  const row = page.getByRole('dialog').locator('div').filter({ hasText: name }).filter({ has: page.getByRole('button', { name: 'Move' }) }).last()
  await row.getByRole('button', { name: 'Move' }).click()
  await page.waitForTimeout(1500) // sync up so the roster can see it
}

// Set the Hidden checkbox inside a notes panel to a desired state, then add.
async function addNote(panelScope, text, wantHidden) {
  const cb = panelScope.locator('input[type="checkbox"]').last()
  if (await cb.isChecked() !== wantHidden) await cb.click()
  await panelScope.locator('textarea').last().fill(text)
  await panelScope.getByRole('button', { name: 'Add note' }).last().click()
  await panelScope.locator('p.whitespace-pre-wrap').filter({ hasText: text.slice(0, 24) }).first().waitFor({ timeout: 10000 })
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
  }, 'Personal Campaign ' + RUN)
  step(!!campaign.id && !!campaign.inviteCode, 'DM created a campaign', campaign.id)

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
  step(true, 'both players seeded a campaign character')

  // ── p1: Personal tab exists, picker is names-only, Yourself first ───────────
  await goTo(p1, BASE + '/')
  await p1.getByText(P1_NAME).first().click()
  await p1.waitForURL('**/character/**')
  await settleDialogs(p1, 'Player One')
  await p1.getByRole('tab', { name: 'Personal' }).waitFor()
  step(await p1.getByRole('tab').count() === 7, 'campaign character shows 7 tabs (incl. Companions + Personal + Notes)')

  await p1.getByRole('tab', { name: 'Personal' }).click()
  const panel = p1.locator('#sheet-panel-personal')
  const yourself = panel.getByRole('button', { name: 'Yourself' })
  await yourself.waitFor()
  step((await yourself.getAttribute('aria-pressed')) === 'true', 'Yourself is selected by default')
  await panel.getByText('About ' + P1_NAME).waitFor()
  step(true, 'self notes panel renders (About <own character>)')

  // The roster is fetched once when the sheet mounts — the other player's
  // character sync can land just after it. The panel has a manual refresh for
  // exactly this; use it like a real user would.
  const p2Chip = panel.getByRole('button', { name: P2_NAME })
  let chipVisible = false
  for (let i = 0; i < 6; i++) {
    if (await p2Chip.isVisible().catch(() => false)) { chipVisible = true; break }
    await panel.getByLabel('Refresh the character list').click()
    await p1.waitForTimeout(1500)
  }
  step(chipVisible, 'other player’s character appears in the picker (refresh covers the sync race)')
  const pickerText = await panel.locator('div.flex.flex-wrap').first().textContent() ?? ''
  step(!/paladin/i.test(pickerText), 'picker shows NAMES ONLY — no class', pickerText.trim().slice(0, 80))

  // ── Hidden by default; re-armed after save ───────────────────────────────────
  const cb = panel.locator('input[type="checkbox"]').last()
  step(await cb.isChecked(), 'Hidden toggle starts ON in the Personal tab')

  await p2Chip.click()
  await panel.getByText('About ' + P2_NAME).waitFor()
  step(await panel.locator('input[type="checkbox"]').last().isChecked(),
    'Hidden stays the default after switching subject')

  await addNote(panel, 'P2 keeps eyeing the party gold — watch them.', true)
  step(/hidden/.test(await panel.textContent() ?? ''), 'hidden note about P2 saved with hidden badge')
  step(await panel.locator('input[type="checkbox"]').last().isChecked(),
    'Hidden toggle re-arms (stays ON) after saving')

  await addNote(panel, 'P2 fought bravely at the bridge.', false)
  step(true, 'public note about P2 saved (toggle manually unchecked)')
  await p1.screenshot({ path: SHOT('pn1-p1-personal'), fullPage: false })

  // ── Self-note round-trip ──────────────────────────────────────────────────────
  await yourself.click()
  await panel.getByText('About ' + P1_NAME).waitFor()
  await addNote(panel, 'Reminder: I owe the temple 50gp.', true)
  step(true, 'self-note round-trips (hidden)')

  // ── Print: personal notes must NOT print, even though the print CSS
  //    force-shows inactive tabpanels with !important ─────────────────────────
  await p1.getByRole('tab', { name: 'Character' }).click()
  await p1.emulateMedia({ media: 'print' })
  await p1.waitForTimeout(300)
  const noteInDom = await p1.getByText('owe the temple').count()
  const noteVisibleInPrint = noteInDom > 0 ? await p1.getByText('owe the temple').first().isVisible() : false
  const characterPanelPrints = await p1.locator('#sheet-panel-character').isVisible()
  step(noteInDom > 0 && !noteVisibleInPrint && characterPanelPrints,
    'print media: personal notes hidden while the rest of the sheet prints',
    `inDom=${noteInDom} noteVisible=${noteVisibleInPrint} charPanel=${characterPanelPrints}`)
  await p1.emulateMedia({ media: null })
  await p1.getByRole('tab', { name: 'Personal' }).click()

  // ── p2: sees the public note about them, NOT the hidden one ─────────────────
  await goTo(p2, BASE + '/')
  await p2.getByText(P2_NAME).first().click()
  await p2.waitForURL('**/character/**')
  await settleDialogs(p2, 'Player Two')
  await p2.getByRole('tab', { name: 'Personal' }).click()
  const p2panel = p2.locator('#sheet-panel-personal')
  await p2panel.getByText('About ' + P2_NAME).waitFor()
  await p2panel.getByText('fought bravely at the bridge').waitFor()
  const p2text = await p2panel.textContent() ?? ''
  step(!/eyeing the party gold/.test(p2text), 'p2 CANNOT see p1’s hidden note about them')
  step(/Player One/.test(p2text), 'public note shows Player One as author')
  await p2.screenshot({ path: SHOT('pn2-p2-sees-public'), fullPage: false })

  // ── DM: sees the hidden note with authorship (campaign character page) ──────
  await goTo(dm, `${BASE}/campaign/${campaign.id}`)
  await dm.getByText(P2_NAME).first().click()
  await dm.waitForURL('**/character/**')
  await dm.getByText('eyeing the party gold').waitFor()
  step(/hidden — by (Player One|p1@test\.local)/.test(await dm.textContent('body') ?? ''),
    'DM sees p1’s hidden note about P2 with a "hidden — by" badge')
  await dm.screenshot({ path: SHOT('pn3-dm-sees-hidden'), fullPage: false })

  // ── Back button: campaign page → notes → back to campaign page ──────────────
  await goTo(p1, `${BASE}/campaign/${campaign.id}`)
  await p1.getByRole('button', { name: 'View Campaign Notes' }).click()
  await p1.waitForURL('**/notes')
  await p1.getByLabel('Back').click()
  await p1.waitForURL(new RegExp(`/campaign/${campaign.id}$`))
  step(true, 'back from notes (entered via campaign page) → campaign page')

  // ── Back button: sheet → notes → back to the character sheet ────────────────
  await goTo(p1, BASE + '/')
  await p1.getByText(P1_NAME).first().click()
  await p1.waitForURL('**/character/**')
  const sheetUrl = p1.url()
  await settleDialogs(p1, 'Player One')
  await p1.getByRole('tab', { name: 'Notes' }).click()
  await p1.waitForURL('**/notes')
  await p1.getByLabel('Back').click()
  await p1.waitForURL('**/character/**')
  step(p1.url() === sheetUrl, 'back from notes (entered via sheet Notes tab) → character sheet')

  // Probe: history state survives a reload — back STILL returns to the sheet.
  await p1.getByRole('tab', { name: 'Notes' }).click()
  await p1.waitForURL('**/notes')
  await p1.reload()
  await settleDialogs(p1, 'Player One')
  await p1.getByLabel('Back').click()
  await p1.waitForURL('**/character/**')
  step(p1.url() === sheetUrl, 'returnTo survives a reload of the notes page')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
