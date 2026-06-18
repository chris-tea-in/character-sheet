// Multi-identity campaign privacy gate (shared-campaigns release gate).
// Runs against `wrangler pages dev` on :8788 with the x-dev-email override.
const BASE = 'http://localhost:8788'
const DM = 'dm@example.com', ALICE = 'alice@example.com', BOB = 'bob@example.com', EVIL = 'evil@example.com'

let pass = 0, fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`) }
}

async function req(method, path, identity, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'x-dev-email': identity, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* no body */ }
  return { status: res.status, json }
}

const uuid = () => crypto.randomUUID()
const newChar = (name, campaignId, extra = {}) => ({
  updatedAt: Date.now(),
  patch: { name, campaignId, currentHp: 10, tempHp: 0, maxHp: 10, level: 1, classes: [], abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, ...extra },
})
const patch = (fields) => ({ updatedAt: Date.now(), patch: fields })

async function main() {
  console.log('— Setup —')
  const created = await req('POST', '/api/campaigns', DM, { name: 'Gate Test Campaign' })
  check('DM creates campaign (200 + code)', created.status === 200 && !!created.json?.id && !!created.json?.inviteCode)
  const cid = created.json.id
  const code = created.json.inviteCode

  // Outsider cannot create a character in a campaign they don't belong to
  const evilCharId = uuid()
  const evilInsert = await req('PUT', `/api/characters/${evilCharId}`, EVIL, newChar('Intruder', cid))
  check('Non-member PUT new char with campaignId → 403', evilInsert.status === 403, `got ${evilInsert.status}`)

  // DM adds their own character
  const dmCharId = uuid()
  const dmIns = await req('PUT', `/api/characters/${dmCharId}`, DM, newChar('DM Hero', cid))
  check('DM adds own character (200)', dmIns.status === 200, `got ${dmIns.status}`)

  // Alice joins + adds
  const aliceJoin = await req('POST', '/api/campaigns/join', ALICE, { code })
  check('Alice joins via code (200)', aliceJoin.status === 200 && aliceJoin.json?.id === cid)
  const aliceCharId = uuid()
  const aliceIns = await req('PUT', `/api/characters/${aliceCharId}`, ALICE, newChar('Alice Hero', cid))
  check('Alice adds character (200)', aliceIns.status === 200, `got ${aliceIns.status}`)

  // Bob joins + adds
  const bobJoin = await req('POST', '/api/campaigns/join', BOB, { code })
  check('Bob joins via code (200)', bobJoin.status === 200)
  const bobCharId = uuid()
  const bobIns = await req('PUT', `/api/characters/${bobCharId}`, BOB, newChar('Bob Hero', cid))
  check('Bob adds character (200)', bobIns.status === 200, `got ${bobIns.status}`)

  console.log('\n— Membership-scoped visibility —')
  const dmView = await req('GET', `/api/campaigns/${cid}/characters`, DM)
  const dmOwners = (dmView.json?.characters ?? []).map(c => c.ownerEmail).sort()
  check('DM sees all three owners', dmView.status === 200 && JSON.stringify(dmOwners) === JSON.stringify([ALICE, BOB, DM].sort()), JSON.stringify(dmOwners))

  const aliceView = await req('GET', `/api/campaigns/${cid}/characters`, ALICE)
  const aliceOwners = (aliceView.json?.characters ?? []).map(c => c.ownerEmail)
  check('Alice sees only her own', aliceView.status === 200 && aliceOwners.length === 1 && aliceOwners[0] === ALICE, JSON.stringify(aliceOwners))

  const bobView = await req('GET', `/api/campaigns/${cid}/characters`, BOB)
  const bobOwners = (bobView.json?.characters ?? []).map(c => c.ownerEmail)
  check('Bob sees only his own', bobView.status === 200 && bobOwners.length === 1 && bobOwners[0] === BOB, JSON.stringify(bobOwners))

  const evilView = await req('GET', `/api/campaigns/${cid}/characters`, EVIL)
  check('Non-member GET campaign chars → 403', evilView.status === 403, `got ${evilView.status}`)

  console.log('\n— PUT authority —')
  const evilPut = await req('PUT', `/api/characters/${aliceCharId}`, EVIL, patch({ currentHp: 1 }))
  check('Unrelated email PUT someone else\'s char → 403', evilPut.status === 403, `got ${evilPut.status}`)

  const dmEditsAlice = await req('PUT', `/api/characters/${aliceCharId}`, DM, patch({ currentHp: 5 }))
  check('Campaign DM PUT a member\'s char → 200', dmEditsAlice.status === 200, `got ${dmEditsAlice.status}`)
  let aliceChar = (await req('GET', `/api/campaigns/${cid}/characters`, ALICE)).json.characters.find(c => c.id === aliceCharId)
  check('DM\'s HP edit reached the owner (currentHp=5)', aliceChar?.data?.currentHp === 5, `currentHp=${aliceChar?.data?.currentHp}`)

  // DM cannot change campaignId/owner of a member's character
  const dmTriesMove = await req('PUT', `/api/characters/${aliceCharId}`, DM, patch({ campaignId: null, tempHp: 9 }))
  check('DM PUT with campaignId → 200 (campaignId stripped, other fields land)', dmTriesMove.status === 200, `got ${dmTriesMove.status}`)
  aliceChar = (await req('GET', `/api/campaigns/${cid}/characters`, ALICE)).json.characters.find(c => c.id === aliceCharId)
  check('DM could NOT change campaignId (still in campaign)', !!aliceChar && aliceChar.data?.campaignId === cid, `campaignId=${aliceChar?.data?.campaignId}`)
  check('DM\'s non-membership field still landed (tempHp=9)', aliceChar?.data?.tempHp === 9, `tempHp=${aliceChar?.data?.tempHp}`)

  console.log('\n— Field-scoped merge correctness —')
  await req('PUT', `/api/characters/${aliceCharId}`, ALICE, patch({ currentHp: 10 }))
  await req('PUT', `/api/characters/${aliceCharId}`, DM, patch({ tempHp: 7 }))
  aliceChar = (await req('GET', `/api/campaigns/${cid}/characters`, ALICE)).json.characters.find(c => c.id === aliceCharId)
  check('Concurrent edits to DIFFERENT fields both survive (currentHp=10 & tempHp=7)',
    aliceChar?.data?.currentHp === 10 && aliceChar?.data?.tempHp === 7, `currentHp=${aliceChar?.data?.currentHp} tempHp=${aliceChar?.data?.tempHp}`)
  await req('PUT', `/api/characters/${aliceCharId}`, ALICE, patch({ currentHp: 1 }))
  await req('PUT', `/api/characters/${aliceCharId}`, DM, patch({ currentHp: 2 }))
  aliceChar = (await req('GET', `/api/campaigns/${cid}/characters`, ALICE)).json.characters.find(c => c.id === aliceCharId)
  check('SAME-field last write wins (currentHp=2)', aliceChar?.data?.currentHp === 2, `currentHp=${aliceChar?.data?.currentHp}`)

  console.log('\n— Member roster + admin authority —')
  const dmMembers = await req('GET', `/api/campaigns/${cid}/members`, DM)
  check('DM lists members (3)', dmMembers.status === 200 && dmMembers.json?.members?.length === 3, `n=${dmMembers.json?.members?.length}`)
  const aliceMembers = await req('GET', `/api/campaigns/${cid}/members`, ALICE)
  check('Player GET members roster → 403', aliceMembers.status === 403, `got ${aliceMembers.status}`)
  const aliceRotate = await req('POST', `/api/campaigns/${cid}/code`, ALICE)
  check('Player rotate code → 403', aliceRotate.status === 403, `got ${aliceRotate.status}`)
  const aliceDelete = await req('DELETE', `/api/campaigns/${cid}`, ALICE)
  check('Player delete campaign → 403', aliceDelete.status === 403, `got ${aliceDelete.status}`)
  const removeDm = await req('DELETE', `/api/campaigns/${cid}/members/${encodeURIComponent(DM)}`, DM)
  check('DM cannot be removed as a member → 400', removeDm.status === 400, `got ${removeDm.status}`)

  console.log('\n— Self-leave —')
  const bobLeave = await req('DELETE', `/api/campaigns/${cid}/members/${encodeURIComponent(BOB)}`, BOB)
  check('Bob self-leaves (200)', bobLeave.status === 200, `got ${bobLeave.status}`)
  const dmViewAfter = await req('GET', `/api/campaigns/${cid}/characters`, DM)
  const ownersAfter = (dmViewAfter.json?.characters ?? []).map(c => c.ownerEmail).sort()
  check('After leave, Bob\'s char drops from DM view', JSON.stringify(ownersAfter) === JSON.stringify([ALICE, DM].sort()), JSON.stringify(ownersAfter))
  const bobCampaigns = await req('GET', '/api/campaigns', BOB)
  check('After leave, campaign gone from Bob\'s list', !(bobCampaigns.json?.campaigns ?? []).some(c => c.id === cid))

  console.log(`\n========================================`)
  console.log(`  ${pass} passed, ${fail} failed`)
  console.log(`========================================`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2) })
