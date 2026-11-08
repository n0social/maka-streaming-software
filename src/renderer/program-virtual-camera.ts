import {
  createProgramOutputCompositor,
  type ProgramOutputCompositor,
  type ProgramOutputCompositorDeps,
} from './program-output-compositor'

export type ProgramVirtualCameraDeps = ProgramOutputCompositorDeps & {
  compositor?: ProgramOutputCompositor
}

export type ProgramVirtualCameraController = {
  isActive: () => boolean
  start: () => void
  stop: () => void
}

export function createProgramVirtualCamera(deps: ProgramVirtualCameraDeps): ProgramVirtualCameraController {
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
      if (ownsCompositor && compositor.isActive()) compositor.stop()
    },
  }
}
