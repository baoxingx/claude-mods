export type AgentDef = {
  name: string
  model: string
  description: string
  scope: 'project' | 'user'
}

export type Run = {
  agentId: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'failed'
  answer?: string
}

declare module 'claude-code' {
  interface PluginState {
    'agents-panel': {
      agents: AgentDef[]
      runs: Record<string, Run>
      expanded: string | null
      task: string
      isOpen: boolean
    }
  }
}
