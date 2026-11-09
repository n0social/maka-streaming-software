/**
 * Chromium ignores a JavaScript override of MediaStream.id when it writes the
 * WHIP offer. The relay still maps tracks by the msid stream id, so the offer
 * is rewritten after createOffer, one id per m-line, in addTrack order.
 */
export function rewriteWhipOfferMsids(sdp: string, streamIds: string[]): string {
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n'
  const parts = sdp.split(/\r?\n(?=m=)/)
  const used: string[] = []
  let mediaIndex = 0
  const rewritten = parts.map((part) => {
    if (!part.startsWith('m=')) return part
    const id = streamIds[mediaIndex] ?? ''
    mediaIndex += 1
    if (!id) return part
    used.push(id)
    return part
      .replace(/^a=msid:\S+(.*)$/gm, `a=msid:${id}$1`)
      .replace(/^(a=ssrc:\d+ msid:)\S+/gm, `$1${id}`)
  })
  if (used.length > 0) {
    const semantic = `a=msid-semantic: WMS ${used.join(' ')}`
    if (/^a=msid-semantic:/m.test(rewritten[0])) {
      rewritten[0] = rewritten[0].replace(/^a=msid-semantic:.*$/m, semantic)
    } else {
      rewritten[0] = `${rewritten[0].replace(/\s*$/, '')}${eol}${semantic}${eol}`
    }
  }
  return rewritten.join(eol)
}
