#!/usr/bin/env node
/**
 * Smoke checks for GeForce Now web studio + relay contract (no droplet deploy).
 * - Static: profiles include 4k60; GeForce Now copy; honest relay messaging
 * - Optional: mock relay on 38473 + POST /config shape
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []

function assert(cond, msg) {
  if (!cond) failures.push(msg)
  else console.log('ok —', msg)
}

const htmlPath = join(root, 'site/stream/index.html')
const livePath = join(root, 'site/stream/js/live.js')
const settingsPath = join(root, 'site/stream/js/settings.js')
const previewPath = join(root, 'site/stream/js/preview.js')
const docsPath = join(root, 'docs/web-studio-cloud-streaming.md')

assert(existsSync(htmlPath), 'site/stream/index.html exists')
assert(existsSync(docsPath), 'docs/web-studio-cloud-streaming.md exists')

const html = readFileSync(htmlPath, 'utf8')
const live = readFileSync(livePath, 'utf8')
const settings = readFileSync(settingsPath, 'utf8')
const preview = readFileSync(previewPath, 'utf8')
const docs = readFileSync(docsPath, 'utf8')

for (const id of ['720p30', '720p60', '1080p30', '1080p60', '2k60', '4k60']) {
  assert(html.includes(`value="${id}"`), `HTML encode option ${id}`)
  assert(settings.includes(`id: '${id}'`), `settings.js ENCODE_PROFILES ${id}`)
  assert(live.includes(`'${id}'`), `live.js profile map ${id}`)
}

assert(/GeForce Now/i.test(html), 'HTML mentions GeForce Now')
assert(/GeForce Now/i.test(preview), 'preview.js mentions GeForce Now')
assert(/Share the GeForce Now tab or window/i.test(preview), 'preview share copy')
assert(/MAKArelay|local relay/i.test(html), 'HTML mentions local relay')
assert(!/browser alone.*(4K|NVENC)|NVENC without/i.test(html + live), 'no false browser-alone 4K NVENC claim as a feature')
assert(/cannot.*NVENC|does not encode 4K NVENC|not in this browser/i.test(html + live + settings), 'honest: browser does not do 4K NVENC')
assert(docs.includes('getDisplayMedia'), 'docs cover getDisplayMedia')
assert(docs.includes('38473'), 'docs cover relay port')
assert(docs.includes('WHIP'), 'docs cover WHIP')
assert(docs.includes('4k60'), 'docs cover 4k60 profile id')
assert(live.includes('twitchKey'), 'live.js sends twitchKey in /config')
assert(live.includes('youtubeKey'), 'live.js sends youtubeKey in /config')
assert(live.includes('bitrateMbps'), 'live.js sends bitrateMbps')
assert(live.includes('streamTitle'), 'live.js sends streamTitle')
assert(live.includes('streamCategory'), 'live.js sends streamCategory')
assert(live.includes('maka.stream.bitrateProfile'), 'live.js syncs bitrateProfile localStorage')
assert(settings.includes('maka.stream.bitrateProfile'), 'settings mirrors bitrateProfile')
assert(settings.includes('maka.stream.destinations.v1'), 'settings stores destinations')

/** Minimal mock relay — health + config capture */
let lastConfig = null
const mock = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, version: 'mock-0.0.1', streamUrl: 'http://127.0.0.1:38473/whip', relayToken: 'smoke' }))
    return
  }
  if (url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'idle', profile: lastConfig?.profile || '720p30' }))
    return
  }
  if (url.pathname === '/config' && req.method === 'POST') {
    const chunks = []
    for await (const c of req) chunks.push(c)
    lastConfig = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (url.pathname === '/stop' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  res.writeHead(404)
  res.end('not found')
})

await new Promise((resolve, reject) => {
  mock.once('error', reject)
  mock.listen(38473, '127.0.0.1', resolve)
})

try {
  const health = await fetch('http://127.0.0.1:38473/health').then((r) => r.json())
  assert(health.ok === true, 'mock relay /health ok')

  const body = {
    profile: '4k60',
    bitrateMbps: 16,
    streamTitle: 'GFN smoke',
    streamCategory: 'Just Chatting',
    twitchKey: 'live_smoke_test_key_xxxxx',
  }
  const cfgRes = await fetch('http://127.0.0.1:38473/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer smoke' },
    body: JSON.stringify(body),
  })
  assert(cfgRes.ok, 'mock relay accepts POST /config')
  assert(lastConfig?.profile === '4k60', 'config stored profile 4k60')
  assert(lastConfig?.bitrateMbps === 16, 'config stored bitrateMbps 16')
  assert(lastConfig?.twitchKey === body.twitchKey, 'config stored twitchKey')
  assert(lastConfig?.streamTitle === 'GFN smoke', 'config stored streamTitle')
} finally {
  await new Promise((resolve) => mock.close(resolve))
}

if (failures.length) {
  console.error('\nFAIL:')
  for (const f of failures) console.error(' -', f)
  process.exit(1)
}
console.log('\nAll web-studio cloud smoke checks passed.')
