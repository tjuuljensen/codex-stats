import * as vscode from 'vscode'
import { AccountUsageSnapshot } from '../types'
import {
  createMainTooltip,
  createAuthRequiredTooltip,
  createAuthErrorTooltip,
  createUpdatingTooltip,
  createFetchErrorTooltip,
  createUpdateErrorTooltip,
} from './tooltip-builder'

let statusBarItem: vscode.StatusBarItem

export function createStatusBarItem(): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  )

  statusBarItem.text = '$(codex-blossom) $(sync~spin)'
  statusBarItem.tooltip = 'Initializing Codex Stats...'
  statusBarItem.command = 'codex-usage.refresh'
  statusBarItem.show()

  return statusBarItem
}

export function updateStatusBar(snapshot: AccountUsageSnapshot): void {
  const primary = snapshot.rateLimits.primary || snapshot.rateLimits.windows[0]
  const displayMode = getDisplayMode()
  const usedPercent = primary?.used_percent ?? 0
  const percent = displayMode === 'remaining'
    ? Math.max(0, Math.min(100, 100 - usedPercent))
    : usedPercent

  statusBarItem.text = `$(codex-blossom) ${percent.toFixed(0)}%`
  statusBarItem.color = getUsageColor(percent, displayMode)
  statusBarItem.backgroundColor = undefined
  statusBarItem.command = 'codex-usage.refresh'
  statusBarItem.tooltip = createMainTooltip(snapshot)
}

export function showAuthRequired(): void {
  statusBarItem.text = '$(error) Codex login'
  statusBarItem.color = new vscode.ThemeColor('errorForeground')
  statusBarItem.backgroundColor = undefined
  statusBarItem.tooltip = createAuthRequiredTooltip()
  statusBarItem.command = 'codex-usage.login'
}

export function showAuthError(error: unknown): void {
  statusBarItem.text = '$(error) Codex auth'
  statusBarItem.color = new vscode.ThemeColor('errorForeground')
  statusBarItem.backgroundColor = undefined
  statusBarItem.tooltip = createAuthErrorTooltip(error)
  statusBarItem.command = 'codex-usage.login'
}

export function showUpdating(): void {
  statusBarItem.text = '$(codex-blossom) $(sync~spin)'
  statusBarItem.color = undefined
  statusBarItem.backgroundColor = undefined
  statusBarItem.tooltip = createUpdatingTooltip()
}

export function showFetchError(): void {
  statusBarItem.text = '$(warning) Codex usage'
  statusBarItem.color = new vscode.ThemeColor('editorWarning.foreground')
  statusBarItem.backgroundColor = undefined
  statusBarItem.tooltip = createFetchErrorTooltip()
  statusBarItem.command = 'codex-usage.refresh'
}

export function showUpdateError(error: unknown): void {
  statusBarItem.text = '$(warning) Codex usage'
  statusBarItem.color = new vscode.ThemeColor('editorWarning.foreground')
  statusBarItem.backgroundColor = undefined
  statusBarItem.tooltip = createUpdateErrorTooltip(error)
  statusBarItem.command = 'codex-usage.refresh'
}

export function getStatusBarItem(): vscode.StatusBarItem {
  return statusBarItem
}

function getDisplayMode(): 'remaining' | 'used' {
  const config = vscode.workspace.getConfiguration('codexUsage')
  return config.get<'remaining' | 'used'>('displayMode') || 'remaining'
}

function getUsageColor(percent: number, displayMode: 'remaining' | 'used'): vscode.ThemeColor {
  if (displayMode === 'used') {
    if (percent >= 85) {
      return new vscode.ThemeColor('errorForeground')
    }
    if (percent >= 70) {
      return new vscode.ThemeColor('editorWarning.foreground')
    }
    return new vscode.ThemeColor('charts.green')
  }

  if (percent <= 15) {
    return new vscode.ThemeColor('errorForeground')
  }
  if (percent <= 30) {
    return new vscode.ThemeColor('editorWarning.foreground')
  }
  return new vscode.ThemeColor('charts.green')
}
