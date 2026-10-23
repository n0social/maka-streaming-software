/** LAN phone pairing (studio ↔ mobile browser). Separate from the relay port. */

/** Marketplace addon id that owns the LAN phone-pair server and panel. */
export const PHONE_CAM_ADDON_ID = 'com.tabcast.phone-cam'

export const PHONE_PAIR_PORT = 38_474
export const PHONE_PAIR_TOKEN_TTL_MS = 5 * 60 * 1000
export const PHONE_PAIR_PAIR_PATH = '/pair'
export const PHONE_PAIR_OFFLINE_PATH = '/offline'

export type PhonePairStatus = 'waiting' | 'connected' | 'offline'

export type PhonePairSnapshot = {
  status: PhonePairStatus
  /** Full URL encoded in the studio QR code, or null if LAN IP is unavailable. */
  pairUrl: string | null
  lanAddress: string | null
  port: number
}
