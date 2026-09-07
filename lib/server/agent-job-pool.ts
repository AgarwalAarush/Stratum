type Completion = { processed: boolean; error?: undefined } | { processed?: undefined; error: unknown }

/** Reuse each released slot immediately. One long research job must not hold
 * completed sibling slots idle until the entire original batch has finished. */
export class AgentJobPool {
  private pending = new Set<Promise<Completion>>()
  private completed: Completion[] = []
  private readonly processOne: () => Promise<boolean>
  constructor(processOne: () => Promise<boolean>) { this.processOne = processOne }

  get active() { return this.pending.size }

  async next(concurrency: number): Promise<number> {
    if (this.completed.length) return this.drainCompletions()
    const slots = Number.isFinite(concurrency) ? Math.max(1, Math.min(4, Math.floor(concurrency))) : 1
    while (this.pending.size < slots) {
      // Install rejection handling immediately, including synchronous throws.
      // A sibling can fail between calls while another completion is returned.
      const task: Promise<Completion> = Promise.resolve().then(this.processOne)
        .then(processed => ({processed}), error => ({error}))
        .then(result => { this.completed.push(result); return result })
        .finally(() => this.pending.delete(task))
      this.pending.add(task)
    }
    await Promise.race(this.pending)
    return this.drainCompletions()
  }

  private drainCompletions() {
    const completed = this.completed.splice(0)
    const failed = completed.find(result => 'error' in result)
    if (failed && 'error' in failed) throw failed.error
    return completed.filter(result => result.processed).length
  }
}
