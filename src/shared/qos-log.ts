/** Structured live-session events for the Settings log and diagnostics export. */

export type QosEventKind = 'recovery' | 'failover' | 'encode' | 'fatal'

export type QosEvent = {
  at: string
  kind: QosEventKind
  reason: string
  label: string
  detail?: string
  attempt?: number
  ingest?: 'primary' | 'backup'
}

export const QOS_LOG_LIMIT = 40

export function pushQosEvent(log: readonly QosEvent[], event: QosEvent, limit = QOS_LOG_LIMIT): QosEvent[] {
  const next = [...log, event]
  if (next.length <= limit) return next
  return next.slice(next.length - limit)
}

export function formatQosEvent(event: QosEvent): string {
  const when = event.at.slice(11, 19)
  const extra = [
    event.attempt != null ? `attempt ${event.attempt}` : '',
    event.ingest ? `ingest ${event.ingest}` : '',
    event.detail?.trim() ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
  return `${when}  ${event.kind}  ${event.label}${extra ? ` — ${extra}` : ''}`
}

export function formatQosLog(log: readonly QosEvent[]): string {
  if (!log.length) return 'No connection events this session.'
  return log.map(formatQosEvent).join('\n')
}
