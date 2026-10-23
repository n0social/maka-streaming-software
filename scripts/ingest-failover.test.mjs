import assert from 'node:assert/strict'
function nextIngestTargetAfterFailedRecovery(current, recoveryReason, backup) {
  if (current === 'backup') return 'backup'
  if (!backup.url.trim()) return 'primary'
  if (recoveryReason.startsWith('rtmp:')) return 'backup'
  return 'primary'
}
assert.equal(nextIngestTargetAfterFailedRecovery('primary','rtmp:x',{url:'u',key:'k'}),'backup')
assert.equal(nextIngestTargetAfterFailedRecovery('primary','whip:x',{url:'u'}),'primary')
console.log('ingest-failover.test.mjs: ok')
