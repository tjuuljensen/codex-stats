export interface AccountData {
  accountId?: string
  email: string
  planType: string
}

export interface RateLimitWindow {
  id: string
  label: string
  used_percent: number
  window_minutes?: number
  resets_in_seconds?: number
  resets_at?: number
}

export interface RateLimits {
  primary?: RateLimitWindow
  secondary?: RateLimitWindow
  windows: RateLimitWindow[]
  raw?: CodexRateLimitRpcResult
}

export interface AccountUsageSnapshot {
  account: AccountData
  rateLimits: RateLimits
  rawAccount: unknown
  rawRateLimits: unknown
}

export type CodexRateLimitRpcResult = unknown

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

export interface JsonRpcResponse {
  id?: number | string | null
  result?: unknown
  error?: JsonRpcError
  method?: string
  params?: unknown
}
