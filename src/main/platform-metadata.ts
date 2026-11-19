/**
 * Relay 0.1.1 — editable platform metadata.
 * Open MAKA.relay encodes and pushes RTMP. This module is the
 * part we can change: it tells Twitch and YouTube the title, game, description,
 * and (YouTube) thumbnail. RTMP does not do that.
 */
export const RELAY_METADATA_VERSION = '0.1.1'

export type PlatformMetadataInput = {
  title: string
  description: string
  category: string
  twitchToken?: string
  twitchClientId?: string
  youtubeToken?: string
  thumbnail?: { bytes: Uint8Array; mime: string }
}

export type PlatformMetadataReport = {
  version: typeof RELAY_METADATA_VERSION
  twitch: { ok: boolean; message: string }
  youtube: { ok: boolean; message: string }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

export async function publishPlatformMetadata(
  input: PlatformMetadataInput,
  fetchImpl: FetchLike = fetch,
): Promise<PlatformMetadataReport> {
  const [twitch, youtube] = await Promise.all([
    publishTwitch(input, fetchImpl),
    publishYoutube(input, fetchImpl),
  ])
  return { version: RELAY_METADATA_VERSION, twitch, youtube }
}

async function publishTwitch(
  input: PlatformMetadataInput,
  fetchImpl: FetchLike,
): Promise<{ ok: boolean; message: string }> {
  const token = input.twitchToken?.trim()
  const clientId = input.twitchClientId?.trim()
  if (!token || !clientId) {
    return { ok: false, message: 'Twitch account token or client id is not set' }
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    'Client-Id': clientId,
    'Content-Type': 'application/json',
  }
  const userRes = await fetchImpl('https://api.twitch.tv/helix/users', { headers })
  if (!userRes.ok) {
    return { ok: false, message: `Twitch user lookup failed (${userRes.status})` }
  }
  const userJson = (await userRes.json()) as { data?: Array<{ id?: string }> }
  const broadcasterId = userJson.data?.[0]?.id
  if (!broadcasterId) return { ok: false, message: 'Twitch token did not return a user' }

  let gameId: string | undefined
  const category = input.category.trim()
  if (category) {
    const gameRes = await fetchImpl(
      `https://api.twitch.tv/helix/games?name=${encodeURIComponent(category)}`,
      { headers },
    )
    if (gameRes.ok) {
      const gameJson = (await gameRes.json()) as { data?: Array<{ id?: string }> }
      gameId = gameJson.data?.[0]?.id
    }
  }

  const body: { title?: string; game_id?: string } = {}
  if (input.title.trim()) body.title = input.title.trim().slice(0, 140)
  if (gameId) body.game_id = gameId
  if (!body.title && !body.game_id) {
    return { ok: false, message: 'No Twitch title or matching game to send' }
  }

  const patch = await fetchImpl(
    `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(broadcasterId)}`,
    { method: 'PATCH', headers, body: JSON.stringify(body) },
  )
  if (!patch.ok) return { ok: false, message: `Twitch channel update failed (${patch.status})` }
  return { ok: true, message: 'Twitch title and game updated' }
}

async function publishYoutube(
  input: PlatformMetadataInput,
  fetchImpl: FetchLike,
): Promise<{ ok: boolean; message: string }> {
  const token = input.youtubeToken?.trim()
  if (!token) return { ok: false, message: 'YouTube account token is not set' }
  const headers = { Authorization: `Bearer ${token}` }
  const list = await fetchImpl(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,id&broadcastStatus=active&mine=true',
    { headers },
  )
  if (!list.ok) return { ok: false, message: `YouTube broadcast lookup failed (${list.status})` }
  const listed = (await list.json()) as { items?: Array<{ id?: string; snippet?: { title?: string; description?: string } }> }
  const item = listed.items?.[0]
  const broadcastId = item?.id
  if (!broadcastId) return { ok: false, message: 'No active YouTube broadcast for this token' }

  const snippet = {
    title: input.title.trim().slice(0, 100) || item.snippet?.title || 'Live',
    description: input.description.trim().slice(0, 5000),
  }
  const update = await fetchImpl(
    'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet',
    {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: broadcastId, snippet }),
    },
  )
  if (!update.ok) return { ok: false, message: `YouTube broadcast update failed (${update.status})` }

  if (input.thumbnail?.bytes?.byteLength) {
    const thumb = await fetchImpl(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(broadcastId)}`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': input.thumbnail.mime || 'image/png' },
        body: input.thumbnail.bytes as unknown as BodyInit,
      },
    )
    if (!thumb.ok) {
      return { ok: true, message: `YouTube title and description set; thumbnail failed (${thumb.status})` }
    }
    return { ok: true, message: 'YouTube title, description, and thumbnail set' }
  }
  return { ok: true, message: 'YouTube title and description set' }
}
