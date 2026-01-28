## ADDED Requirements

### Requirement: 提供玩家角色数据接口

系统 MUST 提供 `GET /api/player` 接口，用于按玩家句柄查询角色数据。

接口输入：
- Query 参数 `player_handle`（string，必填）

数据来源与处理：
- Worker MUST 从 Cloudflare KV 读取固定 key：`bridge_cn.json`。
- Worker MUST 从 `bridge_cn.json` 中读取：
  - `generated_at`
  - `mmr_inject[player_handle]`
  - `role_id_to_name`
  - `role_id_to_team`
- Worker MUST 按游戏内消费逻辑计算角色 MMR：
  - `team = role_id_to_team[role_id]`（0=幸存者，1=凯瑞甘）
  - `core_mmr = cores[team]`（`cores["0"]`/`cores["1"]`）
  - `mmr = core_mmr + class_mmr`
- Worker MUST 仅返回满足以下条件的角色条目：
  - `plays > 0` 或 `class_mmr != 0`

接口输出（HTTP 200 时）：
- JSON MUST 包含：
  - `generated_at`: string（ISO 8601）
  - `player_handle`: string
  - `cores`: object，包含：
    - `survivor`: number（幸存者核心 MMR）
    - `kerrigan`: number（凯瑞甘核心 MMR）
  - `roles_survivor`: array（幸存者角色条目）
  - `roles_kerrigan`: array（凯瑞甘角色条目）
- 每个角色条目 MUST 包含：
  - `role_id`: number
  - `role_name`: string（来自 `role_id_to_name`，无需中文化）
  - `team_name`: string（仅允许 `幸存者` 或 `凯瑞甘`）
  - `core_mmr`: number
  - `class_mmr`: number
  - `mmr`: number
  - `wins`: number
  - `plays`: number
  - `win_rate`: number | null（`plays > 0` 时为 `wins/plays`，否则为 null）

接口响应头：
- 成功响应 MUST 设置 `Content-Type: application/json; charset=utf-8`
- 成功响应 SHOULD 设置 `Cache-Control: public, max-age=30`

#### Scenario: 查询成功返回玩家角色数据
- **WHEN** 客户端请求 `GET /api/player?player_handle=<handle>` 且 KV 中存在可解析的 `bridge_cn.json` 且存在 `mmr_inject[handle]`
- **THEN** 系统返回 HTTP 200，并返回包含 `generated_at`、`player_handle`、`cores`、`roles_survivor`、`roles_kerrigan` 的 JSON，且角色条目满足过滤规则与字段约束

#### Scenario: 缺少 player_handle 参数
- **WHEN** 客户端请求 `GET /api/player` 且未提供 `player_handle`
- **THEN** 系统返回 HTTP 400，并返回包含 `error` 字段的 JSON

#### Scenario: 玩家不存在或无数据
- **WHEN** 客户端请求 `GET /api/player?player_handle=<handle>` 且 `mmr_inject[handle]` 不存在
- **THEN** 系统返回 HTTP 404，并返回包含 `error` 字段的 JSON

#### Scenario: KV 不可用或数据不可解析
- **WHEN** KV 绑定缺失、或 KV 中 `bridge_cn.json` 不存在、或内容无法解析为 JSON
- **THEN** 系统返回非 2xx（例如 500 或 502），并返回包含 `error` 字段的 JSON，且 Worker MUST NOT 抛出未捕获异常导致请求崩溃

### Requirement: 展示角色数据页面与直达路由

系统 MUST 在网站中提供角色数据页面（SPA 路由 `/player`），页面文案使用中文，并提供输入框用于输入玩家句柄（Handle）查询角色数据。

路由行为：
- 系统 MUST 支持 `/player/<handle>` 直达链接（例如 `/player/5-S2-1-10252842`）：
  - 页面加载后 MUST 自动触发查询并展示该句柄的数据
- 手动查询成功后，页面 MUST 将当前 URL 更新为 `/player/<handle>`（便于复制分享）

页面展示内容：
- 页面 MUST 展示“更新时间”，使用接口返回的 `generated_at`，并以北京时间（Asia/Shanghai）格式化展示（例如 `YYYY-MM-DD HH:mm`），同时标注“北京时间”。
- 页面 MUST 展示“核心 MMR”：幸存者 / 凯瑞甘。
- 页面 MUST 分组展示两个角色列表（幸存者 / 凯瑞甘），并在列表中直接展示每个角色条目：
  - `role_name`
  - `mmr`
  - `class_mmr`
  - `wins`
  - `plays`
  - `win_rate`（若 `plays==0` 可显示为 `--`）
- 页面 MUST 应用同样的角色过滤规则（`plays > 0` 或 `class_mmr != 0`），且不需要中文角色名映射。

#### Scenario: 访问 /player/<handle> 自动加载
- **WHEN** 用户访问 `/player/<handle>`
- **THEN** 页面自动请求 `GET /api/player?player_handle=<handle>` 并在成功后展示更新时间、核心 MMR 与按阵营分组的角色列表

### Requirement: 查询历史复用

系统 MUST 在“积分查询”页面与“角色数据”页面复用同一份“最近查询记录”（本地存储）。

行为要求：
- 仅当查询成功时，系统 MUST 将该 `handle` 写入最近查询记录，并更新其 `lastUsed` 时间。
- 最近查询记录 MUST 去重（忽略大小写）并按最近使用时间倒序展示。
- 用户点击某条最近查询记录时，系统 MUST 立即对该句柄发起查询（分别在对应页面查询积分或角色数据）。

#### Scenario: 查询成功后写入并可点击复用
- **WHEN** 用户在任一页面对某句柄查询成功
- **THEN** 该句柄出现在最近查询记录中，且用户点击该记录会再次触发对应页面的查询
