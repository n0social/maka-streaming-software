import type { RelaySnapshot } from '../shared/relay-snapshot'
import { encodeProfileSpec, normalizeEncodeProfileId } from '../shared/stream-encode-profiles'
import {
  RELAY_BASE_URL,
  RELAY_CONFIG_PATH,
  RELAY_HEALTH_PATH,
  RELAY_SCENE_PATH,
  RELAY_STATUS_PATH,
  RELAY_STOP_PATH,
  RELAY_VERIFY_PATH,
  type RelayConfigRequest,
  type RelayHealth,
  type RelayStatusResponse,
  type RelayVerifyResponse,
  type SceneLayout,
  type StreamProfile,
} from '../shared/tabcast'

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
  body: RelayConfigRequest,
): Promise<void> {
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
  const profile = normalizeEncodeProfileId(opts.profile)
  const spec = encodeProfileSpec(profile)
  const canvas = { width: spec.width, height: spec.height }

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

export {
  isFatalLiveRecoveryReason,
  liveRecoveryAttemptCap,
  liveRecoveryReasonLabel,
  liveRetryBackoffMs,
  MAX_LIVE_RETRY_ATTEMPTS,
} from '../shared/live-retry'

export async function fetchRelayStatus(health: RelayHealth): Promise<RelayStatusResponse | null> {
  try {
    const res = await relayFetch(`${RELAY_BASE_URL}${RELAY_STATUS_PATH}`, {
      headers: { Accept: 'application/json', ...authHeaders(health) },
    })
    if (!res.ok) return null
    return (await res.json()) as RelayStatusResponse
  } catch {
    return null
  }
}

/** True when the relay process likely lost WHIP/scene state (e.g. after restart). */
export function relayNeedsLiveBootstrap(snapshot: RelaySnapshot): boolean {
  if (!snapshot.health) return true
  if (snapshot.lifecycle === 'stopped') return true
  if (snapshot.status?.whipSessionActive === false) return true
  if (snapshot.status?.status === 'idle' && snapshot.lifecycle === 'ready') return true
  return false
}

export async function waitForRelayReady(
  readSnapshot: () => Promise<RelaySnapshot>,
  tick: () => Promise<void>,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<RelaySnapshot> {
  const timeoutMs = opts.timeoutMs ?? 45_000
  const pollMs = opts.pollMs ?? 500
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await tick().catch(() => undefined)
    const snapshot = await readSnapshot()
    if (snapshot.health && (snapshot.lifecycle === 'ready' || snapshot.lifecycle === 'live')) {
      return snapshot
    }
    if (
      snapshot.error &&
      snapshot.lifecycle === 'error' &&
      snapshot.error.includes('auto-restart exhausted')
    ) {
      return snapshot
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }

  throw new Error('Relay did not become ready during reconnect wait.')
}

export async function pingRelayHealth(): Promise<boolean> {
  try {
    const res = await relayFetch(`${RELAY_BASE_URL}${RELAY_HEALTH_PATH}`, {
      headers: { Accept: 'application/json' },
    })
    return res.ok
  } catch {
    return false
  }
}
