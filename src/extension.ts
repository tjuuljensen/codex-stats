import * as vscode from 'vscode'
import {
  createStatusBarItem,
  showAuthError,
  getStatusBarItem,
} from './ui/status-bar'
import {
  initializeMonitor,
  stopMonitor,
  updateUsage,
} from './services/usage-monitor'
import { registerCommands } from './commands'

let updateInterval: NodeJS.Timeout | undefined
let outputChannel: vscode.OutputChannel | undefined

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('Codex Stats')
  context.subscriptions.push(outputChannel)

  const statusBarItem = createStatusBarItem()
  context.subscriptions.push(statusBarItem)

  initializeMonitor(outputChannel)
  registerCommands(context)
  startMonitoring()

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('codexUsage.updateInterval')) {
        startUpdateInterval()
      }
      if (event.affectsConfiguration('codexUsage.displayMode')) {
        updateUsage()
      }
    }),
  )
}

async function startMonitoring(): Promise<void> {
  try {
    await updateUsage()
    startUpdateInterval()
  } catch (error) {
    showAuthError(error)
  }
}

function startUpdateInterval(): void {
  if (updateInterval) {
    clearInterval(updateInterval)
  }

  const config = vscode.workspace.getConfiguration('codexUsage')
  const intervalSeconds = config.get<number>('updateInterval') || 300

  updateInterval = setInterval(async () => {
    await updateUsage()
  }, intervalSeconds * 1000)
}

export function deactivate(): void {
  if (updateInterval) {
    clearInterval(updateInterval)
  }

  stopMonitor()
  getStatusBarItem()?.dispose()
  outputChannel?.dispose()
}
