import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

export type FeedbackEntry = {
  at: string
  message: string
  email?: string
  appVersion: string
  platform: string
  arch: string
}

const FEEDBACK_ISSUE_URL =
  'https://github.com/n0social/maka-streaming-software/issues/new?labels=feedback&title=Maka%20feedback'

function feedbackLogPath(): string {
  const dir = join(app.getPath('userData'), 'store')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'feedback.jsonl')
}

export function getFeedbackIssueUrl(): string {
  return FEEDBACK_ISSUE_URL
}

export function appendFeedback(entry: Omit<FeedbackEntry, 'at'>): { path: string; entry: FeedbackEntry } {
  const full: FeedbackEntry = { ...entry, at: new Date().toISOString() }
  const path = feedbackLogPath()
  appendFileSync(path, `${JSON.stringify(full)}\n`, 'utf8')
  return { path, entry: full }
}

export function formatFeedbackForSupport(entry: FeedbackEntry): string {
  const lines = [
    'Maka feedback',
    `Submitted: ${entry.at}`,
    `App: ${entry.appVersion} (${entry.platform}/${entry.arch})`,
  ]
  if (entry.email) lines.push(`Contact: ${entry.email}`)
  lines.push('', entry.message)
  lines.push('', '---', 'Paste this into a GitHub issue or email if you prefer.')
  return lines.join('\n')
}
