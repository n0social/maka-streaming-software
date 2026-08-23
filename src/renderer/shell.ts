import type { TabcastBridge } from '../preload/index'
import type { RelaySnapshot } from '../shared/relay-snapshot'

declare global {
  interface Window {
    tabcast: TabcastBridge
  }
}

const light = document.getElementById('light')!
const lifecycleEl = document.getElementById('lifecycle')!
const metaEl = document.getElementById('meta')!
const healthEl = document.getElementById('health')!
const streamEl = document.getElementById('stream')!
const pidEl = document.getElementById('pid')!
const errorEl = document.getElementById('error')!

const labels: Record<RelaySnapshot['lifecycle'], string> = {
  stopped: 'Relay off',
  starting: 'Starting…',
  ready: 'Ready',
  live: 'LIVE',
  error: 'Error',
}

const metas: Record<RelaySnapshot['lifecycle'], string> = {
  stopped: 'Start the local encoder to go live.',
  starting: 'Waiting for localhost:38473…',
  ready: 'Capture in the Stream window, then go live.',
  live: 'Encoding and pushing to your destinations.',
  error: 'Something went wrong with the sidecar.',
}

function render(snapshot: RelaySnapshot): void {
  light.dataset.state = snapshot.lifecycle
  lifecycleEl.textContent = labels[snapshot.lifecycle]
  metaEl.textContent = metas[snapshot.lifecycle]
  healthEl.textContent = snapshot.health
    ? `v${snapshot.health.version}`
    : snapshot.lifecycle === 'starting'
      ? 'connecting…'
      : '—'
  streamEl.textContent = snapshot.status?.status ?? snapshot.health?.streamUrl ?? '—'
  pidEl.textContent = snapshot.pid != null ? String(snapshot.pid) : '—'

  if (snapshot.error) {
    errorEl.hidden = false
    errorEl.textContent = snapshot.error
  } else {
    errorEl.hidden = true
    errorEl.textContent = ''
  }
}

document.getElementById('btn-start')!.addEventListener('click', () => {
  void window.tabcast.startRelay()
})
document.getElementById('btn-stop')!.addEventListener('click', () => {
  void window.tabcast.stopRelay()
})
document.getElementById('btn-stream')!.addEventListener('click', () => {
  void window.tabcast.openStream()
})
document.getElementById('btn-home')!.addEventListener('click', () => {
  void window.tabcast.openHome()
})

void window.tabcast.getRelay().then(render)
window.tabcast.onRelayUpdate(render)
