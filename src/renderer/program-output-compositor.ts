import type { EncodeProfileSpec } from '../shared/stream-encode-profiles'

export function liveEnabledAudioTracks(streams: (MediaStream | null)[]): MediaStreamTrack[] {
  const out: MediaStreamTrack[] = []
  for (const stream of streams) {
    if (!stream) continue
    const track = stream.getAudioTracks().find((t) => t.readyState === 'live' && t.enabled)
    if (track) out.push(track)
  }
  return out
}

export type ProgramScenePresentation = 'game' | 'desk' | 'card'

export type ProgramOutputCompositorDeps = {
  getProgramVideo: () => HTMLVideoElement
  getWebcamVideo: () => HTMLVideoElement
  hasGameplayVideo: () => boolean
  getScenePresentation: () => ProgramScenePresentation
  getSceneTitle: () => string
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

  function drawContain(ctx: CanvasRenderingContext2D, video: HTMLVideoElement): void {
    if (!canvas || video.videoWidth <= 0) return
    const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
    const dw = video.videoWidth * scale
    const dh = video.videoHeight * scale
    ctx.drawImage(video, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh)
  }

  function drawLabel(ctx: CanvasRenderingContext2D, text: string): void {
    if (!canvas) return
    ctx.fillStyle = '#ffc40c'
    ctx.font = '64px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  }

  function webcamReady(): HTMLVideoElement | null {
    const cam = deps.getWebcamVideo()
    if (cam.hidden || cam.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || cam.videoWidth <= 0) {
      return null
    }
    return cam
  }

  function startCanvasPump(): void {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const spec = deps.getEncodeSpec()
    canvas.width = spec.width
    canvas.height = spec.height

    const tick = () => {
      if (!active || !canvas) return
      ctx.fillStyle = '#111111'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      const presentation = deps.getScenePresentation()
      if (presentation === 'card') {
        drawLabel(ctx, deps.getSceneTitle() || 'Scene')
      } else if (presentation === 'desk') {
        const cam = webcamReady()
        if (cam) drawContain(ctx, cam)
        else drawLabel(ctx, 'Webcam offline')
      } else {
        const program = deps.hasGameplayVideo() ? deps.getProgramVideo() : null
        if (program && program.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && program.videoWidth > 0) {
          drawContain(ctx, program)
        } else {
          drawLabel(ctx, 'No program video')
        }
        const cam = webcamReady()
        if (cam) {
          const pipW = Math.round(canvas.width * 0.22)
          const pipH = Math.round(pipW * (9 / 16))
          const x = canvas.width - pipW - 24
          const y = canvas.height - pipH - 24
          ctx.drawImage(cam, x, y, pipW, pipH)
          ctx.strokeStyle = '#ffc40c'
          ctx.lineWidth = 4
          ctx.strokeRect(x, y, pipW, pipH)
        }
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
