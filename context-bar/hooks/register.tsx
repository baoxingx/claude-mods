import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Segment, Snapshot } from '../types'

const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)
const isShown = atom({ plugin: 'context-bar', key: 'isShown' } as const, false)

// /context's row names, mapped to the short labels and colors the bar uses
const CATEGORIES: { match: RegExp; label: string; color: string }[] = [
  { match: /^system prompt/i, label: 'System Prompt', color: '#6f8fdc' },
  { match: /^(system )?tools/i, label: 'Tools', color: '#5bb8b8' },
  { match: /^mcp/i, label: 'MCP Tools', color: '#9a7cf2' },
  { match: /agent/i, label: 'Agents', color: '#86c77a' },
  { match: /memory/i, label: 'Memory Files', color: '#e9c46a' },
  { match: /skill/i, label: 'Skills', color: '#ee9bbb' },
  { match: /^messages/i, label: 'Messages', color: '#e07f5a' },
]
const OTHER_COLOR = '#8a8f98'
const FREE_COLOR = '#2c313a'

export function fmt(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n < 1_000_000) return Math.round(n / 1000) + 'k'
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
}

export function pct(tokens: number, window: number): number {
  if (tokens <= 0 || window <= 0) return 0
  return Math.max(1, Math.round((tokens / window) * 100))
}

// 各単語の先頭を大文字にする（未知のカテゴリ名用）
export function titleCase(name: string): string {
  return name.replace(/\b[a-z]/g, c => c.toUpperCase())
}

// 使用率に応じたバッジの背景色
export function badgeColor(percent: number): 'error' | 'warning' | 'success' {
  return percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success'
}

// プラン上限の使用率（five_hour: セッション、seven_day: 週間）。サブスク以外や未計測なら null
export function limitUsage(
  rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[],
  kind: string,
): Limit | null {
  const limit = rateLimits.find(r => r.kind === kind)
  return limit ? { percent: Math.round(limit.percentUsed), resetsAt: limit.resetsAt ?? null } : null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// リセット時刻をローカル時間で表示する（週間枠は曜日付き）
export function fmtReset(iso: string | null, withDay: boolean): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return withDay ? `${WEEKDAYS[d.getDay()]} ${time}` : time
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    const b = usage.context.breakdown
    if (!b) return
    const window = usage.context.window || b.rawMaxTokens
    const segments: Segment[] = []
    let free = 0
    for (const row of b.categories) {
      if (row.kind === 'free') {
        free += row.tokens
        continue
      }
      if (row.kind !== 'used') continue
      const known = CATEGORIES.find(c => c.match.test(row.name))
      const label = known?.label ?? titleCase(row.name)
      const existing = segments.find(s => s.label === label)
      if (existing) existing.tokens += row.tokens
      else segments.push({ label, tokens: row.tokens, color: known?.color ?? OTHER_COLOR })
    }
    // Keep the bar's order stable: the known categories first, in their order
    segments.sort((a, z) => rank(a.label) - rank(z.label))
    const used = segments.reduce((sum, s) => sum + s.tokens, 0)
    const next: Snapshot = {
      used,
      window,
      compactAt: b.isAutoCompactEnabled ? (b.autoCompactThreshold ?? null) : null,
      percent: pct(used, window),
      segments,
      free,
      usage: limitUsage(usage.rateLimits, 'five_hour'),
      weekly: limitUsage(usage.rateLimits, 'seven_day'),
    }
    await update($, snapshot, () => next)
  } catch {
    // No session bound yet, or the breakdown failed: keep the last snapshot
  }
}

function rank(label: string): number {
  const i = CATEGORIES.findIndex(c => c.label === label)
  return i === -1 ? CATEGORIES.length : i
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Toggle the context-window bar above the prompt',
      argumentHint: '[on|off]',
      immediate: true,
    })
    const saved = await $.store.get('isShown')
    if (saved === true) {
      await update($, isShown, () => true)
      $.clock.after(1500, () => void refresh($))
    }
    return next(e)
  })

  on('command.run', { command: 'context-bar' }, async ($, e) => {
    const arg = (e.args ?? '').trim().toLowerCase()
    const current = await read($, isShown)
    const show = arg === 'on' ? true : arg === 'off' ? false : !current
    await update($, isShown, () => show)
    await $.store.set('isShown', show)
    if (show) await refresh($)
    return { text: show ? 'Context bar shown.' : 'Context bar hidden.' }
  })

  // Refresh after each main-loop turn, and after /clear, /resume, /compact
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) void refresh($)
    return result
  })
  // 使用率が動いたらバッジだけ更新する
  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    if (e.changed.includes('rateLimits')) {
      const usage = limitUsage(e.rateLimits, 'five_hour')
      const weekly = limitUsage(e.rateLimits, 'seven_day')
      await update($, snapshot, s => (s ? { ...s, usage, weekly } : s))
    }
    return result
  }).catch(($, e, next) => next(e))
  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    $.clock.after(500, () => void refresh($))
    return result
  }).catch(($, e, next) => next(e))
  on('classic.PostCompact', async ($, e, next) => {
    const result = await next(e)
    void refresh($)
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, isShown))) return next(e)
    const snap = await read($, snapshot)
    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns - 2)
    // 後続のフック（進捗バーなど）の描画も残し、自分の枠の下に積む
    const rest = await next(e)

    if (!snap) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
            <Text>
              <Text color="#e07f5a">◆ </Text>
              <Text bold>Context</Text>
              <Text dimColor> measuring… (fills in after the first reply)</Text>
            </Text>
          </Box>
          {rest}
        </Box>
      )
    }

    const badge = badgeColor(snap.percent)
    const summary =
      `${fmt(snap.used)} of ${fmt(snap.window)}` +
      (snap.compactAt ? ` · compacts at ${fmt(snap.compactAt)}` : '')

    const header = (
      <Box flexDirection="row" justifyContent="space-between">
        <Text>
          <Text color="#e07f5a">◆ </Text>
          <Text bold>Context</Text>
          {snap.usage && (
            <Text>
              <Text dimColor>{'   Usage '}</Text>
              <Text bold backgroundColor={badgeColor(snap.usage.percent)} color="inverseText">{` ${snap.usage.percent}% `}</Text>
              {snap.usage.resetsAt && <Text dimColor>{` ↻ ${fmtReset(snap.usage.resetsAt, false)}`}</Text>}
            </Text>
          )}
          {snap.weekly && (
            <Text>
              <Text dimColor>{'   Week '}</Text>
              <Text bold backgroundColor={badgeColor(snap.weekly.percent)} color="inverseText">{` ${snap.weekly.percent}% `}</Text>
              {snap.weekly.resetsAt && <Text dimColor>{` ↻ ${fmtReset(snap.weekly.resetsAt, true)}`}</Text>}
            </Text>
          )}
        </Text>
        <Text>
          <Text bold>{fmt(snap.used)}</Text>
          <Text dimColor>{summary.slice(fmt(snap.used).length)}{'  '}</Text>
          <Text bold backgroundColor={badge} color="inverseText">{` ${snap.percent}% `}</Text>
          <Text> </Text>
        </Text>
      </Box>
    )

    const legend = (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {snap.segments.map(s => (
          <Text>
            <Text color={s.color}>■ </Text>
            <Text>{s.label} </Text>
            <Text bold>{fmt(s.tokens)}</Text>
            <Text dimColor> {pct(s.tokens, snap.window)}%</Text>
          </Text>
        ))}
        <Text>
          <Text dimColor>■ Free </Text>
          <Text>{fmt(snap.free)}</Text>
        </Text>
      </Box>
    )

    const bar = e.surface === 'terminal' ? terminalBar($, e, snap, width) : svgBar($, e, snap)

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          {header}
          {bar}
          {legend}
        </Box>
        {rest}
      </Box>
    )
  })
}

// A row of block characters, one cell per slice of the window
function terminalBar($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], snap: Snapshot, width: number) {
  const { Text } = $.ui.resolve(e)
  const cells = Math.max(10, width - 4)
  const marker = snap.compactAt ? Math.min(cells - 1, Math.floor((snap.compactAt / snap.window) * cells)) : -1
  const parts: { text: string; color?: string; dim?: boolean }[] = []
  let used = 0
  for (const s of snap.segments) {
    if (s.tokens <= 0) continue
    const n = Math.max(1, Math.round((s.tokens / snap.window) * cells))
    parts.push({ text: '█'.repeat(Math.min(n, cells - used)), color: s.color })
    used += n
    if (used >= cells) break
  }
  const rest = Math.max(0, cells - used)
  if (rest > 0) {
    const before = marker > used ? marker - used : rest
    parts.push({ text: '░'.repeat(Math.min(before, rest)), dim: true })
    if (marker >= used && marker < cells) {
      parts.push({ text: '│', color: 'warning' })
      parts.push({ text: '░'.repeat(Math.max(0, rest - before - 1)), dim: true })
    }
  }
  return (
    <Text wrap="truncate-end">
      {parts.map(p => (
        <Text color={p.color} dimColor={p.dim}>{p.text}</Text>
      ))}
    </Text>
  )
}

// A rounded SVG bar for the Desktop app
function svgBar($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], snap: Snapshot) {
  if (e.surface !== 'desktop' && e.surface !== 'mobile') return terminalBar($, e, snap, 60)
  const { Svg } = $.ui.resolve(e)
  const W = 1000
  const H = 22
  let x = 0
  const rects: string[] = []
  for (const s of snap.segments) {
    if (s.tokens <= 0) continue
    const w = Math.max(3, (s.tokens / snap.window) * W)
    rects.push(`<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${H}" fill="${s.color}"/>`)
    x += w
  }
  const marker = snap.compactAt
    ? `<rect x="${((snap.compactAt / snap.window) * W - 2).toFixed(1)}" y="0" width="3" height="${H}" fill="#e9c46a"/>`
    : ''
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
    `<defs><clipPath id="r"><rect width="${W}" height="${H}" rx="4"/></clipPath></defs>` +
    `<g clip-path="url(#r)"><rect width="${W}" height="${H}" fill="${FREE_COLOR}"/>${rects.join('')}${marker}</g></svg>`
  return (
    <Svg
      source={source}
      alt={`Context ${snap.percent}% used: ${snap.segments.map(s => `${s.label} ${fmt(s.tokens)}`).join(', ')}`}
      height={14}
    />
  )
}
