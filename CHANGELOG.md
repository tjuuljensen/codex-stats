# Changelog

All notable changes to Codex Stats are documented in this file.

## 1.1.0 - Unreleased

### Added

- Added `codexUsage.displayMode` to show either remaining quota or used quota.
- Added status bar support for the selected display mode.
- Added divider-separated usage sections in the tooltip.
- Added local Codex app-server usage monitoring through JSON-RPC.
- Added refresh, reconnect, logs, and login commands.

### Changed

- Updated tooltip usage display to focus on percentage and reset time.
- Removed repeated quota window duration lines from each usage section.
- Replaced deprecated `vsce` package dependency with `@vscode/vsce`.
- Updated README content for publishing.

### Removed

- Removed development notes and old implementation commentary from the README.

## 1.0.3 - Previous Release

- Initial Codex Stats extension release history before the app-server usage monitor update.
