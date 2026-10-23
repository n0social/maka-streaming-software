/** Session ingest target when primary custom RTMP fails and a backup ingest is configured. */

export type IngestTarget = 'primary' | 'backup'

export type BackupIngest = { url: string; key?: string }
export type PrimaryCustomIngest = { enabled: boolean; url: string; key?: string }

export function backupIngestConfigured(backup: BackupIngest): boolean {
  return backup.url.trim().length > 0
}

export function isRtmpRecoveryReason(reason: string): boolean {
  return reason.startsWith('rtmp:')
}

export function nextIngestTargetAfterFailedRecovery(
  current: IngestTarget,
  recoveryReason: string,
  backup: BackupIngest,
): IngestTarget {
  if (current === 'backup') return 'backup'
  if (!backupIngestConfigured(backup)) return 'primary'
  if (isRtmpRecoveryReason(recoveryReason)) return 'backup'
  return 'primary'
}

export function resolveCustomRtmpForPost(
  ingestTarget: IngestTarget,
  primary: PrimaryCustomIngest,
  backup: BackupIngest,
): { url?: string; key?: string } {
  if (ingestTarget === 'backup' && backupIngestConfigured(backup)) {
    const url = backup.url.trim()
    const key = (backup.key ?? '').trim()
    if (url && key) return { url, key }
    if (url && !key) return { url }
    return {}
  }
  if (!primary.enabled) return {}
  const url = primary.url.trim()
  const key = (primary.key ?? '').trim()
  if (url && key) return { url, key }
  if (url && !key) return { url }
  return {}
}

export const BACKUP_INGEST_STATUS = 'Backup ingest'
