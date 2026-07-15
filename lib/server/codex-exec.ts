import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { AI_MODELS, type GenerationMetadata } from '../ai/config.ts'

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000

export interface CodexExecOptions<T> {
  prompt: string
  schemaPath: string
  validate: (value: unknown) => T
  model?: string
  cwd?: string
  executable?: string
  timeoutMs?: number
}

export interface CodexExecResult<T> {
  data: T
  metadata: GenerationMetadata
}

export function buildCodexExecArgs(options: {
  model: string
  schemaPath: string
  outputPath: string
  cwd: string
}): string[] {
  return [
    'exec',
    '--model', options.model,
    '--ephemeral',
    '--sandbox', 'read-only',
    '--config', 'approval_policy="never"',
    '--cd', options.cwd,
    '--output-schema', options.schemaPath,
    '--output-last-message', options.outputPath,
    '-',
  ]
}

export async function runCodexJson<T>(options: CodexExecOptions<T>): Promise<CodexExecResult<T>> {
  const startedAt = Date.now()
  const cwd = resolve(options.cwd ?? process.cwd())
  const model = options.model ?? AI_MODELS.scheduledSynthesis
  const schemaPath = resolve(cwd, options.schemaPath)
  const outputPath = join(tmpdir(), `stratum-codex-${randomUUID()}.json`)
  const args = buildCodexExecArgs({ model, schemaPath, outputPath, cwd })

  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(options.executable ?? 'codex', args, {
        cwd,
        env: process.env,
        stdio: ['pipe', 'ignore', 'pipe'],
      })
      let stderr = ''
      let settled = false
      const timeout = setTimeout(() => {
        child.kill('SIGTERM')
        if (!settled) reject(new Error(`Codex execution timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`))
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

      child.stderr.on('data', (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-8_000)
      })
      child.on('error', (error) => {
        settled = true
        clearTimeout(timeout)
        reject(error)
      })
      child.on('close', (code) => {
        settled = true
        clearTimeout(timeout)
        if (code === 0) resolvePromise()
        else reject(new Error(`Codex exited with code ${code}: ${stderr.trim()}`))
      })
      child.stdin.end(options.prompt)
    })

    const data = options.validate(JSON.parse(await readFile(outputPath, 'utf8')))
    return {
      data,
      metadata: {
        provider: 'openai',
        model,
        durationMs: Date.now() - startedAt,
        status: 'succeeded',
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw Object.assign(new Error(message), {
      metadata: {
        provider: 'openai',
        model,
        durationMs: Date.now() - startedAt,
        status: 'failed' as const,
        error: message,
      } satisfies GenerationMetadata,
    })
  } finally {
    await unlink(outputPath).catch(() => undefined)
  }
}
