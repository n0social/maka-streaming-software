/**
 * Live encode step-down when WHIP/relay metrics show congestion.
 * The relay still encodes a fixed target per profile; this module picks the next
 * lower profile (resolution, fps, bitrate, GOP/B-frame hints) and the studio
 * re-posts /config.
 */
import type { EncodeProfileId } from './stream-encode-profiles'

/** Highest load first. Cloud gaming is the floor (low CPU, capped Mbps, no B-frames). */
export const ENCODE_CONGESTION_LADDER: EncodeProfileId[] = [
  '4k60',
  '2k60',
  '1080p60',
  '1080p30',
  '720p60',
  '720p30',
  'cloud720p30',
]

/** Consecutive congested samples before one step (stats poll ~2s). */
export const ENCODE_ADAPT_BAD_SAMPLES = 3
/** Ignore another sample sooner than this so relay + WHIP ticks do not double-count. */
export const ENCODE_ADAPT_MIN_SAMPLE_MS = 1_500
/** Pause after a step so one outage does not walk the whole ladder at once. */
export const ENCODE_ADAPT_COOLDOWN_MS = 12_000

export const ENCODE_ADAPT_DROP_PERCENT = 2
export const ENCODE_ADAPT_RTT_MS = 180
export const ENCODE_ADAPT_UNDERBITRATE_RATIO = 0.7
export const ENCODE_ADAPT_SEVERE_DROP_PERCENT = 8
export const ENCODE_ADAPT_SEVERE_RTT_MS = 400

export type EncodeAdaptSample = {
  dropPercent: number | null
  roundTripMs: number | null
  measuredMbps: number | null
  targetMbps: number
}

export type EncodeAdaptState = {
  badStreak: number
  lastSampleMs: number
  cooldownUntilMs: number
}

export function emptyEncodeAdaptState(): EncodeAdaptState {
  return { badStreak: 0, lastSampleMs: 0, cooldownUntilMs: 0 }
}

export type CongestionLevel = 'ok' | 'mild' | 'severe'

export function congestionLevel(sample: EncodeAdaptSample): CongestionLevel {
  const drop = sample.dropPercent
  const rtt = sample.roundTripMs
  const severeDrop = drop != null && drop >= ENCODE_ADAPT_SEVERE_DROP_PERCENT
  const severeRtt = rtt != null && rtt >= ENCODE_ADAPT_SEVERE_RTT_MS
  if (severeDrop || severeRtt) return 'severe'

  const mildDrop = drop != null && drop >= ENCODE_ADAPT_DROP_PERCENT
  const mildRtt = rtt != null && rtt >= ENCODE_ADAPT_RTT_MS
  const underBitrate =
    sample.measuredMbps != null &&
    sample.targetMbps > 0 &&
    sample.measuredMbps < sample.targetMbps * ENCODE_ADAPT_UNDERBITRATE_RATIO
  if (mildDrop || mildRtt || underBitrate) return 'mild'
  return 'ok'
}

export function stepDownEncodeProfile(current: EncodeProfileId, steps: number): EncodeProfileId | null {
  const index = ENCODE_CONGESTION_LADDER.indexOf(current)
  if (index < 0) return null
  const nextIndex = Math.min(ENCODE_CONGESTION_LADDER.length - 1, index + Math.max(1, steps))
  if (nextIndex === index) return null
  return ENCODE_CONGESTION_LADDER[nextIndex] ?? null
}

export function observeEncodeAdapt(
  state: EncodeAdaptState,
  current: EncodeProfileId,
  sample: EncodeAdaptSample,
  nowMs: number,
  enabled: boolean,
): { state: EncodeAdaptState; next: EncodeProfileId | null } {
  if (!enabled) {
    return { state: { ...state, badStreak: 0 }, next: null }
  }
  if (nowMs - state.lastSampleMs < ENCODE_ADAPT_MIN_SAMPLE_MS) {
    return { state, next: null }
  }
  const stamped: EncodeAdaptState = { ...state, lastSampleMs: nowMs }
  if (nowMs < stamped.cooldownUntilMs) {
    return { state: stamped, next: null }
  }

  const level = congestionLevel(sample)
  if (level === 'ok') {
    return { state: { ...stamped, badStreak: 0 }, next: null }
  }

  const badStreak = stamped.badStreak + 1
  if (badStreak < ENCODE_ADAPT_BAD_SAMPLES) {
    return { state: { ...stamped, badStreak }, next: null }
  }

  const steps = level === 'severe' ? 2 : 1
  const next = stepDownEncodeProfile(current, steps)
  if (!next) {
    return { state: { ...stamped, badStreak: 0 }, next: null }
  }
  return {
    state: { badStreak: 0, lastSampleMs: nowMs, cooldownUntilMs: nowMs + ENCODE_ADAPT_COOLDOWN_MS },
    next,
  }
}
