import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { BrowserWindow } from 'electron'

const MAX_JPEG_CHARS = 1_800_000

export type VcamDeviceProbe = {
  devicePath: string | null
  ffmpeg: boolean
}

export function probeVcamDevice(): VcamDeviceProbe {
  return {
    devicePath: findLoopbackDevice(),
    ffmpeg: ffmpegOnPath(),
  }
}

function ffmpegOnPath(): boolean {
  const path = process.env.PATH ?? ''
  return path.split(':').some((dir) => dir && existsSync(`${dir}/ffmpeg`))
}

function findLoopbackDevice(): string | null {
  if (process.platform !== 'linux') return null
  let entries: string[] = []
  try {
    entries = readdirSync('/sys/class/video4linux')
  } catch {
    return null
  }
  for (const name of entries) {
    try {
      const label = readFileSync(`/sys/class/video4linux/${name}/name`, 'utf8').toLowerCase()
      if (label.includes('loopback') || label.includes('dummy video')) {
        const device = `/dev/${name}`
        if (existsSync(device)) return device
      }
    } catch {
      // skip unreadable nodes
    }
  }
  return null
}

export type VcamOutputController = {
  open: (opts: { preload: string; load: (win: BrowserWindow) => void }) => void
  close: () => void
  pushFrame: (dataUrl: string) => { ok: boolean; device: boolean }
  isOpen: () => boolean
  devicePath: () => string | null
}

export function createVcamOutputController(): VcamOutputController {
  let window: BrowserWindow | null = null
  let ffmpeg: ChildProcessWithoutNullStreams | null = null
  let devicePath: string | null = null

  function stopPipe(): void {
    if (!ffmpeg) return
    ffmpeg.stdin.end()
    ffmpeg.kill()
    ffmpeg = null
    devicePath = null
  }

  function startPipe(): void {
    stopPipe()
    const probe = probeVcamDevice()
    if (!probe.devicePath || !probe.ffmpeg) return
    const child = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-i',
        'pipe:0',
        '-f',
        'v4l2',
        '-pix_fmt',
        'yuv420p',
        probe.devicePath,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    child.on('error', () => {
      if (ffmpeg === child) {
        ffmpeg = null
        devicePath = null
      }
    })
    child.on('exit', () => {
      if (ffmpeg === child) {
        ffmpeg = null
        devicePath = null
      }
    })
    ffmpeg = child
    devicePath = probe.devicePath
  }

  return {
    isOpen: () => Boolean(window && !window.isDestroyed()),
    devicePath: () => devicePath,
    open(opts) {
      if (window && !window.isDestroyed()) {
        window.show()
        window.focus()
        return
      }
      window = new BrowserWindow({
        width: 1280,
        height: 720,
        title: 'Maka Virtual Camera',
        backgroundColor: '#000000',
        autoHideMenuBar: true,
        webPreferences: {
          preload: opts.preload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: false,
        },
      })
      window.on('closed', () => {
        window = null
        stopPipe()
      })
      opts.load(window)
      startPipe()
    },
    close() {
      stopPipe()
      if (window && !window.isDestroyed()) window.close()
      window = null
    },
    pushFrame(dataUrl) {
      if (!dataUrl.startsWith('data:image/jpeg') || dataUrl.length > MAX_JPEG_CHARS) {
        return { ok: false, device: Boolean(devicePath) }
      }
      if (window && !window.isDestroyed()) {
        window.webContents.send('vcam:frame', dataUrl)
      }
      if (ffmpeg?.stdin.writable) {
        const comma = dataUrl.indexOf(',')
        if (comma > 0) {
          const jpeg = Buffer.from(dataUrl.slice(comma + 1), 'base64')
          ffmpeg.stdin.write(jpeg)
        }
      }
      return { ok: true, device: Boolean(ffmpeg && devicePath) }
    },
  }
}
