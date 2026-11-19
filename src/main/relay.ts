import { ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
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
} from '../shared/maka'
import type { RelaySnapshot } from '../shared/relay-snapshot'
import { MAX_LIVE_RETRY_ATTEMPTS, liveRetryBackoffMs } from '../shared/live-retry'
import { recordDiagnostic } from './diagnostics'
import { killProcessTree } from './process-tree'

const execFileAsync = promisify(execFile)

/** Legacy closed relay images — killed on startup so port 38473 is free. */
const LEGACY_RELAY_EXE_NAMES = ['MAKArelay.exe', 'TabcastRelay.exe'] as const
export const RELAY_INSTALL_DIRS = ['MAKArelay', 'TabcastRelay'] as const
const POLL_MS = 1500
const MAX_AUTO_RESTARTS = MAX_LIVE_RETRY_ATTEMPTS

export const OPEN_RELAY_VERSION = '0.1.1'

type Listener = (snapshot: RelaySnapshot) => void

type DirectRelayLaunch = {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  mode: 'direct'
}

export function openRelayEntry(): string | null {
  const devEntry = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'relay',
    'src',
    'index.mjs',
  )
  if (existsSync(devEntry)) return devEntry
  if (app.isPackaged) {
    const bundled = join(process.resourcesPath, 'relay', 'src', 'index.mjs')
    if (existsSync(bundled)) return bundled
  }
  return null
}

function resolveLaunch(): DirectRelayLaunch {
  const entry = openRelayEntry()
  if (!entry) {
    throw new Error(
      'Open MAKA.relay is missing from this install. Reinstall Maka or run from a repo with relay/src.',
    )
  }
  const relayRoot = dirname(dirname(entry))
  const useElectronNode = app.isPackaged || process.versions.electron !== undefined
  const nodePathCandidates = [
    join(relayRoot, 'node_modules'),
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules'),
  ]
  if (app.isPackaged) {
    nodePathCandidates.push(join(process.resourcesPath, 'relay', 'node_modules'))
  }
  const nodePath = nodePathCandidates.filter((p) => existsSync(p)).join(delimiter)
  return {
    command: useElectronNode ? process.execPath : 'node',
    args: [entry],
    cwd: relayRoot,
    mode: 'direct',
    env: {
      ...process.env,
      ...(useElectronNode ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      ...(nodePath ? { NODE_PATH: nodePath } : {}),
      MAKA_NO_OPEN: '1',
      MAKA_STREAM_URL: RELAY_WHIP_URL,
      MAKA_RELAY_ROOT: relayRoot,
      RELAY_VERSION: OPEN_RELAY_VERSION,
      TABCAST_NO_OPEN: '1',
      TABCAST_STREAM_URL: RELAY_WHIP_URL,
      TABCAST_RELAY_ROOT: relayRoot,
    },
  }
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

async function killOrphanRelayTrays(): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        [
          "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe' OR Name='pwsh.exe'\" -ErrorAction SilentlyContinue |",
          "Where-Object { $_.CommandLine -match '(MAKArelay|TabcastRelay).*tray\\.ps1' } |",
          'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
        ].join(' '),
      ],
      { windowsHide: true, timeout: 10_000 },
    )
  } catch {
    // ignore
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

export type { RelaySnapshot }

export type OrphanRelayReport = {
  orphanCount: number
  totalCount: number
  orphanPids: number[]
  portListenerPid: number | null
  portConflict: boolean
}

/** Legacy MAKArelay.exe processes not owned by this app's relay child. */
export async function detectOrphanRelayProcesses(
  ownedPid: number | null,
): Promise<OrphanRelayReport> {
  const empty: OrphanRelayReport = {
    orphanCount: 0,
    totalCount: 0,
    orphanPids: [],
    portListenerPid: null,
    portConflict: false,
  }
  if (process.platform !== 'win32') return empty

  const pids: number[] = []
  for (const image of LEGACY_RELAY_EXE_NAMES) {
    try {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'],
        { windowsHide: true, timeout: 8000 },
      )
      const pattern = new RegExp(`"${image.replaceAll('.', '\\.')}","(\\d+)"`, 'i')
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(pattern)
        if (!match) continue
        const pid = Number.parseInt(match[1], 10)
        if (Number.isFinite(pid)) pids.push(pid)
      }
    } catch {
      // tasklist unavailable
    }
  }

  const orphanPids = ownedPid ? pids.filter((pid) => pid !== ownedPid) : pids
  empty.totalCount = pids.length
  empty.orphanPids = orphanPids
  empty.orphanCount = orphanPids.length

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `$c = Get-NetTCPConnection -LocalPort ${RELAY_DEFAULT_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess }`,
      ],
      { windowsHide: true, timeout: 8000 },
    )
    const portPid = Number.parseInt(stdout.trim(), 10)
    if (Number.isFinite(portPid) && portPid > 0) {
      empty.portListenerPid = portPid
      empty.portConflict = ownedPid !== null && portPid !== ownedPid
    }
  } catch {
    // ignore
  }

  return empty
}

async function terminateAllRelays(owned: ChildProcess | null): Promise<void> {
  await postRelayStop()
  await sleep(400)

  if (owned?.pid) killProcessTree(owned.pid)

  await killOrphanRelayTrays()
  for (const image of LEGACY_RELAY_EXE_NAMES) await killProcessImage(image)
  await killListenersOnPort(RELAY_DEFAULT_PORT)
  await killOrphanRelayTrays()

  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    if (!(await isRelayHealthy())) {
      await killOrphanRelayTrays()
      return
    }
    await postRelayStop()
    await killOrphanRelayTrays()
    for (const image of LEGACY_RELAY_EXE_NAMES) await killProcessImage(image)
    await killListenersOnPort(RELAY_DEFAULT_PORT)
    await sleep(350)
  }
}

export class RelayManager {
  private child: ChildProcess | null = null
  private releaseExitKill: (() => void) | null = null
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

  /** Open relay entry script (reveal in Explorer). */
  getExePath(): string {
    return openRelayEntry() ?? ''
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
    let launch: DirectRelayLaunch
    try {
      launch = resolveLaunch()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      recordDiagnostic('error', 'relay.missing', message)
      this.emit({
        lifecycle: 'error',
        error: message,
        health: null,
        status: null,
        pid: null,
      })
      return
    }

    recordDiagnostic('info', 'relay.start', `Starting open relay (${reason})`, undefined, {
      restarts: this.restartCount,
      command: launch.command,
      entry: launch.args[0],
    })

    this.emit({ lifecycle: 'starting', error: null })
    this.stopPolling()
    this.clearRestartTimer()

    await terminateAllRelays(this.child)
    this.child = null

    let child: ChildProcess
    try {
      child = spawn(launch.command, launch.args, {
        cwd: launch.cwd,
        windowsHide: true,
        stdio: 'ignore',
        detached: true,
        env: launch.env,
      })
      this.watchChildUntilAppExits(child)
    } catch (err) {
      recordDiagnostic('error', 'relay.spawn', 'Failed to spawn relay', err)
      this.emit({
        lifecycle: 'error',
        error: err instanceof Error ? err.message : 'Failed to spawn relay',
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
        await killOrphanRelayTrays()
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

  async fetchHealthLive(): Promise<RelayHealth> {
    return localizeRelayHealth(await fetchJson<RelayHealth>(RELAY_HEALTH_PATH))
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
          health: null,
          status: null,
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
        error: `${msg}. Close Maka and open it again.`,
      })
      return
    }

    this.restartCount += 1
    const delay = liveRetryBackoffMs(this.restartCount - 1)
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

  private watchChildUntilAppExits(child: ChildProcess): void {
    this.releaseExitKill?.()
    const pid = child.pid
    if (!pid) {
      this.releaseExitKill = null
      return
    }
    const onAppExit = () => killProcessTree(pid)
    process.on('exit', onAppExit)
    const release = () => {
      process.off('exit', onAppExit)
      if (this.releaseExitKill === release) this.releaseExitKill = null
    }
    this.releaseExitKill = release
    child.once('exit', release)
    child.once('error', release)
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