/** ICE configuration for LAN phone WebRTC (studio ↔ mobile browser). */

export const PHONE_WEBRTC_STUN_URL = 'stun:stun.l.google.com:19302'

export type PhoneTurnSettings = {
  turnUrl?: string
  turnUsername?: string
  turnCredential?: string
}

export type PhoneIceServer = {
  urls: string | string[]
  username?: string
  credential?: string
}

export function phoneTurnSettingsFromRecord(
  raw: Pick<PhoneTurnSettings, 'turnUrl' | 'turnUsername' | 'turnCredential'> | undefined,
): PhoneTurnSettings {
  if (!raw) return {}
  return {
    turnUrl: raw.turnUrl,
    turnUsername: raw.turnUsername,
    turnCredential: raw.turnCredential,
  }
}

export function isPhoneTurnConfigured(turn: PhoneTurnSettings): boolean {
  return Boolean(turn.turnUrl?.trim())
}

/** Always includes public STUN; adds TURN only when `turnUrl` is non-empty. */
export function buildPhoneIceServers(turn: PhoneTurnSettings = {}): PhoneIceServer[] {
  const servers: PhoneIceServer[] = [{ urls: PHONE_WEBRTC_STUN_URL }]
  const url = turn.turnUrl?.trim()
  if (!url) return servers

  const entry: PhoneIceServer = { urls: url }
  const username = turn.turnUsername?.trim()
  const credential = turn.turnCredential?.trim()
  if (username) entry.username = username
  if (credential) entry.credential = credential
  servers.push(entry)
  return servers
}
