import {
  parseTwitchIrcAlert,
  parseTwitchIrcChat,
  type StreamAlert,
  type TwitchChatLine,
} from '../shared/stream-overlays'

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443'

export type TwitchChatFeedStatus = 'connecting' | 'open'

export type TwitchChatFeed = {
  stop: () => void
}

/**
 * One read-only Twitch chat socket for the saved channel.
 * Chat lines and cheers, subs, gift subs, and raids share the connection.
 */
export function startTwitchChatFeed(
  channel: string,
  handlers: {
    onAlert: (alert: StreamAlert) => void
    onChat: (line: TwitchChatLine) => void
    onStatus?: (status: TwitchChatFeedStatus) => void
  },
): TwitchChatFeed {
  const login = channel.trim().replace(/^@/, '').toLowerCase()
  let socket: WebSocket | null = null
  let stopped = false
  let retryMs = 1000
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  if (!/^[a-z0-9_]{2,25}$/.test(login)) {
    return { stop() {} }
  }

  const schedule = () => {
    if (stopped || retryTimer) return
    handlers.onStatus?.('connecting')
    retryTimer = setTimeout(() => {
      retryTimer = null
      retryMs = Math.min(retryMs * 2, 15_000)
      connect()
    }, retryMs)
  }

  const connect = () => {
    if (stopped) return
    handlers.onStatus?.('connecting')
    let current: WebSocket
    try {
      current = new WebSocket(IRC_URL)
    } catch {
      schedule()
      return
    }
    socket = current

    current.addEventListener('open', () => {
      if (stopped || socket !== current) return
      retryMs = 1000
      handlers.onStatus?.('open')
      const nick = `justinfan${Math.floor(10000 + Math.random() * 89999)}`
      current.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      current.send(`NICK ${nick}`)
      current.send(`JOIN #${login}`)
    })

    current.addEventListener('message', (event) => {
      if (stopped || socket !== current) return
      const text = typeof event.data === 'string' ? event.data : ''
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue
        if (line.startsWith('PING')) {
          current.send('PONG :tmi.twitch.tv')
          continue
        }
        const alert = parseTwitchIrcAlert(line)
        if (alert) {
          handlers.onAlert(alert)
          continue
        }
        const chat = parseTwitchIrcChat(line)
        if (chat) handlers.onChat(chat)
      }
    })

    current.addEventListener('close', () => {
      if (socket === current) socket = null
      if (!stopped) schedule()
    })

    current.addEventListener('error', () => {
      current.close()
    })
  }

  connect()

  return {
    stop() {
      stopped = true
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = null
      socket?.close()
      socket = null
    },
  }
}
