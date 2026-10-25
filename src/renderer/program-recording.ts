import type { EncodeProfileId, EncodeProfileSpec } from '../shared/stream-encode-profiles'

export type ProgramRecordingDeps = {
  /** Primary gameplay / program video element. */
  getProgramVideo: () => HTMLVideoElement
  /** Webcam element when desk-only or cam is the only feed. */
  getWebcamVideo: () => HTMLVideoElement
  /** Returns true when gameplay track is live on program video. */
  hasGameplayVideo: () => boolean
  getMicStream: () => MediaStream | null
  getEncodeSpec: () => EncodeProfileSpec
}

export type ProgramRecordingController = {
  isRecording: () => boolean
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
}

const PREFERRED_MIME = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

function pickRecorderMime(): string {
  for (const mime of PREFERRED_MIME) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

/**
 * Records program output via a canvas compositor (primary video + mic).
 * Limitations: browser overlay, scene PNG masks, and PiP layout are not composited —
 * only the main program video element (or webcam fallback) is drawn each frame.
 */
export function createProgramRecording(deps: ProgramRecordingDeps): ProgramRecordingController {
  let recorder: MediaRecorder | null = null
  let recordStream: MediaStream | null = null
  let canvas: HTMLCanvasElement | null = null
  let rafId = 0
  const chunks: Blob[] = []
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

  function buildRecordStream(): MediaStream {
    const spec = deps.getEncodeSpec()
    canvas = document.createElement('canvas')
    startCanvasPump()
    const videoStream = canvas.captureStream(spec.fps)
    const tracks = [...videoStream.getVideoTracks()]
    const mic = deps.getMicStream()
    if (mic) {
      const audio = mic.getAudioTracks().find((t) => t.readyState === 'live')
      if (audio) tracks.push(audio)
    }
    return new MediaStream(tracks)
  }

  return {
    isRecording: () => active,
    async start(): Promise<void> {
      if (active) return
      const mime = pickRecorderMime()
      if (!mime && !MediaRecorder.isTypeSupported('')) {
        throw new Error('MediaRecorder is not supported in this environment.')
      }
      chunks.length = 0
      recordStream = buildRecordStream()
      recorder = mime
        ? new MediaRecorder(recordStream, { mimeType: mime })
        : new MediaRecorder(recordStream)
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data)
      }
      active = true
      recorder.start(1000)
    },
    async stop(): Promise<Blob | null> {
      if (!active || !recorder) return null
      active = false
      const rec = recorder
      recorder = null

      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve()
        try {
          rec.stop()
        } catch {
          resolve()
        }
      })

      stopCanvasPump()
      if (recordStream) {
        for (const track of recordStream.getTracks()) track.stop()
        recordStream = null
      }
      canvas = null

      if (!chunks.length) return null
      const type = rec.mimeType || 'video/webm'
      return new Blob(chunks, { type })
    },
  }
}

export function recordingFileExtension(blob: Blob): 'webm' | 'mp4' {
  if (blob.type.includes('mp4')) return 'mp4'
  return 'webm'
}

export function recordingTimestampForFilename(at = new Date()): string {
  return at.toISOString().replace(/[:.]/g, '-')
}

/** Local recording filename: timestamp + encode profile id. */
export function buildRecordingFileName(
  profileId: EncodeProfileId,
  ext: 'webm' | 'mp4',
  at = new Date(),
): string {
  const ts = recordingTimestampForFilename(at)
  return `maka-recording-${ts}-${profileId}.${ext}`
}
