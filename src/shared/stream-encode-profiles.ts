/** Single source of truth for stream encode presets (UI labels + relay config). */

export type EncodeProfileId =
  | '720p30'
  | '720p60'
  | '1080p30'
  | '1080p60'
  | '2k60'
  | '4k60'

export type EncodeProfileSpec = {
  id: EncodeProfileId
  /** Center stats bar dropdown */
  menuLabel: string
  /** Sidebar encode profile select */
  sidebarLabel: string
  width: number
  height: number
  fps: 30 | 60
  bitrateMbps: number
}

export const ENCODE_PROFILE_ORDER: EncodeProfileId[] = [
  '720p30',
  '720p60',
  '1080p30',
  '1080p60',
  '2k60',
  '4k60',
]

export const ENCODE_PROFILES: Record<EncodeProfileId, EncodeProfileSpec> = {
  '720p30': {
    id: '720p30',
    menuLabel: '720p @ 30fps',
    sidebarLabel: '720p30 · 3 Mbps',
    width: 1280,
    height: 720,
    fps: 30,
    bitrateMbps: 3,
  },
  '720p60': {
    id: '720p60',
    menuLabel: '720p @ 60fps',
    sidebarLabel: '720p60 · 4.5 Mbps',
    width: 1280,
    height: 720,
    fps: 60,
    bitrateMbps: 4.5,
  },
  '1080p30': {
    id: '1080p30',
    menuLabel: '1080p @ 30fps',
    sidebarLabel: '1080p30 · 4.5 Mbps',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrateMbps: 4.5,
  },
  '1080p60': {
    id: '1080p60',
    menuLabel: '1080p @ 60fps',
    sidebarLabel: '1080p60 · 6 Mbps',
    width: 1920,
    height: 1080,
    fps: 60,
    bitrateMbps: 6,
  },
  '2k60': {
    id: '2k60',
    menuLabel: '2K @ 60fps',
    sidebarLabel: '2K60 · 10 Mbps',
    width: 2560,
    height: 1440,
    fps: 60,
    bitrateMbps: 10,
  },
  '4k60': {
    id: '4k60',
    menuLabel: '4K @ 60fps',
    sidebarLabel: '4K60 · 16 Mbps',
    width: 3840,
    height: 2160,
    fps: 60,
    bitrateMbps: 16,
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
  const { width, height } = ENCODE_PROFILES[id]
  return `Auto (${width}×${height})`
}
