# claude-mods

Claude Code mods by Bao.

| Mod | What it does |
|---|---|
| `context-bar` | A colored context-window bar above the prompt, broken down by category (System Prompt, Tools, MCP Tools, …). Also shows plan usage badges — `Usage` (5-hour session) and `Week` (7-day) — with their reset times. Badge colors: green < 50%, yellow < 80%, red ≥ 80%. Toggle with `/context-bar`. |
| `agents-panel` | A pane listing this project's subagents with a run button and live status. Toggle with `/agents-panel`. |

## Install

```
/plugin marketplace add baoxingx/claude-mods
/plugin install context-bar@baoxingx-mods
/plugin install agents-panel@baoxingx-mods
```

## Test

```
claude plugin test context-bar
claude plugin test agents-panel
```
