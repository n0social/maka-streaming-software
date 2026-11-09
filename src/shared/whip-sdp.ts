/**
 * UDP carries the media. These lines ask the relay to retransmit lost packets
 * on that same UDP session (NACK / PLI for video, in-band FEC for Opus) and
 * list UDP candidates ahead of TCP fallbacks.
 */

function payloadType(line: string): string | null {
  const match = /^a=rtpmap:(\d+)\s/i.exec(line)
  return match ? match[1] : null
}

function isRtx(section: string, payload: string): boolean {
  return new RegExp(`^a=fmtp:${payload}\\b.*\\bapt=`, 'im').test(section)
}

function mediaLines(section: string): string[] {
  return section.split(/\r?\n/).filter((line) => line !== '')
}

function hardenVideoLines(lines: string[], section: string): string[] {
  const feedback: string[] = []
  for (const line of lines) {
    const payload = payloadType(line)
    if (!payload || isRtx(section, payload)) continue
    const hasNack = lines.some((item) => item === `a=rtcp-fb:${payload} nack`)
    const hasPli = lines.some((item) => item === `a=rtcp-fb:${payload} nack pli`)
    if (!hasNack) feedback.push(`a=rtcp-fb:${payload} nack`)
    if (!hasPli) feedback.push(`a=rtcp-fb:${payload} nack pli`)
  }
  const candidateAt = lines.findIndex((line) => line.startsWith('a=candidate:'))
  if (candidateAt === -1) return [...lines, ...feedback]
  return [...lines.slice(0, candidateAt), ...feedback, ...lines.slice(candidateAt)]
}

function hardenAudioLines(lines: string[]): string[] {
  const next = [...lines]
  const additions: string[] = []
  for (const line of lines) {
    const match = /^a=rtpmap:(\d+)\s+opus\/48000/i.exec(line)
    if (!match) continue
    const payload = match[1]
    const fmtpIndex = next.findIndex((item) => item.startsWith(`a=fmtp:${payload}`))
    if (fmtpIndex === -1) {
      additions.push(`a=fmtp:${payload} useinbandfec=1`)
      continue
    }
    if (!/useinbandfec=1/.test(next[fmtpIndex])) {
      next[fmtpIndex] = `${next[fmtpIndex]};useinbandfec=1`
    }
  }
  const candidateAt = next.findIndex((line) => line.startsWith('a=candidate:'))
  if (candidateAt === -1) return [...next, ...additions]
  return [...next.slice(0, candidateAt), ...additions, ...next.slice(candidateAt)]
}

function candidateRank(line: string): number {
  if (/\budp\b/i.test(line)) return 2
  if (/\btcp\b/i.test(line)) return 1
  return 0
}

function preferUdpCandidates(lines: string[]): string[] {
  const candidates = lines.filter((line) => line.startsWith('a=candidate:'))
  if (candidates.length < 2) return lines
  const ranked = [...candidates].sort((left, right) => candidateRank(right) - candidateRank(left))
  let seen = 0
  return lines.map((line) => {
    if (!line.startsWith('a=candidate:')) return line
    const next = ranked[seen]
    seen += 1
    return next
  })
}

/** Prepare a WHIP offer for lossy UDP and a TCP candidate fallback. */
export function hardenWhipMediaSdp(sdp: string): string {
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n'
  const parts = sdp.split(/\r?\n(?=m=)/)
  const hardened = parts.map((part) => {
    const lines = mediaLines(part)
    if (part.startsWith('m=video')) return preferUdpCandidates(hardenVideoLines(lines, part)).join(eol)
    if (part.startsWith('m=audio')) return preferUdpCandidates(hardenAudioLines(lines)).join(eol)
    return lines.join(eol)
  })
  const body = hardened.join(eol)
  return sdp.endsWith('\n') ? `${body}${eol}` : body
}
