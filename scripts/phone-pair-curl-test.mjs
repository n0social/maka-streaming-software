/**
 * Smoke-test phone pair HTTP contract (no Electron).
 * Mirrors PhonePairServer paths and response shapes.
 * Usage: node scripts/phone-pair-curl-test.mjs
 *
 * Set PHONE_PAIR_TEST_GRACE_MS for a shorter grace window in tests (default 80ms).
 */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'

const PORT = 38_474
const PAIR_PATH = '/pair'
const REJOIN_PATH = '/rejoin'
const OFFLINE_PATH = '/offline'
const WEBRTC_OFFER_PATH = '/webrtc/offer'
const WEBRTC_ANSWER_PATH = '/webrtc/answer'
const REJOIN_GRACE_MS = Number(process.env.PHONE_PAIR_TEST_GRACE_MS || 80)

function detectLanIPv4() {
  for (const addrs of Object.values(networkInterfaces())) {
    if (!addrs) continue
    for (const addr of addrs) {
      if ((addr.family === 'IPv4' || addr.family === 4) && !addr.internal) return addr.address
    }
  }
  return '127.0.0.1'
}

let activeToken = randomBytes(24).toString('hex')
const usedTokens = new Set()
let studioStatus = 'waiting'
let sessionToken = null
let pendingAnswer = null
let graceTimer = null

function cancelGrace() {
  if (graceTimer) {
    clearTimeout(graceTimer)
    graceTimer = null
  }
}

function expireGrace() {
  cancelGrace()
  sessionToken = null
  studioStatus = 'waiting'
  pendingAnswer = null
  activeToken = randomBytes(24).toString('hex')
}

function startGrace() {
  cancelGrace()
  graceTimer = setTimeout(expireGrace, REJOIN_GRACE_MS)
}

function studioUnpair() {
  cancelGrace()
  sessionToken = null
  studioStatus = 'waiting'
  pendingAnswer = null
  activeToken = randomBytes(24).toString('hex')
}

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === PAIR_PATH) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const t = body.token
    if (usedTokens.has(t)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'This code was already used. Refresh in the studio.' }))
      return
    }
    if (t !== activeToken) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid pairing code.' }))
      return
    }
    usedTokens.add(t)
    sessionToken = randomBytes(16).toString('hex')
    studioStatus = 'connected'
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, message: 'connected', session: sessionToken }))
    return
  }

  if (req.method === 'POST' && req.url === REJOIN_PATH) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!sessionToken || body.session !== sessionToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Session ended. Scan a new QR code.' }))
      return
    }
    if (studioStatus !== 'reconnecting' && studioStatus !== 'connected') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Session ended. Scan a new QR code.' }))
      return
    }
    cancelGrace()
    studioStatus = 'connected'
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, message: 'reconnected', session: sessionToken }))
    return
  }

  if (req.method === 'POST' && req.url === WEBRTC_OFFER_PATH) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!sessionToken || body.session !== sessionToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Session ended. Scan a new QR code.' }))
      return
    }
    if (studioStatus === 'reconnecting') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Call rejoin before sending media.' }))
      return
    }
    if (studioStatus !== 'connected') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Session ended. Scan a new QR code.' }))
      return
    }
    if (!body.sdp || body.type !== 'offer') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid offer.' }))
      return
    }
    pendingAnswer = { type: 'answer', sdp: 'v=0\r\n' }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method === 'GET' && req.url?.startsWith(WEBRTC_ANSWER_PATH)) {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
    const session = url.searchParams.get('session')
    if (!sessionToken || session !== sessionToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Session ended. Scan a new QR code.' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, answer: pendingAnswer }))
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
    if (studioStatus === 'connected') {
      studioStatus = 'reconnecting'
      pendingAnswer = null
      startGrace()
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        status: studioStatus,
        sessionEnded: false,
        graceMs: REJOIN_GRACE_MS,
      }),
    )
    return
  }

  res.writeHead(404)
  res.end()
})

await new Promise((resolve) => server.listen(PORT, '0.0.0.0', resolve))

const lan = detectLanIPv4()
const pairUrl = `http://${lan}:${PORT}/?t=${encodeURIComponent(activeToken)}`
const base = `http://127.0.0.1:${PORT}`

const good = await fetch(`${base}${PAIR_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: activeToken }),
})
const goodBody = await good.json()
const session = goodBody.session

const bad = await fetch(`${base}${PAIR_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: activeToken }),
})
const badBody = await bad.json()

const offer = await fetch(`${base}${WEBRTC_OFFER_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session, type: 'offer', sdp: 'v=0\r\n' }),
})
const offerBody = await offer.json()

const offline = await fetch(`${base}${OFFLINE_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session }),
})
const offlineBody = await offline.json()
const statusAfterOffline = studioStatus

const offerWhileReconnecting = await fetch(`${base}${WEBRTC_OFFER_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session, type: 'offer', sdp: 'v=0\r\n' }),
})
const offerWhileReconnectingBody = await offerWhileReconnecting.json()

const rejoin = await fetch(`${base}${REJOIN_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session }),
})
const rejoinBody = await rejoin.json()

const offerAfterRejoin = await fetch(`${base}${WEBRTC_OFFER_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session, type: 'offer', sdp: 'v=0\r\n' }),
})
const offerAfterRejoinBody = await offerAfterRejoin.json()

studioUnpair()
const rejoinAfterUnpair = await fetch(`${base}${REJOIN_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session }),
})
const rejoinAfterUnpairBody = await rejoinAfterUnpair.json()

const expiryToken = activeToken
const good2 = await fetch(`${base}${PAIR_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: expiryToken }),
})
const session2 = (await good2.json()).session

await fetch(`${base}${OFFLINE_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: session2 }),
})

await new Promise((r) => setTimeout(r, REJOIN_GRACE_MS + 40))

const rejoinAfterExpiry = await fetch(`${base}${REJOIN_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: session2 }),
})
const rejoinAfterExpiryBody = await rejoinAfterExpiry.json()

console.log('pairUrl:', pairUrl)
console.log('graceMs:', REJOIN_GRACE_MS)
console.log('good:', good.status, JSON.stringify(goodBody))
console.log('bad:', bad.status, JSON.stringify(badBody))
console.log('offline:', offline.status, JSON.stringify(offlineBody), 'statusAfterOffline:', statusAfterOffline)
console.log('webrtc-during-reconnect:', offerWhileReconnecting.status, JSON.stringify(offerWhileReconnectingBody))
console.log('rejoin:', rejoin.status, JSON.stringify(rejoinBody))
console.log('webrtc-after-rejoin:', offerAfterRejoin.status, JSON.stringify(offerAfterRejoinBody))
console.log('rejoin-after-unpair:', rejoinAfterUnpair.status, JSON.stringify(rejoinAfterUnpairBody))
console.log('rejoin-after-expiry:', rejoinAfterExpiry.status, JSON.stringify(rejoinAfterExpiryBody))

await new Promise((resolve) => server.close(resolve))

if (good.status !== 200 || !goodBody.ok || !session) process.exit(2)
if (bad.status === 200 && badBody.ok) process.exit(3)
if (!badBody.message || !String(badBody.message).includes('already used')) process.exit(3)
if (offline.status !== 200 || !offlineBody.ok || statusAfterOffline !== 'reconnecting') process.exit(4)
if (offlineBody.sessionEnded) process.exit(4)
if (offerWhileReconnecting.status === 200 && offerWhileReconnectingBody.ok) process.exit(5)
if (rejoin.status !== 200 || !rejoinBody.ok) process.exit(6)
if (offerAfterRejoin.status !== 200 || !offerAfterRejoinBody.ok) process.exit(7)
if (rejoinAfterUnpair.status === 200 && rejoinAfterUnpairBody.ok) process.exit(8)
if (rejoinAfterExpiry.status === 200 && rejoinAfterExpiryBody.ok) process.exit(9)
if (offer.status !== 200 || !offerBody.ok) process.exit(10)
