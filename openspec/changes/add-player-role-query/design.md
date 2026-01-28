## Context

当前站点为 Vite + React SPA，通过 Cloudflare Worker 提供静态资源与 `/api/*` 数据接口。`bridge_cn.json` 已托管在 Cloudflare KV 中，并且网站已经使用该文件实现了排行榜（`leaderboard`）展示。

本需求新增“角色数据查询”：用户输入玩家句柄（Handle），网站从 KV 中读取与地图注入同源的数据 `bridge_cn.json.mmr_inject[handle]`，并按游戏内消费逻辑计算“角色 MMR”等指标进行展示，同时支持可分享的直达 URL `/player/<handle>`。

约束/已确认点：
- 数据源固定为 KV 的 `bridge_cn.json`（不按 handle 分 key）。
- 页面形态为独立路由 `/player`（方案 A），并支持 `/player/<handle>` 直达。
- 角色列表过滤：仅展示 `plays > 0` 或 `class_mmr != 0` 的角色。
- 角色名不做中文映射，直接使用 `role_id_to_name`。
- 角色数据直接在页面列表展示，不使用弹窗。
- 查询历史在积分页与角色页复用，同一份本地记录，点击可一键查询；仅查询成功写入历史。

## Goals / Non-Goals

**Goals:**
- 新增 `/player` 与 `/player/:handle` 页面，支持输入句柄查询并展示角色数据；支持复制 URL 直达分享。
- 新增 Worker API：`GET /api/player?player_handle=<handle>`，从 KV 读取 `bridge_cn.json`，返回裁剪/重组后的玩家数据（避免透传整份大 JSON）。
- 复用现有“最近查询”逻辑：积分页与角色页共享同一份 localStorage 记录。
- 保证直连路由可用：直接访问 `/player/<handle>` 不报错；未知路由重定向到首页。

**Non-Goals:**
- 不提供写入/更新 KV 的能力（仅展示读取）。
- 不提供角色名中文化/本地化映射（保持英文角色名）。
- 不做复杂筛选/排序 UI（按阵营分组展示即可）。
- 不实现 SSR（保持 SPA）。

## Decisions

### 1) 接口设计：Worker 侧裁剪/重组（方案 B）

**Decision:** `/api/player` 返回精简 JSON，仅包含页面渲染所需字段：
- `generated_at`（用于“更新时间”，北京时间展示）
- `player_handle`
- `cores`（幸存者/凯瑞甘核心 MMR）
- `roles_survivor[]` 与 `roles_kerrigan[]`（已过滤后的角色条目）

每条角色条目包含：`role_id`、`role_name`、`team_name`（幸存者/凯瑞甘）、`core_mmr`、`class_mmr`、`mmr`、`wins`、`plays`、`win_rate`。

**Why:** `bridge_cn.json` 体积较大，直接透传会带来网络与解析成本；由 Worker 统一裁剪/重组可以减少前端复杂度并提升加载体验。

**Alternatives considered:**
- 前端直接读取 `/api/bridge_cn.json` 再本地解析：下载大、解析重、移动端体验差。

### 2) 角色 MMR 计算口径：对齐地图消费逻辑

**Decision:** 角色 MMR 计算与地图侧一致：
- `team = role_id_to_team[role_id]`（0=幸存者，1=凯瑞甘）
- `core = cores[team]`（`cores["0"]`/`cores["1"]`）
- `mmr = core + class_mmr`

**Why:** 与游戏内注入/消费一致，避免“网页显示与游戏显示不一致”的争议。

### 3) 大文件性能：缓存策略

**Decision:**
- `/api/player` 响应按 `player_handle` 作为 cache key，使用 `caches.default` 做短 TTL 缓存（例如 `Cache-Control: public, max-age=30`），减少高频查询时的 KV 读取与 JSON 重复解析。
- 解析 `bridge_cn.json` 失败、KV 不存在或缺字段时返回结构化错误 JSON，不抛未捕获异常（避免 1101）。

**Why:** 数据文件大且多用户查询会重复命中同一版本数据；短 TTL 缓存能显著降低 CPU 与延迟，同时保证更新及时性。

**Alternatives considered:**
- 无缓存：实现简单但性能风险高。
- 预裁剪并单独存 KV：更优但需要改数据生产链路，本期不做。

### 4) 路由：支持 `/player/<handle>` 直达

**Decision:**
- React Router 增加 `/player` 与 `/player/:handle`。
- 页面查询成功后将 URL 更新为 `/player/<handle>`（便于复制分享）。
- Worker SPA 回退逻辑从“精确匹配已知路由”升级为支持 `/player` 前缀（`/player` 与 `/player/<handle>` 都视为已知路由）。

**Why:** 直达链接是核心用户体验；同时要避免 Worker 将其误判为未知路由而重定向或报错。

### 5) 查询历史复用：抽取公共存储

**Decision:** 把“最近查询句柄”读写逻辑抽为公共模块（例如 `lib/recentHandles`），积分页与角色页共同使用同一 storage key。

**Why:** 避免两处逻辑分叉；满足“两个页面查询历史互相复用”。

## Risks / Trade-offs

- **[KV 文件大导致解析耗时]** → `caches.default` 短 TTL 缓存 +（可选）内存缓存；如仍不够，再评估数据生产侧拆分 key。
- **[路由回退导致 1101]** → Worker 对已知路由统一回退 `/index.html` 并 try/catch；未知路由 302 回首页。
- **[数据结构变动导致字段缺失]** → Worker 做字段容错（缺字段返回空/默认），并返回明确错误信息用于排查。

## Migration Plan

1. 增加 Worker `/api/player` 接口（KV 读取 `bridge_cn.json`、裁剪重组、缓存、错误处理）。
2. 增加前端 `/player` 与 `/player/:handle` 页面与导航入口，支持自动查询与 URL 更新。
3. 抽取并复用最近查询记录逻辑；确保只在查询成功时写入。
4. 部署到 preview 验证：直连 `/player/<handle>`、查询成功/失败提示、与积分页历史互通。
5. 合并到生产分支触发生产部署。

## Open Questions

- （无）
