/** Typical Twitch keys look like live_<id>_<secret> (~30+ chars). */
export const TWITCH_STREAM_KEY_MIN_LENGTH = 15
export const TWITCH_STREAM_KEY_MAX_LENGTH = 128

/** YouTube RTMP keys are usually 16–24 chars. */
export const YOUTUBE_STREAM_KEY_MIN_LENGTH = 16
export const YOUTUBE_STREAM_KEY_MAX_LENGTH = 64

const TWITCH_STREAM_KEY_PATTERN = /^live_[a-zA-Z0-9_]+$/
const YOUTUBE_STREAM_KEY_PATTERN = /^[a-z0-9-]{16,64}$/i

export type StreamKeyValidation = { ok: true } | { ok: false; message: string }

/** Trims input and extracts a stream key when a full RTMP URL was pasted. */
export function normalizeStreamKey(raw: string): string {
  let key = raw.trim()

  const fromRtmpUrl = key.match(/rtmps?:\/\/[^/]+\/app\/([^/?#\s]+)/i)
  if (fromRtmpUrl?.[1]) return fromRtmpUrl[1]

  const fromAppPath = key.match(/\/app\/([^/?#\s]+)/i)
  if (fromAppPath?.[1]) return fromAppPath[1]

  return key
}

export function validateTwitchStreamKey(raw: string): StreamKeyValidation {
  const key = normalizeStreamKey(raw)
  if (!key) {
    return { ok: false, message: 'Enter your Twitch stream key (Dashboard → Settings → Stream).' }
  }
  if (key.length < TWITCH_STREAM_KEY_MIN_LENGTH || key.length > TWITCH_STREAM_KEY_MAX_LENGTH) {
    return {
      ok: false,
      message: `Twitch stream key must be ${TWITCH_STREAM_KEY_MIN_LENGTH}–${TWITCH_STREAM_KEY_MAX_LENGTH} characters.`,
    }
  }
  if (!TWITCH_STREAM_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      message: 'Twitch stream key must start with live_ and contain only letters, numbers, and underscores.',
    }
  }
  return { ok: true }
}

export function validateYoutubeStreamKey(raw: string): StreamKeyValidation {
  const key = normalizeStreamKey(raw)
  if (!key) return { ok: true }
  if (key.length < YOUTUBE_STREAM_KEY_MIN_LENGTH || key.length > YOUTUBE_STREAM_KEY_MAX_LENGTH) {
    return {
      ok: false,
      message: `YouTube stream key must be ${YOUTUBE_STREAM_KEY_MIN_LENGTH}–${YOUTUBE_STREAM_KEY_MAX_LENGTH} characters.`,
    }
  }
  if (!YOUTUBE_STREAM_KEY_PATTERN.test(key)) {
    return {
      ok: false,
      message: 'YouTube stream key may only contain letters, numbers, and dashes.',
    }
  }
  return { ok: true }
}

export function validateRelayStreamKeys(input: {
  twitchKey?: string
  youtubeKey?: string
}): StreamKeyValidation {
  const twitch = normalizeStreamKey(input.twitchKey ?? '')
  const youtube = normalizeStreamKey(input.youtubeKey ?? '')

  if (!twitch && !youtube) {
    return { ok: false, message: 'Enter a Twitch or YouTube stream key.' }
  }

  if (twitch) {
    const twitchResult = validateTwitchStreamKey(twitch)
    if (!twitchResult.ok) return twitchResult
  }

  if (youtube) {
    const youtubeResult = validateYoutubeStreamKey(youtube)
    if (!youtubeResult.ok) return youtubeResult
  }

  return { ok: true }
}
