import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type GpuOption = {
  id: string
  label: string
}

const SYSTEM_DEFAULT: GpuOption = { id: 'default', label: 'System default' }

/** Best-effort GPU names for settings UI (Windows via CIM; elsewhere system default only). */
export async function listGpuOptions(): Promise<GpuOption[]> {
  const options: GpuOption[] = [SYSTEM_DEFAULT]

  if (process.platform !== 'win32') {
    options.push({ id: 'integrated', label: 'Integrated graphics (when available)' })
    return options
  }

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_VideoController | Where-Object { $_.Name } | Select-Object -ExpandProperty Name",
      ],
      { timeout: 8000, windowsHide: true },
    )
    const names = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
    let index = 0
    for (const name of names) {
      const lower = name.toLowerCase()
      const id =
        lower.includes('nvidia') || lower.includes('radeon') || lower.includes('arc ')
          ? 'discrete'
          : `gpu-${index}`
      if (id === 'discrete' && options.some((o) => o.id === 'discrete')) {
        options.push({ id: `gpu-${index}`, label: name })
      } else {
        options.push({ id, label: name })
      }
      index += 1
    }
    if (!options.some((o) => o.id === 'integrated')) {
      options.push({ id: 'integrated', label: 'Integrated graphics (when available)' })
    }
  } catch {
    options.push({
      id: 'discrete',
      label: 'Discrete GPU (detect on next restart)',
    })
  }

  return options
}
