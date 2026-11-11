export type VcamFallbackInfo = {
  name: string
  /** Public download or docs URL. */
  url: string
}

export type VcamCapability = {
  /** True when a virtual camera device can be registered from this app build. */
  canOutputToDevice: boolean
  /** Program canvas can run locally (preview / future device pipe). */
  previewOnly: boolean
  platform: NodeJS.Platform
  /** Human-readable limitation when `canOutputToDevice` is false. */
  limitationMessage: string
  recommendedFallback: VcamFallbackInfo | null
  /** Separate window other apps can capture as a camera source. */
  mirrorWindow: boolean
  /** v4l2loopback node when one is present, otherwise null. */
  devicePath: string | null
}
