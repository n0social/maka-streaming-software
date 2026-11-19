import { randomUUID } from 'node:crypto'
import { RTCPeerConnection } from 'werift'
import {
  applyConfig,
  clearError,
  getEncoderSession,
  getPhase,
  getRelayConfig,
  pushFfmpegLog,
  setEncoderSession,
  setError,
  setPhase,
  stopEncoder,
} from './state.mjs'
import { ensureEncoder } from './encoder.mjs'

/** @type {Map<string, { pc: RTCPeerConnection, resourcePath: string }>} */
export const whipSessions = new Map()

export function whipSessionActive() {
  return whipSessions.size > 0
}

export async function closeAllWhipSessions() {
  await stopEncoder()
  for (const [id, session] of whipSessions) {
    try {
      session.pc.close()
    } catch {
      /* ignore */
    }
    whipSessions.delete(id)
    console.log(`[whip] session closed ${id}`)
  }
  if (getPhase() === 'live') setPhase('idle')
}

async function waitForIceGathering(pc, timeoutMs = 6000) {
  if (pc.iceGatheringState === 'complete') return
  await new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener?.('icegatheringstatechange', onChange)
      clearTimeout(timer)
      resolve(undefined)
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    pc.addEventListener?.('icegatheringstatechange', onChange)
    const timer = setTimeout(done, timeoutMs)
    pc.iceGatheringStateChange?.subscribe?.((state) => {
      if (state === 'complete') done()
    })
  })
}

/**
 * @param {string} offerSdp
 */
export async function handleWhipPost(offerSdp) {
  setPhase('starting')
  clearError()

  const pc = new RTCPeerConnection({})

  const trackLog = (track, streamId) => {
    const kind = track?.kind ?? '?'
    const id = track?.id ?? track?.uuid ?? '?'
    console.log(`[whip] inbound track kind=${kind} id=${id} stream=${streamId || ''}`)
  }

  if (typeof pc.addEventListener === 'function') {
    pc.addEventListener('track', (ev) => {
      trackLog(ev.track, ev.streams?.[0]?.id)
    })
  }
  pc.ontrack = (ev) => {
    trackLog(ev.track ?? ev, ev.streams?.[0]?.id)
  }
  pc.onTrack?.subscribe?.((track) => {
    trackLog(track, track.streamId)
  })

  try {
    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await waitForIceGathering(pc)

    const answerSdp = pc.localDescription?.sdp
    if (!answerSdp) {
      pc.close()
      setPhase('error')
      setError('WHIP answer produced empty SDP')
      throw new Error('WHIP answer produced empty SDP')
    }

    const sessionId = randomUUID()
    const resourcePath = `/whip/${sessionId}`
    whipSessions.set(sessionId, { pc, resourcePath })

    const startEncoderWhenReady = async () => {
      const session = await ensureEncoder(pc)
      setEncoderSession(session)
      setPhase('live')
    }

    const onState = (state) => {
      console.log(`[whip] connectionState=${state}`)
      if (state === 'connected') void startEncoderWhenReady()
      if (state === 'failed' || state === 'closed') {
        whipSessions.delete(sessionId)
        void stopEncoder().then(() => setEncoderSession(null))
        if (whipSessions.size === 0) setPhase('idle')
      }
    }

    if (pc.connectionStateChange?.subscribe) {
      pc.connectionStateChange.subscribe(onState)
    } else {
      void startEncoderWhenReady()
    }

    return { answerSdp, resourcePath, sessionId }
  } catch (err) {
    pc.close()
    setPhase('error')
    const message = err instanceof Error ? err.message : String(err)
    setError(message)
    throw err
  }
}

export async function handleWhipDelete(sessionId) {
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
    await stopEncoder()
    setPhase('idle')
  }
}

/**
 * Apply config while live — restart ffmpeg when encode settings change.
 * @param {Record<string, unknown>} body
 */
export async function applyConfigLive(body) {
  applyConfig(body)
  const active = [...whipSessions.values()][0]?.pc
  if (active) {
    await stopEncoder()
    const session = await ensureEncoder(active)
    setEncoderSession(session)
    pushFfmpegLog('[config] encoder rebuilt after live config apply')
  }
}