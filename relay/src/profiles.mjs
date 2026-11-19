/** Encode profile resolution (matches studio relay-config + patch-installed-relay). */

const PROFILE_TABLE = {
  cloud720p30: { width: 1280, height: 720, fps: 30, videoBitrateKbps: 2500, bFrames: 0, preset: 'ultrafast' },
  '720p30': { width: 1280, height: 720, fps: 30, videoBitrateKbps: 3000, bFrames: 2, preset: 'veryfast' },
  '720p60': { width: 1280, height: 720, fps: 60, videoBitrateKbps: 4500, bFrames: 2, preset: 'veryfast' },
  '1080p30': { width: 1920, height: 1080, fps: 30, videoBitrateKbps: 6000, bFrames: 2, preset: 'veryfast' },
  '1080p60': { width: 1920, height: 1080, fps: 60, videoBitrateKbps: 9000, bFrames: 2, preset: 'veryfast' },
  '2k60': { width: 2560, height: 1440, fps: 60, videoBitrateKbps: 12000, bFrames: 2, preset: 'fast' },
  '4k60': { width: 3840, height: 2160, fps: 60, videoBitrateKbps: 20000, bFrames: 2, preset: 'fast' },
}

function profileIdFromLegacy(profile) {
  if (profile === '1080p') return '1080p60'
  if (profile === '720p') return '720p30'
  return profile
}

/**
 * @param {Record<string, unknown>} config
 */
export function resolveEncodeSettings(config) {
  const profile = profileIdFromLegacy(String(config.profile ?? '720p30'))
  const base = PROFILE_TABLE[profile] ?? PROFILE_TABLE['720p30']

  const mbps = Number(config.bitrateMbps)
  const mic = Number(config.audioMicBitrateKbps)
  const desk = Number(config.audioDesktopBitrateKbps)
  const audioKbps = Number.isFinite(mic) && Number.isFinite(desk)
    ? Math.max(mic, desk)
    : Number.isFinite(mic)
      ? mic
      : 160

  const gop = Number(config.keyframeIntervalSec)
  const bFrames = Number(config.bFrames)
  const videoCodec =
    config.videoEncoderPreference === 'hardware' ? 'h264_nvenc' : 'libx264'

  return {
    profile,
    width: base.width,
    height: base.height,
    fps: base.fps,
    videoBitrateKbps:
      Number.isFinite(mbps) && mbps > 0 ? Math.round(mbps * 1000) : base.videoBitrateKbps,
    audioBitrateKbps: Math.max(64, Math.min(320, Math.round(audioKbps))),
    keyframeIntervalSec: Number.isFinite(gop) && gop > 0 ? gop : 2,
    preset: typeof config.encoderPreset === 'string' && config.encoderPreset
      ? config.encoderPreset
      : base.preset,
    bFrames: Number.isFinite(bFrames) ? bFrames : base.bFrames,
    videoCodec,
    rateControl: config.rateControl === 'vbr' ? 'vbr' : 'cbr',
  }
}