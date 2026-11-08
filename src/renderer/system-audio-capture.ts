/**
 * Windows WASAPI loopback via Chromium desktop capture.
 * Other platforms have no per-app loopback in this build.
 */

export type SystemAudioCapturePlatform = 'win32' | 'darwin' | 'linux' | 'other'

export function parseCapturePlatform(raw: string | undefined): SystemAudioCapturePlatform {
  if (raw === 'win32' || raw === 'darwin' || raw === 'linux') return raw
  return 'other'
}

export function systemAudioCaptureSupported(platform: SystemAudioCapturePlatform): boolean {
  return platform === 'win32'
}

type MandatoryDesktopAudio = MediaTrackConstraints & {
  mandatory: {
    chromeMediaSource: 'desktop'
    chromeMediaSourceId?: string
  }
}

type MandatoryDesktopVideo = MediaTrackConstraints & {
  mandatory: {
    chromeMediaSource: 'desktop'
    chromeMediaSourceId?: string
    maxWidth: number
    maxHeight: number
    maxFrameRate: number
  }
}

function stripVideoTracks(stream: MediaStream): MediaStream {
  for (const track of stream.getVideoTracks()) {
    track.stop()
    stream.removeTrack(track)
  }
  return stream
}

async function captureDesktopAudioTracks(chromeMediaSourceId?: string): Promise<MediaStream> {
  const audioMandatory: MandatoryDesktopAudio['mandatory'] = {
    chromeMediaSource: 'desktop',
  }
  if (chromeMediaSourceId) audioMandatory.chromeMediaSourceId = chromeMediaSourceId

  const videoMandatory: MandatoryDesktopVideo['mandatory'] = {
    chromeMediaSource: 'desktop',
    maxWidth: 1,
    maxHeight: 1,
    maxFrameRate: 1,
  }
  if (chromeMediaSourceId) videoMandatory.chromeMediaSourceId = chromeMediaSourceId

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: audioMandatory } as MediaTrackConstraints,
    video: { mandatory: videoMandatory } as MediaTrackConstraints,
  })
  return stripVideoTracks(stream)
}

export async function startDesktopLoopbackAudio(): Promise<MediaStream | null> {
  try {
    const stream = await captureDesktopAudioTracks()
    if (!stream.getAudioTracks().length) {
      stopMediaStream(stream)
      return null
    }
    return stream
  } catch {
    return null
  }
}

export async function startGameLinkedAudio(sourceId: string): Promise<MediaStream | null> {
  const id = sourceId.trim()
  if (!id) return null
  try {
    const stream = await captureDesktopAudioTracks(id)
    if (!stream.getAudioTracks().length) {
      stopMediaStream(stream)
      return null
    }
    return stream
  } catch {
    return null
  }
}

export function stopMediaStream(stream: MediaStream | null): void {
  if (!stream) return
  for (const track of stream.getTracks()) track.stop()
}
