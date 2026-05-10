import * as vscode from 'vscode'
import { CodexAppServerClient } from '../codex-client'
import { AccountUsageSnapshot, RateLimits } from '../types'
import {
  updateStatusBar,
  showUpdating,
  showFetchError,
  showUpdateError,
} from '../ui/status-bar'

let appServerClient: CodexAppServerClient | undefined
let outputChannel: vscode.OutputChannel | undefined

export function initializeMonitor(output: vscode.OutputChannel): void {
  outputChannel = output
  appServerClient = new CodexAppServerClient(output)
}

export async function updateUsage(): Promise<void> {
  if (!appServerClient) {
    return
  }

  try {
    showUpdating()

    const snapshot = await appServerClient.readUsage()
    if (snapshot.rateLimits.windows.length > 0) {
      updateStatusBar(snapshot)
      checkRateLimitWarnings(snapshot.rateLimits)
      return
    }

    log('account/rateLimits/read returned no recognizable limits')
    showFetchError()
  } catch (error) {
    log(`Error updating usage: ${error instanceof Error ? error.message : String(error)}`)
    showUpdateError(error)

    const config = vscode.workspace.getConfiguration('codexUsage')
    if (config.get<boolean>('showNotifications')) {
      vscode.window.showWarningMessage(
        `Codex Stats: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export async function reconnectAppServer(): Promise<void> {
  if (!appServerClient) {
    return
  }

  showUpdating()
  await appServerClient.reconnect()
  await updateUsage()
}

export function stopMonitor(): void {
  appServerClient?.stop()
  appServerClient = undefined
}

export function showLogs(): void {
  outputChannel?.show()
}

export function getLastSnapshot(): AccountUsageSnapshot | null {
  return appServerClient?.getLastSnapshot() || null
}

function checkRateLimitWarnings(rateLimits: RateLimits): void {
  const config = vscode.workspace.getConfiguration('codexUsage')
  const showNotifications = config.get<boolean>('showNotifications')
  if (!showNotifications) {
    return
  }

  const warnings = rateLimits.windows
    .filter((limit) => limit.used_percent >= 90)
    .map((limit) => `${limit.label} is ${limit.used_percent.toFixed(1)}% used`)

  if (warnings.length > 0) {
    vscode.window.showWarningMessage(`Codex Stats Warning: ${warnings.join(', ')}`)
  }
}

function log(message: string): void {
  const config = vscode.workspace.getConfiguration('codexUsage')
  if (config.get<boolean>('debug')) {
    outputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`)
  }
}
