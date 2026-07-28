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

export function buildCodexExecEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const apiKey = source.CODEX_API_KEY ?? source.OPENAI_API_KEY

  return Object.fromEntries(
    Object.entries({
      PATH: source.PATH,
      HOME: source.HOME,
      TMPDIR: source.TMPDIR,
      LANG: source.LANG,
      LC_ALL: source.LC_ALL,
      SSL_CERT_FILE: source.SSL_CERT_FILE,
      CODEX_CA_CERTIFICATE: source.CODEX_CA_CERTIFICATE,
      CODEX_API_KEY: apiKey || undefined,
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
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
    '--ignore-user-config',
    '--ignore-rules',
    '--sandbox', 'read-only',
    '--config', 'approval_policy="never"',
    '--config', 'shell_environment_policy.inherit="none"',
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
    const childEnv = buildCodexExecEnv()
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(options.executable ?? 'codex', args, {
        cwd,
        env: childEnv,
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
