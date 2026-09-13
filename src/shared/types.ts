export type SendMode = 'debug' | 'confirm' | 'auto'

export interface AppConfig {
  folderPath: string
  captionTemplate: string
  delayMinSec: number
  delayMaxSec: number
  dailyCap: number
  mode: SendMode
  supportedExtensions: string[]
  loginTimeoutSec: number
}

export type RecordStatus = 'sent' | 'skipped' | 'failed' | 'not_found' | 'rejected'

export interface HistoryRecord {
  key: string
  filename: string
  hash: string
  phone: string
  id: string
  status: RecordStatus
  at: string
  error?: string
}

export interface WorkItem {
  id: string
  phone: string
  rawPhone: string
  files: string[]
  key: string
}

export interface RunReport {
  startedAt: string
  finishedAt: string
  mode: SendMode
  totals: Record<RecordStatus | 'total', number>
  items: Array<{ phone: string; filename: string; status: RecordStatus; detail?: string }>
}

export type RunStatus =
  | 'idle'
  | 'scanning'
  | 'launching_browser'
  | 'waiting_login'
  | 'running'
  | 'done'
  | 'stopped'
  | 'aborted'

export interface LogEntry {
  level: 'info' | 'warn' | 'error'
  at: string
  message: string
}

export interface CandidateInfo {
  index: number
  name: string
  subtitle?: string
}
