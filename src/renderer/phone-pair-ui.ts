import type { PhonePairSnapshot } from '../shared/phone-pair'
import QRCode from 'qrcode'

const qrCanvas = document.getElementById('phone-pair-qr') as HTMLCanvasElement
const statusEl = document.getElementById('phone-pair-status')!
const btnRefresh = document.getElementById('btn-phone-pair-refresh') as HTMLButtonElement
const btnUnpair = document.getElementById('btn-phone-unpair') as HTMLButtonElement
const lanHint = document.getElementById('phone-pair-lan-hint')!

function renderStatus(snap: PhonePairSnapshot): void {
  if (snap.status === 'connected') {
    statusEl.textContent = 'Phone connected'
    btnUnpair.hidden = false
  } else {
    statusEl.textContent = 'Waiting for phone'
    btnUnpair.hidden = true
  }

  if (!snap.lanAddress) {
    lanHint.textContent = 'No LAN IPv4 found — connect Wi‑Fi and refresh the code.'
    lanHint.hidden = false
  } else {
    lanHint.textContent = `Same Wi‑Fi as ${snap.lanAddress}`
    lanHint.hidden = false
  }
}

async function renderQr(pairUrl: string | null): Promise<void> {
  const ctx = qrCanvas.getContext('2d')
  if (!ctx) return
  if (!pairUrl) {
    ctx.fillStyle = '#141a24'
    ctx.fillRect(0, 0, qrCanvas.width, qrCanvas.height)
    return
  }
  await QRCode.toCanvas(qrCanvas, pairUrl, {
    width: qrCanvas.width,
    margin: 1,
    color: { dark: '#e8ecf4', light: '#141a24' },
  })
}

async function applySnapshot(snap: PhonePairSnapshot): Promise<void> {
  renderStatus(snap)
  await renderQr(snap.pairUrl)
}

export function initPhonePairUi(): void {
  void window.tabcast.getPhonePair().then((snap) => {
    void applySnapshot(snap)
  })

  window.tabcast.onPhonePairUpdate((snap) => {
    void applySnapshot(snap)
  })

  btnRefresh.addEventListener('click', () => {
    void window.tabcast.refreshPhonePair().then((snap) => applySnapshot(snap))
  })

  btnUnpair.addEventListener('click', () => {
    void window.tabcast.unpairPhone().then((snap) => applySnapshot(snap))
  })
}
