/**
 * When a draw or the outbound video path falls behind, shed work instead of
 * queueing more frames. Gameplay stays. Browser overlay goes first, then webcam.
 */

export const BACKPRESSURE_CONFIRM_SAMPLES = 3
export const MAX_COMPOSITOR_SKIP = 3

export type WhipLoadLevel = 'normal' | 'shed-browser' | 'shed-webcam'

export function nextCompositorSkip(skip: number, drawMs: number, budgetMs: number): number {
  const current = clampSkip(skip)
  if (!(budgetMs > 0) || !(drawMs >= 0)) return current
  if (drawMs > budgetMs * 1.5) return clampSkip(current + 1)
  if (drawMs < budgetMs * 0.6 && current > 0) return current - 1
  return current
}

function clampSkip(skip: number): number {
  if (!Number.isFinite(skip)) return 0
  return Math.max(0, Math.min(MAX_COMPOSITOR_SKIP, Math.floor(skip)))
}

export function whipLoadSample(input: {
  dropPercent: number | null
  captureFps: number | null
  targetFps: number
  compositorSkip: number
}): WhipLoadLevel {
  const slowCapture =
    input.captureFps != null && input.targetFps > 0 && input.captureFps < input.targetFps * 0.6
  const heavyDrops = input.dropPercent != null && input.dropPercent >= 8
  const mildDrops = input.dropPercent != null && input.dropPercent >= 3
  if (heavyDrops || input.compositorSkip >= MAX_COMPOSITOR_SKIP || (slowCapture && mildDrops)) {
    return 'shed-webcam'
  }
  if (mildDrops || slowCapture || input.compositorSkip >= 2) return 'shed-browser'
  return 'normal'
}

export type WhipLoadState = {
  pending: WhipLoadLevel
  pendingCount: number
  applied: WhipLoadLevel
}

export function emptyWhipLoadState(): WhipLoadState {
  return { pending: 'normal', pendingCount: 0, applied: 'normal' }
}

export function observeWhipLoad(state: WhipLoadState, sample: WhipLoadLevel): WhipLoadState {
  if (sample === state.applied) {
    return { pending: sample, pendingCount: 0, applied: state.applied }
  }
  const pendingCount = sample === state.pending ? state.pendingCount + 1 : 1
  if (pendingCount >= BACKPRESSURE_CONFIRM_SAMPLES) {
    return { pending: sample, pendingCount: 0, applied: sample }
  }
  return { pending: sample, pendingCount, applied: state.applied }
}
