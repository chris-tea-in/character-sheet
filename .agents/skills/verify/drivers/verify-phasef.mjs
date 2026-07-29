// Phase F runtime verification — two identities (DM + player) against one
// `wrangler pages dev` (:8788, local D1). Each browser context carries its own
// x-dev-email header, which the DEV_EMAIL bypass honors per request.
import { chromium } from 'file:///C:/Users/buyp1/Workspace/dnd-character-sheet/node_modules/playwright/index.mjs'

const SCRATCH = 'C:/Users/buyp1/AppData/Local/Temp/claude/c--Users-buyp1-Workspace-dnd-character-sheet/0b760faa-f2f6-4255-9f37-2af7647ee9ad/scratchpad'
const SHOT = (n) => `${SCRATCH}/shots/${n}.png`
const BASE = 'http://localhost:8788'
const results = []
function step(ok, label, detail = '') {
  results.push(`${ok ? 'OK ' : 'FAIL'} | ${label}${detail ? ' | ' + detail : ''}`)
  console.log(results[results.length - 1])
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()

// The username-onboarding dialog appears whenever /api/me resolves with no
// username — which can be SECONDS after load on a cold wrangler (per-route
// compile). Sweep for it after every navigation so it can never block a click.
async function settleDialogs(page, username) {
  for (let i = 0; i < 10; i++) {
    let acted = false
    try {
      const gotIt = page.getByRole('button', { name: 'Got it' })
      if (await gotIt.isVisible({ timeout: 500 })) { await gotIt.click(); acted = true }
    } catch { /* absent */ }
    try {
      const dlg = page.getByRole('dialog').filter({ hasText: 'username' })
      if (await dlg.isVisible({ timeout: 500 })) {
        await dlg.locator('input').fill(username)
        await dlg.getByRole('button', { name: 'Save' }).click()
        await page.waitForTimeout(500)
        acted = true
      }
    } catch { /* absent */ }
    if (!acted && i >= 3) break
    await page.waitForTimeout(500)
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
      await scope.getByText(text.slice(0, 24)).first().waitFor({ timeout: 10000 })
      return
    } catch { /* re-fill and retry */ }
  }
  throw new Error('addNoteIn failed: ' + text)
}

try {
  const dm = await makeUser('dm@test.local', 'Dungeon Master')
  const player = await makeUser('p1@test.local', 'Player One')

  // DM creates a campaign via the API (browser fetch carries the identity header)
  const campaign = await dm.evaluate(async () => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Notes Test Campaign' }),
    })
    return res.json()
  })
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

  // ── Campaign page: DM adds a public note + a hidden note ─────────────────────
  await goTo(dm, `${BASE}/campaign/${campaign.id}`)
  const dmNotes = dm.locator('section').filter({ hasText: 'Campaign Notes' }).first()
  await addNoteIn(dmNotes, 'Welcome to the campaign — session 0 on Friday.')
  step(true, 'DM added a public campaign note')

  await addNoteIn(dmNotes, 'The twist: the mayor is the villain.', true)
  step(true, 'DM added a hidden campaign note')

  // Player sees the public note but NOT the DM's hidden note
  await goTo(player, `${BASE}/campaign/${campaign.id}`)
  const plNotes = player.locator('section').filter({ hasText: 'Campaign Notes' }).first()
  await plNotes.getByText('session 0 on Friday').waitFor()
  const plText = (await plNotes.textContent() ?? '')
  step(!/mayor is the villain/.test(plText), 'player CANNOT see the DM’s hidden note')

  // Player adds their own hidden note; DM sees it with an authorship badge
  await addNoteIn(plNotes, 'I do not trust the mayor either.', true)
  step(true, 'player added their own hidden note')

  await dm.reload(); await settleDialogs(dm, 'Dungeon Master')
  const dmNotes2 = dm.locator('section').filter({ hasText: 'Campaign Notes' }).first()
  await dmNotes2.getByText('I do not trust the mayor').waitFor()
  step(/hidden — by (Player One|p1@test\.local)/.test(await dmNotes2.textContent() ?? ''),
    'DM sees the player’s hidden note with a "hidden — by" badge')
  await dm.screenshot({ path: SHOT('f1-dm-notes'), fullPage: false })

  // ── Locations: player creates one, both can open its page ────────────────────
  const plLocs = player.locator('section').filter({ hasText: 'Locations' }).first()
  await plLocs.locator('input').fill('The Yawning Portal')
  await plLocs.getByRole('button', { name: 'Add' }).click()
  await plLocs.getByText('The Yawning Portal').waitFor()
  step(true, 'player created a location')

  await plLocs.getByRole('button', { name: 'The Yawning Portal' }).first().click()
  await player.waitForURL('**/location/**')
  await player.getByText('No description yet').waitFor()
  step(true, 'location page opens with empty description')

  // Author edits the description
  await player.getByRole('button', { name: /Edit/ }).click()
  await player.locator('textarea').first().fill('A famous inn built over a well that descends into Undermountain.')
  await player.getByRole('button', { name: 'Save', exact: true }).click()
  await player.getByText('descends into Undermountain').waitFor()
  step(true, 'location author edited the description')

  // NPC quick-add + a hidden NPC note
  await player.locator('input[placeholder="NPC name…"]').fill('Durnan')
  await player.locator('textarea[placeholder*="Who are they"]').fill('The grim barkeep.')
  await player.getByRole('button', { name: 'Add NPC' }).click()
  await player.getByRole('button', { name: 'Durnan', exact: true }).waitFor()
  step(true, 'player quick-added an NPC (lightweight entry)')

  await player.getByRole('button', { name: 'Durnan', exact: true }).click()
  const npcPanel = player.locator('div').filter({ has: player.getByText('The grim barkeep.') }).last()
  await player.getByText('The grim barkeep.').waitFor()
  // The expanded NPC row's note panel (div.pl-5) — NOT the quick-add textarea below it
  const npcNotes = player.locator('section').filter({ hasText: 'NPCs here' }).first().locator('div.pl-5').first()
  await addNoteIn(npcNotes, 'Durnan winked at me — he knows something.', true)
  step(true, 'player added a hidden note on the NPC')
  void npcPanel

  // DM opens the same location: sees the NPC and the player's hidden NPC note
  await goTo(dm, `${BASE}/campaign/${campaign.id}/location/${player.url().split('/location/')[1]}`)
  await dm.getByRole('button', { name: 'Durnan', exact: true }).click()
  await dm.getByText('he knows something').waitFor()
  step(true, 'DM sees the player’s hidden NPC note (authorized viewer)')
  await dm.screenshot({ path: SHOT('f2-location-dm'), fullPage: false })
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
