import type { EncodeProfileId } from '../shared/stream-encode-profiles'
import type { ProgramOutputCompositor } from './program-output-compositor'
import {
  createProgramOutputCompositor,
  liveEnabledAudioTracks,
  type ProgramOutputCompositorDeps,
} from './program-output-compositor'

export { liveEnabledAudioTracks }

export type ProgramRecordingDeps = ProgramOutputCompositorDeps & {
  /** When omitted, a private compositor is created for this recorder only. */
  compositor?: ProgramOutputCompositor
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
 * Records program output via a canvas compositor (primary video + mixer audio).
 * Limitations: browser overlay, scene PNG masks, and PiP layout are not composited —
 * only the main program video element (or webcam fallback) is drawn each frame.
 */
export function createProgramRecording(deps: ProgramRecordingDeps): ProgramRecordingController {
  const compositor = deps.compositor ?? createProgramOutputCompositor(deps)
  const ownsCompositor = !deps.compositor

  let recorder: MediaRecorder | null = null
  let recordStream: MediaStream | null = null
  const chunks: Blob[] = []
  let active = false

  return {
    isRecording: () => active,
    async start(): Promise<void> {
      if (active) return
      const mime = pickRecorderMime()
      if (!mime && !MediaRecorder.isTypeSupported('')) {
        throw new Error('MediaRecorder is not supported in this environment.')
      }
      chunks.length = 0
      recordStream = compositor.isActive() ? compositor.getStream() : compositor.start()
      if (!recordStream) {
        throw new Error('Could not start program output compositor.')
      }
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

      if (ownsCompositor && compositor.isActive()) {
        compositor.stop()
      }
      recordStream = null

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
