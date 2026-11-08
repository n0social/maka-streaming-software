export type VcamFallbackInfo = {
  name: string
  url: string
}

export type VcamCapability = {
  canOutputToDevice: boolean
  previewOnly: boolean
  platform: string
  limitationMessage: string
  recommendedFallback: VcamFallbackInfo | null
}
