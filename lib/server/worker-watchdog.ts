/** A timed-out handler may ignore cancellation and continue writing. Never
 * release its slot and retry in the same process: terminate the worker and let
 * startup recovery reclaim durable attempts after the old process is gone. */
export function startAttemptWatchdog(
  timeoutMs: number,
  onExpired: () => void,
): () => void {
  const timer = setTimeout(onExpired, timeoutMs)
  timer.unref()
  return () => clearTimeout(timer)
}

export function workerProgressState(lastLoopAt: number, now = Date.now()) {
  const loopAgeSeconds = Math.max(0, Math.floor((now - lastLoopAt) / 1000))
  return { loopAgeSeconds, stalled: loopAgeSeconds > 180 }
}
