import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import {
  PHONE_PAIR_OFFLINE_PATH,
  PHONE_PAIR_PAIR_PATH,
  PHONE_PAIR_PORT,
  PHONE_PAIR_TOKEN_TTL_MS,
  PHONE_PAIR_WEBRTC_ANSWER_PATH,
  PHONE_PAIR_WEBRTC_OFFER_PATH,
  type PhonePairSnapshot,
  type PhonePairStatus,
  type PhoneWebRtcSessionDescription,
} from '../shared/phone-pair'
import { recordDiagnostic } from './diagnostics'

type Listener = (snapshot: PhonePairSnapshot) => void
type OfferListener = (offer: PhoneWebRtcSessionDescription) => void

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
      padding: 16px;
    }
    main {
      width: 100%;
      max-width: 24rem;
      text-align: center;
    }
    h1 { font-size: 1.35rem; margin: 0 0 0.35rem; font-weight: 700; }
    p { margin: 0.4rem 0; line-height: 1.45; color: #a8b0c0; font-size: 0.95rem; }
    .state { margin-top: 0.75rem; font-size: 1rem; }
    .ok { color: #6ee7a8; }
    .err { color: #f87171; }
    .spin { opacity: 0.85; }
    #preview-wrap {
      margin-top: 1rem;
      border-radius: 12px;
      overflow: hidden;
      background: #141a24;
      aspect-ratio: 9 / 16;
      max-height: 55dvh;
      display: none;
    }
    #preview {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #000;
    }
    .controls {
      display: none;
      margin-top: 0.75rem;
      gap: 0.5rem;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
    }
    .controls.visible { display: flex; }
    button.flip {
      font: inherit;
      font-size: 0.9rem;
      padding: 0.5rem 1rem;
      border-radius: 8px;
      border: 1px solid #2a3344;
      background: #1a2230;
      color: #e8ecf4;
      cursor: pointer;
    }
    button.flip:active { background: #243044; }
    .mic {
      font-size: 0.85rem;
      padding: 0.45rem 0.75rem;
      border-radius: 8px;
      background: #1a2230;
      border: 1px solid #2a3344;
      color: #a8b0c0;
    }
    .mic.on { color: #6ee7a8; border-color: #2d5a40; }
    .mic.off { color: #f87171; border-color: #5a2d2d; }
    .hint-audio { color: #d4af37; font-size: 0.88rem; margin-top: 0.5rem; }
  </style>
</head>
<body>
  <main>
    <h1>Maka</h1>
    <p>Pair this phone with your studio on the same Wi‑Fi.</p>
    <p class="hint-audio">Use headphones for clearer audio</p>
    <p class="state spin" id="status">Connecting to Maka…</p>
    <div id="preview-wrap"><video id="preview" playsinline muted autoplay></video></div>
    <div class="controls" id="controls">
      <button type="button" class="flip" id="btn-flip" hidden>Flip camera</button>
      <span class="mic on" id="mic-indicator" aria-live="polite">Mic on</span>
    </div>
  </main>
  <script>
    (function () {
      var status = document.getElementById('status');
      var previewWrap = document.getElementById('preview-wrap');
      var preview = document.getElementById('preview');
      var controls = document.getElementById('controls');
      var btnFlip = document.getElementById('btn-flip');
      var micIndicator = document.getElementById('mic-indicator');
      var params = new URLSearchParams(location.search);
      var token = params.get('t');
      var sessionId = null;
      var offlineSent = false;
      var sessionEnded = false;
      var currentStream = null;
      var facingMode = 'environment';
      var peer = null;
      var PHONE_CAM_STREAM_ID = 'phone-cam';
      var PHONE_MIC_STREAM_ID = 'phone-mic';

      function showSessionEnded() {
        sessionEnded = true;
        stopStream();
        previewWrap.style.display = 'none';
        controls.classList.remove('visible');
        status.textContent = 'This link ended. Scan a new QR code in the studio.';
        status.className = 'state err';
      }

      function signalOffline() {
        if (!sessionId || offlineSent || sessionEnded) return;
        offlineSent = true;
        var payload = JSON.stringify({ session: sessionId });
        var blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon && navigator.sendBeacon('${PHONE_PAIR_OFFLINE_PATH}', blob)) return;
        fetch('${PHONE_PAIR_OFFLINE_PATH}', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(function () {});
      }

      function bindPeerLifecycle(pc) {
        pc.addEventListener('connectionstatechange', function () {
          var state = pc.connectionState;
          if (state === 'failed' || state === 'closed') {
            signalOffline();
            showSessionEnded();
          } else if (state === 'disconnected') {
            signalOffline();
          }
        });
      }

      function bindLifecycle() {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') signalOffline();
        });
        window.addEventListener('pagehide', signalOffline);
        window.addEventListener('beforeunload', signalOffline);
      }

      function updateMicIndicator(stream) {
        var audio = stream.getAudioTracks()[0];
        if (!audio) {
          micIndicator.textContent = 'Mic off';
          micIndicator.className = 'mic off';
          return;
        }
        function refresh() {
          var live = audio.enabled && audio.readyState === 'live' && !audio.muted;
          micIndicator.textContent = live ? 'Mic on' : 'Mic off';
          micIndicator.className = live ? 'mic on' : 'mic off';
        }
        audio.addEventListener('mute', refresh);
        audio.addEventListener('unmute', refresh);
        audio.addEventListener('ended', refresh);
        refresh();
      }

      function stopStream() {
        if (peer) {
          peer.close();
          peer = null;
        }
        if (!currentStream) return;
        currentStream.getTracks().forEach(function (t) { t.stop(); });
        currentStream = null;
        preview.srcObject = null;
      }

      function waitIce(pc) {
        if (pc.iceGatheringState === 'complete') return Promise.resolve();
        return new Promise(function (resolve) {
          var timer = setTimeout(function () { resolve(); }, 4000);
          pc.addEventListener('icegatheringstatechange', function () {
            if (pc.iceGatheringState === 'complete') {
              clearTimeout(timer);
              resolve();
            }
          });
        });
      }

      function namedStream(id, track) {
        var s = new MediaStream([track]);
        try {
          Object.defineProperty(s, 'id', { value: id, writable: false, configurable: true });
        } catch (e) { /* ignore */ }
        return s;
      }

      function pollAnswer() {
        return fetch('${PHONE_PAIR_WEBRTC_ANSWER_PATH}?session=' + encodeURIComponent(sessionId))
          .then(function (res) {
            return res.json().then(function (body) { return { res: res, body: body }; });
          })
          .then(function (out) {
            if (out.res.status === 403) {
              showSessionEnded();
              throw new Error('session ended');
            }
            if (out.body && out.body.ok && out.body.answer) return out.body.answer;
            return null;
          });
      }

      function waitForAnswer(attempts) {
        if (!attempts) attempts = 40;
        return pollAnswer().then(function (answer) {
          if (answer) return answer;
          if (attempts <= 1) throw new Error('timeout');
          return new Promise(function (r) { setTimeout(r, 250); }).then(function () {
            return waitForAnswer(attempts - 1);
          });
        });
      }

      function startWebRtc(stream) {
        if (sessionEnded) return Promise.reject(new Error('session ended'));
        peer = new RTCPeerConnection({ iceServers: [] });
        bindPeerLifecycle(peer);
        var video = stream.getVideoTracks()[0];
        var audio = stream.getAudioTracks()[0];
        if (video) peer.addTrack(video, namedStream(PHONE_CAM_STREAM_ID, video));
        if (audio) peer.addTrack(audio, namedStream(PHONE_MIC_STREAM_ID, audio));

        peer.getSenders().forEach(function (sender) {
          if (sender.track && sender.track.kind === 'video') {
            try {
              var params = sender.getParameters();
              if (!params.encodings || !params.encodings.length) params.encodings = [{}];
              params.encodings[0].maxBitrate = 2_000_000;
              params.encodings[0].scaleResolutionDownBy = 1;
              void sender.setParameters(params);
            } catch (e) { /* ignore */ }
          }
        });

        return peer.createOffer().then(function (offer) {
          return peer.setLocalDescription(offer).then(function () { return waitIce(peer); });
        }).then(function () {
          var local = peer.localDescription;
          return fetch('${PHONE_PAIR_WEBRTC_OFFER_PATH}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session: sessionId,
              type: local.type,
              sdp: local.sdp,
            }),
          }).then(function (res) {
            return res.json().then(function (body) { return { res: res, body: body }; });
          });
        }).then(function (out) {
          if (out.res.status === 403) {
            showSessionEnded();
            throw new Error('session ended');
          }
          if (!out.body || !out.body.ok) throw new Error('offer failed');
          return waitForAnswer();
        }).then(function (answer) {
          if (sessionEnded || !peer) throw new Error('session ended');
          return peer.setRemoteDescription(answer);
        });
      }

      function bindTrackEnded(stream) {
        stream.getVideoTracks().forEach(function (track) {
          track.addEventListener('ended', signalOffline);
        });
      }

      function startPreview() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          status.textContent = 'Camera not supported in this browser.';
          status.className = 'state err';
          return Promise.resolve();
        }
        var constraints = {
          video: {
            facingMode: facingMode,
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        };
        return navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
          stopStream();
          currentStream = stream;
          preview.srcObject = stream;
          preview.muted = true;
          previewWrap.style.display = 'block';
          controls.classList.add('visible');
          status.textContent = 'Connecting media…';
          status.className = 'state spin';
          updateMicIndicator(stream);
          bindTrackEnded(stream);
          return startWebRtc(stream).then(function () {
            status.textContent = 'Connected to Maka';
            status.className = 'state ok';
          });
        }).then(function () {
          return navigator.mediaDevices.enumerateDevices();
        }).then(function (devices) {
          if (!devices) return;
          var cams = devices.filter(function (d) { return d.kind === 'videoinput'; });
          btnFlip.hidden = cams.length < 2;
        }).catch(function (err) {
          if (err && err.name === 'NotAllowedError') {
            status.textContent = 'Camera or mic permission denied. Refresh the code in the studio to try again.';
          } else {
            status.textContent = 'Could not open camera. Refresh the code in the studio to try again.';
          }
          status.className = 'state err';
        });
      }

      btnFlip.addEventListener('click', function () {
        facingMode = facingMode === 'user' ? 'environment' : 'user';
        startPreview();
      });

      if (!token) {
        status.textContent = 'Missing pairing code. Scan the QR in the studio again.';
        status.className = 'state err';
        return;
      }

      bindLifecycle();

      fetch('${PHONE_PAIR_PAIR_PATH}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token }),
      })
        .then(function (res) { return res.json().then(function (body) { return { res: res, body: body }; }); })
        .then(function (out) {
          if (out.res.ok && out.body && out.body.ok && out.body.session) {
            sessionId = out.body.session;
            return startPreview();
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
  private offerListeners = new Set<OfferListener>()
  private resetListeners = new Set<() => void>()
  private status: PhonePairStatus = 'waiting'
  private activeToken: ActiveToken | null = null
  private usedTokens = new Set<string>()
  private sessionToken: string | null = null
  private pendingAnswer: PhoneWebRtcSessionDescription | null = null

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onWebRtcOffer(listener: OfferListener): () => void {
    this.offerListeners.add(listener)
    return () => this.offerListeners.delete(listener)
  }

  onWebRtcReset(listener: () => void): () => void {
    this.resetListeners.add(listener)
    return () => this.resetListeners.delete(listener)
  }

  private clearWebRtc(): void {
    this.pendingAnswer = null
    for (const listener of this.resetListeners) listener()
  }

  setWebRtcAnswer(answer: PhoneWebRtcSessionDescription): void {
    if (answer.type !== 'answer' || !answer.sdp.trim()) return
    this.pendingAnswer = answer
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
    this.sessionToken = null
    this.clearWebRtc()
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

    this.sessionToken = randomBytes(16).toString('hex')
    this.status = 'connected'
    this.emit()
    recordDiagnostic('info', 'phone-pair', 'Phone paired over LAN')

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, message: 'connected', session: this.sessionToken }))
  }

  private async handleOffline(req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
    let parsed: { session?: string }
    try {
      parsed = JSON.parse(body) as { session?: string }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid request.' }))
      return
    }

    const session = typeof parsed.session === 'string' ? parsed.session.trim() : ''
    if (!session || !this.sessionToken || session !== this.sessionToken) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid session.' }))
      return
    }

    if (this.status === 'connected') {
      this.status = 'offline'
      this.sessionToken = null
      this.clearWebRtc()
      this.emit()
      recordDiagnostic('info', 'phone-pair', 'Phone went offline')
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        ok: true,
        status: this.status,
        sessionEnded: true,
      }),
    )
  }

  private sessionOk(session: string): boolean {
    return Boolean(session && this.sessionToken && session === this.sessionToken)
  }

  private async handleWebRtcOffer(req: IncomingMessage, res: ServerResponse, body: string): Promise<void> {
    let parsed: { session?: string; type?: string; sdp?: string }
    try {
      parsed = JSON.parse(body) as { session?: string; type?: string; sdp?: string }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid request.' }))
      return
    }

    const session = typeof parsed.session === 'string' ? parsed.session.trim() : ''
    if (!this.sessionOk(session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Session ended. Scan a new QR code.' }))
      return
    }
    if (this.status !== 'connected') {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Session ended. Scan a new QR code.' }))
      return
    }

    const type = parsed.type === 'offer' ? 'offer' : null
    const sdp = typeof parsed.sdp === 'string' ? parsed.sdp : ''
    if (!type || !sdp.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid offer.' }))
      return
    }

    this.pendingAnswer = null
    const offer: PhoneWebRtcSessionDescription = { type: 'offer', sdp }
    for (const listener of this.offerListeners) listener(offer)
    recordDiagnostic('info', 'phone-pair', 'Phone WebRTC offer received')

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  }

  private handleWebRtcAnswerQuery(url: URL, res: ServerResponse): void {
    const session = url.searchParams.get('session')?.trim() ?? ''
    if (!this.sessionOk(session)) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, message: 'Invalid session.' }))
      return
    }

    if (!this.pendingAnswer) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, answer: null }))
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, answer: this.pendingAnswer }))
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

    if (req.method === 'POST' && url.pathname === PHONE_PAIR_OFFLINE_PATH) {
      void readBody(req)
        .then((body) => this.handleOffline(req, res, body))
        .catch(() => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, message: 'Server error.' }))
        })
      return
    }

    if (req.method === 'POST' && url.pathname === PHONE_PAIR_WEBRTC_OFFER_PATH) {
      void readBody(req)
        .then((body) => this.handleWebRtcOffer(req, res, body))
        .catch(() => {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, message: 'Server error.' }))
        })
      return
    }

    if (req.method === 'GET' && url.pathname === PHONE_PAIR_WEBRTC_ANSWER_PATH) {
      this.handleWebRtcAnswerQuery(url, res)
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
