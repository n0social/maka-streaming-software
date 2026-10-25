import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { isSceneImageStorageKey } from '../shared/scene-images'

const IMAGE_FILTERS = [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]

function mimeForPath(filePath: string): 'image/png' | 'image/jpeg' | null {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return null
}

export function readSceneImageDataUrl(filePath: string): string | null {
  const mime = mimeForPath(filePath)
  if (!mime) return null
  try {
    const buf = readFileSync(filePath)
    if (buf.length > 25 * 1024 * 1024) return null
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function pickSceneImageFile(
  parent: BrowserWindow | null,
): Promise<{ canceled: true } | { canceled: false; path: string; dataUrl: string }> {
  const result = parent
    ? await dialog.showOpenDialog(parent, {
        title: 'Choose scene image',
        properties: ['openFile'],
        filters: [...IMAGE_FILTERS],
      })
    : await dialog.showOpenDialog({
        title: 'Choose scene image',
        properties: ['openFile'],
        filters: [...IMAGE_FILTERS],
      })
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true }
  }
  const filePath = result.filePaths[0]
  const dataUrl = readSceneImageDataUrl(filePath)
  if (!dataUrl) {
    return { canceled: true }
  }
  return { canceled: false, path: filePath, dataUrl }
}

export function coerceSceneImagesRecord(
  raw: unknown,
): Partial<Record<string, string>> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Partial<Record<string, string>> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSceneImageStorageKey(key)) continue
    if (value === null || value === '') {
      out[key] = ''
      continue
    }
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > 4096) continue
    if (trimmed.includes('\0')) continue
    out[key] = trimmed
  }
  return out
}
