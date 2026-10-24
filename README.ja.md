# claude-mods

[English](README.md) | [简体中文](README.zh-CN.md) | **日本語**

Bao による Claude Code mods：プラン使用量つきのコンテキストウィンドウバーと、サブエージェントパネル。

![context-bar](docs/context-bar.png)

| Mod | 内容 |
|---|---|
| [`context-bar`](#context-bar) | プロンプトの上に、カテゴリ別に色分けしたコンテキストウィンドウのバーを表示。プラン使用量のバッジとリセット時刻つき。 |
| [`agents-panel`](#agents-panel) | サブエージェントを一覧表示するペイン。実行ボタン、ライブステータス、各実行のレポートつき。 |

## インストール

mods に対応した Claude Code が必要です（開発時のバージョンは 2.1.310）。

```
/plugin marketplace add baoxingx/claude-mods
/plugin install context-bar@baoxingx-mods
/plugin install agents-panel@baoxingx-mods
```

その後 `/reload-plugins` を実行してください（または新しいセッションを開始）。

---

## context-bar

プロンプトの上に表示される枠で、コンテキストウィンドウの使用状況と、プランをどれだけ使ったかを表示します。

### バーの見方

```
◆ Context   Usage [ 1% ] ↻ 01:30   Week [ 10% ] ↻ Wed 20:00        139k of 1M · compacts at 967k  [ 14% ]
████████▒▒▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│░░░░
■ System Prompt 5k 1%  ■ Tools 28k 3%  ■ MCP Tools 2.7k 1%  ■ Agents 77 1%  ■ Memory Files 177 1%
■ Skills 9.9k 1%  ■ Messages 93k 9%  ■ Free 828k
```

| 部分 | 意味 |
|---|---|
| **Usage** | 5 時間のセッション枠のプラン使用量と、リセットされるローカル時刻（`↻ 01:30`）。 |
| **Week** | 7 日間の枠（すべてのモデル）のプラン使用量と、リセットされるローカルの曜日と時刻（`↻ Wed 20:00`）。 |
| **139k of 1M** | 現在コンテキストにあるトークン数 / モデルのコンテキストウィンドウ。 |
| **compacts at 967k** | 自動コンパクトが走る位置。バー上に黄色のマーカーで表示。自動コンパクトがオフのときは非表示。 |
| **14%** バッジ | コンテキストウィンドウの使用率。 |
| バーの各区間 | カテゴリごとのトークン数。順序と色は固定：System Prompt、Tools、MCP Tools、Agents、Memory Files、Skills、Messages。それ以外のカテゴリはグレーで表示。 |
| **Free** | ウィンドウの残りトークン。 |

3 つのパーセンテージのバッジは同じ色ルールです：

| 使用量 | 色 |
|---|---|
| 50% 未満 | 緑 |
| 50% – 79% | 黄 |
| 80% 以上 | 赤 |

### コマンド

| コマンド | 動作 |
|---|---|
| `/context-bar` | 表示 / 非表示を切り替え。 |
| `/context-bar on` | 表示。 |
| `/context-bar off` | 非表示。 |

表示 / 非表示の設定はセッションをまたいで保存されます。最初にオンにするまでは非表示です。

### 更新のタイミング

- メインの会話の応答ごと（サブエージェントのターンでは更新しません）。
- `/clear`、`/resume`、`/compact` のあと。
- プラン使用量の数値が変わったとき。

最初の応答までは `measuring…` と表示されます。

### 注意

- **Usage** と **Week** は Claude Pro / Max のサブスクリプションでのみ表示されます。API キーの場合はプラン上限の情報がないため、バッジは表示されません。
- リセット時刻はカウントダウンではなく、ローカルタイムゾーンの時刻で表示します。バーは何かが変わったときにだけ再描画されるためです。
- ターミナルではブロック文字で、デスクトップアプリでは SVG のバーで描画されます。

---

## agents-panel

定義済みのサブエージェントを一覧表示し、ワンクリックで実行できるペインです。

### 使い方

`/agents-panel` でペインを開き、もう一度実行する（またはペインを閉じる）と非表示になります。

エージェントは 2 か所から読み込みます：

| セクション | フォルダ |
|---|---|
| **PROJECT** | 現在のプロジェクトの `.claude/agents/*.md` |
| **USER** | `~/.claude/agents/*.md` |

同じ名前の場合はプロジェクトのエージェントが優先されます。各行にはエージェントの名前、モデル（未設定なら `inherit`）、説明が表示され、いずれもファイルの frontmatter から読み取ります。

### エージェントの実行

- **▶ run** をクリックするとエージェントが起動します。
- デフォルトでは汎用のタスクが渡されます：自身の指示どおりに現在のプロジェクトで作業し、最後に短いレポートを出す、というものです。
- 特定のタスクを渡したい場合は、先に **Task** 欄に入力してください。そのタスクは次の 1 回の実行にだけ使われ、その後クリアされます。

### ステータス

| ステータス | 意味 |
|---|---|
| `◌ running · 12s` | 実行中。経過時間を表示（毎秒更新）。 |
| `✓ done · 1m 4s` | 完了。所要時間を表示。**report** で最終回答を表示、**hide** で折りたたみ。 |
| `✕ stopped` | 失敗、中断、または強制終了。 |

ヘッダーには実行中のエージェント数（なければ `idle`）が表示されます。Claude が自分で起動したエージェントも、ペインの一覧にあれば実行中として表示されます。実行が終わるとトーストで通知されます。

エージェントが見つからない場合はその旨が表示されます。Claude にエージェントを作ってもらい（例：コードレビュー用）、もう一度 `/agents-panel` を実行してください。

---

## 開発

各 mod は `.claude-plugin/plugin.json`、`hooks/register.tsx`（mod 本体）、`types/index.d.ts`、`tests/` を含むフォルダです。

インストール版の代わりにローカルのコピーを読み込むには、`CLAUDE_CODE_PLUGIN_DIRS` に各 mod のフォルダを指定します（Windows は `;`、それ以外は `:` 区切り）。例：`~/.claude/settings.json`

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-mods/context-bar;/path/to/claude-mods/agents-panel"
  }
}
```

変更後は `/reload-plugins` を実行してください。

テスト：

```
claude plugin test context-bar
claude plugin test agents-panel
```

## ライセンス

[MIT](LICENSE)
