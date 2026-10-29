import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export type DiagLevel = 'info' | 'warn' | 'error' | 'fatal'

export type DiagEvent = {
  id: string
  at: string
  level: DiagLevel
  source: string
  message: string
  stack?: string
  detail?: Record<string, unknown>
}

const MAX_EVENTS = 200
const events: DiagEvent[] = []
const listeners = new Set<(event: DiagEvent) => void>()

let seq = 0

function logFilePath(): string {
  return join(app.getPath('userData'), 'logs', 'maka-diagnostics.log')
}

function ensureLogDir(): void {
  mkdirSync(join(app.getPath('userData'), 'logs'), { recursive: true })
}

function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack }
  }
  return { message: String(err) }
}

export function getDiagnostics(): DiagEvent[] {
  return [...events]
}

export function clearDiagnostics(): void {
  events.length = 0
}

export function onDiagnostic(listener: (event: DiagEvent) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function recordDiagnostic(
  level: DiagLevel,
  source: string,
  message: string,
  err?: unknown,
  detail?: Record<string, unknown>,
): DiagEvent {
  const serialized = err !== undefined ? serializeError(err) : null
  const event: DiagEvent = {
    id: `${Date.now()}-${++seq}`,
    at: new Date().toISOString(),
    level,
    source,
    message: serialized ? `${message}: ${serialized.message}` : message,
    stack: serialized?.stack,
    detail,
  }

  events.push(event)
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS)
  }

  try {
    ensureLogDir()
    const line = JSON.stringify(event)
    appendFileSync(logFilePath(), `${line}\n`, 'utf8')
  } catch {
    // never throw from diagnostics
  }

  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
      // ignore subscriber errors
    }
  }

  const prefix = `[diag:${level}] ${source}`
  if (level === 'error' || level === 'fatal') {
    console.error(prefix, event.message, event.stack ?? '')
  } else if (level === 'warn') {
    console.warn(prefix, event.message)
  } else {
    console.log(prefix, event.message)
  }

  return event
}

export function exportDiagnosticsBundle(): string {
  ensureLogDir()
  const out = join(
    app.getPath('userData'),
    'logs',
    `maka-diagnostics-${Date.now()}.json`,
  )
  const payload = {
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    events: getDiagnostics(),
  }
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return out
}

export function installProcessGuards(onFatal?: (event: DiagEvent) => void): void {
  process.on('uncaughtException', (err) => {
    const event = recordDiagnostic('fatal', 'main.uncaughtException', 'Uncaught exception', err)
    onFatal?.(event)
  })

  process.on('unhandledRejection', (reason) => {
    const event = recordDiagnostic(
      'fatal',
      'main.unhandledRejection',
      'Unhandled promise rejection',
      reason,
    )
    onFatal?.(event)
  })
}
