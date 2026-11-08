import type { RelayHealth, RelayLifecycle, RelayStatusResponse } from './maka-constants'

export type RelaySnapshot = {
  lifecycle: RelayLifecycle
  health: RelayHealth | null
  status: RelayStatusResponse | null
  error: string | null
  pid: number | null
  /** Auto-recovery attempts in this app session. */
  restarts?: number
}
