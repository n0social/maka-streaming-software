import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dialog } from 'electron'
import type { BrowserWindow } from 'electron'

export type SaveRecordingResult =
  | { canceled: true }
  | { canceled: false; filePath: string }

function resolveDefaultSavePath(defaultName: string, saveFolder?: string): string {
  const folder = saveFolder?.trim()
  if (folder && existsSync(folder)) {
    return join(folder, defaultName)
  }
  return defaultName
}

export type SaveRecordingOptions = {
  /** When set and the path exists, write here without a dialog unless `forceDialog`. */
  saveFolder?: string
  /** Shift-click stop: always show the save dialog. */
  forceDialog?: boolean
}

function shouldUseSaveDialog(saveFolder?: string, forceDialog?: boolean): boolean {
  if (forceDialog) return true
  const folder = saveFolder?.trim()
  if (!folder || !existsSync(folder)) return true
  return false
}

export async function saveRecording(
  parent: BrowserWindow | null,
  defaultName: string,
  data: Uint8Array,
  ext: 'webm' | 'mp4',
  options: SaveRecordingOptions = {},
): Promise<SaveRecordingResult> {
  const { saveFolder, forceDialog } = options
  if (!shouldUseSaveDialog(saveFolder, forceDialog)) {
    const filePath = join(saveFolder!.trim(), defaultName)
    writeFileSync(filePath, data)
    return { canceled: false, filePath }
  }
  return saveRecordingWithDialog(parent, defaultName, data, ext, saveFolder)
}

export async function saveRecordingWithDialog(
  parent: BrowserWindow | null,
  defaultName: string,
  data: Uint8Array,
  ext: 'webm' | 'mp4',
  saveFolder?: string,
): Promise<SaveRecordingResult> {
  const filters =
    ext === 'mp4'
      ? [{ name: 'MP4 video', extensions: ['mp4'] }]
      : [{ name: 'WebM video', extensions: ['webm'] }]

  const defaultPath = resolveDefaultSavePath(defaultName, saveFolder)

  const result = parent
    ? await dialog.showSaveDialog(parent, {
        title: 'Save recording',
        defaultPath,
        filters,
      })
    : await dialog.showSaveDialog({
        title: 'Save recording',
        defaultPath,
        filters,
      })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  writeFileSync(result.filePath, data)
  return { canceled: false, filePath: result.filePath }
}

/** Folder picker + fixed filename (when save dialog is awkward on some platforms). */
export async function saveRecordingToFolder(
  parent: BrowserWindow | null,
  fileName: string,
  data: Uint8Array,
): Promise<SaveRecordingResult> {
  const folderResult = parent
    ? await dialog.showOpenDialog(parent, {
        title: 'Save recording to folder',
        properties: ['openDirectory', 'createDirectory'],
      })
    : await dialog.showOpenDialog({
        title: 'Save recording to folder',
        properties: ['openDirectory', 'createDirectory'],
      })

  if (folderResult.canceled || !folderResult.filePaths[0]) {
    return { canceled: true }
  }

  const filePath = join(folderResult.filePaths[0], fileName)
  writeFileSync(filePath, data)
  return { canceled: false, filePath }
}
