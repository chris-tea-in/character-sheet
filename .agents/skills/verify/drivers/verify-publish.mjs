// Hidden→public note publishing: three identities prove the visibility flip.
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

const notesSection = (page) => page.locator('section').filter({ hasText: 'Campaign Notes' }).first()

try {
  const dm = await makeUser('dm@test.local', 'Dungeon Master')
  const p1 = await makeUser('p1@test.local', 'Player One')
  const p2 = await makeUser('p2@test.local', 'Player Two')

  const campaign = await dm.evaluate(async () => {
    const res = await fetch('/api/campaigns', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Publish Test' }),
    })
    return res.json()
  })
  for (const p of [p1, p2]) {
    const status = await p.evaluate(async (code) => {
      const res = await fetch('/api/campaigns/join', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      return res.status
    }, campaign.inviteCode)
    if (status !== 200) throw new Error('join failed')
  }
  step(true, 'campaign seeded with DM + two players')

  // p1 writes a hidden note
  await goTo(p1, `${BASE}/campaign/${campaign.id}`)
  const p1Notes = notesSection(p1)
  await p1Notes.locator('textarea').fill('SECRET: the artifact is fake.')
  await p1Notes.locator('input[type="checkbox"]').click()
  await p1Notes.getByRole('button', { name: 'Add note' }).click()
  await p1Notes.getByText('the artifact is fake').waitFor()
  step(true, 'p1 added a hidden note')

  // p2 cannot see it
  await goTo(p2, `${BASE}/campaign/${campaign.id}`)
  const p2Notes = notesSection(p2)
  await p2Notes.getByText('No notes yet.').waitFor()
  step(true, 'p2 sees no notes while it is hidden')

  // p1 publishes it via the new eye toggle
  await p1Notes.getByRole('button', { name: 'Make note public' }).click()
  await p1Notes.locator('span').filter({ hasText: /^hidden/ }).first().waitFor({ state: 'detached' }).catch(() => {})
  await p1.waitForTimeout(600)
  const p1Text = (await p1Notes.textContent() ?? '')
  step(!/hidden/.test(p1Text), 'p1: hidden badge gone after publishing', p1Text.slice(0, 80))
  await p1.screenshot({ path: SHOT('pub1-published'), fullPage: false })

  // p2 now sees the note (refresh button — no polling by design)
  await p2Notes.getByRole('button', { name: 'Refresh notes' }).click()
  await p2Notes.getByText('the artifact is fake').waitFor()
  step(true, 'p2 sees the note after it was pushed to the live notes')

  // and p1 can retract it back to hidden
  await p1Notes.getByRole('button', { name: 'Make note hidden' }).click()
  await p1.waitForTimeout(600)
  await p2Notes.getByRole('button', { name: 'Refresh notes' }).click()
  await p2Notes.getByText('No notes yet.').waitFor()
  step(true, 'retracting to hidden removes it from p2 again')
} catch (err) {
  step(false, 'UNCAUGHT', String(err).slice(0, 300))
} finally {
  await browser.close()
  console.log('\n==== SUMMARY ====')
  for (const r of results) console.log(r)
}
