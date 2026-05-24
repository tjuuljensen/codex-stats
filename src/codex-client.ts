import { spawn, ChildProcessWithoutNullStreams } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as readline from 'readline'
import * as vscode from 'vscode'
import {
  AccountData,
  AccountUsageSnapshot,
  CodexRateLimitRpcResult,
  JsonRpcError,
  JsonRpcResponse,
  RateLimitWindow,
  RateLimits,
} from './types'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
  timer: NodeJS.Timeout
  method: string
}

const DEFAULT_TIMEOUT_MS = 10000

export class CodexAppServerClient {
  private process: ChildProcessWithoutNullStreams | undefined
  private lineReader: readline.Interface | undefined
  private pendingRequests = new Map<number, PendingRequest>()
  private nextRequestId = 1
  private initialized = false
  private starting: Promise<void> | undefined
  private lastSnapshot: AccountUsageSnapshot | null = null

  constructor(private readonly output: vscode.OutputChannel) {}

  async readUsage(): Promise<AccountUsageSnapshot> {
    await this.ensureStarted()

    const [accountResult, rateLimitResult] = await Promise.all([
      this.request<unknown>('account/read', { refreshToken: false }),
      this.request<unknown>('account/rateLimits/read'),
    ])

    const snapshot: AccountUsageSnapshot = {
      account: parseAccountData(accountResult),
      rateLimits: parseRateLimits(rateLimitResult),
      rawAccount: accountResult,
      rawRateLimits: rateLimitResult,
    }

    this.lastSnapshot = snapshot
    return snapshot
  }

  async reconnect(): Promise<void> {
    this.stop()
    await this.ensureStarted()
  }

  stop(): void {
    this.rejectAllPending(new Error('Codex app-server stopped'))
    this.initialized = false
    this.starting = undefined

    if (this.lineReader) {
      this.lineReader.close()
      this.lineReader = undefined
    }

    if (this.process) {
      const child = this.process
      this.process = undefined
      child.kill()
    }
  }

  getLastSnapshot(): AccountUsageSnapshot | null {
    return this.lastSnapshot
  }

  private async ensureStarted(): Promise<void> {
    if (this.process && !this.process.killed && this.initialized) {
      return
    }

    if (!this.starting) {
      this.starting = this.start()
    }

    await this.starting
  }

  private async start(): Promise<void> {
    const config = vscode.workspace.getConfiguration('codexUsage')
    const configuredCodexPath = config.get<string>('codexPath') || 'codex'
    const codexPathCandidates = resolveCodexPathCandidates(configuredCodexPath)
    const extraArgs = config.get<string[]>('appServerArgs') || []
    const args = ['app-server', ...extraArgs]

    let lastError: unknown
    for (const codexPath of codexPathCandidates) {
      try {
        await this.startProcess(codexPath, args)
        return
      } catch (error) {
        lastError = error
        this.log(
          `Failed app-server candidate ${codexPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        this.stop()

        if (!isSpawnStartupError(error)) {
          throw error
        }
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('Unable to start Codex app-server')
  }

  private async startProcess(codexPath: string, args: string[]): Promise<void> {
    this.log(`Starting Codex app-server: ${codexPath} ${args.join(' ')}`)

    const child = spawn(codexPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && codexPath.endsWith('.cmd'),
      windowsHide: true,
    })

    this.process = child
    this.initialized = false

    child.once('error', (error) => {
      this.log(`Failed to start Codex app-server: ${error.message}`)
      if (this.process === child) {
        this.initialized = false
        this.starting = undefined
        this.process = undefined
        this.rejectAllPending(error)
      }
    })

    child.once('exit', (code, signal) => {
      this.log(`Codex app-server exited: code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      if (this.process === child) {
        this.initialized = false
        this.starting = undefined
        this.process = undefined
        this.rejectAllPending(new Error('Codex app-server exited'))
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      this.log(`app-server stderr: ${chunk.toString().trimEnd()}`)
    })

    this.lineReader = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    })

    this.lineReader.on('line', (line) => this.handleLine(line))

    await this.request('initialize', {
      clientInfo: {
        name: 'codex_stats_vscode',
        title: 'Codex Stats VS Code Extension',
        version: getExtensionVersion(),
      },
    })
    this.sendNotification('initialized', {})
    this.initialized = true
    this.log('Codex app-server initialized')
  }

  private request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.process || !this.process.stdin.writable) {
      return Promise.reject(new Error('Codex app-server is not running'))
    }

    const id = this.nextRequestId++
    const message = params === undefined ? { method, id } : { method, id, params }
    const timeoutMs = getRequestTimeoutMs()

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Timed out waiting for ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve: (value: unknown) => resolve(value as T),
        reject,
        timer,
        method,
      })

      this.writeJson(message)
    })
  }

  private sendNotification(method: string, params?: unknown): void {
    const message = params === undefined ? { method } : { method, params }
    this.writeJson(message)
  }

  private writeJson(message: object): void {
    const raw = JSON.stringify(message)
    this.logRaw(`--> ${raw}`)
    this.process?.stdin.write(`${raw}\n`)
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    this.logRaw(`<-- ${trimmed}`)

    let message: JsonRpcResponse
    try {
      message = JSON.parse(trimmed) as JsonRpcResponse
    } catch (error) {
      this.log(`Ignoring non-JSON app-server output: ${trimmed}`)
      return
    }

    if (message.id === undefined || message.id === null) {
      return
    }

    const responseId =
      typeof message.id === 'number' ? message.id : Number(message.id)
    const pending = this.pendingRequests.get(responseId)
    if (!pending) {
      this.log(`Received response for unknown request id ${message.id}`)
      return
    }

    clearTimeout(pending.timer)
    this.pendingRequests.delete(responseId)

    if (message.error) {
      pending.reject(formatJsonRpcError(pending.method, message.error))
      return
    }

    pending.resolve(message.result)
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pendingRequests.clear()
  }

  private log(message: string): void {
    const config = vscode.workspace.getConfiguration('codexUsage')
    if (config.get<boolean>('debug')) {
      this.output.appendLine(`[${new Date().toISOString()}] ${message}`)
    }
  }

  private logRaw(message: string): void {
    const config = vscode.workspace.getConfiguration('codexUsage')
    if (config.get<boolean>('debug') && config.get<boolean>('logRawJsonRpc')) {
      this.output.appendLine(`[${new Date().toISOString()}] ${message}`)
    }
  }
}

function getRequestTimeoutMs(): number {
  const config = vscode.workspace.getConfiguration('codexUsage')
  return config.get<number>('requestTimeoutMs') || DEFAULT_TIMEOUT_MS
}

function getExtensionVersion(): string {
  const extension = vscode.extensions.getExtension('MartinOrtiz.codex-stats')
  return extension?.packageJSON?.version || '1.0.0'
}

function resolveCodexPathCandidates(configuredPath: string): string[] {
  if (configuredPath !== 'codex') {
    return [configuredPath]
  }

  const candidates = getCodexPathCandidates()
  const existingAbsoluteCandidates = candidates.filter(
    (candidate) => !candidate.includes(path.sep) || fs.existsSync(candidate),
  )
  return existingAbsoluteCandidates.length > 0
    ? existingAbsoluteCandidates
    : [process.platform === 'win32' ? 'codex.exe' : 'codex']
}

function getCodexPathCandidates(): string[] {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    const candidates = [
      appData ? path.join(appData, 'npm', 'codex.cmd') : undefined,
      appData ? path.join(appData, 'npm', 'codex.exe') : undefined,
      ...getBundledCodexCandidates(),
      'codex.cmd',
      'codex.exe',
      'codex',
    ]

    return candidates.filter((candidate): candidate is string => Boolean(candidate))
  }

  return [
    ...getBundledCodexCandidates(),
    path.join(os.homedir(), '.local', 'bin', 'codex'),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    '/usr/bin/codex',
    'codex',
  ]
}

function isSpawnStartupError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const maybeCode = (error as NodeJS.ErrnoException).code
  return maybeCode === 'ENOENT' || maybeCode === 'EINVAL'
}

function getBundledCodexCandidates(): string[] {
  const extensionRoot = path.join(os.homedir(), '.vscode', 'extensions')
  if (!fs.existsSync(extensionRoot)) {
    return []
  }

  const platformDir = getBundledCodexPlatformDir()
  const executableName = process.platform === 'win32' ? 'codex.exe' : 'codex'

  if (!platformDir) {
    return []
  }

  return fs
    .readdirSync(extensionRoot)
    .filter((entry) => entry.startsWith('openai.chatgpt-'))
    .map((entry) =>
      path.join(
        extensionRoot,
        entry,
        'bin',
        platformDir,
        executableName,
      ),
    )
}

function getBundledCodexPlatformDir(): string | undefined {
  if (process.platform === 'win32') {
    return 'windows-x86_64'
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'linux-aarch64' : 'linux-x86_64'
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'macos-aarch64' : 'macos-x86_64'
  }

  return undefined
}

function formatJsonRpcError(method: string, error: JsonRpcError): Error {
  const details = error.data ? ` ${JSON.stringify(error.data)}` : ''
  return new Error(`${method} failed: ${error.message}${details}`)
}

function parseAccountData(value: unknown): AccountData {
  const root = asRecord(value) || {}
  const account = asRecord(root.account) || root
  const profile = asRecord(root.profile) || asRecord(account.profile)
  const plan = asRecord(root.plan) || asRecord(account.plan)

  return {
    email: firstString(account.email, profile?.email, root.email) || 'Unknown',
    planType:
      firstString(
        account.planType,
        account.plan_type,
        account.subscriptionPlan,
        plan?.type,
        plan?.name,
        profile?.planType,
        root.planType,
      ) || 'Unknown',
    accountId: firstString(account.id, account.accountId, root.accountId),
  }
}

function parseRateLimits(value: unknown): RateLimits {
  const root = asRecord(value) || {}
  const usage = asRecord(root.usage)
  const rateLimitRoot =
    asRecord(root.rateLimits) ||
    asRecord(root.rate_limits) ||
    asRecord(usage?.rateLimits) ||
    root

  const windows: RateLimitWindow[] = []

  const primary = parseWindow('primary', asRecord(rateLimitRoot.primary))
  if (primary) {
    windows.push(primary)
  }

  const secondary = parseWindow('secondary', asRecord(rateLimitRoot.secondary))
  if (secondary) {
    windows.push(secondary)
  }

  const byLimitId =
    asRecord(rateLimitRoot.rateLimitsByLimitId) ||
    asRecord(rateLimitRoot.rate_limits_by_limit_id)
  if (byLimitId) {
    for (const [limitId, limitValue] of Object.entries(byLimitId)) {
      const parsed = parseWindow(limitId, asRecord(limitValue))
      if (parsed) {
        windows.push(parsed)
      }
    }
  }

  const list = Array.isArray(rateLimitRoot.windows)
    ? rateLimitRoot.windows
    : Array.isArray(rateLimitRoot.limits)
      ? rateLimitRoot.limits
      : Array.isArray(rateLimitRoot.rateLimits)
        ? rateLimitRoot.rateLimits
        : undefined

  if (list) {
    for (const [index, item] of list.entries()) {
      const record = asRecord(item)
      const parsed = parseWindow(firstString(record?.id, record?.name) || `limit-${index + 1}`, record)
      if (parsed) {
        windows.push(parsed)
      }
    }
  }

  const deduped = dedupeWindows(windows)
  return {
    primary: deduped.find((limit) => limit.id === 'primary') || deduped[0],
    secondary: deduped.find((limit) => limit.id === 'secondary') || deduped[1],
    windows: deduped,
    raw: value as CodexRateLimitRpcResult,
  }
}

function parseWindow(id: string, value: Record<string, unknown> | undefined): RateLimitWindow | undefined {
  if (!value) {
    return undefined
  }

  const usedPercent = firstNumber(
    value.usedPercent,
    value.used_percent,
    value.percentUsed,
    value.percent_used,
    value.usagePercent,
  )

  if (usedPercent === undefined) {
    return undefined
  }

  const resetsAt = firstNumber(value.resetsAt, value.resets_at, value.resetAt, value.reset_at)
  const resetAfterSeconds = firstNumber(
    value.resetsInSeconds,
    value.resets_in_seconds,
    value.resetAfterSeconds,
    value.reset_after_seconds,
  )

  return {
    id,
    label: firstString(value.label, value.name, value.title) || labelForLimit(id),
    used_percent: usedPercent,
    window_minutes: firstNumber(
      value.windowDurationMins,
      value.window_duration_mins,
      value.windowMinutes,
      value.window_minutes,
    ),
    resets_at: resetsAt,
    resets_in_seconds: resetAfterSeconds ?? secondsUntilUnixTimestamp(resetsAt),
  }
}

function dedupeWindows(windows: RateLimitWindow[]): RateLimitWindow[] {
  const seen = new Set<string>()
  const result: RateLimitWindow[] = []

  for (const window of windows) {
    const key = `${window.id}:${window.window_minutes ?? 'unknown'}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(window)
    }
  }

  return result
}

function labelForLimit(id: string): string {
  if (id === 'primary') {
    return 'Primary'
  }
  if (id === 'secondary') {
    return 'Weekly'
  }
  return id
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function secondsUntilUnixTimestamp(timestamp: number | undefined): number | undefined {
  if (timestamp === undefined) {
    return undefined
  }

  const millis = timestamp > 9999999999 ? timestamp : timestamp * 1000
  return Math.max(0, Math.round((millis - Date.now()) / 1000))
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return undefined
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}
