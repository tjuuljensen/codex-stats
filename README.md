# Codex Stats

Codex Stats adds a VS Code status bar item for monitoring ChatGPT/Codex usage limits from the local Codex CLI app server.

The extension starts `codex app-server` locally and reads account and rate-limit data through its JSON-RPC interface. It does not require OpenAI API keys, scrape browser sessions, or make extension-owned network calls.

## Features

- Status bar percentage for your primary Codex usage window.
- Configurable display mode: percentage remaining or percentage used.
- Tooltip with account email, plan, usage windows, reset times, and visual progress bars.
- Divider-separated primary and weekly usage sections when both limits are available.
- Manual refresh and reconnect commands.
- Configurable auto-refresh interval.
- Optional output-channel diagnostics for local troubleshooting.

## Requirements

- VS Code 1.90.0 or newer.
- Codex CLI installed and available on PATH, configured with `codexUsage.codexPath`, or provided by the official ChatGPT VS Code extension.
- A ChatGPT Plus, Pro, Business, or compatible Codex account logged in with:

```bash
codex login
```

If `codex login` is unavailable on Linux but you are already signed in through Codex or the ChatGPT VS Code extension, Codex Stats can use the existing `~/.codex/auth.json` session.

## Configuration

- `codexUsage.updateInterval`: Refresh interval in seconds. Default: `300`.
- `codexUsage.displayMode`: Show `remaining` or `used` percentages in the status bar and tooltip. Default: `remaining`.
- `codexUsage.showNotifications`: Show warning notifications when usage is high. Default: `false`.
- `codexUsage.codexPath`: Codex CLI executable path. Default: `codex`.
- `codexUsage.appServerArgs`: Extra arguments passed to `codex app-server`. Default: `[]`.
- `codexUsage.requestTimeoutMs`: JSON-RPC request timeout in milliseconds. Default: `10000`.
- `codexUsage.debug`: Write diagnostic logs to the Codex Stats output channel. Default: `false`.
- `codexUsage.logRawJsonRpc`: Log raw local JSON-RPC messages. Default: `false`.

Raw JSON-RPC logging is local-only and intended for troubleshooting. It may include account metadata in the VS Code output channel.

## Commands

- `Codex Stats: Refresh Codex Stats`
- `Codex Stats: Reconnect Codex App Server`
- `Codex Stats: Show Codex Stats Logs`
- `Codex Stats: Login to Codex`

## Status Colors

When display mode is `used`:

- Green below 70%.
- Yellow at 70% and above.
- Red at 85% and above.

When display mode is `remaining`:

- Green above 30%.
- Yellow at 30% and below.
- Red at 15% and below.

## Troubleshooting

- If the status bar shows a warning, run `Codex Stats: Show Codex Stats Logs`.
- Enable `codexUsage.debug` for app-server lifecycle logs.
- Enable `codexUsage.logRawJsonRpc` only when diagnosing local app-server response changes.
- If `codex` is not on PATH, set `codexUsage.codexPath` to the full executable path.
- On Windows, the extension also checks `%APPDATA%\npm\codex.cmd`. On Windows, Linux, and macOS, it checks the bundled ChatGPT VS Code extension Codex binary before falling back to PATH.
- If authentication fails and `~/.codex/auth.json` exists, run `Codex Stats: Reconnect Codex App Server`.
- If authentication fails and `~/.codex/auth.json` is missing, run `codex login` in a terminal and refresh the extension.
- If app-server exits, run `Codex Stats: Reconnect Codex App Server`.

## Privacy and Security

- No telemetry.
- No external extension-owned network calls.
- No upload of `auth.json` or token contents.
- Account and rate-limit reads occur through the local Codex app-server process.

## Development

```bash
npm ci
npm run compile
npm run vscode:package
```

Launch the extension development host from VS Code with `F5`.
