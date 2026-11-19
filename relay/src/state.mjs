/** In-memory relay config and runtime phase (keys never written to disk). */

/** @type {Record<string, unknown>} */
let relayConfig = {
  profile: '720p30',
  bitrateMbps: 3,
}

/** @type {'idle' | 'starting' | 'live' | 'error'} */
let relayPhase = 'idle'

/** @type {string | null} */
let relayError = null

/** @type {string[]} */
const ffmpegLog = []

/** @type {import('./encoder.mjs').EncoderSession | null} */
let encoderSession = null

export function getRelayConfig() {
  return relayConfig
}

export function applyConfig(body) {
  if (!body || typeof body !== 'object') return
  relayConfig = { ...relayConfig, ...body }
  if (!relayConfig.youtubeKey) relayConfig.streamDescription = ''
  if (body.profile && body.bitrateMbps === undefined) {
    const bitrates = {
      cloud720p30: 2.5,
      '720p30': 3,
      '720p60': 4.5,
      '1080p30': 6,
      '1080p60': 9,
      '2k60': 12,
      '4k60': 20,
    }
    const id = String(body.profile)
    relayConfig.bitrateMbps = bitrates[id] ?? relayConfig.bitrateMbps
  }
}

export function getPhase() {
  return relayPhase
}

export function setPhase(phase) {
  relayPhase = phase
}

export function getError() {
  return relayError
}

export function setError(message) {
  relayError = message
}

export function clearError() {
  relayError = null
}

export function pushFfmpegLog(line) {
  const entry = String(line)
  ffmpegLog.push(entry)
  if (ffmpegLog.length > 80) ffmpegLog.shift()
  console.log(entry)
}

export function getFfmpegLog() {
  return [...ffmpegLog]
}

export function setEncoderSession(session) {
  encoderSession = session
}

export function getEncoderSession() {
  return encoderSession
}

export async function stopEncoder() {
  if (encoderSession) {
    await encoderSession.stop().catch(() => undefined)
    encoderSession = null
  }
}