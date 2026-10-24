import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentDef, Run } from '../types'

const PANE = 'agents-panel'
const agents = atom({ plugin: 'agents-panel', key: 'agents' } as const, [])
const runs = atom({ plugin: 'agents-panel', key: 'runs' } as const, {})
const expanded = atom({ plugin: 'agents-panel', key: 'expanded' } as const, null)
const task = atom({ plugin: 'agents-panel', key: 'task' } as const, '')
const isOpen = atom({ plugin: 'agents-panel', key: 'isOpen' } as const, false)

const DOTS = ['#7aa2f7', '#5bb8c8', '#e9c46a', '#e0805a', '#b48ead', '#e06c75', '#98c379', '#d19a66']
const ACCENT = '#e07f5a'

const DEFAULT_TASK =
  'Do your job on the current project now, as your instructions describe. ' +
  'Use the working tree and recent git changes for context, and finish with a short report.'

// ---------- reading .claude/agents ----------

export function parseAgent(text: string, fallbackName: string): Omit<AgentDef, 'scope'> | null {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(text)
  if (!m) return null
  const fields: Record<string, string> = {}
  const lines = (m[1] ?? '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i] ?? '')
    if (!kv) continue
    const key = (kv[1] ?? '').toLowerCase()
    let value = (kv[2] ?? '').trim()
    // A folded or literal block: gather the indented lines under it
    if (value === '|' || value === '>' || value === '|-' || value === '>-') {
      const parts: string[] = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1] ?? '')) parts.push((lines[++i] ?? '').trim())
      value = parts.join(' ')
    }
    fields[key] = value.replace(/^["']|["']$/g, '').replace(/\\n/g, ' ')
  }
  const name = fields['name'] || fallbackName
  return {
    name,
    model: fields['model'] || 'inherit',
    description: (fields['description'] || '').replace(/\s+/g, ' ').trim(),
  }
}

async function readDir($: EngineInterface, dir: string, scope: 'project' | 'user'): Promise<AgentDef[]> {
  if (!(await $.fs.exists(dir))) return []
  const found: AgentDef[] = []
  for (const entry of await $.fs.list(dir)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
    try {
      const parsed = parseAgent(await $.fs.read(`${dir}/${entry.name}`), entry.name.replace(/\.md$/, ''))
      if (parsed) found.push({ ...parsed, scope })
    } catch {
      // An unreadable file is left out
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

async function loadAgents($: EngineInterface): Promise<void> {
  try {
    const cwd = await $.session.cwd()
    const project = await readDir($, `${cwd}/.claude/agents`, 'project')
    const home = await $.env.get('HOME')
    const user = home ? await readDir($, `${home}/.claude/agents`, 'user') : []
    const names = new Set(project.map(a => a.name))
    await update($, agents, () => [...project, ...user.filter(a => !names.has(a.name))])
  } catch {
    // Keep the last list
  }
}

// ---------- runs ----------

async function startRun($: EngineInterface, agent: AgentDef): Promise<void> {
  const typed = (await read($, task)).trim()
  try {
    const result = await $.agent.spawn({
      prompt: typed || DEFAULT_TASK,
      subagentType: agent.name,
      description: `${agent.name} (agents panel)`,
    })
    if (result.deny !== undefined) {
      $.ui.toast(`${agent.name}: ${result.deny}`)
      return
    }
    if (!result.agentId) {
      $.ui.toast(`${agent.name} started`)
      return
    }
    await record($, agent.name, result.agentId)
    if (typed) await update($, task, () => '')
  } catch (err) {
    $.ui.toast(`${agent.name}: ${err instanceof Error ? err.message : 'could not start'}`)
  }
}

async function record($: EngineInterface, name: string, agentId: string): Promise<void> {
  const now = await $.clock.now()
  await update($, runs, all =>
    all[name]?.agentId === agentId ? all : { ...all, [name]: { agentId, startedAt: now, status: 'running' as const } },
  )
}

async function finish($: EngineInterface, agentId: string, status: Run['status'], answer?: string): Promise<string | null> {
  const now = await $.clock.now()
  let finished: string | null = null
  await update($, runs, all => {
    const name = Object.keys(all).find(n => all[n]?.agentId === agentId && all[n]?.status === 'running')
    if (!name) return all
    finished = name
    const run = all[name] as Run
    return { ...all, [name]: { ...run, status, endedAt: now, answer: answer ?? run.answer } }
  })
  return finished
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// ---------- the mod ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agents-panel',
      description: "Show this project's subagents in a pane, with a run button for each",
      immediate: true,
    })
    void loadAgents($)

    // While anything runs: tick the elapsed time, and catch runs that ended
    // without a turn.complete (killed, failed)
    $.clock.every(1000, () => {
      void (async () => {
        const all = await read($, runs)
        const live = Object.values(all).filter(r => r.status === 'running')
        if (live.length === 0) return
        $.ui.invalidate('ui.render')
        try {
          const list = await $.agent.list()
          for (const run of live) {
            const info = list.find(a => a.id === run.agentId)
            if (info && info.status !== 'running' && info.status !== 'pending') {
              await finish($, run.agentId, info.status === 'completed' ? 'done' : 'failed')
            }
          }
        } catch {
          // Try again next tick
        }
      })()
    })
    return next(e)
  })

  on('command.run', { command: 'agents-panel' }, async $ => {
    if (await read($, isOpen)) {
      await $.ui.close({ id: PANE })
      await update($, isOpen, () => false)
      return { text: 'Agents panel closed.' }
    }
    await loadAgents($)
    await $.ui.open({ id: PANE, title: 'Agents' })
    await update($, isOpen, () => true)
    return { text: 'Agents panel open.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    await update($, isOpen, () => false)
    return result
  }).catch(($, e, next) => next(e))

  // Agents the model starts show up as running too
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result.agentId) {
      const known = (await read($, agents)).some(a => a.name === e.subagentType)
      if (known) await record($, e.subagentType, result.agentId)
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      const name = await finish($, e.agentId, e.isAborted || e.reason === 'error' ? 'failed' : 'done', e.answer)
      if (name) $.ui.toast(`${name} finished — open the Agents panel to read its report`)
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const list = await read($, agents)
    const all = await read($, runs)
    const open = await read($, expanded)
    const draft = await read($, task)
    const now = await $.clock.now()
    const running = Object.values(all).filter(r => r.status === 'running').length
    const project = list.filter(a => a.scope === 'project')
    const user = list.filter(a => a.scope === 'user')
    const ruleWidth = Math.max(4, e.props.bodyColumns - 30)

    const row = (agent: AgentDef, i: number) => {
      const run = all[agent.name]
      const isRunning = run?.status === 'running'
      const status = !run
        ? null
        : isRunning
          ? <Text color="suggestion">◌ running · {elapsed(now - run.startedAt)}</Text>
          : run.status === 'done'
            ? <Text color="success">✓ done · {elapsed((run.endedAt ?? now) - run.startedAt)}</Text>
            : <Text color="error">✕ stopped</Text>
      const isExpanded = open === agent.name && !!run?.answer
      return (
        <Box key={`agent-${agent.name}`} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text color={DOTS[i % DOTS.length]}>● </Text>
              <Text bold>{agent.name}</Text>
              <Text dimColor>  {agent.model}</Text>
            </Text>
            <Box flexDirection="row" columnGap={2}>
              {status}
              {run?.answer && !isRunning && (
                <Button
                  key={`view-${agent.name}`}
                  label={isExpanded ? 'hide' : 'report'}
                  plain
                  dimColor
                  onPress={() => update($, expanded, cur => (cur === agent.name ? null : agent.name))}
                />
              )}
              {!isRunning && (
                <Button key={`run-${agent.name}`} label="▶ run" onPress={() => startRun($, agent)} />
              )}
            </Box>
          </Box>
          <Box paddingLeft={2}>
            <Text dimColor wrap="truncate-end">{agent.description || '(no description)'}</Text>
          </Box>
          {isExpanded && (
            <Box paddingLeft={2} marginTop={1} borderStyle="single" borderDimColor paddingX={1}>
              <Text wrap="wrap">{(run?.answer ?? '').slice(0, 4000)}</Text>
            </Box>
          )}
        </Box>
      )
    }

    const section = (label: string, path: string, items: AgentDef[], offset: number) => (
      <Box flexDirection="column">
        <Text>
          <Text bold color="ide">{label}</Text>
          <Text dimColor>  {path} · {items.length} {'─'.repeat(ruleWidth)}</Text>
        </Text>
        <Text> </Text>
        {items.map((a, i) => row(a, i + offset))}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text>
            <Text color={ACCENT}>◆ </Text>
            <Text bold>Agents</Text>
            <Text dimColor>  in this project</Text>
          </Text>
          <Text dimColor>{running > 0 ? `◌ ${running} running` : 'idle'}  </Text>
        </Box>
        <Text> </Text>
        {list.length === 0 && (
          <Text dimColor wrap="wrap">
            No subagents found in .claude/agents or ~/.claude/agents. Ask Claude to make one (for example a
            code-reviewer), then run /agents-panel again.
          </Text>
        )}
        {project.length > 0 && section('PROJECT', '.claude/agents', project, 0)}
        {user.length > 0 && section('USER', '~/.claude/agents', user, project.length)}
        {list.length > 0 && Input && (
          <Input
            key="task"
            label="Task"
            placeholder="optional task for the next run (blank = the agent's own job)"
            value={draft}
            submitLabel="keep"
            onInput={(value: string) => update($, task, () => value)}
            onSubmit={(value: string) => update($, task, () => value)}
          />
        )}
        <Text> </Text>
        <Text dimColor>click ▶ run to start one · /agents-panel to hide</Text>
      </Box>
    )
  })
}
