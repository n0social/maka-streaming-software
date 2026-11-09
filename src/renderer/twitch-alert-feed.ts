import { parseTwitchIrcAlert, type StreamAlert } from '../shared/stream-overlays'

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443'

export type TwitchAlertFeed = {
  stop: () => void
}

/** Read-only Twitch chat socket. Chat text stays in the popout; this feed only raises alerts. */
export function startTwitchAlertFeed(
  channel: string,
  onAlert: (alert: StreamAlert) => void,
): TwitchAlertFeed {
  const login = channel.trim().replace(/^@/, '').toLowerCase()
  let socket: WebSocket | null = null
  let stopped = false

  if (!/^[a-z0-9_]{2,25}$/.test(login)) {
    return { stop() {} }
  }

  try {
    socket = new WebSocket(IRC_URL)
  } catch {
    return { stop() {} }
  }

  socket.addEventListener('open', () => {
    if (!socket || stopped) return
    const nick = `justinfan${Math.floor(10000 + Math.random() * 89999)}`
    socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
    socket.send(`NICK ${nick}`)
    socket.send(`JOIN #${login}`)
  })

  socket.addEventListener('message', (event) => {
    const text = typeof event.data === 'string' ? event.data : ''
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith('PING')) {
        socket?.send('PONG :tmi.twitch.tv')
        continue
      }
      const alert = parseTwitchIrcAlert(line)
      if (alert) onAlert(alert)
    }
  })

  return {
    stop() {
      stopped = true
      socket?.close()
      socket = null
    },
  }
}
