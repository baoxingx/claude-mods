# claude-mods

[English](README.md) | **简体中文** | [日本語](README.ja.md)

Bao 制作的 Claude Code mods：带套餐用量显示的上下文窗口条，以及子代理（subagents）面板。

![context-bar](docs/context-bar.png)

| Mod | 功能 |
|---|---|
| [`context-bar`](#context-bar) | 在输入框上方显示按类别细分的彩色上下文窗口条，并带有套餐用量徽章和重置时间。 |
| [`agents-panel`](#agents-panel) | 列出你的子代理的面板，带运行按钮、实时状态和每次运行的报告。 |

## 安装

需要支持 mods 的 Claude Code 版本（开发时使用的是 2.1.310）。

```
/plugin marketplace add baoxingx/claude-mods
/plugin install context-bar@baoxingx-mods
/plugin install agents-panel@baoxingx-mods
```

然后执行 `/reload-plugins`（或新开一个会话）。

---

## context-bar

输入框上方的一个框，显示上下文窗口的占用情况，以及你已经用了多少套餐额度。

### 各部分含义

```
◆ Context   Usage [ 1% ] ↻ 01:30   Week [ 10% ] ↻ Wed 20:00        139k of 1M · compacts at 967k  [ 14% ]
████████▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░
■ System Prompt 5k 1%  ■ Tools 28k 3%  ■ MCP Tools 2.7k 1%  ■ Agents 77 1%  ■ Memory Files 177 1%
■ Skills 9.9k 1%  ■ Messages 93k 9%  ■ Free 828k
```

| 部分 | 含义 |
|---|---|
| **Usage** | 5 小时会话窗口的套餐用量，以及重置的本地时间（`↻ 01:30`）。 |
| **Week** | 7 天窗口（所有模型）的套餐用量，以及重置的本地星期和时间（`↻ Wed 20:00`）。 |
| **139k of 1M** | 当前上下文中的 token 数 / 模型的上下文窗口大小。 |
| **compacts at 967k** | 触发自动压缩的位置，在条上显示为黄色竖线。关闭自动压缩时不显示。 |
| **14%** 徽章 | 上下文窗口的占用率。 |
| 条的各分段 | 各类别的 token 数，顺序和颜色固定：System Prompt、Tools、MCP Tools、Agents、Memory Files、Skills、Messages。引擎报告的其他类别显示为灰色。 |
| **Free** | 窗口中剩余的 token。 |

三个百分比徽章使用同一套颜色规则：

| 用量 | 颜色 |
|---|---|
| 低于 50% | 绿色 |
| 50% – 79% | 黄色 |
| 80% 及以上 | 红色 |

### 命令

| 命令 | 作用 |
|---|---|
| `/context-bar` | 切换显示 / 隐藏。 |
| `/context-bar on` | 显示。 |
| `/context-bar off` | 隐藏。 |

显示 / 隐藏的选择会跨会话保存。第一次打开之前默认是隐藏的。

### 刷新时机

- 主对话每次回复之后（子代理的回合不触发）。
- `/clear`、`/resume`、`/compact` 之后。
- 套餐用量数据发生变化时。

第一次回复之前显示 `measuring…`。

### 注意事项

- **Usage** 和 **Week** 只在 Claude Pro / Max 订阅下显示。使用 API key 时没有套餐上限数据，所以不显示这两个徽章。
- 重置时间按本地时区显示为具体时间点，而不是倒计时，因为这个条只在数据变化时才重绘。
- 在终端中用方块字符绘制；在桌面应用中显示为 SVG 条。

---

## agents-panel

一个列出你已定义的子代理、并能一键运行它们的面板。

### 用法

执行 `/agents-panel` 打开面板，再执行一次（或直接关闭面板）即可隐藏。

面板从两个位置读取 agents：

| 分区 | 目录 |
|---|---|
| **PROJECT** | 当前项目的 `.claude/agents/*.md` |
| **USER** | `~/.claude/agents/*.md` |

项目中的 agent 会覆盖同名的用户 agent。每一行显示 agent 的名称、模型（未设置时为 `inherit`）和描述，均读取自文件的 frontmatter。

### 运行 agent

- 点击 **▶ run** 启动 agent。
- 默认会给它一个通用任务：按照它自身的指令处理当前项目，最后给出简短报告。
- 如果想指定任务，先在 **Task** 输入框里填写。该任务只用于下一次运行，之后会被清空。

### 状态

| 状态 | 含义 |
|---|---|
| `◌ running · 12s` | 运行中，显示已用时间（每秒更新）。 |
| `✓ done · 1m 4s` | 已完成，显示耗时。点击 **report** 查看最终回答，点击 **hide** 收起。 |
| `✕ stopped` | 失败、被中止或被终止。 |

标题栏显示正在运行的 agent 数量，没有时显示 `idle`。Claude 自己启动的 agent，只要在面板列表中，也会显示为运行中。运行结束时会弹出提示。

如果没有找到任何 agent，面板会提示你：让 Claude 帮你创建一个（比如代码审查用的 agent），然后再执行 `/agents-panel`。

---

## 开发

每个 mod 是一个文件夹，包含 `.claude-plugin/plugin.json`、`hooks/register.tsx`（mod 本体）、`types/index.d.ts` 和 `tests/`。

如果想加载本地副本而不是已安装的版本，把 `CLAUDE_CODE_PLUGIN_DIRS` 指向各个 mod 文件夹（Windows 用 `;` 分隔，其他系统用 `:`），例如在 `~/.claude/settings.json` 中：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-mods/context-bar;/path/to/claude-mods/agents-panel"
  }
}
```

修改后执行 `/reload-plugins`。

测试：

```
claude plugin test context-bar
claude plugin test agents-panel
```

## 许可证

[MIT](LICENSE)
