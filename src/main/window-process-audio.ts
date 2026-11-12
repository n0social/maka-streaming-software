import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import type { BrowserWindow } from 'electron'
import { windowHandleFromCaptureSourceId } from '../shared/game-audio-source'

const execFileAsync = promisify(execFile)
const require = createRequire(import.meta.url)

type LoopbackCapture = {
  start(processId: number, callback: (chunk: Buffer) => void): void
  stop(): void
}

type LoopbackModule = {
  LoopbackCapture: new () => LoopbackCapture
}

let target: BrowserWindow | null = null
let capture: LoopbackCapture | null = null
let session = 0

export function attachWindowAudioTarget(win: BrowserWindow | null): void {
  target = win
}

export function stopWindowProcessAudio(): void {
  session += 1
  try {
    capture?.stop()
  } catch {
    // already stopped
  }
  capture = null
}

export async function startWindowProcessAudio(
  sourceId: string,
): Promise<{ ok: true; session: number } | { ok: false; message: string }> {
  stopWindowProcessAudio()
  if (process.platform !== 'win32') {
    return { ok: false, message: 'Game audio follows a window on Windows.' }
  }
  const hwnd = windowHandleFromCaptureSourceId(sourceId)
  if (!hwnd) {
    return { ok: false, message: 'Pick a gameplay window for game audio.' }
  }
  const pid = await pidForWindowHandle(hwnd)
  if (!pid) {
    return { ok: false, message: 'Could not find the app for that window.' }
  }

  let loopback: LoopbackModule
  try {
    loopback = require('loopback-capture') as LoopbackModule
  } catch {
    return { ok: false, message: 'Window audio capture is unavailable in this build.' }
  }

  const active = ++session
  const next = new loopback.LoopbackCapture()
  try {
    next.start(pid, (chunk) => {
      const win = target
      if (!win || win.isDestroyed() || active !== session) return
      const pcm = Buffer.from(chunk)
      setImmediate(() => {
        if (!target || target.isDestroyed() || active !== session) return
        target.webContents.send('window-audio:pcm', { session: active, pcm })
      })
    })
  } catch (err) {
    try {
      next.stop()
    } catch {
      // start failed before the capturer was live
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Could not capture that window’s audio.',
    }
  }
  capture = next
  return { ok: true, session: active }
}

async function pidForWindowHandle(hwnd: string): Promise<number | null> {
  const script = `
$hwnd = [IntPtr]::new(${hwnd})
if (-not ([System.Management.Automation.PSTypeName]'MakaWindowPid').Type) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MakaWindowPid {
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
}
$processId = [uint32]0
[MakaWindowPid]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
if ($processId -eq 0) { exit 1 }
Write-Output $processId
`
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', script],
      { windowsHide: true, timeout: 8000 },
    )
    const pid = Number(String(stdout).trim())
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}
