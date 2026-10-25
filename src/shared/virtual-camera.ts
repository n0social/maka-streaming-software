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
}
