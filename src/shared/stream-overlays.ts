export type StreamChatPlatform = 'twitch' | 'youtube' | 'custom' | 'none'

/** Same event set Twitch draws as in-stream alerts: cheers, subs, gift subs, raids. */
export type StreamAlertKind = 'cheer' | 'subscription' | 'gift' | 'raid'

export type StreamAlert = {
  id: string
  kind: StreamAlertKind
  name: string
  amount: string
  message: string
}

const TWITCH_LOGIN = /^[a-zA-Z0-9_]{2,25}$/
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Streamlabs and StreamElements hand their on-stream alerts to OBS as an https alert-box page. */
export function alertBoxPageUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

/** Popout chat for the channel chosen in the go-live wizard. */
export function streamChatUrl(platform: StreamChatPlatform, channel: string): string | null {
  const name = channel.trim().replace(/^@/, '')
  if (!name) return null
  if (platform === 'twitch' && TWITCH_LOGIN.test(name)) {
    return `https://www.twitch.tv/popout/${name.toLowerCase()}/chat?popout=`
  }
  if (platform === 'youtube' && YOUTUBE_VIDEO_ID.test(name)) {
    return `https://www.youtube.com/live_chat?is_popout=1&v=${name}`
  }
  return null
}

/** On-stream card copy, matching Twitch alert wording: name, event, amount, optional message. */
export function alertCard(alert: StreamAlert): { kicker: string; headline: string; detail: string } {
  if (alert.kind === 'cheer') {
    return { kicker: 'Cheer', headline: `${alert.name} cheered ${alert.amount}`, detail: alert.message }
  }
  if (alert.kind === 'subscription') {
    return { kicker: 'Subscription', headline: `${alert.name} subscribed`, detail: alert.message }
  }
  if (alert.kind === 'gift') {
    return { kicker: 'Gifted sub', headline: `${alert.name} gifted ${alert.amount}`, detail: alert.message }
  }
  return { kicker: 'Raid', headline: `${alert.name} is raiding with ${alert.amount}`, detail: alert.message }
}

function unescapeIrcTag(value: string): string {
  return value.replace(/\\s/g, ' ').replace(/\\:/g, ';').replace(/\\\\/g, '\\').replace(/\\r/g, ' ').replace(/\\n/g, ' ')
}

function ircTags(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of source.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    out[part.slice(0, eq)] = unescapeIrcTag(part.slice(eq + 1))
  }
  return out
}

function trailingMessage(rest: string): string {
  const idx = rest.indexOf(' :')
  return idx >= 0 ? rest.slice(idx + 2).trim() : ''
}

/** Twitch IRC bits, subscriptions, and raids. Ordinary chat lines are ignored. */
export function parseTwitchIrcAlert(rawLine: string): StreamAlert | null {
  const line = rawLine.trim()
  if (!line.startsWith('@')) return null
  const space = line.indexOf(' ')
  if (space < 0) return null
  const tags = ircTags(line.slice(1, space))
  const rest = line.slice(space + 1)
  const command = rest.split(' ')[1] || ''
  const name = tags['display-name'] || 'Someone'
  const id = tags.id || `${command}-${name}-${tags.bits || tags['msg-id'] || ''}`

  if (command === 'PRIVMSG' && tags.bits) {
    return {
      id,
      kind: 'cheer',
      name,
      amount: `${tags.bits} bits`,
      message: trailingMessage(rest),
    }
  }

  if (command !== 'USERNOTICE') return null
  const msgId = tags['msg-id'] || ''
  if (msgId === 'sub' || msgId === 'resub') {
    const months = tags['msg-param-cumulative-months']
    return {
      id,
      kind: 'subscription',
      name,
      amount: months ? `${months} months` : tags['msg-param-sub-plan-name'] || 'Tier 1',
      message: tags['system-msg'] || trailingMessage(rest),
    }
  }
  if (msgId === 'subgift' || msgId === 'submysterygift') {
    const count = tags['msg-param-mass-gift-count'] || tags['msg-param-sender-count'] || '1'
    return {
      id,
      kind: 'gift',
      name,
      amount: `${count} subs`,
      message: tags['system-msg'] || trailingMessage(rest),
    }
  }
  if (msgId === 'raid') {
    const viewers = tags['msg-param-viewerCount']
    return {
      id,
      kind: 'raid',
      name: tags['msg-param-displayName'] || name,
      amount: viewers ? `${viewers} viewers` : 'Raid',
      message: tags['system-msg'] || '',
    }
  }
  return null
}
