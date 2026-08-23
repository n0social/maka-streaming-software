import { ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { app } from 'electron'
import {
  RELAY_BASE_URL,
  RELAY_DEFAULT_PORT,
  RELAY_HEALTH_PATH,
  RELAY_STATUS_PATH,
  RELAY_STOP_PATH,
  RELAY_WHIP_URL,
  localizeRelayHealth,
  type RelayHealth,
  type RelayLifecycle,
  type RelayStatusResponse,
} from '../shared/tabcast'
import type { RelaySnapshot } from '../shared/relay-snapshot'
import { recordDiagnostic } from './diagnostics'

const execFileAsync = promisify(execFile)

const RELAY_MIN_BYTES = 200_000_000
const POLL_MS = 1500
const MAX_AUTO_RESTARTS = 8
const BASE_BACKOFF_MS = 1_200

type RelayManifest = {
  size?: number
  sha256?: string
  version?: string
}

type Listener = (snapshot: RelaySnapshot) => void

function vendorDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'relay')
  }
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', '..', 'vendor', 'relay')
}

function readLocalManifest(): RelayManifest | null {
  const path = join(vendorDir(), 'relay-manifest.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RelayManifest
  } catch {
    return null
  }
}

function relayIntegrityError(exe: string): string | null {
  if (!existsSync(exe)) {
    return `Relay binary missing. Run: npm run fetch:relay\nExpected: ${exe}`
  }
  const size = statSync(exe).size
  const manifest = readLocalManifest()
  const expected = manifest?.size ?? 0

  if (expected > 0 && size < expected) {
    const haveMb = (size / (1024 * 1024)).toFixed(0)
    const needMb = (expected / (1024 * 1024)).toFixed(0)
    return `Relay binary incomplete (${haveMb} / ${needMb} MB).\nRun: npm run fetch:relay -- --force`
  }
  if (size < RELAY_MIN_BYTES) {
    const haveMb = (size / (1024 * 1024)).toFixed(0)
    return `Relay binary looks truncated (~${haveMb} MB). Full build is ~376 MB.\nRun: npm run fetch:relay -- --force`
  }
  return null
}

export type { RelaySnapshot }

function vendorRelayPath(): string {
  return join(vendorDir(), 'TabcastRelay.exe')
}

function resolveRelayExe(): string {
  const preferred = vendorRelayPath()
  if (!relayIntegrityError(preferred)) return preferred

  const localApp = process.env.LOCALAPPDATA
  if (localApp) {
    const candidates = [
      join(localApp, 'TabcastRelay', 'v0.1.0', 'TabcastRelay.exe'),
      join(localApp, 'TabcastRelay', 'TabcastRelay.exe'),
    ]
    for (const candidate of candidates) {
      if (!relayIntegrityError(candidate)) return candidate
    }
  }

  return preferred
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RELAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(4_000),
  })
  if (!res.ok) {
    throw new Error(`Relay ${path} → HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

async function postRelayStop(): Promise<boolean> {
  try {
    const res = await fetch(`${RELAY_BASE_URL}${RELAY_STOP_PATH}`, {
      method: 'POST',
      signal: AbortSignal.timeout(2500),
    })
    return res.ok
  } catch {
    return false
  }
}

async function killProcessImage(imageName: string): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await execFileAsync('taskkill', ['/IM', imageName, '/F', '/T'], {
      windowsHide: true,
    })
  } catch {
    // none running
  }
}

async function killListenersOnPort(port: number): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
      ],
      { windowsHide: true, timeout: 8000 },
    )
  } catch {
    // ignore
  }
}

async function isRelayHealthy(): Promise<boolean> {
  try {
    await fetchJson<RelayHealth>(RELAY_HEALTH_PATH)
    return true
  } catch {
    return false
  }
}

async function terminateAllRelays(owned: ChildProcess | null): Promise<void> {
  await postRelayStop()
  await sleep(400)

  if (owned && !owned.killed) {
    try {
      owned.kill()
    } catch {
      // ignore
    }
  }

  await killProcessImage('TabcastRelay.exe')
  await killListenersOnPort(RELAY_DEFAULT_PORT)

  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    if (!(await isRelayHealthy())) return
    await postRelayStop()
    await killProcessImage('TabcastRelay.exe')
    await killListenersOnPort(RELAY_DEFAULT_PORT)
    await sleep(350)
  }
}

export class RelayManager {
  private child: ChildProcess | null = null
  private timer: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private listeners = new Set<Listener>()
  private startGate: Promise<void> | null = null
  private wantRunning = false
  private stopping = false
  private restartCount = 0
  private healthFailStreak = 0
  private snapshot: RelaySnapshot = {
    lifecycle: 'stopped',
    health: null,
    status: null,
    error: null,
    pid: null,
    restarts: 0,
  }

  getSnapshot(): RelaySnapshot {
    return this.snapshot
  }

  getExePath(): string {
    return resolveRelayExe()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => this.listeners.delete(listener)
  }

  private emit(partial: Partial<RelaySnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      restarts: this.restartCount,
    }
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }

  async start(): Promise<void> {
    this.wantRunning = true
    this.stopping = false
    if (this.startGate) {
      await this.startGate
      return
    }

    this.startGate = this.startExclusive('manual')
    try {
      await this.startGate
    } finally {
      this.startGate = null
    }
  }

  private async startExclusive(reason: string): Promise<void> {
    const exe = resolveRelayExe()
    const integrity = relayIntegrityError(exe)
    if (integrity) {
      recordDiagnostic('error', 'relay.integrity', integrity)
      this.emit({
        lifecycle: 'error',
        error: integrity,
        health: null,
        status: null,
        pid: null,
      })
      return
    }

    recordDiagnostic('info', 'relay.start', `Starting relay (${reason})`, undefined, {
      restarts: this.restartCount,
      exe,
    })

    this.emit({ lifecycle: 'starting', error: null })
    this.stopPolling()
    this.clearRestartTimer()

    await terminateAllRelays(this.child)
    this.child = null

    let child: ChildProcess
    try {
      child = spawn(exe, [], {
        cwd: dirname(exe),
        windowsHide: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          TABCAST_NO_OPEN: '1',
          TABCAST_STREAM_URL: RELAY_WHIP_URL,
        },
      })
    } catch (err) {
      recordDiagnostic('error', 'relay.spawn', 'Failed to spawn relay', err)
      this.emit({
        lifecycle: 'error',
        error:
          err instanceof Error
            ? err.message
            : 'Failed to spawn relay (is the binary still downloading?)',
        pid: null,
      })
      this.scheduleRestart('spawn-failed')
      return
    }

    this.child = child
    this.emit({ pid: child.pid ?? null })

    child.on('exit', (code, signal) => {
      if (this.child !== child) return
      this.child = null
      this.stopPolling()

      const message =
        code && code !== 0
          ? `Relay exited with code ${code}`
          : signal
            ? `Relay killed (${signal})`
            : 'Relay process exited'

      recordDiagnostic(
        this.stopping ? 'info' : 'error',
        'relay.exit',
        message,
        undefined,
        { code, signal, wantRunning: this.wantRunning },
      )

      this.emit({
        lifecycle: this.stopping ? 'stopped' : 'error',
        pid: null,
        health: null,
        status: null,
        error: this.stopping ? null : message,
      })

      if (this.wantRunning && !this.stopping) {
        this.scheduleRestart(`exit:${code ?? signal ?? '0'}`)
      }
    })

    child.on('error', (err) => {
      if (this.child !== child) return
      this.child = null
      recordDiagnostic('error', 'relay.child-error', 'Relay child process error', err)
      this.emit({
        lifecycle: 'error',
        error: err.message,
        pid: null,
      })
      if (this.wantRunning && !this.stopping) {
        this.scheduleRestart('child-error')
      }
    })

    const deadline = Date.now() + 25_000
    while (Date.now() < deadline) {
      if (!this.wantRunning || this.stopping) return
      try {
        const health = localizeRelayHealth(await fetchJson<RelayHealth>(RELAY_HEALTH_PATH))
        this.healthFailStreak = 0
        this.restartCount = Math.max(0, this.restartCount - 1)
        recordDiagnostic('info', 'relay.ready', `Relay ready v${health.version}`)
        this.emit({ lifecycle: 'ready', health, error: null })
        this.startPolling()
        return
      } catch {
        await sleep(400)
      }
    }

    const timeoutMsg = 'Relay started but /health did not respond in time'
    recordDiagnostic('error', 'relay.health-timeout', timeoutMsg)
    this.emit({ lifecycle: 'error', error: timeoutMsg })
    this.scheduleRestart('health-timeout')
  }

  async stop(): Promise<void> {
    this.wantRunning = false
    this.stopping = true
    this.clearRestartTimer()
    this.stopPolling()
    recordDiagnostic('info', 'relay.stop', 'Stopping relay')
    await terminateAllRelays(this.child)
    this.child = null
    this.healthFailStreak = 0
    this.emit({
      lifecycle: 'stopped',
      health: null,
      status: null,
      pid: null,
      error: null,
    })
    this.stopping = false
  }

  async refresh(): Promise<void> {
    try {
      const [rawHealth, status] = await Promise.all([
        fetchJson<RelayHealth>(RELAY_HEALTH_PATH),
        fetchJson<RelayStatusResponse>(RELAY_STATUS_PATH).catch(() => null),
      ])
      const health = localizeRelayHealth(rawHealth)
      this.healthFailStreak = 0

      const lifecycle: RelayLifecycle =
        status?.status === 'live'
          ? 'live'
          : status?.status === 'error'
            ? 'error'
            : status?.status === 'starting'
              ? 'starting'
              : 'ready'

      if (status?.status === 'error' && status.error) {
        recordDiagnostic('warn', 'relay.status-error', status.error, undefined, {
          ffmpegLog: status.ffmpegLog?.slice(-8),
        })
      }

      this.emit({
        lifecycle,
        health,
        status,
        error: status?.error ?? null,
      })
    } catch (err) {
      this.healthFailStreak += 1
      const message = err instanceof Error ? err.message : String(err)

      if (this.wantRunning && !this.stopping) {
        recordDiagnostic('warn', 'relay.health-miss', message, err, {
          streak: this.healthFailStreak,
        })

        if (this.healthFailStreak >= 3) {
          this.emit({
            lifecycle: 'error',
            error: `Relay health lost (${this.healthFailStreak} misses)`,
            health: null,
            status: null,
          })
          this.scheduleRestart('health-lost')
          return
        }

        this.emit({
          lifecycle: 'starting',
          error: message,
        })
        return
      }

      this.emit({
        lifecycle: 'stopped',
        health: null,
        status: null,
        error: null,
      })
    }
  }

  private scheduleRestart(reason: string): void {
    if (!this.wantRunning || this.stopping) return
    if (this.restartTimer || this.startGate) return

    if (this.restartCount >= MAX_AUTO_RESTARTS) {
      const msg = `Relay auto-restart exhausted after ${MAX_AUTO_RESTARTS} attempts (${reason})`
      recordDiagnostic('fatal', 'relay.restart-exhausted', msg)
      this.emit({
        lifecycle: 'error',
        error: `${msg}. Click Start to try again.`,
      })
      return
    }

    this.restartCount += 1
    const delay = Math.min(20_000, BASE_BACKOFF_MS * 2 ** Math.min(this.restartCount - 1, 4))
    recordDiagnostic('warn', 'relay.restart-scheduled', `Restart #${this.restartCount} in ${delay}ms`, undefined, {
      reason,
    })
    this.emit({
      lifecycle: 'starting',
      error: `Recovering… restart ${this.restartCount}/${MAX_AUTO_RESTARTS} (${reason})`,
    })

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      void this.start().catch((err) => {
        recordDiagnostic('error', 'relay.restart-failed', 'Auto-restart failed', err)
      })
    }, delay)
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  private startPolling(): void {
    this.stopPolling()
    this.timer = setInterval(() => {
      void this.refresh()
    }, POLL_MS)
  }

  private stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
