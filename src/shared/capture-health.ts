/** Detect a live capture whose video frames stop advancing. */

export const CAPTURE_STALL_SAMPLES = 6

export type CaptureStallState = {
  lastFrames: number | null
  stillSamples: number
  /** True after the program video has decoded at least one frame. */
  sawFrame: boolean
}

export function emptyCaptureStallState(): CaptureStallState {
  return { lastFrames: null, stillSamples: 0, sawFrame: false }
}

export function observeCaptureFrames(
  state: CaptureStallState,
  frames: number,
  trackLive: boolean,
  stallSamples = CAPTURE_STALL_SAMPLES,
): { state: CaptureStallState; stalled: boolean } {
  if (!trackLive || frames < 0) {
    return { state: emptyCaptureStallState(), stalled: false }
  }
  if (state.lastFrames === null || frames > state.lastFrames) {
    return {
      state: { lastFrames: frames, stillSamples: 0, sawFrame: state.sawFrame || frames > 0 },
      stalled: false,
    }
  }
  const stillSamples = state.stillSamples + 1
  // A capture that never paints gets a longer grace so startup does not look frozen.
  const limit = state.sawFrame ? stallSamples : stallSamples * 3
  return {
    state: { lastFrames: frames, stillSamples, sawFrame: state.sawFrame },
    stalled: stillSamples >= limit,
  }
}
