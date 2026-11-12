/** Pick a window when a full-screen capture stays black (common on cloud gaming VMs). */

export const BLACK_FRAME_SAMPLES = 4

const SKIP_WINDOW_NAME =
  /^(maka|program manager|windows input experience|windows shell experience host|nvidia overlay|desktop|task view)$/i

export type FallbackCaptureSource = {
  id: string
  name: string
  type: 'screen' | 'window' | 'browser'
}

export function frameLooksEmpty(rgba: Uint8ClampedArray): boolean {
  let max = 0
  let sum = 0
  let count = 0
  for (let i = 0; i + 2 < rgba.length; i += 16 * 4) {
    const luma = rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722
    sum += luma
    if (luma > max) max = luma
    count += 1
  }
  if (!count) return false
  return max < 12 && sum / count < 6
}

export function observeBlackFrames(
  stillBlack: number,
  empty: boolean,
  limit = BLACK_FRAME_SAMPLES,
): { stillBlack: number; fallback: boolean } {
  if (!empty) return { stillBlack: 0, fallback: false }
  const next = stillBlack + 1
  return { stillBlack: next, fallback: next >= limit }
}

export function pickGameplayWindowFallback(
  sources: readonly FallbackCaptureSource[],
  currentId: string,
): FallbackCaptureSource | null {
  for (const source of sources) {
    if (source.type !== 'window') continue
    if (source.id === currentId) continue
    const name = source.name.trim()
    if (!name || SKIP_WINDOW_NAME.test(name)) continue
    return source
  }
  return null
}
