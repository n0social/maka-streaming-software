/**
 * Windows WASAPI loopback / per-window desktop audio via Chromium desktop capture.
 * Linux and macOS return null streams (UI shows honest 0% meters).
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

async function captureDesktopAudioTracks(
  chromeMediaSourceId?: string,
  outputDeviceId?: string,
): Promise<MediaStream> {
  const audioMandatory: MandatoryDesktopAudio['mandatory'] = {
    chromeMediaSource: 'desktop',
  }
  if (chromeMediaSourceId) {
    audioMandatory.chromeMediaSourceId = chromeMediaSourceId
  }

  const audio: MandatoryDesktopAudio = { mandatory: audioMandatory }
  if (outputDeviceId) {
    Object.assign(audio, { deviceId: { exact: outputDeviceId } })
  }

  const videoMandatory: MandatoryDesktopVideo['mandatory'] = {
    chromeMediaSource: 'desktop',
    maxWidth: 1,
    maxHeight: 1,
    maxFrameRate: 1,
  }
  if (chromeMediaSourceId) {
    videoMandatory.chromeMediaSourceId = chromeMediaSourceId
  }

  const video: MandatoryDesktopVideo = { mandatory: videoMandatory }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio,
    video,
  })
  return stripVideoTracks(stream)
}

/** Full system output loopback (notifications, all desktop audio). */
export async function startDesktopLoopbackAudio(
  outputDeviceId?: string,
): Promise<MediaStream | null> {
  try {
    const stream = await captureDesktopAudioTracks(undefined, outputDeviceId?.trim() || undefined)
    const tracks = stream.getAudioTracks()
    if (!tracks.length) {
      stopMediaStream(stream)
      return null
    }
    return stream
  } catch {
    return null
  }
}

/** Audio tied to a display/window capture source id (per-process on Win10+ when available). */
export async function startGameLinkedAudio(sourceId: string): Promise<MediaStream | null> {
  const id = sourceId.trim()
  if (!id) return null
  try {
    const stream = await captureDesktopAudioTracks(id)
    const tracks = stream.getAudioTracks()
    if (!tracks.length) {
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
  for (const track of stream.getTracks()) {
    track.stop()
  }
}
