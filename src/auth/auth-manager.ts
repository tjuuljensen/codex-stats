import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export function getCodexAuthPath(): string {
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  return path.join(codexHome, 'auth.json')
}

export function hasCodexAuthFile(): boolean {
  return fs.existsSync(getCodexAuthPath())
}
