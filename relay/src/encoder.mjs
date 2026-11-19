import { spawn } from 'node:child_process'
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveEncodeSettings } from './profiles.mjs'
import { pushFfmpegLog, getRelayConfig } from './state.mjs'
import { rtmpDestinations } from './rtmp-urls.mjs'

/**
 * @typedef {{ stop: () => Promise<void>, mock: boolean }} EncoderSession
 */

function ffmpegBin() {
  return process.env.FFMPEG_PATH?.trim() || 'ffmpeg'
}

function mockRtmpEnabled() {
  return process.env.MAKA_RELAY_MOCK_RTMP === '1' || process.env.MAKA_RELAY_MOCK_RTMP === 'true'
}

/**
 * @param {import('werift').RTCPeerConnection} pc
 * @returns {{ videoTracks: import('werift').MediaStreamTrack[], audioTracks: import('werift').MediaStreamTrack[] }}
 */
function classifyTracks(pc) {
  /** @type {import('werift').MediaStreamTrack[]} */
  const videoTracks = []
  /** @type {import('werift').MediaStreamTrack[]} */
  const audioTracks = []
  const receivers = typeof pc.getReceivers === 'function' ? pc.getReceivers() : []
  for (const receiver of receivers) {
    const track = receiver.track
    if (!track) continue
    if (track.kind === 'video') videoTracks.push(track)
    if (track.kind === 'audio') audioTracks.push(track)
  }
  return { videoTracks, audioTracks }
}

/**
 * Subscribe track RTP to a UDP port for FFmpeg sdp ingest.
 * @param {import('werift').MediaStreamTrack} track
 * @param {number} port
 * @param {(buf: Buffer) => void} onWire
 */
function rtpToBuffer(packet) {
  if (Buffer.isBuffer(packet)) return packet
  if (packet?.serialize) return packet.serialize()
  return Buffer.from([])
}

function wireTrackToUdp(track, onWire) {
  if (track.onReceiveRtp?.subscribe) {
    track.onReceiveRtp.subscribe((packet) => {
      const buf = rtpToBuffer(packet)
      if (buf.length) onWire(buf)
    })
  }
}

/**
 * @param {import('werift').RTCPeerConnection} pc
 */
export async function ensureEncoder(pc) {
  const config = getRelayConfig()
  const destinations = rtmpDestinations(config)
  if (!destinations.length) {
    pushFfmpegLog('[ffmpeg] WHIP active — no stream keys (RTMP idle)')
    return { stop: async () => {}, mock: true }
  }

  const settings = resolveEncodeSettings(config)
  const { videoTracks, audioTracks } = classifyTracks(pc)

  if (mockRtmpEnabled() || process.platform !== 'win32') {
    pushFfmpegLog(
      `[ffmpeg] mock RTMP profile=${settings.profile} codec=${settings.videoCodec} dest=${destinations.map((d) => d.label).join('+')} videoTracks=${videoTracks.length} audioTracks=${audioTracks.length}`,
    )
    return {
      mock: true,
      stop: async () => {
        pushFfmpegLog('[ffmpeg] mock session stopped')
      },
    }
  }

  const copyVideo =
    videoTracks.length === 1 &&
    settings.videoCodec === 'libx264' &&
    process.env.MAKA_RELAY_FORCE_TRANSCODE !== '1'

  const workDir = mkdtempSync(join(tmpdir(), 'maka-relay-'))
  const sdpPath = join(workDir, 'whip-ingest.sdp')
  const videoPort = 21000 + Math.floor(Math.random() * 4000)
  const audioPort = videoPort + 2

  const sdp = [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=MAKArelay',
    'c=IN IP4 127.0.0.1',
    't=0 0',
    `m=video ${videoPort} RTP/AVP 96`,
    'a=rtpmap:96 H264/90000',
    'a=fmtp:96 packetization-mode=1',
    audioTracks.length ? `m=audio ${audioPort} RTP/AVP 97` : '',
    audioTracks.length ? 'a=rtpmap:97 opus/48000/2' : '',
  ]
    .filter(Boolean)
    .join('\r\n')
  writeFileSync(sdpPath, sdp, 'utf8')

  const outputUrl = destinations[0].url
  const gop = Math.max(1, Math.round(settings.keyframeIntervalSec * settings.fps))

  const args = [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-protocol_whitelist',
    'file,udp,rtp',
    '-i',
    sdpPath,
    '-map',
    '0:v:0',
  ]

  if (audioTracks.length) {
    args.push('-map', '0:a:0')
  }

  if (copyVideo) {
    args.push('-c:v', 'copy')
  } else {
    const codec = settings.videoCodec
    args.push(
      '-c:v',
      codec,
      '-preset',
      codec === 'h264_nvenc' ? 'p4' : settings.preset,
      '-profile:v',
      'main',
      '-pix_fmt',
      'yuv420p',
      '-tune',
      codec === 'h264_nvenc' ? 'll' : 'zerolatency',
      '-b:v',
      `${settings.videoBitrateKbps}k`,
      '-maxrate',
      `${settings.videoBitrateKbps}k`,
      '-bufsize',
      `${settings.videoBitrateKbps * 2}k`,
      '-g',
      String(gop),
      '-bf',
      String(settings.bFrames ?? 2),
      '-r',
      String(settings.fps),
    )
  }

  if (audioTracks.length) {
    args.push('-c:a', 'aac', '-b:a', `${settings.audioBitrateKbps}k`)
  }

  args.push('-f', 'flv', outputUrl)

  pushFfmpegLog(`[ffmpeg] spawn ${ffmpegBin()} → ${destinations[0].label} (${copyVideo ? 'copy' : settings.videoCodec})`)

  const proc = spawn(ffmpegBin(), args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  proc.stdout?.on('data', (chunk) => pushFfmpegLog(chunk.toString().trim()))
  proc.stderr?.on('data', (chunk) => pushFfmpegLog(chunk.toString().trim()))
  proc.on('exit', (code) => pushFfmpegLog(`[ffmpeg] exit ${code}`))

  const dgram = await import('node:dgram')
  const videoSocket = dgram.createSocket('udp4')
  videoSocket.bind(0)

  videoSocket.on('message', (msg) => {
    videoSocket.send(msg, videoPort, '127.0.0.1')
  })

  if (videoTracks[0]) {
    wireTrackToUdp(videoTracks[0], (buf) => {
      videoSocket.send(buf, videoPort, '127.0.0.1')
    })
  }

  return {
    mock: false,
    stop: async () => {
      try {
        proc.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      videoSocket.close()
      try {
        unlinkSync(sdpPath)
      } catch {
        /* ignore */
      }
    },
  }
}

export async function resetEncoderState() {
  /* mid-live config: caller stops session and starts again */
}