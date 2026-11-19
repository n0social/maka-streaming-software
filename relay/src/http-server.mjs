import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { liveStatsFromReports, reportsFromPeer } from '../../scripts/relay-live-stats.mjs'
import {
  applyConfig,
  getError,
  getFfmpegLog,
  getPhase,
  getRelayConfig,
} from './state.mjs'
import {
  closeAllWhipSessions,
  handleWhipDelete,
  handleWhipPost,
  whipSessions,
  applyConfigLive,
} from './whip.mjs'

const HOST = process.env.RELAY_HOST ?? '127.0.0.1'
const PORT = Number(process.env.RELAY_PORT ?? 38_473)
const WHIP_URL = `http://${HOST}:${PORT}/whip`
const RELAY_VERSION = process.env.RELAY_VERSION ?? '0.1.1'

const relayToken = randomBytes(24).toString('hex')

let mockRtmpLive = false

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

export function healthPayload() {
  return {
    ok: true,
    version: RELAY_VERSION,
    streamUrl: WHIP_URL,
    relayToken,
    openSource: true,
  }
}

function statusPayload() {
  const relayConfig = getRelayConfig()
  const platforms = {}
  const live = mockRtmpLive || getPhase() === 'live'
  if (relayConfig.twitchKey) platforms.twitch = live ? { live: true, viewers: 0 } : false
  if (relayConfig.youtubeKey) platforms.youtube = live ? { live: true, viewers: 0 } : false
  if (relayConfig.customRtmpUrl && relayConfig.customRtmpKey) {
    platforms.custom = live ? { live: true } : false
  }

  return {
    status: getPhase(),
    profile: relayConfig.profile,
    broadcast: {
      title: relayConfig.streamTitle || '',
      game: relayConfig.streamCategory || '',
      description: relayConfig.youtubeKey ? relayConfig.streamDescription || '' : '',
      twitch: Boolean(relayConfig.twitchKey),
      youtube: Boolean(relayConfig.youtubeKey),
    },
    platforms: Object.keys(platforms).length ? platforms : undefined,
    whipSessionActive: whipSessions.size > 0,
    error: getError() ?? undefined,
    ffmpegLog: getFfmpegLog().length ? getFfmpegLog() : undefined,
    bitrateMbps: relayConfig.bitrateMbps,
    viewerCount: live ? 0 : undefined,
  }
}

async function measuredLiveStats() {
  const reports = []
  for (const session of whipSessions.values()) {
    try {
      reports.push(...(await reportsFromPeer(session.pc)))
    } catch {
      /* optional */
    }
  }
  return liveStatsFromReports(reports)
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
    const measured = whipSessions.size ? await measuredLiveStats() : {}
    sendJson(res, 200, { ...statusPayload(), ...measured })
    return
  }

  if (req.method === 'POST' && path === '/config') {
    if (!requireAuth(req, res)) return
    const body = parseJson(await readBody(req))
    if (body === null) {
      sendJson(res, 400, { ok: false, message: 'Invalid JSON' })
      return
    }
  if (whipSessions.size > 0) {
      await applyConfigLive(body)
    } else {
      applyConfig(body)
    }
    const relayConfig = getRelayConfig()
    console.log(
      '[config] profile=%s bitrate=%s title=%s',
      relayConfig.profile,
      relayConfig.bitrateMbps,
      relayConfig.streamTitle || '',
    )
    const hasKeys =
      relayConfig.twitchKey ||
      relayConfig.youtubeKey ||
      (relayConfig.customRtmpUrl && relayConfig.customRtmpKey)
    mockRtmpLive = hasKeys && getPhase() === 'live'
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && path === '/config/verify') {
    if (!requireAuth(req, res)) return
    const body = parseJson(await readBody(req))
    if (body && typeof body === 'object') applyConfig(body)
    const relayConfig = getRelayConfig()
    if (!relayConfig.profile) {
      sendJson(res, 400, { ok: false, error: 'INVALID_CONFIG', message: 'profile is required' })
      return
    }
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
      message: ok ? 'Keys look valid (shape check only)' : 'Add at least one valid-looking key',
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

  if (req.method === 'POST' && path === '/drop') {
    await closeAllWhipSessions()
    mockRtmpLive = false
    sendJson(res, 200, { ok: true, dropped: true })
    return
  }

  if (req.method === 'POST' && path === '/stop') {
    await closeAllWhipSessions()
    mockRtmpLive = false
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && path === '/whip') {
    if (!requireAuth(req, res)) return
    const offerSdp = (await readBody(req)).toString('utf8')
    if (!offerSdp.trim()) {
      sendText(res, 400, 'Expected SDP body')
      return
    }
    try {
      const { answerSdp, resourcePath } = await handleWhipPost(offerSdp)
      const relayConfig = getRelayConfig()
      mockRtmpLive = Boolean(
        relayConfig.twitchKey ||
          relayConfig.youtubeKey ||
          (relayConfig.customRtmpUrl && relayConfig.customRtmpKey),
      )
      sendText(res, 201, answerSdp, { Location: resourcePath })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendText(res, 500, message)
    }
    return
  }

  if (req.method === 'DELETE' && path.startsWith('/whip/')) {
    if (!requireAuth(req, res)) return
    const sessionId = path.slice('/whip/'.length)
    await handleWhipDelete(sessionId)
    if (whipSessions.size === 0) mockRtmpLive = false
    res.writeHead(204, corsHeaders())
    res.end()
    return
  }

  sendJson(res, 404, { ok: false, message: 'Not found' })
}

/** @returns {import('node:http').Server} */
export function startRelayServer() {
  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      console.error('[maka-relay] unhandled', err)
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: 'Internal error' })
    })
  })

  server.listen(PORT, HOST, () => {
    console.log('')
    console.log(`MAKA.relay open source v${RELAY_VERSION}`)
    console.log(`  health   http://${HOST}:${PORT}/health`)
    console.log(`  whip     ${WHIP_URL}`)
    console.log(`  token    ${relayToken.slice(0, 8)}… (Bearer on protected routes)`)
    console.log('')
  })

  process.on('SIGINT', () => {
    void closeAllWhipSessions().finally(() => process.exit(0))
  })

  return server
}

export { HOST, PORT, relayToken }