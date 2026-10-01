import { fork } from 'node:child_process'

export function runIsolatedAgentAttempt(job: object, timeoutMs: number,
  reportProgress: (progress: number, phase: string) => Promise<void>,
  script = new URL('../../scripts/agent-attempt.ts', import.meta.url)): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = fork(script, [], { execArgv: ['--experimental-strip-types'], detached: true,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    let output: unknown, failure: Error | undefined, completed = false
    const terminate = (signal: NodeJS.Signals) => {
      if (!child.pid) return
      try { process.kill(-child.pid, signal) } catch { child.kill(signal) }
    }
    let hardKill: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => {
      failure = new Error('Agent attempt exceeded its deadline')
      terminate('SIGTERM')
      hardKill = setTimeout(() => terminate('SIGKILL'), 5_000)
    }, timeoutMs)
    child.on('message', (message: unknown) => {
      const m = message as { type: string; output?: unknown; error?: string; progress?: number; phase?: string }
      if (m.type === 'progress') void reportProgress(m.progress ?? 0, m.phase ?? '').catch(() => undefined)
      if (m.type === 'result') { output = m.output; completed = true }
      if (m.type === 'error') failure = new Error(m.error ?? 'Agent attempt failed')
    })
    child.once('error', error => { failure = error })
    // The parent does not release the lease until the isolated handler is gone.
    child.once('close', code => {
      clearTimeout(timer); clearTimeout(hardKill)
      if (failure) reject(failure)
      else if (code !== 0 || !completed) reject(new Error(`Agent attempt exited ${code} without a result`))
      else resolve(output)
    })
    child.send(job)
  })
}
