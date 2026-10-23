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
const WEBRTC_OFFER_PATH = '/webrtc/offer'
const WEBRTC_ANSWER_PATH = '/webrtc/answer'
const TOKEN_TTL_MS = 5 * 60 * 1000

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
const tokenExpiresAt = Date.now() + TOKEN_TTL_MS
const usedTokens = new Set()
let studioStatus = 'waiting'
let sessionToken = null
let pendingAnswer = null

function tokenValid(t) {
  if (usedTokens.has(t)) return 'used'
  if (t !== token) return 'missing'
  if (Date.now() > tokenExpiresAt) return 'expired'
  return 'ok'
}

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === PAIR_PATH) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const t = body.token
    const check = tokenValid(t)
    if (check === 'used') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'This code was already used. Refresh in the studio.' }))
      return
    }
    if (check === 'expired') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'This code expired. Refresh in the studio.' }))
      return
    }
    if (check === 'missing') {
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

  if (req.method === 'POST' && req.url === WEBRTC_OFFER_PATH) {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!sessionToken || body.session !== sessionToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Session ended. Scan a new QR code.' }))
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
    if (studioStatus === 'connected') studioStatus = 'offline'
    sessionToken = null
    pendingAnswer = null
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, status: studioStatus, sessionEnded: true }))
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
const pairedSession = goodBody.session

const bad = await fetch(`${base}${PAIR_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token }),
})
const badBody = await bad.json()

const bogusPair = await fetch(`${base}${PAIR_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: 'not-a-real-token' }),
})
const bogusPairBody = await bogusPair.json()
const statusAfterBogusPair = studioStatus

const offer = await fetch(`${base}${WEBRTC_OFFER_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: pairedSession, type: 'offer', sdp: 'v=0\r\n' }),
})
const offerBody = await offer.json()

const answerPoll = await fetch(
  `${base}${WEBRTC_ANSWER_PATH}?session=${encodeURIComponent(pairedSession)}`,
)
const answerBody = await answerPoll.json()

const badOffer = await fetch(`${base}${WEBRTC_OFFER_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: 'bad', type: 'offer', sdp: 'v=0\r\n' }),
})
const badOfferBody = await badOffer.json()

// Studio refresh invalidates session (mirrors PhonePairServer.resetPairing)
sessionToken = null
pendingAnswer = null
studioStatus = 'waiting'

const offerAfterRefresh = await fetch(`${base}${WEBRTC_OFFER_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: pairedSession, type: 'offer', sdp: 'v=0\r\n' }),
})
const offerAfterRefreshBody = await offerAfterRefresh.json()

// New pair for offline flow
const token2 = randomBytes(24).toString('hex')
usedTokens.add(token2)
sessionToken = randomBytes(16).toString('hex')
studioStatus = 'connected'

const offline = await fetch(`${base}${OFFLINE_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: sessionToken }),
})
const offlineBody = await offline.json()

const postOfflineOffer = await fetch(`${base}${WEBRTC_OFFER_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ session: sessionToken, type: 'offer', sdp: 'v=0\r\n' }),
})
const postOfflineOfferBody = await postOfflineOffer.json()

const expiredPair = await fetch(`${base}${PAIR_PATH}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token }),
})
const expiredPairBody = await expiredPair.json()

console.log('pairUrl:', pairUrl)
console.log('good:', good.status, JSON.stringify(goodBody))
console.log('bad:', bad.status, JSON.stringify(badBody))
console.log('bogus:', bogusPair.status, JSON.stringify(bogusPairBody), 'studioStatus:', statusAfterBogusPair)
console.log('offer-after-refresh:', offerAfterRefresh.status, JSON.stringify(offerAfterRefreshBody))
console.log('offline:', offline.status, JSON.stringify(offlineBody), 'studioStatus:', studioStatus)
console.log('webrtc-offer:', offer.status, JSON.stringify(offerBody))
console.log('webrtc-answer:', answerPoll.status, JSON.stringify(answerBody))
console.log('webrtc-bad-offer:', badOffer.status, JSON.stringify(badOfferBody))
console.log('webrtc-after-offline:', postOfflineOffer.status, JSON.stringify(postOfflineOfferBody))
console.log('re-pair-used-token:', expiredPair.status, JSON.stringify(expiredPairBody))

await new Promise((resolve) => server.close(resolve))

if (good.status !== 200 || !goodBody.ok || !goodBody.session) process.exit(2)
if (bad.status === 200 && badBody.ok) process.exit(3)
if (!badBody.message || !String(badBody.message).includes('already used')) process.exit(3)
if (bogusPair.status === 200 && bogusPairBody.ok) process.exit(9)
if (statusAfterBogusPair !== 'connected') process.exit(9)
if (offerAfterRefresh.status === 200 && offerAfterRefreshBody.ok) process.exit(10)
if (offline.status !== 200 || !offlineBody.ok || studioStatus !== 'offline') process.exit(4)
if (!offlineBody.sessionEnded) process.exit(4)
if (offer.status !== 200 || !offerBody.ok) process.exit(5)
if (answerPoll.status !== 200 || !answerBody.ok || !answerBody.answer) process.exit(6)
if (badOffer.status === 200 && badOfferBody.ok) process.exit(7)
if (postOfflineOffer.status === 200 && postOfflineOfferBody.ok) process.exit(8)
if (expiredPair.status === 200 && expiredPairBody.ok) process.exit(11)
