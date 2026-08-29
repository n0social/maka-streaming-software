import {
  DEFAULT_STREAM_PROFILE,
  RELAY_BASE_URL,
  RELAY_CONFIG_PATH,
  RELAY_SCENE_PATH,
  RELAY_STOP_PATH,
  RELAY_VERIFY_PATH,
  type RelayConfigRequest,
  type RelayHealth,
  type RelayVerifyResponse,
  type SceneLayout,
  type StreamProfile,
} from '../shared/tabcast'
import { normalizeStreamKey } from '../shared/stream-keys'

const RELAY_FETCH_MS = 8_000

function relayFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(RELAY_FETCH_MS),
  })
}

export function authHeaders(health: RelayHealth | null): Record<string, string> {
  if (!health?.relayToken) return {}
  return { Authorization: `Bearer ${health.relayToken}` }
}

export async function postRelayConfig(
  health: RelayHealth,
  input: {
    twitchKey?: string
    youtubeKey?: string
    customRtmpUrl?: string
    customRtmpKey?: string
    profile: StreamProfile
  },
): Promise<void> {
  const body: RelayConfigRequest = {
    profile: input.profile || DEFAULT_STREAM_PROFILE,
  }
  const twitch = normalizeStreamKey(input.twitchKey ?? '')
  const youtube = normalizeStreamKey(input.youtubeKey ?? '')
  const customKey = normalizeStreamKey(input.customRtmpKey ?? '')
  const customUrl = (input.customRtmpUrl ?? '').trim()
  if (twitch) body.twitchKey = twitch
  if (youtube) body.youtubeKey = youtube
  if (customUrl && customKey) {
    body.customRtmpUrl = customUrl
    body.customRtmpKey = customKey
  }

  const res = await relayFetch(`${RELAY_BASE_URL}${RELAY_CONFIG_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(health),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).trim()
    throw new Error(`Relay config failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
}

export async function verifyRelayConfig(health: RelayHealth): Promise<RelayVerifyResponse> {
  const res = await relayFetch(`${RELAY_BASE_URL}${RELAY_VERIFY_PATH}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...authHeaders(health),
    },
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).trim()
    throw new Error(`Verify failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  return (await res.json()) as RelayVerifyResponse
}

export async function postSceneLayout(health: RelayHealth, layout: SceneLayout): Promise<void> {
  const res = await relayFetch(`${RELAY_BASE_URL}${RELAY_SCENE_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...authHeaders(health),
    },
    body: JSON.stringify(layout),
  })
  if (!res.ok) {
    // Non-fatal for go-live — some relay builds accept WHIP without scene first
    console.warn('[scene] POST failed', res.status)
  }
}

export async function stopRelayStream(health: RelayHealth | null): Promise<void> {
  await relayFetch(`${RELAY_BASE_URL}${RELAY_STOP_PATH}`, {
    method: 'POST',
    headers: authHeaders(health),
  }).catch(() => undefined)
}

export function defaultSceneLayout(opts: {
  profile: StreamProfile
  hasWebcam: boolean
  hasBrowser?: boolean
}): SceneLayout {
  const canvas =
    opts.profile === '1080p'
      ? { width: 1920, height: 1080 }
      : { width: 1280, height: 720 }

  const sources = [
    {
      id: 'gameplay',
      type: 'video' as const,
      label: 'Gameplay',
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      zIndex: 0,
    },
  ]

  if (opts.hasWebcam) {
    const w = Math.round(canvas.width * 0.22)
    const h = Math.round(w * (9 / 16))
    sources.push({
      id: 'webcam',
      type: 'video',
      label: 'Webcam',
      x: canvas.width - w - 24,
      y: canvas.height - h - 24,
      width: w,
      height: h,
      zIndex: 2,
    })
  }

  if (opts.hasBrowser) {
    const w = Math.round(canvas.width * 0.35)
    const h = Math.round(w * (9 / 16))
    sources.push({
      id: 'browser',
      type: 'video',
      label: 'Browser',
      x: 24,
      y: 24,
      width: w,
      height: h,
      zIndex: 1,
    })
  }

  return { canvas, sources }
}

/** Always publish to the local sidecar — never the old web stream URL. */
export function whipUrlFromHealth(_health: RelayHealth): string {
  return `${RELAY_BASE_URL}/whip`
}
