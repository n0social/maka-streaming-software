/** Web Audio analyser driving a horizontal `.audio-meter` fill width. */

export type AudioLevelMeter = {
  stop: () => void
}

export function startAudioLevelMeter(
  stream: MediaStream,
  setLevelPercent: (percent: number) => void,
): AudioLevelMeter {
  let raf = 0
  let ctx: AudioContext | null = null
  let analyser: AnalyserNode | null = null

  const stop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    analyser = null
    if (ctx) {
      void ctx.close()
      ctx = null
    }
    setLevelPercent(0)
  }

  try {
    ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      if (!analyser) return
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (const v of data) sum += v
      const avg = sum / data.length / 255
      setLevelPercent(Math.min(100, Math.round(avg * 140)))
      raf = requestAnimationFrame(tick)
    }
    tick()
  } catch {
    stop()
  }

  return { stop }
}

export function setHorizontalMeterLevel(el: HTMLElement, percent: number): void {
  const level = Math.max(0, Math.min(100, percent))
  el.style.width = `${level}%`
  el.style.removeProperty('height')
}
