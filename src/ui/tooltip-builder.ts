import * as vscode from 'vscode'
import { AccountUsageSnapshot, RateLimitWindow } from '../types'
import { createProgressBar } from './progress-bar'

export function createMainTooltip(snapshot: AccountUsageSnapshot): vscode.MarkdownString {
  const tooltip = createTrustedTooltip()
  const account = snapshot.account
  const displayMode = getDisplayMode()

  tooltip.appendMarkdown(`**Codex ${formatPlanName(account.planType)}**  ${account.email}\n\n`)
  tooltip.appendMarkdown(
    `[Refresh](command:codex-usage.refresh)  ` +
      `[Reconnect](command:codex-usage.reconnect)\n\n`,
  )
  tooltip.appendMarkdown('---\n\n')

  snapshot.rateLimits.windows.forEach((limit, index) => {
    if (index > 0) {
      tooltip.appendMarkdown('---\n\n')
    }
    appendLimit(tooltip, limit, displayMode)
  })

  if (snapshot.rateLimits.windows.length > 0) {
    tooltip.appendMarkdown('---\n\n')
  }

  tooltip.appendMarkdown(
    `$(output) [Diagnostics](command:codex-usage.showLogs)  ` +
      `$(settings-gear) [Settings](command:workbench.action.openSettings?%22codexUsage%22)  ` +
      `Updated ${new Date().toLocaleTimeString()}\n`,
  )

  return tooltip
}

export function createAuthRequiredTooltip(): vscode.MarkdownString {
  const tooltip = createTrustedTooltip()
  tooltip.appendMarkdown('## Codex Login Required\n\n')
  tooltip.appendMarkdown('Run `codex login`, then refresh Codex Stats.\n\n')
  tooltip.appendMarkdown('If your Codex CLI stores credentials outside `auth.json`, this extension can still use `codex app-server` once the CLI is logged in.\n\n')
  tooltip.appendMarkdown('$(terminal) [Open Login Terminal](command:codex-usage.login)\n')
  return tooltip
}

export function createAuthErrorTooltip(error: unknown): vscode.MarkdownString {
  const tooltip = createTrustedTooltip()
  tooltip.appendMarkdown('## Codex Authentication Error\n\n')
  tooltip.appendMarkdown(`\`${formatError(error)}\`\n\n`)
  tooltip.appendMarkdown('Run `codex login` and check that `codex app-server` starts from a terminal.\n\n')
  tooltip.appendMarkdown('$(terminal) [Open Login Terminal](command:codex-usage.login)\n')
  return tooltip
}

export function createUpdatingTooltip(): vscode.MarkdownString {
  const tooltip = createTrustedTooltip()
  tooltip.appendMarkdown('## Codex Stats\n\n')
  tooltip.appendMarkdown('$(sync~spin) Reading usage from `codex app-server`...\n')
  return tooltip
}

export function createFetchErrorTooltip(): vscode.MarkdownString {
  const tooltip = createTrustedTooltip()
  tooltip.appendMarkdown('## Unable to Fetch Usage Limits\n\n')
  tooltip.appendMarkdown('`account/rateLimits/read` completed, but no supported rate-limit shape was found.\n\n')
  tooltip.appendMarkdown('Enable `codexUsage.debug` and `codexUsage.logRawJsonRpc` to inspect the raw local JSON-RPC response.\n\n')
  tooltip.appendMarkdown('$(sync) [Retry](command:codex-usage.refresh)  ')
  tooltip.appendMarkdown('$(output) [Logs](command:codex-usage.showLogs)\n')
  return tooltip
}

export function createUpdateErrorTooltip(error: unknown): vscode.MarkdownString {
  const tooltip = createTrustedTooltip()
  tooltip.appendMarkdown('## Codex Usage Error\n\n')
  tooltip.appendMarkdown(`\`${formatError(error)}\`\n\n`)
  tooltip.appendMarkdown('Check that the Codex CLI is installed, `codex login` has completed, and `codex app-server` is available on your PATH.\n\n')
  tooltip.appendMarkdown('$(sync) [Retry](command:codex-usage.refresh)  ')
  tooltip.appendMarkdown('$(debug-restart) [Reconnect](command:codex-usage.reconnect)  ')
  tooltip.appendMarkdown('$(output) [Logs](command:codex-usage.showLogs)\n')
  return tooltip
}

function appendLimit(
  tooltip: vscode.MarkdownString,
  limit: RateLimitWindow,
  displayMode: 'remaining' | 'used',
): void {
  const remainingPercent = Math.max(0, Math.min(100, 100 - limit.used_percent))
  const usedPercent = Math.max(0, Math.min(100, limit.used_percent))
  const displayPercent = displayMode === 'remaining' ? remainingPercent : usedPercent
  const displayLabel = displayMode === 'remaining' ? 'remaining' : 'used'

  tooltip.appendMarkdown(`**${formatLimitLabel(limit)}**\n\n`)
  tooltip.appendMarkdown(`## ${displayPercent.toFixed(0)}% ${displayLabel}\n\n`)
  tooltip.appendMarkdown(`${createProgressBar(displayPercent, displayMode)}\n\n`)
  tooltip.appendMarkdown(`${formatReset(limit)}\n\n`)
}

function createTrustedTooltip(): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString()
  tooltip.isTrusted = true
  tooltip.supportThemeIcons = true
  return tooltip
}

function formatWindow(minutes: number): string {
  if (minutes >= 60 * 24) {
    const days = minutes / (60 * 24)
    return `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? '' : 's'}`
  }
  if (minutes >= 60) {
    const hours = minutes / 60
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hour${hours === 1 ? '' : 's'}`
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

function getDisplayMode(): 'remaining' | 'used' {
  const config = vscode.workspace.getConfiguration('codexUsage')
  return config.get<'remaining' | 'used'>('displayMode') || 'remaining'
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatReset(limit: RateLimitWindow): string {
  if (limit.resets_at !== undefined) {
    return `Resets ${formatResetDate(toDate(limit.resets_at))}`
  }

  if (limit.resets_in_seconds !== undefined) {
    return `Resets ${formatResetDate(new Date(Date.now() + limit.resets_in_seconds * 1000))}`
  }

  return 'Reset unknown'
}

function toDate(timestamp: number): Date {
  return new Date(timestamp > 9999999999 ? timestamp : timestamp * 1000)
}

function formatResetDate(date: Date): string {
  if (isSameLocalDate(date, new Date())) {
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date)
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

function formatLimitLabel(limit: RateLimitWindow): string {
  if (limit.id === 'primary') {
    return `${formatWindow(limit.window_minutes ?? 300)} usage limit`
  }

  if (limit.id === 'secondary') {
    return 'Weekly usage limit'
  }

  if (limit.window_minutes && limit.window_minutes >= 60 * 24 * 6) {
    return 'Weekly usage limit'
  }

  return `${formatWindow(limit.window_minutes ?? 0)} usage limit`
}

function formatPlanName(planType: string): string {
  if (!planType || planType === 'Unknown') {
    return 'Account'
  }

  return planType
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}
