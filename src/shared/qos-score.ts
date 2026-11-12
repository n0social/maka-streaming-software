/** One number for support exports. Gameplay health from WHIP, relay status, and errors. */

export type QosGrade = 'good' | 'fair' | 'poor'

export type QosScore = {
  score: number
  grade: QosGrade
  reasons: string[]
}

export function scoreQos(input: {
  rttMs: number | null
  dropPercent: number | null
  relayError: string | null
}): QosScore {
  let score = 100
  const reasons: string[] = []
  const rtt = input.rttMs
  if (rtt == null) {
    score -= 5
    reasons.push('No round-trip sample yet')
  } else if (rtt >= 400) {
    score -= 40
    reasons.push(`Round-trip ${rtt} ms`)
  } else if (rtt >= 180) {
    score -= 15
    reasons.push(`Round-trip ${rtt} ms`)
  }
  const drop = input.dropPercent
  if (drop != null && drop >= 8) {
    score -= 40
    reasons.push(`Dropped frames ${drop.toFixed(1)}%`)
  } else if (drop != null && drop >= 2) {
    score -= 20
    reasons.push(`Dropped frames ${drop.toFixed(1)}%`)
  }
  if (input.relayError?.trim()) {
    score -= 25
    reasons.push(input.relayError.trim().slice(0, 180))
  }
  score = Math.max(0, Math.min(100, score))
  const grade: QosGrade = score >= 80 ? 'good' : score >= 50 ? 'fair' : 'poor'
  if (!reasons.length) reasons.push('WHIP and relay look healthy')
  return { score, grade, reasons }
}

export function redactSupportText(text: string): string {
  return text
    .replace(/rtmps?:\/\/\S+/gi, 'rtmp://redacted')
    .replace(/\blive_[A-Za-z0-9_]{8,}\b/g, 'live_redacted')
    .replace(/\b[a-z0-9]{4}(?:-[a-z0-9]{4}){3,5}\b/gi, 'youtube-key-redacted')
}

export function dropPercentFromCounts(dropped: number | null, encoded: number | null): number | null {
  if (dropped == null || encoded == null || encoded <= 0) return null
  return (Math.max(0, dropped) / encoded) * 100
}
