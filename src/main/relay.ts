import { ChildProcess, execFile, spawn } from 'node:child_process'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
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
import { MAX_LIVE_RETRY_ATTEMPTS, liveRetryBackoffMs } from '../shared/live-retry'
import { recordDiagnostic } from './diagnostics'

const execFileAsync = promisify(execFile)

const RELAY_MIN_BYTES = 200_000_000
/** Public download name first, then the name shipped inside older installers. */
const RELAY_EXE_NAMES = ['MAKArelay.exe', 'TabcastRelay.exe'] as const
const POLL_MS = 1500
const MAX_AUTO_RESTARTS = MAX_LIVE_RETRY_ATTEMPTS

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

async function relaySha256Error(exe: string): Promise<string | null> {
  const manifest = readLocalManifest()
  const expected = manifest?.sha256?.toLowerCase()
  if (!expected) return null

  const digest = await new Promise<string>((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(exe)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })

  if (digest.toLowerCase() !== expected) {
    return `Relay binary failed SHA-256 integrity check.\nRun: npm run fetch:relay -- --force`
  }
  return null
}

export type { RelaySnapshot }

function relayExeCandidates(): string[] {
  const bundled = RELAY_EXE_NAMES.map((name) => join(vendorDir(), name))
  const localApp = process.env.LOCALAPPDATA
  const installed: string[] = []
  if (localApp) {
    for (const rootName of ['TabcastRelay', 'MAKArelay']) {
      for (const name of RELAY_EXE_NAMES) {
        installed.push(join(localApp, rootName, 'v0.1.0', name))
        installed.push(join(localApp, rootName, name))
      }
    }
  }
  return [...bundled, ...installed]
}

function resolveRelayExe(): string {
  for (const candidate of relayExeCandidates()) {
    if (!relayIntegrityError(candidate)) return candidate
  }
  return join(vendorDir(), RELAY_EXE_NAMES[0])
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

/** Relay launcher spawns tray.ps1 via PowerShell; those survive taskkill of the exe. */
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
          "Where-Object { $_.CommandLine -match '(TabcastRelay|MAKArelay).*tray\\.ps1' } |",
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

export type OrphanRelayReport = {
  orphanCount: number
  totalCount: number
  orphanPids: number[]
  portListenerPid: number | null
  portConflict: boolean
}

/** Relay processes not owned by this app's relay child. */
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
  for (const image of RELAY_EXE_NAMES) {
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

type DirectRelayLaunch = {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  mode: 'direct' | 'launcher'
}

/** Prefer the unpacked Node relay. The single-file launcher still extracts under TabcastRelay. */
function resolveLaunch(): DirectRelayLaunch {
  const localApp = process.env.LOCALAPPDATA
  if (localApp) {
    const root = join(localApp, 'TabcastRelay', 'v0.1.0')
    const node = join(root, 'runtime', 'node.exe')
    const entry = join(root, 'relay', 'dist', 'index.js')
    const ffmpeg = join(root, 'ffmpeg', 'bin', 'ffmpeg.exe')
    const relayRoot = join(root, 'relay')
    if (existsSync(node) && existsSync(entry)) {
      return {
        command: node,
        args: [entry],
        cwd: relayRoot,
        mode: 'direct',
        env: {
          ...process.env,
          TABCAST_NO_OPEN: '1',
          TABCAST_STREAM_URL: RELAY_WHIP_URL,
          TABCAST_RELAY_ROOT: relayRoot,
          FFMPEG_PATH: existsSync(ffmpeg) ? ffmpeg : (process.env.FFMPEG_PATH ?? ''),
        },
      }
    }
  }

  const exe = resolveRelayExe()
  return {
    command: exe,
    args: [],
    cwd: dirname(exe),
    mode: 'launcher',
    env: {
      ...process.env,
      TABCAST_NO_OPEN: '1',
      TABCAST_STREAM_URL: RELAY_WHIP_URL,
    },
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

  await killOrphanRelayTrays()
  for (const image of RELAY_EXE_NAMES) await killProcessImage(image)
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
    for (const image of RELAY_EXE_NAMES) await killProcessImage(image)
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

    const shaError = await relaySha256Error(exe)
    if (shaError) {
      recordDiagnostic('error', 'relay.integrity', shaError)
      this.emit({
        lifecycle: 'error',
        error: shaError,
        health: null,
        status: null,
        pid: null,
      })
      return
    }

    const launch = resolveLaunch()
    recordDiagnostic('info', 'relay.start', `Starting relay (${reason}, ${launch.mode})`, undefined, {
      restarts: this.restartCount,
      command: launch.command,
      mode: launch.mode,
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
        env: launch.env,
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
        // Launcher mode always starts tray.ps1 — strip orphans so only the Maka tray remains.
        await killOrphanRelayTrays()
        recordDiagnostic('info', 'relay.ready', `Relay ready v${health.version} (${launch.mode})`)
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
