import { readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { claimGateDrainBlockers, descendantProcessIds, pauseWorkerClaims, releaseHealthBlockers, setWorkerClaimGate, verifyWorkerSchema, workerClaimGateStatus, workerClaimsPaused, workerHealthDirectory, workerPauseFile } from '../lib/server/worker-release-control.ts'

const command = process.argv[2]
const release = process.argv.find(arg => arg.startsWith('--required-release='))?.split('=')[1] ?? ''
const supervisorPid = Number(process.argv.find(arg => arg.startsWith('--worker-pid='))?.split('=')[1])
const descendants = (pid: number) => descendantProcessIds(execFileSync('/bin/ps', ['-axo', 'pid=,ppid='], { encoding: 'utf8' })
  .trim().split('\n').map(line => { const [pid, parent] = line.trim().split(/\s+/).map(Number); return { pid, parent } }), pid)
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH' } }
try {
  if (command === 'pause') {
    if (!Number.isInteger(supervisorPid) || supervisorPid <= 1 || !alive(supervisorPid)) throw new Error('A running supervisor PID is required to snapshot descendants')
    await setWorkerClaimGate(true, release)
    let trackedPids = descendants(supervisorPid)
    if (await workerClaimsPaused()) {
      const previous = JSON.parse(await readFile(workerPauseFile(), 'utf8')) as { supervisorPid?: number; trackedPids?: unknown }
      if (!Array.isArray(previous.trackedPids) || previous.trackedPids.some(pid => !Number.isInteger(pid) || pid <= 1)) throw new Error('Existing pause descendant evidence is invalid')
      if (previous.supervisorPid !== supervisorPid && previous.trackedPids.some(alive)) throw new Error('Previous supervisor descendants have not exited')
      if (previous.supervisorPid === supervisorPid) trackedPids = [...new Set([...previous.trackedPids as number[], ...trackedPids])]
    }
    await pauseWorkerClaims(workerPauseFile(), { supervisorPid, trackedPids })
    console.log(JSON.stringify({ paused: true, note: 'Existing attempts may finish; wait for verified drained health before activation' }))
  } else if (command === 'schema') {
    await verifyWorkerSchema()
    console.log(JSON.stringify({ schema: 'ready' }))
  } else if (command === 'verify-activation') {
    const blockers = claimGateDrainBlockers(await workerClaimGateStatus(), release)
    if (!await workerClaimsPaused()) blockers.push('Durable file pause is missing')
    const snapshot = JSON.parse(await readFile(workerPauseFile(), 'utf8')) as { supervisorPid?: number; trackedPids?: unknown }
    if (!Number.isInteger(supervisorPid) || supervisorPid <= 1 || !alive(supervisorPid)) blockers.push('A running supervisor PID is required')
    else {
      if (snapshot.supervisorPid !== supervisorPid || !Array.isArray(snapshot.trackedPids) || snapshot.trackedPids.some(pid => !Number.isInteger(pid) || pid <= 1)) blockers.push('Pause record lacks the matching descendant snapshot')
      else {
        const trackedPids = [...new Set([...snapshot.trackedPids as number[], ...descendants(supervisorPid)])]
        await pauseWorkerClaims(workerPauseFile(), { supervisorPid, trackedPids })
        if (trackedPids.some(alive)) blockers.push('Old supervisor descendants have not exited')
      }
    }
    if (blockers.length) throw new Error(blockers.join('; '))
    console.log(JSON.stringify({ verified: true, release, databaseClaimsPaused: true, runningJobs: 0, runningAttempts: 0 }))
  } else if (command === 'verify' || command === 'resume') {
    const state = JSON.parse(await readFile(join(workerHealthDirectory(), 'worker.json'), 'utf8')) as Record<string, unknown>
    const drained = command === 'resume' || process.argv.includes('--drained')
    const blockers = releaseHealthBlockers(state, release, drained)
    if (drained && !await workerClaimsPaused()) blockers.push('Durable file pause is missing')
    if (drained) blockers.push(...claimGateDrainBlockers(await workerClaimGateStatus(), release))
    if (!Number.isInteger(state.processId)) blockers.push('Worker process identity is unverified')
    else { try { process.kill(Number(state.processId), 0) } catch { blockers.push('Worker process is not running') } }
    if (blockers.length) throw new Error(blockers.join('; '))
    if (command === 'resume') {
      try {
        await setWorkerClaimGate(false, release)
        await unlink(workerPauseFile())
      } catch (error) {
        await setWorkerClaimGate(true, release)
        throw error
      }
    }
    console.log(JSON.stringify({ verified: true, release, paused: await workerClaimsPaused(), drained: state.drained }))
  } else throw new Error('Usage: worker-release-control.ts pause|schema|verify|verify-activation|resume --required-release=SHA [--drained] [--worker-pid=PID]')
} catch (error) {
  console.error(JSON.stringify({ verified: false, error: error instanceof Error ? error.message : 'Worker release verification failed' }))
  process.exitCode = 1
}
