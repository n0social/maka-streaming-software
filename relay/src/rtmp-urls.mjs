/**
 * @param {Record<string, unknown>} config
 * @returns {{ label: string, url: string }[]}
 */
export function rtmpDestinations(config) {
  const out = []
  const twitchKey = typeof config.twitchKey === 'string' ? config.twitchKey.trim() : ''
  const youtubeKey = typeof config.youtubeKey === 'string' ? config.youtubeKey.trim() : ''
  const customUrl = typeof config.customRtmpUrl === 'string' ? config.customRtmpUrl.trim() : ''
  const customKey = typeof config.customRtmpKey === 'string' ? config.customRtmpKey.trim() : ''

  if (twitchKey) {
    out.push({ label: 'twitch', url: `rtmp://live.twitch.tv/app/${twitchKey}` })
  }
  if (youtubeKey) {
    out.push({ label: 'youtube', url: `rtmp://a.rtmp.youtube.com/live2/${youtubeKey}` })
  }
  if (customUrl && customKey) {
    const base = customUrl.replace(/\/+$/, '')
    out.push({ label: 'custom', url: `${base}/${customKey}` })
  }
  return out
}