#!/usr/bin/env node
import { initializeWorldRepository, worldRepositoryBranch, worldRepositoryRoot } from '../lib/server/world-repository.ts'

const result = await initializeWorldRepository({
  root: worldRepositoryRoot(),
  branch: worldRepositoryBranch(),
  remote: process.env.STRATUM_WORLD_GIT_REMOTE,
})
process.stdout.write(`${JSON.stringify({ event: 'world_repository_initialized', ...result })}\n`)
