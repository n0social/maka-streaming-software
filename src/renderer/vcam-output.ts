import type { TabcastBridge } from '../preload/index'

declare global {
  interface Window {
    tabcast: TabcastBridge
  }
}

const frame = document.getElementById('vcam-frame') as HTMLImageElement
const waiting = document.getElementById('vcam-waiting')

window.tabcast.onVcamFrame((dataUrl) => {
  if (!dataUrl.startsWith('data:image/jpeg')) return
  frame.src = dataUrl
  frame.hidden = false
  if (waiting) waiting.hidden = true
})
