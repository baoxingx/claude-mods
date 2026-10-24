import { expect, mock, test } from 'claude-code/testing'

const FILES: Record<string, string> = {
  '/repo/.claude/agents/code-reviewer.md':
    '---\nname: code-reviewer\ndescription: Reviews the current diff for correctness bugs\nmodel: sonnet\n---\nYou review code.',
  '/repo/.claude/agents/release-notes.md':
    '---\nname: release-notes\ndescription: "Turns the commits since the last tag into release notes"\nmodel: haiku\n---\nBody.',
}

const PANE = (cols: number) => ({
  title: 'Agents',
  isFocused: false,
  bodyColumns: cols,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`/agents-panel lists .claude/agents and runs one (${surface})`, async ($, on) => {
    mock.store(on)
    mock.clock(on, { now: 1000 })
    mock.env(on, { HOME: '/home/none' })
    on('session.start', () => ({ cwd: '/repo' }))
    on('session.cwd', () => ({ value: '/repo' }) as never)
    on('command.register', (_$, e) => ({ value: { command: (e as { name: string }).name } }) as never)
    on('fs.exists', (_$, e) => ({ value: String((e as { path: string }).path) === '/repo/.claude/agents' }) as never)
    on('fs.list', () => ({
      value: [
        { name: 'release-notes.md', kind: 'file', size: 1 },
        { name: 'code-reviewer.md', kind: 'file', size: 1 },
        { name: 'notes.txt', kind: 'file', size: 1 },
      ],
    }) as never)
    on('fs.read', (_$, e) => ({ value: FILES[(e as { path: string }).path] ?? '' }) as never)
    on('ui.open', () => ({ value: { isPlaced: true } }) as never)
    const toasts: string[] = []
    on('ui.toast', (_$, e) => (toasts.push(String((e as { text: string }).text)), { value: undefined }) as never)
    const spawned: string[] = []
    // The kit runs a plugin's spawn as the Agent tool: answer that call
    on('agent.spawn', (_$, e) => {
      spawned.push(String((e as { subagent_type?: string }).subagent_type))
      return { model: 'sonnet' }
    })
    on('ui.close', () => ({ value: undefined }) as never)

    await $.session.start({ cwd: '/repo', surface } as never)
    const opened = await $.command.run({ command: 'agents-panel', args: '' } as never)
    expect(opened.text).toBe('Agents panel open.')

    const pane = await $.ui.mount({
      plugin: 'agents-panel',
      surface,
      component: 'Pane',
      requestId: 'agents-panel',
      props: PANE(100) as never,
    })
    expect((await pane.findAll({ text: 'code-reviewer' })).length).toBeGreaterThan(0)
    expect((await pane.findAll({ text: /release notes/ })).length).toBeGreaterThan(0)
    expect((await pane.findAll({ text: 'notes.txt' })).length).toBe(0)

    // ▶ run spawns that agent type (the engine, not the kit, mints its agentId)
    await pane.press({ key: 'run-code-reviewer' })
    expect(spawned).toEqual(['code-reviewer'])

    const closed = await $.command.run({ command: 'agents-panel', args: '' } as never)
    expect(closed.text).toBe('Agents panel closed.')
  })
}
