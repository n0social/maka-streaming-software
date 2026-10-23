/**
 * Smoke-test phone pair HTTP contract (no Electron).
 * Mirrors PhonePairServer paths and response shapes.
 * Usage: node scripts/phone-pair-curl-test.mjs
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'

const PORT = 38_474
const PAIR_PATH = '/pair'
const OFFLINE_PATH = '/offline'

function detectLanIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    if (!addrs) continue
    for (const addr of addrs) {
      if ((addr.family === 'IPv4' || addr.family === 4) && !addr.internal) return addr.address
    }
  }
  return '127.0.0.1'
}

const token = randomBytes(24).toString('hex')
let tokenUsed = false
let studioStatus = 'waiting'
let sessionToken = null

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === PAIR_PATH) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const t = body.token
    if (tokenUsed || t !== token) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid pairing code.' }))
      return
    }
    tokenUsed = true
    sessionToken = randomBytes(16).toString('hex')
    studioStatus = 'connected'
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, message: 'connected', session: sessionToken }))
    return
  }

  if (req.method === 'POST' && req.url === OFFLINE_PATH) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!sessionToken || body.session !== sessionToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid session.' }))
      return
    }
    if (studioStatus === 'connected') studioStatus = 'offline'
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, status: studioStatus }))
    return
  }

  res.writeHead(404)
  res.end()
})

await new Promise((resolve) => server.listen(PORT, '0.0.0.0', resolve))

const lan = detectLanIPv4()
const pairUrl = `http://${lan}:${PORT}/?t=${encodeURIComponent(token)}`
const base = `http://127.0.0.1:${PORT}`

const good = await fetch(`${base}${PAIR_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token }),
})
const goodBody = await good.json()

const bad = await fetch(`${base}${PAIR_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token }),
})
const badBody = await bad.json()

const offline = await fetch(`${base}${OFFLINE_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: goodBody.session }),
})
const offlineBody = await offline.json()

console.log('pairUrl:', pairUrl)
console.log('good:', good.status, JSON.stringify(goodBody))
console.log('bad:', bad.status, JSON.stringify(badBody))
console.log('offline:', offline.status, JSON.stringify(offlineBody), 'studioStatus:', studioStatus)

await new Promise((resolve) => server.close(resolve))

if (good.status !== 200 || !goodBody.ok || !goodBody.session) process.exit(2)
if (bad.status === 200 && badBody.ok) process.exit(3)
if (offline.status !== 200 || !offlineBody.ok || studioStatus !== 'offline') process.exit(4)
