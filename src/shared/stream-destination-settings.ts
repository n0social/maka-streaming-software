export type StreamDestinationSettings = {
  destTwitch: boolean
  destYoutube: boolean
  destCustom: boolean
  twitchKey: string
  youtubeKey: string
}

export const DEFAULT_STREAM_DESTINATIONS: StreamDestinationSettings = {
  destTwitch: true,
  destYoutube: false,
  destCustom: false,
  twitchKey: '',
  youtubeKey: '',
}

const MAX_KEY_LEN = 256

export function coerceStreamDestinations(raw: unknown): StreamDestinationSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_STREAM_DESTINATIONS }
  }
  const p = raw as Record<string, unknown>
  return {
    destTwitch: typeof p.destTwitch === 'boolean' ? p.destTwitch : DEFAULT_STREAM_DESTINATIONS.destTwitch,
    destYoutube: typeof p.destYoutube === 'boolean' ? p.destYoutube : DEFAULT_STREAM_DESTINATIONS.destYoutube,
    destCustom: typeof p.destCustom === 'boolean' ? p.destCustom : DEFAULT_STREAM_DESTINATIONS.destCustom,
    twitchKey:
      typeof p.twitchKey === 'string' ? p.twitchKey.trim().slice(0, MAX_KEY_LEN) : '',
    youtubeKey:
      typeof p.youtubeKey === 'string' ? p.youtubeKey.trim().slice(0, MAX_KEY_LEN) : '',
  }
}

export function streamDestinationsFromPartial(
  partial: Partial<StreamDestinationSettings> | undefined,
): StreamDestinationSettings {
  if (!partial) return { ...DEFAULT_STREAM_DESTINATIONS }
  return coerceStreamDestinations({ ...DEFAULT_STREAM_DESTINATIONS, ...partial })
}
