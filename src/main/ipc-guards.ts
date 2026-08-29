import type { WebContents } from 'electron'
import { recordDiagnostic } from './diagnostics'

const MAX_NAV_INPUT = 2048
const MAX_CHAT_URL = 2048

/** Reject IPC when the sender is not the studio window webContents. */
export function assertStudioSender(
  sender: WebContents,
  isStudio: (s: WebContents) => boolean,
): boolean {
  if (isStudio(sender)) return true
  recordDiagnostic('warn', 'ipc.denied', 'Rejected IPC from non-studio sender')
  return false
}

export function clampInput(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return ''
  return raw.slice(0, maxLen)
}

export function sanitizeNavigateInput(raw: unknown): string {
  return clampInput(raw, MAX_NAV_INPUT).trim()
}

export function sanitizeChatUrlInput(raw: unknown): string | undefined {
  const trimmed = clampInput(raw, MAX_CHAT_URL).trim()
  return trimmed || undefined
}

export async function ipcTry<T>(
  source: string,
  fn: () => T | Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    recordDiagnostic('error', source, 'IPC handler failed', err)
    return fallback
  }
}
