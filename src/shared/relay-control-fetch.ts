import {
  RELAY_CONTROL_RETRY_ATTEMPTS,
  liveRetryBackoffMs,
  relayControlStatusShouldRetry,
} from './live-retry'

const DEFAULT_TIMEOUT_MS = 8_000

function formatFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const cause =
    err.cause instanceof Error
      ? err.cause.message
      : typeof err.cause === 'string'
        ? err.cause
        : ''
  const code =
    err.cause && typeof err.cause === 'object' && err.cause !== null && 'code' in err.cause
      ? String((err.cause as { code?: unknown }).code ?? '')
      : ''
  const bits = [err.message]
  if (code && !err.message.includes(code)) bits.push(code)
  if (cause && cause !== err.message) bits.push(cause)
  return bits.filter(Boolean).join(' — ')
}

export type RelayControlFetchOptions = {
  attempts?: number
  timeoutMs?: number
}

/** Relay HTTP with timeout + retry (TCP control paths: config, scene, WHIP signaling). */
export async function relayControlFetch(
  input: string,
  init: RequestInit | undefined,
  options: RelayControlFetchOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? RELAY_CONTROL_RETRY_ATTEMPTS
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let lastResponse: Response | null = null
  let lastError: Error | null = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(input, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
      })
      if (res.ok || !relayControlStatusShouldRetry(res.status) || attempt + 1 >= attempts) return res
      lastResponse = res
    } catch (err) {
      lastError = new Error(formatFetchError(err))
      if (attempt + 1 >= attempts) throw lastError
    }
    await new Promise((resolve) => setTimeout(resolve, liveRetryBackoffMs(attempt)))
  }
  if (lastResponse) return lastResponse
  throw lastError ?? new Error('Relay request failed')
}
