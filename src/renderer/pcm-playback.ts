/** Turns 48 kHz stereo signed-16 PCM into a live MediaStream. */

const SAMPLE_RATE = 48_000
const CHANNELS = 2

export type PcmPlayback = {
  stream: MediaStream
  push(pcm: Uint8Array): void
  close(): void
}

export function createPcmPlayback(): PcmPlayback {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
  const dest = ctx.createMediaStreamDestination()
  const node = ctx.createScriptProcessor(2048, 0, CHANNELS)
  const queue = new Float32Array(SAMPLE_RATE * CHANNELS)
  let read = 0
  let write = 0
  let available = 0

  node.onaudioprocess = (event) => {
    const left = event.outputBuffer.getChannelData(0)
    const right = event.outputBuffer.getChannelData(1)
    for (let i = 0; i < left.length; i++) {
      if (available < CHANNELS) {
        left[i] = 0
        right[i] = 0
        continue
      }
      left[i] = queue[read] ?? 0
      right[i] = queue[(read + 1) % queue.length] ?? 0
      read = (read + CHANNELS) % queue.length
      available -= CHANNELS
    }
  }
  node.connect(dest)
  void ctx.resume()

  return {
    stream: dest.stream,
    push(pcm) {
      const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
      for (let i = 0; i + 3 < pcm.byteLength; i += 4) {
        if (available + CHANNELS >= queue.length) return
        queue[write] = view.getInt16(i, true) / 32768
        queue[(write + 1) % queue.length] = view.getInt16(i + 2, true) / 32768
        write = (write + CHANNELS) % queue.length
        available += CHANNELS
      }
    },
    close() {
      node.onaudioprocess = null
      node.disconnect()
      for (const track of dest.stream.getTracks()) track.stop()
      void ctx.close()
    },
  }
}
