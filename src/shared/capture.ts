/** Virtual capture source id for the active Browse tab (resolved in main process). */
export const BROWSE_CAPTURE_SOURCE_ID = 'tabcast:browse:active'

export type BrowseCaptureInfo = {
  mediaSourceId: string
  title: string
  url: string
}
