import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import {
  PHONE_PAIR_PAIR_PATH,
  PHONE_PAIR_PORT,
  PHONE_PAIR_TOKEN_TTL_MS,
  type PhonePairSnapshot,
  type PhonePairStatus,
} from '../shared/phone-pair'
import { recordDiagnostic } from './diagnostics'

type Listener = (snapshot: PhonePairSnapshot) => void

type ActiveToken = {
  value: string
  expiresAt: number
}

function isIPv4(family: string | number): boolean {
  return family === 'IPv4' || family === 4
}

export function detectLanIPv4(): string | null {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    const addrs = nets[name]
    if (!addrs) continue
    for (const addr of addrs) {
      if (isIPv4(addr.family) && !addr.internal) {
        return addr.address
      }
    }
  }
  return null
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function mobilePageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Maka — Phone pairing</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      font-family: system-ui, -apple-system, Segoe UI, sans-serif;
      background: #0a0e14;
      color: #e8ecf4;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    main {
      max-width: 22rem;
      text-align: center;
    }
    h1 { font-size: 1.35rem; margin: 0 0 0.5rem; font-weight: 700; }
    p { margin: 0.5rem 0; line-height: 1.45; color: #a8b0c0; }
    .state { margin-top: 1.25rem; font-size: 1.05rem; }
    .ok { color: #6ee7a8; }
    .err { color: #f87171; }
    .spin { opacity: 0.85; }
  </style>
</head>
<body>
  <main>
    <h1>Maka</h1>
    <p>Pair this phone with your studio on the same Wi‑Fi.</p>
    <p class="state spin" id="status">Connecting to Maka…</p>
  </main>
  <script>
    (function () {
      var status = document.getElementById('status');
      var params = new URLSearchParams(location.search);
      var token = params.get('t');
      if (!token) {
        status.textContent = 'Missing pairing code. Scan the QR in the studio again.';
        status.className = 'state err';
        return;
      }
      fetch('${PHONE_PAIR_PAIR_PATH}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token }),
      })
        .then(function (res) { return res.json().then(function (body) { return { res: res, body: body }; }); })
        .then(function (out) {
          if (out.res.ok && out.body && out.body.ok) {
            status.textContent = 'Connected to Maka. You can return to the studio.';
            status.className = 'state ok';
            return;
          }
          var msg = (out.body && out.body.message) || 'Pairing failed. Scan a fresh code in the studio.';
          status.textContent = msg;
          status.className = 'state err';
        })
        .catch(function () {
          status.textContent = 'Could not reach Maka on this network.';
          status.className = 'state err';
        });
    })();
  </script>
</body>
</html>`
}

export class PhonePairServer {
  private server: Server | null = null
  private listeners = new Set<Listener>()
  private status: PhonePairStatus = 'waiting'
  private activeToken: ActiveToken | null = null
  private usedTokens = new Set<string>()

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): PhonePairSnapshot {
    const lan = detectLanIPv4()
    const token = this.activeToken?.value ?? null
    const pairUrl =
      lan && token ? `http://${lan}:${PHONE_PAIR_PORT}/?t=${encodeURIComponent(token)}` : null
    return {
      status: this.status,
      pairUrl,
      lanAddress: lan,
      port: PHONE_PAIR_PORT,
    }
  }

  private emit(): void {
    const snap = this.getSnapshot()
    for (const listener of this.listeners) listener(snap)
  }

  private clearToken(): void {
    if (this.activeToken) {
      this.usedTokens.add(this.activeToken.value)
      this.activeToken = null
    }
  }

  private mintToken(): void {
    this.clearToken()
    const value = randomBytes(24).toString('hex')
    this.activeToken = { value, expiresAt: Date.now() + PHONE_PAIR_TOKEN_TTL_MS }
  }

  /** Invalidate pairing and return to waiting with a fresh code. */
  resetPairing(): PhonePairSnapshot {
    this.status = 'waiting'
    this.mintToken()
    this.emit()
    return this.getSnapshot()
  }

  unpair(): PhonePairSnapshot {
    return this.resetPairing()
  }

  refresh(): PhonePairSnapshot {
    return this.resetPairing()
  }

  private tokenValid(token: string): 'ok' | 'expired' | 'used' | 'missing' {
    if (this.usedTokens.has(token)) return 'used'
    if (!this.activeToken || this.activeToken.value !== token) {
      if (this.usedTokens.has(token)) return 'used'
      return 'missing'
    }
    if (Date.now() > this.activeToken.expiresAt) return 'expired'
    return 'ok'
  }

  private consumeToken(token: string): boolean {
    const check = this.tokenValid(token)
    if (check !== 'ok') return false
    this.usedTokens.add(token)
    this.activeToken = null
    return true
  }

  private async handlePair(req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
    let parsed: { token?: string }
    try {
      parsed = JSON.parse(body) as { token?: string }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid request.' }))
      return
    }

    const token = typeof parsed.token === 'string' ? parsed.token.trim() : ''
    if (!token) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Missing pairing code.' }))
      return
    }

    const check = this.tokenValid(token)
    if (check === 'used') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'This code was already used. Refresh in the studio.' }))
      return
    }
    if (check === 'expired') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'This code expired. Refresh in the studio.' }))
      return
    }
    if (check === 'missing') {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid pairing code.' }))
      return
    }

    if (!this.consumeToken(token)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Pairing failed.' }))
      return
    }

    this.status = 'connected'
    this.emit()
    recordDiagnostic('info', 'phone-pair', 'Phone paired over LAN')

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, message: 'connected' }))
  }

  private onRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(mobilePageHtml())
      return
    }

    if (req.method === 'POST' && url.pathname === PHONE_PAIR_PAIR_PATH) {
      void readBody(req)
        .then((body) => this.handlePair(req, res, body))
        .catch(() => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, message: 'Server error.' }))
        })
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found')
  }

  async start(): Promise<void> {
    if (this.server) return
    if (!this.activeToken) this.mintToken()

    await new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => this.onRequest(req, res))
      server.once('error', reject)
      server.listen(PHONE_PAIR_PORT, '0.0.0.0', () => {
        this.server = server
        recordDiagnostic('info', 'phone-pair', `Phone pair server listening on 0.0.0.0:${PHONE_PAIR_PORT}`)
        this.emit()
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
    })
  }
}
