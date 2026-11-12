/** How game audio should be captured for a desktopCapturer source id. */

export type GameAudioKind = 'window' | 'screen' | 'none'

export function gameAudioKind(sourceId: string | null | undefined): GameAudioKind {
  if (!sourceId) return 'none'
  if (sourceId.startsWith('window:')) return 'window'
  if (sourceId.startsWith('screen:')) return 'screen'
  return 'none'
}

/** Electron window ids are `window:<hwnd>:0` on Windows. */
export function windowHandleFromCaptureSourceId(sourceId: string): string | null {
  const parts = sourceId.split(':')
  if (parts[0] !== 'window' || parts.length < 2) return null
  if (!/^\d+$/.test(parts[1]) || parts[1] === '0') return null
  return parts[1]
}
