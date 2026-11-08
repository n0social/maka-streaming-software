import type { VcamCapability } from '../shared/virtual-camera'

const OBS_VIRTUAL_CAM_URL = 'https://github.com/Fenrirthviti/obs-virtual-cam/releases'

export function getVirtualCameraCapability(): VcamCapability {
  const platform = process.platform
  const windows = platform === 'win32'

  return {
    canOutputToDevice: false,
    previewOnly: true,
    platform,
    limitationMessage: windows
      ? 'This build does not include a Windows virtual camera driver. Preview mode runs the same program compositor as local recording. Other apps cannot select Maka as a camera yet.'
      : 'Virtual camera device output is Windows-only and is not in this build. Preview mode still runs the program compositor on this machine.',
    recommendedFallback: windows ? { name: 'OBS Virtual Camera', url: OBS_VIRTUAL_CAM_URL } : null,
  }
}
