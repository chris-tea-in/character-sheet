// Run after npm run build. Exercises the generated service worker with no HTTP cache.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const root = resolve('dist')
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm' }
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (pathname.startsWith('/api/')) {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end('{}')
    return
  }
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return }
  try {
    const content = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(content)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext()
  let page = await context.newPage()
  const origin = `http://127.0.0.1:${server.address().port}`
  await page.goto(origin)
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready })
  await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  const paths = ['/data/classes.json', '/data/races.json', '/data/spells.json', '/data/equipment.json']
  await page.evaluate(async paths => {
    for (const path of paths) await (await fetch(path)).json()
    await fetch('/api/me')
  }, paths)
  await page.waitForFunction(async paths => {
    const cache = await caches.open('game-data-v2')
    return (await Promise.all(paths.map(path => cache.match(path)))).every(Boolean)
  }, paths, { timeout: 10_000 })
  assert.equal(await page.evaluate(async () => Boolean(await caches.match('/api/me'))), false)
  await page.close()
  await context.setOffline(true)
  page = await context.newPage()
  await page.goto(origin)
  const result = await page.evaluate(async paths => {
    const data = await Promise.all(paths.map(async path => {
      const response = await fetch(path)
      return { path, status: response.status, entries: Object.keys(await response.json()).length }
    }))
    let apiFailed = false
    try { await fetch('/api/me') } catch { apiFailed = true }
    return { data, apiFailed }
  }, paths)
  assert.ok(result.data.every(entry => entry.status === 200 && entry.entries > 0))
  assert.equal(result.apiFailed, true)
  console.log('PASS: cold offline navigation, four reference catalogs, and uncached API', result)
} finally {
  await browser.close()
  await new Promise(resolve => server.close(resolve))
}
