## ADDED Requirements

### Requirement: 提供排行榜数据接口

系统 MUST 提供 `GET /api/leaderboard` 接口，用于返回“精简后的排行榜数据”。该接口 MUST 从 Cloudflare KV 读取固定 key：`bridge_cn.json`，并从中提取 `generated_at` 与 `leaderboard` 数据进行裁剪/重组后返回；接口 MUST NOT 直接透传原始 `bridge_cn.json` 内容。

接口返回 JSON MUST 包含：
- `generated_at`: string（ISO 8601，来自 `bridge_cn.json.generated_at`，例如 `2026-01-27T17:13:36Z`）
- `boards`: object，包含两个榜单：
  - `kerrigan`: array（凯瑞甘榜条目，按 MMR 从高到低，最多 50 条）
  - `survivor`: array（幸存者榜条目，按 MMR 从高到低，最多 50 条）

每个榜单条目 MUST 包含：
- `rank`: number（从 1 开始）
- `display_name`: string
- `handles`: string[]（用于展示的句柄列表）
- `mmr`: number
- `team_name`: string（仅允许 `凯瑞甘` 或 `幸存者`）

每个榜单条目 MUST NOT 包含 `games_played` 字段。

#### Scenario: 接口成功返回排行榜
- **WHEN** 客户端请求 `GET /api/leaderboard` 且 KV 中存在可解析的 `bridge_cn.json`
- **THEN** 系统返回 HTTP 200，并返回包含 `generated_at` 与 `boards.kerrigan`/`boards.survivor` 的 JSON，且每个条目字段满足上述约束

#### Scenario: KV 绑定缺失或数据不可用
- **WHEN** KV 绑定缺失、或 KV 中 `bridge_cn.json` 不存在、或内容无法解析为 JSON
- **THEN** 系统返回非 2xx（例如 500 或 502），并返回可读的错误 JSON（包含 `error` 字段），且 Worker MUST NOT 抛出未捕获异常导致请求崩溃

### Requirement: 展示排行榜页面

系统 MUST 在网站中提供排行榜页面（SPA 路由，例如 `/leaderboard`），页面文案为中文，并从 `GET /api/leaderboard` 拉取数据渲染。

页面 MUST 展示：
- “更新时间”：使用接口返回的 `generated_at`，并以北京时间（Asia/Shanghai）格式化展示（例如 `YYYY-MM-DD HH:mm`），同时标注“北京时间”。
- 两个榜单区域（或两个 Tab）：
  - `凯瑞甘` 榜
  - `幸存者` 榜
- 每个榜单以 MMR 从高到低展示 Top 50 条目，每条至少展示：名次（`rank`）、玩家名（`display_name`）、句柄（`handles`）、MMR（`mmr`）。

页面 MUST NOT 展示 `games_played`。

#### Scenario: 用户打开排行榜页面
- **WHEN** 用户访问 `/leaderboard`
- **THEN** 页面请求 `GET /api/leaderboard` 并在成功后渲染“更新时间”与两个中文榜单（凯瑞甘/幸存者），且不展示 `games_played`
