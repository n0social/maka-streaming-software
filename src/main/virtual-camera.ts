import type { VcamCapability } from '../shared/virtual-camera'

const OBS_VIRTUAL_CAM_URL =
  'https://github.com/Fenrirthviti/obs-virtual-cam/releases'

export function getVirtualCameraCapability(): VcamCapability {
  const platform = process.platform
  const windows = platform === 'win32'

  return {
    canOutputToDevice: false,
    previewOnly: true,
    platform,
    limitationMessage: windows
      ? 'This build does not include a Windows virtual camera driver. Preview mode outputs the same program compositor as local recording, but other apps cannot select “Maka” as a camera yet.'
      : 'Virtual camera device output is only planned for Windows first. Use OBS Virtual Camera or a similar tool on this platform.',
    recommendedFallback: windows
      ? { name: 'OBS Virtual Camera', url: OBS_VIRTUAL_CAM_URL }
      : null,
  }
}
