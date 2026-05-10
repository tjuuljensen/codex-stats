import * as vscode from 'vscode'
import {
  reconnectAppServer,
  showLogs,
  updateUsage,
} from '../services/usage-monitor'

export function registerCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('codex-usage.noop', () => undefined),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('codex-usage.refresh', async () => {
      await updateUsage()
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('codex-usage.reconnect', async () => {
      await reconnectAppServer()
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('codex-usage.showLogs', () => {
      showLogs()
    }),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('codex-usage.login', async () => {
      const selection = await vscode.window.showInformationMessage(
        'Authenticate with Codex to use Codex Stats.',
        'Open Terminal',
        'Copy Command',
        'Help',
      )

      if (selection === 'Open Terminal') {
        vscode.commands.executeCommand('workbench.action.terminal.new')
        setTimeout(() => {
          vscode.commands.executeCommand(
            'workbench.action.terminal.sendSequence',
            { text: 'codex login\n' },
          )
        }, 500)
      } else if (selection === 'Copy Command') {
        vscode.env.clipboard.writeText('codex login')
        vscode.window.showInformationMessage('Command "codex login" copied.')
      } else if (selection === 'Help') {
        vscode.env.openExternal(
          vscode.Uri.parse('https://github.com/openai/codex'),
        )
      }
    }),
  )
}
