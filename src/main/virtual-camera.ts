import type { VcamCapability } from '../shared/virtual-camera'
import { probeVcamDevice } from './vcam-output'

const OBS_VIRTUAL_CAM_URL =
  'https://github.com/Fenrirthviti/obs-virtual-cam/releases'

export function getVirtualCameraCapability(): VcamCapability {
  const platform = process.platform
  const windows = platform === 'win32'
  const probe = probeVcamDevice()
  const deviceReady = Boolean(probe.devicePath && probe.ffmpeg)

  let limitationMessage: string
  if (deviceReady && probe.devicePath) {
    limitationMessage = `Program frames are written to ${probe.devicePath}. Other apps can select that camera. A Maka Virtual Camera window is also opened for window capture.`
  } else if (windows) {
    limitationMessage =
      'This build opens a Maka Virtual Camera window other apps can window-capture. It does not include a Windows virtual camera driver, so apps cannot select “Maka” as a camera device yet.'
  } else {
    limitationMessage = probe.devicePath
      ? `Found ${probe.devicePath}, but ffmpeg is not installed, so frames stay in the Maka Virtual Camera window.`
      : 'Start Virtual Camera opens a Maka Virtual Camera window other apps can capture. A system camera device needs v4l2loopback plus ffmpeg on Linux, or a driver on Windows.'
  }

  return {
    canOutputToDevice: deviceReady,
    previewOnly: !deviceReady,
    platform,
    limitationMessage,
    recommendedFallback: windows ? { name: 'OBS Virtual Camera', url: OBS_VIRTUAL_CAM_URL } : null,
    mirrorWindow: true,
    devicePath: probe.devicePath,
  }
}
