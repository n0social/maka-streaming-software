import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const qrcodeBundle = readFileSync(join(here, 'phone-cam-qrcode.bundle.js'), 'utf8')

/** Bundled Phone camera marketplace addon (LAN QR pairing panel). */
export const PHONE_CAM_FILES: Record<string, string> = {
  'qrcode.bundle.js': qrcodeBundle,
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';" />
    <title>Phone camera</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; }
      body { margin: 0; padding: 0.5rem 0.55rem 0.65rem; background: #121218; color: #e8e8ec; font-size: 0.82rem; }
      .panel { display: grid; justify-items: center; gap: 0.35rem; }
      canvas { border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: #141a24; }
      .status { margin: 0; color: #c8c8d4; font-size: 0.8rem; text-align: center; }
      .hint { margin: 0; color: #9a9aa8; font-size: 0.72rem; text-align: center; line-height: 1.35; }
      .actions { display: flex; gap: 0.4rem; width: 100%; margin-top: 0.15rem; }
      button {
        flex: 1;
        font: inherit;
        font-size: 0.78rem;
        padding: 0.35rem 0.5rem;
        border-radius: 0.35rem;
        border: 1px solid #555;
        background: #1e1e28;
        color: inherit;
        cursor: pointer;
      }
      button:hover { border-color: #d4af37; }
      button[hidden] { display: none; }
    </style>
  </head>
  <body>
    <div class="panel">
      <canvas id="qr" width="168" height="168" aria-label="Pairing QR code"></canvas>
      <p class="status" id="status">Waiting for phone</p>
      <p class="hint" id="lan-hint" hidden></p>
      <div class="actions">
        <button type="button" id="btn-refresh">Refresh</button>
        <button type="button" id="btn-unpair" hidden>Unpair</button>
      </div>
    </div>
    <script src="qrcode.bundle.js"></script>
    <script src="index.js"></script>
  </body>
</html>
`,
  'index.js': `/** Phone camera addon — LAN pairing QR (device.phone-pair). */
;(function () {
  var qrCanvas = document.getElementById('qr')
  var statusEl = document.getElementById('status')
  var lanHint = document.getElementById('lan-hint')
  var btnRefresh = document.getElementById('btn-refresh')
  var btnUnpair = document.getElementById('btn-unpair')
  var api = window.maka && window.maka.addons

  function renderStatus(snap) {
    if (snap.status === 'connected') {
      statusEl.textContent = 'Phone connected'
      btnUnpair.hidden = false
    } else if (snap.status === 'reconnecting') {
      statusEl.textContent = 'Phone reconnecting'
      btnUnpair.hidden = false
    } else {
      statusEl.textContent = 'Waiting for phone'
      btnUnpair.hidden = true
    }
    if (!snap.lanAddress) {
      lanHint.textContent = 'No LAN IPv4 — connect Wi‑Fi and refresh the code.'
      lanHint.hidden = false
    } else {
      lanHint.textContent = 'Same Wi‑Fi as ' + snap.lanAddress
      lanHint.hidden = false
    }
  }

  function renderQr(pairUrl) {
    var ctx = qrCanvas.getContext('2d')
    if (!ctx) return Promise.resolve()
    if (!pairUrl || !window.QRCode || !window.QRCode.toCanvas) {
      ctx.fillStyle = '#141a24'
      ctx.fillRect(0, 0, qrCanvas.width, qrCanvas.height)
      return Promise.resolve()
    }
    return window.QRCode.toCanvas(qrCanvas, pairUrl, {
      width: qrCanvas.width,
      margin: 1,
      color: { dark: '#e8ecf4', light: '#141a24' },
    })
  }

  function applySnapshot(snap) {
    renderStatus(snap)
    return renderQr(snap.pairUrl)
  }

  if (!api || !api.getPhonePair) {
    statusEl.textContent = 'Phone pairing bridge unavailable'
    return
  }

  api.getPhonePair().then(function (snap) {
    return applySnapshot(snap)
  })

  api.onPhonePairUpdate(function (snap) {
    void applySnapshot(snap)
  })

  btnRefresh.addEventListener('click', function () {
    api.refreshPhonePair().then(function (snap) {
      return applySnapshot(snap)
    })
  })

  btnUnpair.addEventListener('click', function () {
    api.unpairPhone().then(function (snap) {
      return applySnapshot(snap)
    })
  })
})()
`,
}
