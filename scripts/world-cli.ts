#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { currentWorldCommit, readWorldNodes, worldRepositoryBranch, worldRepositoryRoot } from '../lib/server/world-repository.ts'

function emit(value: unknown): never {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
  process.exit(0)
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

async function readJson(path: string): Promise<unknown[]> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'))
    return Array.isArray(value) ? value : []
  } catch { return [] }
}

const [command = 'status', argument = ''] = process.argv.slice(2)
const root = worldRepositoryRoot()
const branch = worldRepositoryBranch()
const commit = await currentWorldCommit(root, branch)
const entries = await readWorldNodes(root).catch(() => [])
const nodes = entries.map((entry) => entry.node)

if (command === 'status') {
  emit({ root, branch, commit, nodeCount: nodes.length, byKind: Object.fromEntries([...new Set(nodes.map((node) => node.kind))].map((kind) => [kind, nodes.filter((node) => node.kind === kind).length])), currentAsOf: nodes.find((node) => node.kind === 'current')?.asOf ?? null })
}

if (command === 'search') {
  if (!argument.trim()) fail('Usage: world search <query>')
  const terms = argument.toLowerCase().split(/\s+/).filter(Boolean)
  emit(nodes.filter((node) => terms.every((term) => [node.title, node.summary, node.body, ...node.aliases].join(' ').toLowerCase().includes(term))).slice(0, 30))
}

if (command === 'show') {
  const node = nodes.find((candidate) => candidate.id === argument)
  if (!node) fail(`Unknown world node: ${argument}`)
  emit(node)
}

if (command === 'neighbors') {
  const node = nodes.find((candidate) => candidate.id === argument)
  if (!node) fail(`Unknown world node: ${argument}`)
  const targetIds = new Set(node.relationships.map((relationship) => relationship.targetId))
  for (const candidate of nodes) if (candidate.relationships.some((relationship) => relationship.targetId === node.id)) targetIds.add(candidate.id)
  emit({ node, neighbors: nodes.filter((candidate) => targetIds.has(candidate.id)) })
}

if (command === 'changes') {
  const count = Number.isInteger(Number(argument)) ? Math.max(1, Math.min(20, Number(argument))) : 2
  emit(nodes.filter((node) => node.kind === 'journal').sort((a, b) => Date.parse(b.asOf) - Date.parse(a.asOf)).slice(0, count))
}

if (command === 'sources') {
  const sources = await readJson(join(root, 'world/index/sources.json'))
  emit(argument ? sources.filter((source) => source && typeof source === 'object' && String((source as { id?: unknown }).id) === argument) : sources)
}

if (command === 'market') {
  if (!argument.trim()) fail('Usage: world market <market-or-hypothesis-id|symbol-or-issuer>')
  const node = nodes.find((candidate) => candidate.id === argument && (candidate.kind === 'market' || candidate.kind === 'hypothesis'))
  if (node) {
    const targetIds = new Set(node.relationships.map((relationship) => relationship.targetId))
    emit({ node, connected: nodes.filter((candidate) => targetIds.has(candidate.id) || candidate.relationships.some((relationship) => relationship.targetId === node.id)) })
  }
  const dataRoot = process.env.STRATUM_DATA_ROOT?.trim() || join(root, '..')
  const assets = await readJson(join(dataRoot, 'runtime/asset-registry.json'))
  const query = argument.trim().toLowerCase()
  const normalized = assets.filter((asset): asset is Record<string, unknown> => Boolean(asset && typeof asset === 'object'))
  const exact = normalized.filter((row) => String(row.symbol ?? '').toLowerCase() === query)
  const matches = exact.length ? exact : normalized.filter((row) => String(row.name ?? '').toLowerCase().includes(query))
  emit(matches.slice(0, 20).map((row) => {
    return { symbol: String(row.symbol), name: String(row.name), active: true, tradable: true }
  }))
}

if (command === 'portfolio-context') {
  // Host code may write this sanitized, non-Git runtime file immediately
  // before a run. Quantities, costs, account IDs, and brokerage data are never
  // accepted by this interface or persisted into StratumWorld.
  const path = join(process.env.STRATUM_DATA_ROOT?.trim() || join(root, '..'), 'runtime/portfolio-context.json')
  const context = await readJson(path)
  emit(context.map((entry) => {
    if (!entry || typeof entry !== 'object') return null
    const row = entry as Record<string, unknown>
    return { symbol: typeof row.symbol === 'string' ? row.symbol : null, dependency: typeof row.dependency === 'string' ? row.dependency : null }
  }).filter(Boolean))
}

fail('Commands: status, search, show, neighbors, changes, sources, market, portfolio-context')
