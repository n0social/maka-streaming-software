/** Stream-key and chat checks shared with the web studio wizard. */

const TWITCH_LOGIN = /^[A-Za-z0-9_]{4,25}$/
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function sanitizeStreamWizardTitle(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 140)
}

export function sanitizeStreamGame(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 100)
  return cleaned || 'Just Chatting'
}

export function extractStreamKey(raw: string): string {
  const key = raw.trim()
  const fromUrl = key.match(/rtmps?:\/\/[^/\s]+\/(?:app|live2)\/([^/?#\s]+)/i)
  if (fromUrl?.[1]) return fromUrl[1]
  const fromApp = key.match(/\/(?:app|live2)\/([^/?#\s]+)/i)
  if (fromApp?.[1]) return fromApp[1]
  return key
}

export function isTwitchStreamKey(raw: string): boolean {
  const key = extractStreamKey(raw)
  if (!key || /\s/.test(key) || key.length < 15 || key.length > 128) return false
  return /^live_[a-zA-Z0-9_]+$/.test(key)
}

export function isYouTubeStreamKey(raw: string): boolean {
  const key = extractStreamKey(raw)
  if (!key || /\s/.test(key)) return false
  return /^[a-z0-9]{4}(?:-[a-z0-9]{4}){3,5}$/i.test(key)
}

export function streamKeyValid(platform: 'twitch' | 'youtube', raw: string): boolean {
  return platform === 'youtube' ? isYouTubeStreamKey(raw) : isTwitchStreamKey(raw)
}

export function normalizeTwitchChannel(raw: string): string {
  const text = raw.trim().replace(/^@+/, '')
  if (!text) return ''
  const fromUrl = text.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([A-Za-z0-9_]{1,25})/i)
  if (fromUrl?.[1]) return fromUrl[1]
  if (/twitch\.tv/i.test(text) || /^https?:/i.test(text)) {
    const path = text.split(/[?#]/)[0] ?? ''
    const bits = path.split('/').filter(Boolean)
    const last = (bits[bits.length - 1] ?? '').replace(/^@+/, '')
    if (/^[A-Za-z0-9_]{1,25}$/.test(last)) return last
  }
  return text.slice(0, 25)
}

export function isTwitchLogin(raw: string): boolean {
  return TWITCH_LOGIN.test(raw)
}

export function youtubeVideoId(raw: string): string {
  const text = raw.trim().slice(0, 512)
  if (!text) return ''
  const patterns = [
    /[?&]v=([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/,
    /youtu\.be\/([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/,
    /youtube\.com\/(?:embed|live|shorts|v)\/([A-Za-z0-9_-]{11})(?:[^A-Za-z0-9_-]|$)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1]
  }
  if (YOUTUBE_VIDEO_ID.test(text)) return text
  return ''
}
