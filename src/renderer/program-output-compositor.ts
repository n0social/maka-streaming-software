import type { EncodeProfileSpec } from '../shared/stream-encode-profiles'

/** Live, unmuted tracks from mixer sources (mirrors stream mute / layer enabled flags on tracks). */
export function liveEnabledAudioTracks(streams: (MediaStream | null)[]): MediaStreamTrack[] {
  const out: MediaStreamTrack[] = []
  for (const stream of streams) {
    if (!stream) continue
    const track = stream.getAudioTracks().find((t) => t.readyState === 'live' && t.enabled)
    if (track) out.push(track)
  }
  return out
}

export type ProgramOutputCompositorDeps = {
  getProgramVideo: () => HTMLVideoElement
  getWebcamVideo: () => HTMLVideoElement
  hasGameplayVideo: () => boolean
  getMicStream: () => MediaStream | null
  getDesktopAudioStream: () => MediaStream | null
  getGameAudioStream: () => MediaStream | null
  getEncodeSpec: () => EncodeProfileSpec
}

export type ProgramOutputCompositor = {
  isActive: () => boolean
  getStream: () => MediaStream | null
  getCanvas: () => HTMLCanvasElement | null
  start: () => MediaStream
  stop: () => void
}

export function createProgramOutputCompositor(
  deps: ProgramOutputCompositorDeps,
): ProgramOutputCompositor {
  let canvas: HTMLCanvasElement | null = null
  let outputStream: MediaStream | null = null
  let rafId = 0
  let active = false

  function primaryVideoEl(): HTMLVideoElement | null {
    if (deps.hasGameplayVideo()) {
      const el = deps.getProgramVideo()
      if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !el.hidden) return el
    }
    const cam = deps.getWebcamVideo()
    if (cam.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !cam.hidden) return cam
    const program = deps.getProgramVideo()
    if (program.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return program
    return cam.readyState >= HTMLMediaElement.HAVE_METADATA ? cam : program
  }

  function startCanvasPump(): void {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const spec = deps.getEncodeSpec()
    canvas.width = spec.width
    canvas.height = spec.height

    const tick = () => {
      if (!active) return
      const video = primaryVideoEl()
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, canvas!.width, canvas!.height)
      if (video && video.videoWidth > 0) {
        const vw = video.videoWidth
        const vh = video.videoHeight
        const scale = Math.min(canvas!.width / vw, canvas!.height / vh)
        const dw = vw * scale
        const dh = vh * scale
        const dx = (canvas!.width - dw) / 2
        const dy = (canvas!.height - dh) / 2
        ctx.drawImage(video, dx, dy, dw, dh)
      } else {
        ctx.fillStyle = '#f6f3ec'
        ctx.fillRect(0, 0, canvas!.width, canvas!.height)
        ctx.fillStyle = '#1a1408'
        ctx.font = '24px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('No program video', canvas!.width / 2, canvas!.height / 2)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopCanvasPump(): void {
    if (rafId) cancelAnimationFrame(rafId)
    rafId = 0
  }

  function buildStream(): MediaStream {
    const spec = deps.getEncodeSpec()
    canvas = document.createElement('canvas')
    outputStream = null
    startCanvasPump()
    const videoStream = canvas.captureStream(spec.fps)
    const tracks = [
      ...videoStream.getVideoTracks(),
      ...liveEnabledAudioTracks([
        deps.getMicStream(),
        deps.getDesktopAudioStream(),
        deps.getGameAudioStream(),
      ]),
    ]
    outputStream = new MediaStream(tracks)
    return outputStream
  }

  return {
    isActive: () => active,
    getStream: () => outputStream,
    getCanvas: () => canvas,
    start() {
      if (active && outputStream) return outputStream
      active = true
      return buildStream()
    },
    stop() {
      if (!active) return
      active = false
      stopCanvasPump()
      if (outputStream) {
        for (const track of outputStream.getTracks()) track.stop()
        outputStream = null
      }
      canvas = null
    },
  }
}
