import type { ProgramOutputCompositor, ProgramOutputCompositorDeps } from './program-output-compositor'
import { createProgramOutputCompositor } from './program-output-compositor'

export type ProgramVirtualCameraDeps = ProgramOutputCompositorDeps & {
  compositor?: ProgramOutputCompositor
}

export type ProgramVirtualCameraController = {
  isActive: () => boolean
  start: () => void
  stop: () => void
  copyProgramFrameToClipboard: () => Promise<void>
}

export function createProgramVirtualCamera(
  deps: ProgramVirtualCameraDeps,
): ProgramVirtualCameraController {
  const compositor = deps.compositor ?? createProgramOutputCompositor(deps)
  const ownsCompositor = !deps.compositor
  let sessionActive = false

  return {
    isActive: () => sessionActive,
    start() {
      if (sessionActive) return
      compositor.start()
      sessionActive = true
    },
    stop() {
      if (!sessionActive) return
      sessionActive = false
      if (ownsCompositor && compositor.isActive()) {
        compositor.stop()
      }
    },
    async copyProgramFrameToClipboard(): Promise<void> {
      if (!sessionActive) {
        compositor.start()
        sessionActive = true
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      }
      const canvas = compositor.getCanvas()
      if (!canvas) {
        throw new Error('Could not access program canvas.')
      }
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png')
      })
      if (!blob) throw new Error('Could not capture program frame.')
      if (!navigator.clipboard?.write) {
        throw new Error('Clipboard is not available in this context.')
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    },
  }
}
