export type Segment = { label: string; tokens: number; color: string }

/** One plan limit window: percent used (0–100) and when it resets (ISO 8601) */
export type Limit = { percent: number; resetsAt: string | null }

export type Snapshot = {
  used: number
  window: number
  compactAt: number | null
  percent: number
  segments: Segment[]
  free: number
  /** Plan usage of the five-hour session window, 0–100; null off a subscription or before the first reading */
  usage: Limit | null
  /** Plan usage of the seven-day window; null when not reported */
  weekly: Limit | null
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': {
      snapshot: Snapshot | null
      isShown: boolean
    }
  }
}
