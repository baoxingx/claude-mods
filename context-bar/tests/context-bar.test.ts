import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 12,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 12 },
  view: {},
}

const USAGE = {
  startedAt: 0,
  rateLimits: [{ kind: 'five_hour', percentUsed: 4.2, resetsAt: '2026-10-24T05:30:00Z' }, { kind: 'seven_day', percentUsed: 10, resetsAt: '2026-10-28T11:00:00Z' }],
  context: {
    tokens: 90_400,
    window: 1_000_000,
    percent: 9,
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 4200, color: 'promptBorder', isDeferred: false, kind: 'used' },
        { name: 'System tools', tokens: 17_000, color: 'inactive', isDeferred: false, kind: 'used' },
        { name: 'MCP tools', tokens: 52_000, color: 'permission', isDeferred: false, kind: 'used' },
        { name: 'Custom agents', tokens: 3400, color: 'success', isDeferred: false, kind: 'used' },
        { name: 'Memory files', tokens: 8600, color: 'warning', isDeferred: false, kind: 'used' },
        { name: 'Skills', tokens: 5100, color: 'remember', isDeferred: false, kind: 'used' },
        { name: 'Messages', tokens: 0, color: 'claude', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 897_000, color: 'inactive', isDeferred: false, kind: 'free' },
        { name: 'Autocompact buffer', tokens: 13_000, color: 'inactive', isDeferred: false, kind: 'buffer' },
      ],
      totalTokens: 90_300,
      maxTokens: 1_000_000,
      rawMaxTokens: 1_000_000,
      autocompactSource: 'auto',
      percentage: 9,
      gridRows: [],
      model: 'claude-opus-5-5',
      memoryFiles: [],
      mcpTools: [],
      agents: [],
      isAutoCompactEnabled: true,
      autoCompactThreshold: 987_000,
      apiUsage: null,
    },
  },
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`/context-bar toggles a broken-down bar above the prompt (${surface})`, async ($, on) => {
    mock.store(on)
    mock.clock(on)
    on('session.usage', () => ({ value: USAGE }) as never)
    on('session.start', () => ({ cwd: '/tmp/p' }))
    on('command.register', e => ({ value: { command: (e as { name: string }).name } }) as never)
    on('ui.render', ($, e) => $.ui.resolve(e as never).Box({}) as never)
    await $.session.start({ cwd: '/tmp/p', surface } as never)

    // Hidden until the command runs
    const before = await $.ui.mount({ plugin: 'context-bar', surface, component: 'AbovePrompt', props: BAND as never })
    expect(await before.findAll({ text: 'Context' })).toHaveLength(0)

    const shown = await $.command.run({ command: 'context-bar', args: '' } as never)
    expect(shown.text).toBe('Context bar shown.')

    const band = await $.ui.mount({ plugin: 'context-bar', surface, component: 'AbovePrompt', props: BAND as never })
    expect((await band.findAll({ text: /compacts at 987k/ })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: /MCP Tools/ })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: '52k' })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: /Free/ })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: /Usage/ })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: ' 4% ' })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: /Week/ })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: ' 10% ' })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: /↻ \d\d:\d\d$/ })).length).toBeGreaterThan(0)
    expect((await band.findAll({ text: /↻ (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d:\d\d/ })).length).toBeGreaterThan(0)

    const hidden = await $.command.run({ command: 'context-bar', args: '' } as never)
    expect(hidden.text).toBe('Context bar hidden.')
  })
}
