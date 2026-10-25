import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { RelayLifecycle } from '../shared/tabcast'
import { loadSettings } from './settings-store'

/** Minimal opt-in analytics event (no stream keys, URLs with secrets, or PII). */
export type AnalyticsEvent = {
  at: string
  kind: 'app.start' | 'opt_in.enabled' | 'opt_in.disabled' | 'relay.lifecycle'
  appVersion: string
  platform: string
  arch: string
  relayLifecycle?: RelayLifecycle
  /** Redacted relay error summary when lifecycle is error */
  relayErrorCode?: string
}

const STREAM_KEY_RE = /\b(live_[a-z0-9_]+|sk_[a-z0-9_-]+)\b/gi
const RTMP_SECRET_RE = /(rtmps?:\/\/[^?\s]+)(\?[^\s]*)?/gi

function analyticsLogPath(): string {
  const dir = join(app.getPath('userData'), 'store')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'analytics-events.jsonl')
}

function baseFields(): Pick<AnalyticsEvent, 'appVersion' | 'platform' | 'arch'> {
  return {
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
  }
}

/** Strip stream keys and ingest URLs from relay error text before logging. */
export function anonymizeRelayError(raw: string | null | undefined): string | undefined {
  if (!raw || !raw.trim()) return undefined
  let s = raw.trim().slice(0, 400)
  s = s.replace(STREAM_KEY_RE, '[redacted-key]')
  s = s.replace(RTMP_SECRET_RE, '[redacted-ingest]')
  return s.slice(0, 200)
}

export function isAnalyticsOptIn(): boolean {
  return loadSettings().diagnosticsOptIn === true
}

export function queueAnalyticsEvent(
  partial: Omit<AnalyticsEvent, 'at' | 'appVersion' | 'platform' | 'arch'>,
  options?: { force?: boolean },
): void {
  if (!options?.force && !isAnalyticsOptIn()) return
  const event: AnalyticsEvent = {
    at: new Date().toISOString(),
    ...baseFields(),
    ...partial,
  }
  try {
    appendFileSync(analyticsLogPath(), `${JSON.stringify(event)}\n`, 'utf8')
  } catch {
    // never throw from analytics
  }
  console.log('[analytics]', event.kind, event.relayLifecycle ?? '', event.relayErrorCode ?? '')
}

let lastRelayLifecycle: RelayLifecycle | null = null

export function trackRelayLifecycle(lifecycle: RelayLifecycle, error: string | null): void {
  if (!isAnalyticsOptIn()) return
  if (lifecycle === lastRelayLifecycle && lifecycle !== 'error') return
  lastRelayLifecycle = lifecycle
  queueAnalyticsEvent({
    kind: 'relay.lifecycle',
    relayLifecycle: lifecycle,
    relayErrorCode: lifecycle === 'error' ? anonymizeRelayError(error) : undefined,
  })
}

export function trackOptInChange(enabled: boolean): void {
  queueAnalyticsEvent(
    { kind: enabled ? 'opt_in.enabled' : 'opt_in.disabled' },
    { force: !enabled },
  )
}

export function trackAppStart(): void {
  queueAnalyticsEvent({ kind: 'app.start' })
}
