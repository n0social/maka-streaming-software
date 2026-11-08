#!/usr/bin/env node
/**
 * MAKA.relay-compatible dev server for browser testing (no MAKArelay.exe).
 * Listens on 127.0.0.1:38473 — same HTTP contract as the desktop sidecar.
 *
 * RTMP ingest is mocked (logged only). WHIP uses werift to accept browser offers.
 */
import { createServer } from 'node:http'
import { randomBytes, randomUUID } from 'node:crypto'
import { RTCPeerConnection } from 'werift'

const HOST = process.env.RELAY_HOST ?? '127.0.0.1'
const PORT = Number(process.env.RELAY_PORT ?? 38_473)
const RELAY_VERSION = process.env.RELAY_MOCK_VERSION ?? '0.1.0-mock'
const WHIP_URL = `http://${HOST}:${PORT}/whip`

const relayToken = randomBytes(24).toString('hex')

let relayConfig = {
  profile: '720p30',
  bitrateMbps: 3,
}

/** @type {Map<string, { pc: RTCPeerConnection, resourcePath: string }>} */
const whipSessions = new Map()

let relayPhase = /** @type {'idle' | 'starting' | 'live' | 'error'} */ ('idle')
let relayError = /** @type {string | null} */ (null)
let mockRtmpLive = false
const ffmpegLog = /** @type {string[]} */ ([])

function logFfmpeg(line) {
  const entry = `[mock-ffmpeg] ${line}`
  ffmpegLog.push(entry)
  if (ffmpegLog.length > 40) ffmpegLog.shift()
  console.log(entry)
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    'Access-Control-Max-Age': '86400',
  }
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(),
  })
  res.end(payload)
}

function sendText(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...corsHeaders(),
    ...extraHeaders,
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function parseJson(buf) {
  if (!buf.length) return {}
  try {
    return JSON.parse(buf.toString('utf8'))
  } catch {
    return null
  }
}

function authOk(req) {
  const header = req.headers.authorization ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return Boolean(match && match[1] === relayToken)
}

function requireAuth(req, res) {
  if (authOk(req)) return true
  sendJson(res, 401, { ok: false, message: 'Missing or invalid relay token' })
  return false
}

function healthPayload() {
  return {
    ok: true,
    version: RELAY_VERSION,
    streamUrl: WHIP_URL,
    relayToken,
  }
}

function statusPayload() {
  const platforms = {}
  if (relayConfig.twitchKey) {
    platforms.twitch = mockRtmpLive ? { live: true, viewers: 0 } : false
  }
  if (relayConfig.youtubeKey) {
    platforms.youtube = mockRtmpLive ? { live: true, viewers: 0 } : false
  }
  if (relayConfig.customRtmpUrl && relayConfig.customRtmpKey) {
    platforms.custom = mockRtmpLive ? { live: true } : false
  }

  return {
    status: relayPhase,
    profile: relayConfig.profile,
    platforms: Object.keys(platforms).length ? platforms : undefined,
    whipSessionActive: whipSessions.size > 0,
    error: relayError ?? undefined,
    ffmpegLog: ffmpegLog.length ? [...ffmpegLog] : undefined,
    bitrateMbps: relayConfig.bitrateMbps,
    droppedFrames: mockRtmpLive ? 0 : undefined,
    latencyMs: mockRtmpLive ? 35 : undefined,
    viewerCount: mockRtmpLive ? 0 : undefined,
  }
}

async function waitForIceGathering(pc, timeoutMs = 6000) {
  if (pc.iceGatheringState === 'complete') return
  await new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', onChange)
      clearTimeout(timer)
      resolve(undefined)
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    pc.addEventListener('icegatheringstatechange', onChange)
    const timer = setTimeout(done, timeoutMs)
  })
}

async function closeAllWhipSessions() {
  for (const [id, session] of whipSessions) {
    try {
      session.pc.close()
    } catch {
      /* ignore */
    }
    whipSessions.delete(id)
    console.log(`[whip] session closed ${id}`)
  }
  mockRtmpLive = false
  if (relayPhase === 'live') relayPhase = 'idle'
}

async function handleWhipPost(res, offerSdp) {
  relayPhase = 'starting'
  relayError = null

  const pc = new RTCPeerConnection({})
  pc.ontrack = (ev) => {
    const kind = ev.track?.kind ?? 'unknown'
    const id = ev.track?.id ?? '?'
    console.log(`[whip] inbound track kind=${kind} id=${id}`)
  }

  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc)

    const answerSdp = pc.localDescription?.sdp
    if (!answerSdp) {
      pc.close()
      relayPhase = 'error'
      relayError = 'WHIP answer produced empty SDP'
      sendText(res, 500, relayError)
      return
    }

    const sessionId = randomUUID()
    const resourcePath = `/whip/${sessionId}`
    whipSessions.set(sessionId, { pc, resourcePath })

    const hasKeys =
      relayConfig.twitchKey ||
      relayConfig.youtubeKey ||
      (relayConfig.customRtmpUrl && relayConfig.customRtmpKey)
    if (hasKeys) {
      mockRtmpLive = true
      logFfmpeg(
        `mock RTMP push profile=${relayConfig.profile} twitch=${Boolean(relayConfig.twitchKey)} youtube=${Boolean(relayConfig.youtubeKey)} custom=${Boolean(relayConfig.customRtmpUrl)}`,
      )
    } else {
      logFfmpeg('WHIP session active — no stream keys configured (RTMP mock idle)')
    }

    relayPhase = 'live'
    pc.connectionStateChange.subscribe((state) => {
      console.log(`[whip] connectionState=${state}`)
      if (state === 'failed' || state === 'closed') {
        whipSessions.delete(sessionId)
        if (whipSessions.size === 0) {
          mockRtmpLive = false
          relayPhase = 'idle'
        }
      }
    })

    sendText(res, 201, answerSdp, { Location: resourcePath })
  } catch (err) {
    pc.close()
    relayPhase = 'error'
    relayError = err instanceof Error ? err.message : String(err)
    sendText(res, 500, relayError)
  }
}

async function handleRequest(req, res) {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`)
  const path = url.pathname

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }

  if (req.method === 'GET' && path === '/health') {
    sendJson(res, 200, healthPayload())
    return
  }

  if (req.method === 'GET' && path === '/status') {
    if (!requireAuth(req, res)) return
    sendJson(res, 200, statusPayload())
    return
  }

  if (req.method === 'POST' && path === '/config') {
    if (!requireAuth(req, res)) return
    const body = parseJson(await readBody(req))
    if (body === null) {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
      return
    }
    relayConfig = { ...relayConfig, ...body }
    if (body.profile && !body.bitrateMbps) {
      const bitrates = {
        '720p30': 3,
        '720p60': 4.5,
        '1080p30': 6,
        '1080p60': 9,
        '2k60': 12,
        '4k60': 20,
      }
      relayConfig.bitrateMbps = bitrates[body.profile] ?? relayConfig.bitrateMbps
    }
    console.log('[config] updated profile=%s', relayConfig.profile)
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && path === '/config/verify') {
    if (!requireAuth(req, res)) return
    const twitchOk = relayConfig.twitchKey ? relayConfig.twitchKey.length >= 10 : undefined
    const youtubeOk = relayConfig.youtubeKey ? relayConfig.youtubeKey.length >= 10 : undefined
    const customOk =
      relayConfig.customRtmpUrl && relayConfig.customRtmpKey
        ? relayConfig.customRtmpKey.length >= 4
        : undefined
    const ok =
      twitchOk !== false &&
      youtubeOk !== false &&
      customOk !== false &&
      Boolean(relayConfig.twitchKey || relayConfig.youtubeKey || customOk)
    sendJson(res, 200, {
      ok,
      twitch: relayConfig.twitchKey ? { ok: Boolean(twitchOk) } : undefined,
      youtube: relayConfig.youtubeKey ? { ok: Boolean(youtubeOk) } : undefined,
      custom: relayConfig.customRtmpUrl ? { ok: Boolean(customOk) } : undefined,
      message: ok ? 'Mock verify OK (no real platform call)' : 'Add at least one valid-looking key',
    })
    return
  }

  if (req.method === 'POST' && path === '/scene') {
    if (!requireAuth(req, res)) return
    const body = parseJson(await readBody(req))
    if (body === null) {
      sendJson(res, 400, { ok: false })
      return
    }
    console.log('[scene] sources=%s', body.sources?.length ?? 0)
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && path === '/stop') {
    await closeAllWhipSessions()
    relayPhase = 'idle'
    relayError = null
    logFfmpeg('stream stopped via POST /stop')
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && path === '/whip') {
    const offerSdp = (await readBody(req)).toString('utf8')
    if (!offerSdp.trim()) {
      sendText(res, 400, 'Expected SDP body')
      return
    }
    await handleWhipPost(res, offerSdp)
    return
  }

  if (req.method === 'DELETE' && path.startsWith('/whip/')) {
    const sessionId = path.slice('/whip/'.length)
    const session = whipSessions.get(sessionId)
    if (session) {
      try {
        session.pc.close()
      } catch {
        /* ignore */
      }
      whipSessions.delete(sessionId)
    }
    if (whipSessions.size === 0) {
      mockRtmpLive = false
      relayPhase = 'idle'
    }
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }

  sendJson(res, 404, { ok: false, message: 'Not found' })
}

const server = createServer((req, res) => {
  void handleRequest(req, res).catch((err) => {
    console.error('[relay-dev] unhandled', err)
    if (!res.headersSent) sendJson(res, 500, { ok: false, message: 'Internal error' })
  })
})

server.listen(PORT, HOST, () => {
  console.log('')
  console.log('MAKA.relay dev mock (API-compatible, RTMP mocked)')
  console.log(`  health   http://${HOST}:${PORT}/health`)
  console.log(`  whip     ${WHIP_URL}`)
  console.log(`  token    ${relayToken.slice(0, 8)}… (Bearer on /config, /status, /scene)`)
  console.log('')
  console.log('Pair with: npm run dev:web-studio  →  open /stream/ or /studio-web/')
  console.log('')
})

process.on('SIGINT', () => {
  void closeAllWhipSessions().finally(() => process.exit(0))
})
