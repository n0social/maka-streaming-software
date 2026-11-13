import type { EncodeProfileSpec } from '../shared/stream-encode-profiles'
import type { SceneLayout, SceneSource } from '../shared/maka'
import { nextCompositorSkip } from '../shared/encode-backpressure'

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
  getBrowserVideo: () => HTMLVideoElement
  /** Scene boxes at encode-profile size. Browser and webcam sources are omitted when those layers are off. */
  getLayout: () => SceneLayout
  getMicStream: () => MediaStream | null
  getDesktopAudioStream: () => MediaStream | null
  getGameAudioStream: () => MediaStream | null
  getEncodeSpec: () => EncodeProfileSpec
}

export type ProgramOutputCompositor = {
  isActive: () => boolean
  getStream: () => MediaStream | null
  getCanvas: () => HTMLCanvasElement | null
  /** Frames skipped after a slow draw. 0 means every animation frame is painted. */
  getSkip: () => number
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
  let skipFrames = 0
  let framesToSkip = 0

  function videoHasFrames(el: HTMLVideoElement): boolean {
    return el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && el.videoWidth > 0 && el.videoHeight > 0
  }

  /** Live camera or capture frames. A hidden element is not on the program preview. */
  function liveLayerVideo(el: HTMLVideoElement): boolean {
    if (el.hidden || !videoHasFrames(el)) return false
    const src = el.srcObject
    if (!(src instanceof MediaStream)) return false
    return src.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled)
  }

  function sceneBox(
    source: SceneSource,
    layout: SceneLayout,
    outWidth: number,
    outHeight: number,
  ): { x: number; y: number; width: number; height: number } {
    const sx = layout.canvas.width > 0 ? outWidth / layout.canvas.width : 1
    const sy = layout.canvas.height > 0 ? outHeight / layout.canvas.height : 1
    return {
      x: source.x * sx,
      y: source.y * sy,
      width: source.width * sx,
      height: source.height * sy,
    }
  }

  function drawFitted(
    ctx: CanvasRenderingContext2D,
    video: HTMLVideoElement,
    box: { x: number; y: number; width: number; height: number },
    fit: 'contain' | 'cover',
  ): void {
    const vw = video.videoWidth
    const vh = video.videoHeight
    if (vw <= 0 || vh <= 0 || box.width <= 0 || box.height <= 0) return
    const scale =
      fit === 'cover' ? Math.max(box.width / vw, box.height / vh) : Math.min(box.width / vw, box.height / vh)
    const dw = vw * scale
    const dh = vh * scale
    const dx = box.x + (box.width - dw) / 2
    const dy = box.y + (box.height - dh) / 2
    ctx.save()
    ctx.beginPath()
    ctx.rect(box.x, box.y, box.width, box.height)
    ctx.clip()
    ctx.drawImage(video, dx, dy, dw, dh)
    ctx.restore()
  }

  function paintScene(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
    const layout = deps.getLayout()
    const sources = [...layout.sources].sort((a, b) => a.zIndex - b.zIndex)
    let drew = false
    for (const source of sources) {
      if (source.id === 'gameplay') {
        const video = deps.getProgramVideo()
        if (!liveLayerVideo(video)) continue
        drawFitted(ctx, video, sceneBox(source, layout, width, height), 'contain')
        drew = true
        continue
      }
      if (source.id === 'browser') {
        const video = deps.getBrowserVideo()
        if (!liveLayerVideo(video)) continue
        drawFitted(ctx, video, sceneBox(source, layout, width, height), 'cover')
        drew = true
        continue
      }
      if (source.id === 'webcam') {
        const video = deps.getWebcamVideo()
        if (!liveLayerVideo(video)) continue
        drawFitted(ctx, video, sceneBox(source, layout, width, height), 'cover')
        drew = true
      }
    }
    return drew
  }

  function startCanvasPump(): void {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const spec = deps.getEncodeSpec()
    canvas.width = spec.width
    canvas.height = spec.height

    const budgetMs = spec.fps > 0 ? 1000 / spec.fps : 33
    const tick = () => {
      if (!active) return
      if (framesToSkip > 0) {
        framesToSkip -= 1
        rafId = requestAnimationFrame(tick)
        return
      }
      const started = performance.now()
      const width = canvas!.width
      const height = canvas!.height
      ctx.fillStyle = '#0a0a0a'
      ctx.fillRect(0, 0, width, height)
      if (!paintScene(ctx, width, height)) {
        ctx.fillStyle = '#f6f3ec'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = '#1a1408'
        ctx.font = '24px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('No program video', width / 2, height / 2)
      }
      skipFrames = nextCompositorSkip(skipFrames, performance.now() - started, budgetMs)
      framesToSkip = skipFrames
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
    getSkip: () => skipFrames,
    start() {
      if (active && outputStream) return outputStream
      active = true
      return buildStream()
    },
    stop() {
      if (!active) return
      active = false
      skipFrames = 0
      framesToSkip = 0
      stopCanvasPump()
      if (outputStream) {
        for (const track of outputStream.getTracks()) track.stop()
        outputStream = null
      }
      canvas = null
    },
  }
}
