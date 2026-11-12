/** Real WHIP stats for the dev relay. Omit a field when the peer has not reported it. */

/** WebRTC reports RTT in seconds. Some stacks already use milliseconds. */
export function roundTripToMs(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  const ms = value > 10 ? value : value * 1000
  return Math.round(ms)
}

export function liveStatsFromReports(reports) {
  let latencyMs = null
  let droppedFrames = 0
  let sawInbound = false
  for (const stat of reports) {
    if (!stat || typeof stat !== 'object') continue
    const nominated = stat.nominated === true || stat.state === 'succeeded'
    if (stat.type === 'candidate-pair' && nominated) {
      const ms = roundTripToMs(stat.currentRoundTripTime)
      if (ms != null) latencyMs = latencyMs == null ? ms : Math.min(latencyMs, ms)
    }
    if (stat.type === 'inbound-rtp' && stat.kind === 'video' && typeof stat.packetsLost === 'number') {
      sawInbound = true
      droppedFrames += Math.max(0, Math.floor(stat.packetsLost))
    }
  }
  return {
    latencyMs: latencyMs ?? undefined,
    droppedFrames: sawInbound ? droppedFrames : undefined,
  }
}

export async function reportsFromPeer(pc) {
  if (!pc || typeof pc.getStats !== 'function') return []
  const report = await pc.getStats()
  if (!report) return []
  if (typeof report.values === 'function') return [...report.values()]
  if (Array.isArray(report)) return report
  return Object.values(report)
}
