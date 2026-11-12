import { parseCount, parseTwitchGqlViewers, type PlatformViewerCounts } from '../shared/platform-viewers'

/** Public client id shipped in twitch.tv pages. Used only to read viewer count. */
const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

const TWITCH_LOGIN = /^[A-Za-z0-9_]{4,25}$/
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export async function fetchPlatformViewers(input: {
  twitchLogin?: string
  youtubeVideoId?: string
}): Promise<PlatformViewerCounts> {
  const [twitch, youtube] = await Promise.all([
    fetchTwitchViewers(input.twitchLogin ?? ''),
    fetchYouTubeViewers(input.youtubeVideoId ?? ''),
  ])
  return { twitch, youtube }
}

async function fetchYouTubeViewers(videoId: string): Promise<number | null> {
  if (!YOUTUBE_VIDEO_ID.test(videoId)) return null
  try {
    const res = await fetch(`https://www.youtube.com/live_stats?v=${encodeURIComponent(videoId)}`, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: 'text/plain', 'User-Agent': 'Maka/0.2' },
    })
    if (!res.ok) return null
    return parseCount(await res.text())
  } catch {
    return null
  }
}

async function fetchTwitchViewers(login: string): Promise<number | null> {
  const name = login.trim().replace(/^@/, '')
  if (!TWITCH_LOGIN.test(name)) return null
  try {
    const res = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      signal: AbortSignal.timeout(8_000),
      headers: {
        'Client-ID': TWITCH_WEB_CLIENT_ID,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Maka/0.2',
      },
      body: JSON.stringify({
        query: 'query($login:String!){user(login:$login){stream{viewersCount}}}',
        variables: { login: name.toLowerCase() },
      }),
    })
    if (!res.ok) return null
    return parseTwitchGqlViewers(await res.text())
  } catch {
    return null
  }
}
