// Run after npm run build. Uses an isolated browser profile and a local Access
// simulation to exercise the production service worker through a full login.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const dist = resolve('dist')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json' }
let origin
let loginOrigin
let callbackRequests = 0
const silentLogin = process.argv.includes('--silent')
const unregisterFirst = process.argv.includes('--unregister')
const server = createServer(async (req, res) => {
  const url = new URL(req.url, origin)
  const redirect = (location) => { res.writeHead(302, { location, 'cache-control': 'no-store' }); res.end() }
  if (url.pathname === '/login') {
    if (silentLogin) {
      redirect(`${origin}/cdn-cgi/access/authorized?returnTo=%2F`)
      return
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<a href="${origin}/cdn-cgi/access/authorized?returnTo=%2F">Sign in</a>`)
    return
  }
  if (url.pathname === '/cdn-cgi/access/authorized') {
    callbackRequests++
    res.setHeader('set-cookie', 'test-session=valid; HttpOnly; SameSite=Lax; Path=/')
    redirect('/')
    return
  }
  if (url.pathname.startsWith('/api/')) {
    const signedIn = req.headers.cookie?.includes('test-session=valid')
    if (url.pathname === '/api/reconnect') {
      redirect(signedIn ? '/' : `${loginOrigin}/login`)
      return
    }
    res.writeHead(signedIn ? 200 : 401, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(!signedIn ? { error: 'Unauthorized' }
      : url.pathname === '/api/me' ? { email: 'test@example.test', username: 'Test Player' }
      : url.pathname === '/api/characters' ? { characters: [] } : { campaigns: [] }))
    return
  }
  try {
    const target = resolve(dist, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`)
    if (!target.startsWith(`${dist}/`) && !target.startsWith(`${dist}\\`)) throw new Error('Invalid path')
    const body = await readFile(target)
    res.writeHead(200, { 'content-type': types[extname(target)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(await readFile(resolve(dist, 'index.html')))
  }
})
await new Promise(resolve => server.listen(0, resolve))
origin = `http://localhost:${server.address().port}`
loginOrigin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true })
  let page = await context.newPage()
  await page.goto(origin)
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
  await page.reload()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  const gotIt = page.getByRole('button', { name: 'Got it', exact: true })
  await gotIt.waitFor({ state: 'visible' })
  await gotIt.click()
  await page.getByRole('button', { name: 'Reconnect', exact: true }).waitFor()
  await page.evaluate(() => localStorage.setItem('reconnect-test-edits', 'keep-me'))
  await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('reconnect-safety-test', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('edits')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('edits', 'readwrite')
      tx.objectStore('edits').put('keep-me', 'unsynced')
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
  }))

  if (unregisterFirst) {
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration || !await registration.unregister()) throw new Error('Unregister failed')
    })
    await page.close()
    page = await context.newPage()
    await page.goto(`${origin}/api/reconnect`)
  } else {
    await page.getByRole('button', { name: 'Reconnect', exact: true }).click()
  }
  if (!silentLogin) {
    await page.getByRole('link', { name: 'Sign in', exact: true }).waitFor()
    await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  }
  await page.waitForURL(url => url.origin === origin)
  await page.waitForLoadState('domcontentloaded')
  assert.equal(callbackRequests, 1, 'The service worker must let the login callback reach the network')
  await page.getByRole('button', { name: 'Signed in as Test Player' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Reconnect', exact: true }).count(), 0)
  assert.equal(await page.evaluate(() => localStorage.getItem('reconnect-test-edits')), 'keep-me')
  assert.equal(await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('reconnect-safety-test', 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const read = db.transaction('edits').objectStore('edits').get('unsynced')
      read.onsuccess = () => { db.close(); resolve(read.result) }
      read.onerror = () => reject(read.error)
    }
  })), 'keep-me')
  console.log(`PASS: ${unregisterFirst ? 'worker removal + reopen' : 'cached mobile app'} -> Reconnect -> ${silentLogin ? 'silent' : 'interactive'} login -> network callback -> signed-in app; localStorage and IndexedDB preserved`)
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
