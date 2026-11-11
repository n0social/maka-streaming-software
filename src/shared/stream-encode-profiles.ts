/** Single source of truth for stream encode presets (UI labels + relay config). */

export type EncodeProfileId =
  | 'cloud720p30'
  | '720p30'
  | '720p60'
  | '1080p30'
  | '1080p60'
  | '2k60'
  | '4k60'

export type EncodeRateControl = 'cbr' | 'vbr'

export type EncodeProfileSpec = {
  id: EncodeProfileId
  /** Center stats bar dropdown */
  menuLabel: string
  /** Compact label (legacy sidebar; stats bar uses menuLabel) */
  sidebarLabel: string
  width: number
  height: number
  fps: 30 | 60
  bitrateMbps: number
  /** Peak cap sent with the profile (CBR uses the same value as the target). */
  maxBitrateMbps: number
  rateControl: EncodeRateControl
  /** IDR interval. Short GOPs recover faster after a congestion drop. */
  keyframeIntervalSec: number
  bFrames: number
  /** x264/x265-style speed hint for the relay encoder. */
  encoderPreset: 'ultrafast' | 'veryfast' | 'fast' | 'medium'
}

export const ENCODE_PROFILE_ORDER: EncodeProfileId[] = [
  'cloud720p30',
  '720p30',
  '720p60',
  '1080p30',
  '1080p60',
  '2k60',
  '4k60',
]

const STANDARD_GOP = {
  rateControl: 'cbr' as const,
  keyframeIntervalSec: 2,
  bFrames: 2,
  encoderPreset: 'veryfast' as const,
}

export const ENCODE_PROFILES: Record<EncodeProfileId, EncodeProfileSpec> = {
  cloud720p30: {
    id: 'cloud720p30',
    menuLabel: 'Cloud gaming · 720p30',
    sidebarLabel: 'Cloud · 2.5 Mbps',
    width: 1280,
    height: 720,
    fps: 30,
    bitrateMbps: 2.5,
    maxBitrateMbps: 2.5,
    rateControl: 'cbr',
    keyframeIntervalSec: 2,
    bFrames: 0,
    encoderPreset: 'ultrafast',
  },
  '720p30': {
    id: '720p30',
    menuLabel: '720p @ 30fps',
    sidebarLabel: '720p30 · 3 Mbps',
    width: 1280,
    height: 720,
    fps: 30,
    bitrateMbps: 3,
    maxBitrateMbps: 3,
    ...STANDARD_GOP,
  },
  '720p60': {
    id: '720p60',
    menuLabel: '720p @ 60fps',
    sidebarLabel: '720p60 · 4.5 Mbps',
    width: 1280,
    height: 720,
    fps: 60,
    bitrateMbps: 4.5,
    maxBitrateMbps: 4.5,
    ...STANDARD_GOP,
  },
  '1080p30': {
    id: '1080p30',
    menuLabel: '1080p @ 30fps',
    sidebarLabel: '1080p30 · 4.5 Mbps',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateMbps: 4.5,
    maxBitrateMbps: 4.5,
    ...STANDARD_GOP,
  },
  '1080p60': {
    id: '1080p60',
    menuLabel: '1080p @ 60fps',
    sidebarLabel: '1080p60 · 6 Mbps',
    width: 1920,
    height: 1080,
    fps: 60,
    bitrateMbps: 6,
    maxBitrateMbps: 6,
    ...STANDARD_GOP,
  },
  '2k60': {
    id: '2k60',
    menuLabel: '2K @ 60fps',
    sidebarLabel: '2K60 · 10 Mbps',
    width: 2560,
    height: 1440,
    fps: 60,
    bitrateMbps: 10,
    maxBitrateMbps: 10,
    ...STANDARD_GOP,
  },
  '4k60': {
    id: '4k60',
    menuLabel: '4K @ 60fps',
    sidebarLabel: '4K60 · 16 Mbps',
    width: 3840,
    height: 2160,
    fps: 60,
    bitrateMbps: 16,
    maxBitrateMbps: 16,
    ...STANDARD_GOP,
  },
}

export const DEFAULT_ENCODE_PROFILE: EncodeProfileId = '720p30'

const LEGACY_PROFILE_MAP: Record<string, EncodeProfileId> = {
  '720p': '720p30',
  '1080p': '1080p60',
}

export function isEncodeProfileId(value: string): value is EncodeProfileId {
  return value in ENCODE_PROFILES
}

export function normalizeEncodeProfileId(stored: string | undefined | null): EncodeProfileId {
  if (!stored) return DEFAULT_ENCODE_PROFILE
  if (isEncodeProfileId(stored)) return stored
  return LEGACY_PROFILE_MAP[stored] ?? DEFAULT_ENCODE_PROFILE
}

export function encodeProfileSpec(id: EncodeProfileId): EncodeProfileSpec {
  return ENCODE_PROFILES[id]
}

export function canvasForEncodeProfile(id: EncodeProfileId): { width: number; height: number } {
  const spec = ENCODE_PROFILES[id]
  return { width: spec.width, height: spec.height }
}

/** Legacy addon / toast bucket (relay used to expose only 720p | 1080p). */
export function addonProfileBucket(id: EncodeProfileId): '720p' | '1080p' {
  return ENCODE_PROFILES[id].height >= 1080 ? '1080p' : '720p'
}

export function formatResolutionLabel(id: EncodeProfileId): string {
  const { width, height } = ENCODE_PROFILES[id]
  return `${width}×${height}`
}

/** Program stats bar quality dropdown (readme hero style). */
export function formatAutoEncodeLabel(id: EncodeProfileId): string {
  if (id === 'cloud720p30') return 'Cloud (1280×720)'
  const { width, height } = ENCODE_PROFILES[id]
  return `Auto (${width}×${height})`
}
