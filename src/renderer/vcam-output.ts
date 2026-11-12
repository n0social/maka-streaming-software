import type { MakaBridge } from '../preload/index'

declare global {
  interface Window {
    maka: MakaBridge
  }
}

const frame = document.getElementById('vcam-frame') as HTMLImageElement
const waiting = document.getElementById('vcam-waiting')

window.maka.onVcamFrame((dataUrl) => {
  if (!dataUrl.startsWith('data:image/jpeg')) return
  frame.src = dataUrl
  frame.hidden = false
  if (waiting) waiting.hidden = true
})
