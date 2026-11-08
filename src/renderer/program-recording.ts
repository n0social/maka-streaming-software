import type { EncodeProfileId } from '../shared/stream-encode-profiles'
import {
  createProgramOutputCompositor,
  type ProgramOutputCompositor,
  type ProgramOutputCompositorDeps,
} from './program-output-compositor'

export type ProgramRecordingDeps = ProgramOutputCompositorDeps & {
  compositor?: ProgramOutputCompositor
}

export type ProgramRecordingController = {
  isRecording: () => boolean
  start: () => Promise<void>
  stop: () => Promise<Blob | null>
}

const PREFERRED_MIME = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

function pickRecorderMime(): string {
  for (const mime of PREFERRED_MIME) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

export function createProgramRecording(deps: ProgramRecordingDeps): ProgramRecordingController {
  const compositor = deps.compositor ?? createProgramOutputCompositor(deps)
  const ownsCompositor = !deps.compositor
  let recorder: MediaRecorder | null = null
  let active = false
  const chunks: Blob[] = []

  return {
    isRecording: () => active,
    async start(): Promise<void> {
      if (active) return
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not supported in this environment.')
      }
      const mime = pickRecorderMime()
      chunks.length = 0
      const recordStream = compositor.isActive() ? compositor.getStream() : compositor.start()
      if (!recordStream) throw new Error('Could not start program output compositor.')
      recorder = mime ? new MediaRecorder(recordStream, { mimeType: mime }) : new MediaRecorder(recordStream)
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
      if (ownsCompositor && compositor.isActive()) compositor.stop()
      if (!chunks.length) return null
      return new Blob(chunks, { type: rec.mimeType || 'video/webm' })
    },
  }
}

export function buildRecordingFileName(profileId: EncodeProfileId, at = new Date()): string {
  const ts = at.toISOString().replace(/[:.]/g, '-')
  return `maka-recording-${ts}-${profileId}.webm`
}
