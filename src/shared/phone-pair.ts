/** LAN phone pairing (studio ↔ mobile browser). Separate from the relay port. */

/** Marketplace addon id that owns the LAN phone-pair server and panel. */
export const PHONE_CAM_ADDON_ID = 'com.tabcast.phone-cam'

export const PHONE_PAIR_PORT = 38_474
export const PHONE_PAIR_TOKEN_TTL_MS = 5 * 60 * 1000
/** Grace period after phone offline / WebRTC drop before the session token is invalidated. */
export const PHONE_PAIR_REJOIN_GRACE_MS = 60 * 1000
export const PHONE_PAIR_PAIR_PATH = '/pair'
export const PHONE_PAIR_REJOIN_PATH = '/rejoin'
export const PHONE_PAIR_OFFLINE_PATH = '/offline'
export const PHONE_PAIR_WEBRTC_OFFER_PATH = '/webrtc/offer'
export const PHONE_PAIR_WEBRTC_ANSWER_PATH = '/webrtc/answer'

/** MSID / MediaStream id for the phone facecam track (video only). */
export const PHONE_CAM_STREAM_ID = 'phone-cam'
/** MSID / MediaStream id for the phone microphone track (audio only). */
export const PHONE_MIC_STREAM_ID = 'phone-mic'

/** `<select id="camera-select">` value when using the paired phone camera. */
export const PHONE_CAMERA_DEVICE_VALUE = 'phone-cam'
/** `<select id="mic-select">` value when using the paired phone microphone. */
export const PHONE_MIC_DEVICE_VALUE = 'phone-mic'

export type PhonePairStatus = 'waiting' | 'connected' | 'reconnecting'

export type PhoneWebRtcSessionDescription = {
  type: 'offer' | 'answer'
  sdp: string
}

export type PhonePairSnapshot = {
  status: PhonePairStatus
  /** Full URL encoded in the studio QR code, or null if LAN IP is unavailable. */
  pairUrl: string | null
  lanAddress: string | null
  port: number
}
