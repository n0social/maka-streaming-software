import {
  RELAY_TRACK_STREAM_IDS,
  type RelayTrackStreamId,
} from '../shared/tabcast'

export const WHIP_VIDEO_WATCHDOG_POLL_MS = 2_000
export const WHIP_VIDEO_WATCHDOG_STALL_MS = 8_000

export type WhipVideoStallState = {
  lastBytes: number | null
  stallSinceMs: number | null
}

export type WhipStreamMetrics = {
  roundTripMs: number | null
  outboundVideoFramesDropped: number | null
  outboundVideoFramesEncoded: number | null
}

export function parseWhipStreamMetrics(stats: RTCStatsReport): WhipStreamMetrics {
  let roundTripMs: number | null = null
  let outboundVideoFramesDropped: number | null = null
  let outboundVideoFramesEncoded: number | null = null
  for (const report of stats.values()) {
    if (report.type === 'candidate-pair') {
      const pair = report as RTCStats & {
        state?: string
        nominated?: boolean
        currentRoundTripTime?: number
      }
      const rttSec = pair.currentRoundTripTime
      if (
        typeof rttSec === 'number' &&
        rttSec > 0 &&
        (pair.state === 'succeeded' || pair.nominated === true)
      ) {
        const ms = Math.round(rttSec * 1000)
        roundTripMs = roundTripMs === null ? ms : Math.min(roundTripMs, ms)
      }
    }
    if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
      const inbound = report as RTCInboundRtpStreamStats & { roundTripTime?: number }
      if (typeof inbound.roundTripTime === 'number' && inbound.roundTripTime > 0) {
        roundTripMs = Math.round(inbound.roundTripTime * 1000)
      }
    }
    if (report.type === 'outbound-rtp' && report.kind === 'video') {
      const outbound = report as RTCOutboundRtpStreamStats & {
        framesDropped?: number
        framesEncoded?: number
      }
      if (typeof outbound.framesDropped === 'number' && outbound.framesDropped >= 0) {
        outboundVideoFramesDropped =
          (outboundVideoFramesDropped ?? 0) + Math.floor(outbound.framesDropped)
      }
      if (typeof outbound.framesEncoded === 'number' && outbound.framesEncoded >= 0) {
        outboundVideoFramesEncoded =
          (outboundVideoFramesEncoded ?? 0) + Math.floor(outbound.framesEncoded)
      }
    }
  }
  return { roundTripMs, outboundVideoFramesDropped, outboundVideoFramesEncoded }
}

export const WHIP_STATS_POLL_MS = 2_000

export type WhipStatsSamplerOptions = {
  pc: RTCPeerConnection
  pollIntervalMs?: number
  isLive: () => boolean
  onMetrics: (metrics: WhipStreamMetrics) => void
  getStats?: (pc: RTCPeerConnection) => Promise<RTCStatsReport>
}

export type WhipStatsSampler = { stop: () => void }

export function startWhipStatsSampler(options: WhipStatsSamplerOptions): WhipStatsSampler {
  const pollIntervalMs = options.pollIntervalMs ?? WHIP_STATS_POLL_MS
  const getStats = options.getStats ?? ((pc) => pc.getStats())
  let stopped = false
  const tick = async () => {
    if (stopped || !options.isLive()) return
    if (options.pc.connectionState !== 'connected') return
    try {
      options.onMetrics(parseWhipStreamMetrics(await getStats(options.pc)))
    } catch {
      // ignore
    }
  }
  const timer = setInterval(() => void tick(), pollIntervalMs)
  void tick()
  return {
    stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
    },
  }
}

export function sumOutboundVideoBytesSent(stats: RTCStatsReport): number {
  let total = 0
  for (const report of stats.values()) {
    if (report.type !== 'outbound-rtp') continue
    if (report.kind !== 'video') continue
    const bytes = (report as RTCOutboundRtpStreamStats).bytesSent
    if (typeof bytes === 'number' && Number.isFinite(bytes)) total += bytes
  }
  return total
}

export function evaluateWhipVideoStall(
  state: WhipVideoStallState,
  bytesSent: number,
  nowMs: number,
  stallWindowMs: number,
): { next: WhipVideoStallState; stalled: boolean } {
  if (state.lastBytes === null) {
    return { next: { lastBytes: bytesSent, stallSinceMs: nowMs }, stalled: false }
  }
  if (bytesSent > state.lastBytes) {
    return { next: { lastBytes: bytesSent, stallSinceMs: null }, stalled: false }
  }
  const stallSince = state.stallSinceMs ?? nowMs
  const next: WhipVideoStallState = { lastBytes: bytesSent, stallSinceMs: stallSince }
  return { next, stalled: nowMs - stallSince >= stallWindowMs }
}

export type WhipVideoWatchdogOptions = {
  pc: RTCPeerConnection
  pollIntervalMs?: number
  stallWindowMs?: number
  shouldExpectVideo: () => boolean
  isLive: () => boolean
  onVideoStall: (reason: string) => void
  now?: () => number
  getStats?: (pc: RTCPeerConnection) => Promise<RTCStatsReport>
}

export type WhipVideoWatchdog = { stop: () => void }

export function startWhipVideoWatchdog(options: WhipVideoWatchdogOptions): WhipVideoWatchdog {
  const pollIntervalMs = options.pollIntervalMs ?? WHIP_VIDEO_WATCHDOG_POLL_MS
  const stallWindowMs = options.stallWindowMs ?? WHIP_VIDEO_WATCHDOG_STALL_MS
  const now = options.now ?? (() => Date.now())
  const getStats = options.getStats ?? ((pc) => pc.getStats())
  let state: WhipVideoStallState = { lastBytes: null, stallSinceMs: null }
  let stopped = false
  const reset = () => {
    state = { lastBytes: null, stallSinceMs: null }
  }
  const tick = async () => {
    if (stopped || !options.isLive()) return
    if (options.pc.connectionState !== 'connected' || !options.shouldExpectVideo()) {
      reset()
      return
    }
    try {
      const bytes = sumOutboundVideoBytesSent(await getStats(options.pc))
      const result = evaluateWhipVideoStall(state, bytes, now(), stallWindowMs)
      state = result.next
      if (result.stalled) {
        stopped = true
        clearInterval(timer)
        options.onVideoStall('whip:no-video')
      }
    } catch {
      // ignore getStats errors
    }
  }
  const timer = setInterval(() => void tick(), pollIntervalMs)
  return {
    stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
    },
  }
}

export type WhipPublisher = {
  pc: RTCPeerConnection
  resourceUrl: string | null
  audioSenders: WhipAudioSenders
  close: () => Promise<void>
}

export type WhipAudioTrackRole = 'mic' | 'desktop' | 'game'

export type WhipPublishSources = {
  /** Primary program / gameplay video track. */
  gameplay: MediaStream
  /** Optional browse-tab overlay track. */
  browser?: MediaStream | null
  webcam?: MediaStream | null
  mic?: MediaStream | null
  desktopAudio?: MediaStream | null
  gameAudio?: MediaStream | null
}

export type WhipAudioSenders = Partial<Record<WhipAudioTrackRole, RTCRtpSender>>

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', onChange)
      clearTimeout(timer)
      resolve()
    }
    const onChange = () => {
      if (pc.iceGatheringState === 'complete') done()
    }
    pc.addEventListener('icegatheringstatechange', onChange)
    const timer = setTimeout(done, timeoutMs)
  })
}

/** MediaStream with a fixed id so relay can map WHIP msid → scene source. */
export function createNamedMediaStream(
  id: RelayTrackStreamId | string,
  tracks: MediaStreamTrack[],
): MediaStream {
  const stream = new MediaStream(tracks)
  Object.defineProperty(stream, 'id', { value: id, writable: false, configurable: true })
  return stream
}

function attachWhipSources(
  pc: RTCPeerConnection,
  sources: WhipPublishSources,
  audioSenders: WhipAudioSenders,
): void {
  const gameplayTracks = sources.gameplay.getTracks().filter((t) => t.readyState === 'live')
  if (gameplayTracks.length > 0) {
    const gameplayStream = createNamedMediaStream(RELAY_TRACK_STREAM_IDS.gameplay, gameplayTracks)
    for (const track of gameplayTracks) pc.addTrack(track, gameplayStream)
  }

  if (sources.browser) {
    const browserTracks = sources.browser.getVideoTracks().filter((t) => t.readyState === 'live')
    if (browserTracks.length > 0) {
      const browserNamed = createNamedMediaStream(RELAY_TRACK_STREAM_IDS.browser, browserTracks)
      for (const track of browserTracks) pc.addTrack(track, browserNamed)
    }
  }

  if (sources.webcam) {
    const webcamTracks = sources.webcam.getVideoTracks().filter((t) => t.readyState === 'live')
    if (webcamTracks.length > 0) {
      const webcamStream = createNamedMediaStream(RELAY_TRACK_STREAM_IDS.webcam, webcamTracks)
      for (const track of webcamTracks) pc.addTrack(track, webcamStream)
    }
  }

  const attachAudioRole = (
    role: WhipAudioTrackRole,
    streamId: RelayTrackStreamId,
    stream: MediaStream | null | undefined,
  ) => {
    if (!stream) return
    const audioTracks = stream.getAudioTracks().filter((t) => t.readyState === 'live')
    if (audioTracks.length === 0) return
    const named = createNamedMediaStream(streamId, audioTracks)
    for (const track of audioTracks) {
      audioSenders[role] = pc.addTrack(track, named)
    }
  }

  attachAudioRole('mic', RELAY_TRACK_STREAM_IDS.mic, sources.mic)
  attachAudioRole('desktop', RELAY_TRACK_STREAM_IDS.desktopAudio, sources.desktopAudio)
  attachAudioRole('game', RELAY_TRACK_STREAM_IDS.gameAudio, sources.gameAudio)
}

/** Prefer H.264 for relay ffmpeg (`-f h264`). */
function preferH264VideoCodecs(pc: RTCPeerConnection): void {
  const caps = RTCRtpSender.getCapabilities('video')
  if (!caps) return

  const h264 = caps.codecs.filter((c) => c.mimeType.toLowerCase().includes('h264'))
  const other = caps.codecs.filter((c) => !c.mimeType.toLowerCase().includes('h264'))
  if (h264.length === 0) return

  const ordered = [...h264, ...other]
  for (const transceiver of pc.getTransceivers()) {
    if (transceiver.sender.track?.kind !== 'video') continue
    try {
      transceiver.setCodecPreferences(ordered)
    } catch {
      // ignore
    }
  }
}

/**
 * Publishes capture tracks to a WHIP endpoint (Maka Relay).
 * ICE is gathered before the offer is POSTed (WHIP trickle-less).
 */
export async function publishWhip(
  whipUrl: string,
  sources: WhipPublishSources,
  headers: Record<string, string> = {},
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void,
): Promise<WhipPublisher> {
  const pc = new RTCPeerConnection({ iceServers: [] })

  const notifyConnection = () => {
    onConnectionStateChange?.(pc.connectionState)
  }

  pc.onconnectionstatechange = notifyConnection
  pc.oniceconnectionstatechange = () => {
    const ice = pc.iceConnectionState
    if (ice === 'failed' || ice === 'disconnected') {
      notifyConnection()
    }
  }

  const audioSenders: WhipAudioSenders = {}
  attachWhipSources(pc, sources, audioSenders)
  preferH264VideoCodecs(pc)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await waitForIceGathering(pc)

  const localSdp = pc.localDescription?.sdp
  if (!localSdp) {
    pc.close()
    throw new Error('WHIP offer produced empty SDP')
  }

  let response: Response
  try {
    response = await fetch(whipUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', ...headers },
      body: localSdp,
    })
  } catch (error) {
    pc.close()
    const message = error instanceof Error ? error.message : 'Network error'
    throw new Error(`WHIP publish failed: ${message}`)
  }

  if (!response.ok) {
    pc.close()
    const detail = (await response.text().catch(() => '')).trim()
    throw new Error(`WHIP publish failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const answerSdp = await response.text()
  const location = response.headers.get('Location')
  const resourceUrl = location ? new URL(location, whipUrl).href : null

  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  return {
    pc,
    resourceUrl,
    audioSenders,
    async close() {
      if (resourceUrl) {
        try {
          await fetch(resourceUrl, { method: 'DELETE', headers })
        } catch {
          // Relay may already be stopped.
        }
      }
      pc.close()
    },
  }
}
