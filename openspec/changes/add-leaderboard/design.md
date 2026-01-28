## Context

当前站点为 Vite + React 的 SPA，通过 Cloudflare Worker 承载静态资源并提供 `/api/*` 代理/聚合接口；站点已具备 KV 读取能力（绑定名 `KS_KV`），例如已用于读取 `proposal_votes_cn.json`。

排行榜数据来源为 KV 中的 `bridge_cn.json`（本地 `public/bridge_cn.json` 可作为结构参考）。该文件体积较大，且结构为“列式/字段数组”为主（例如 `leaderboard` 下按字段名存储数组），不适合直接透传给浏览器。因此需要在 Worker 侧进行裁剪与重组（方案 B），前端仅消费精简后的榜单数据。

站点 UI 语言为中文；排行榜页面仅展示榜单，不提供搜索/输入框。需要展示榜单更新时间（`bridge_cn.json.generated_at`）。用户已明确 `games_played` 不需要展示。

## Goals / Non-Goals

**Goals:**
- 新增一个“排行榜”页面入口（SPA 路由 `/leaderboard`），与现有页面一致的导航/布局风格。
- 新增 Worker API `GET /api/leaderboard`：从 KV 读取 `bridge_cn.json`，解析并返回精简后的榜单数据（不透传原始文件）。
- 返回内容包含“生成时间/更新时间”（读取自 `bridge_cn.json.generated_at`），并在网页上展示为“更新时间”。
- 保障接口稳定性：KV 绑定缺失、key 不存在、JSON 格式异常时不崩溃，返回可读的错误 JSON。
- 控制性能与传输体积：接口输出尽量小，且具备合理缓存策略。

**Non-Goals:**
- 不在网页上提供排行榜搜索/筛选/分页编辑能力（本期只做展示）。
- 不展示 `games_played`（接口与 UI 都不需要返回/渲染该字段）。
- 不实现 SSR / 预渲染（保持现有 SPA 架构）。
- 不提供写入/更新排行榜数据的能力（数据生产在站点外完成，只负责读取展示）。

## Decisions

### 1) 数据获取：KV + 固定 key

**Decision:** Worker 从 `env.KS_KV` 读取固定 key：`bridge_cn.json`。

**Why:** 数据源已在 KV 中托管，且站点已有 KV 读取基础设施；固定 key 简化接口与权限边界。

**Alternatives considered:**
- 前端直连公用源：存在 CORS、可用性与缓存不可控问题。
- Worker 透传 KV 原始 JSON：响应过大、前端解析成本高、移动端体验差。

### 2) 接口形状：返回“行式榜单”且按阵营分组

**Decision:** `GET /api/leaderboard` 返回精简 JSON，包含 `generated_at`，并按阵营分组提供排名条目数组；每条只包含渲染所需字段：
- `rank`（从 1 开始）
- `display_name`
- `handles`（原始数据为数组时保留数组；若为字符串则标准化为数组）
- `mmr`
- `team_name`（中文：`凯瑞甘` / `幸存者`）

明确不返回 `games_played`。

**Why:** 前端展示只需要“名次 + 名称 + 句柄 + MMR + 阵营”。按阵营分组利于 UI（双列/标签切换）且减少前端计算与耦合。

**Alternatives considered:**
- 返回原始 `leaderboard` 列式结构：前端解析复杂，且与数据生产格式强耦合。
- 返回混合数组再由前端分组：减少 Worker 工作量，但增加前端逻辑与重复渲染成本。

### 3) 排序与截断：Worker 端保证稳定排序与 Top N

**Decision:**
- Worker 端解析后，按 `mmr` 从高到低排序；如 `mmr` 相同，使用 `identity` 或 `display_name` 作为稳定 tie-break（避免不同运行时排序不稳定）。
- 固定仅返回每个阵营 Top 50（与本地样例一致）。

**Why:** 保证榜单在不同环境/刷新下顺序一致，控制返回体积。

**Alternatives considered:**
- 依赖数据源“天然排序”：更简单，但对数据生产假设过强，风险高。

### 4) 缓存策略：边缘缓存 + 短 TTL

**Decision:**
- Worker 响应添加 `Cache-Control: public, max-age=30`（可按实际更新频率调整）。
- 使用 `caches.default` 对 `/api/leaderboard` 结果进行缓存（缓存的是“裁剪/重组后的 JSON 响应”），避免每次都从 KV 读取并解析大 JSON。

**Why:** `bridge_cn.json` 体积较大，频繁解析会增加 Worker CPU 时间与延迟；短 TTL 在保持更新及时性的同时显著减少计算与 KV 读取。

**Alternatives considered:**
- 不缓存：实现最简单但性能风险高。
- 长 TTL：性能更好但榜单更新滞后、用户感知差。
- 预先在 KV 中存一份 `leaderboard_cn.json`（已裁剪）：更优但涉及数据生产链路变更，本期不做。

### 5) 前端呈现：无输入、分阵营展示、信息密度适中

**Decision:**
- `/leaderboard` 页面不提供任何输入框与搜索。
- 默认展示两个阵营的榜单：
  - 桌面端：左右双列（凯瑞甘 / 幸存者）
  - 移动端：上下堆叠或标签切换（保持可读性）
- 单行展示：名次、名称（`display_name`）、句柄（`handles`）、MMR。
- 页面顶部（或标题区域）展示“更新时间”，数据来自接口返回的 `generated_at`，并以北京时间（Asia/Shanghai）格式化展示（例如 `YYYY-MM-DD HH:mm`，尾部标注“北京时间”）。

**Why:** 用户目标是“快速看榜”；保持信息密度适中、减少交互复杂度。

**Alternatives considered:**
- 单表混排并加筛选：交互更复杂，且与“无输入”要求冲突。

## Risks / Trade-offs

- **[KV 中 JSON 体积大导致解析耗时]** → 使用 `caches.default` + 短 TTL 缓存裁剪后的结果；必要时后续引入“预裁剪 KV key”作为进一步优化。
- **[KV 绑定或 key 缺失导致 Worker 异常]** → 在读取与解析处做兜底：返回结构化错误 JSON（HTTP 5xx）且不抛出未捕获异常。
- **[KV 数据结构变更导致解析失败]** → Worker 解析层对字段做容错（缺字段返回空列表），并在日志中记录错误，便于排查数据生产链路。
- **[缓存导致榜单短时间不一致]** → 接受短 TTL 的最终一致性；若需要强一致，再调整 TTL 或引入带版本号的 key。

## Migration Plan

1. 确认 KV 已写入 `bridge_cn.json`（生产与 preview 环境均绑定相同 `KS_KV` 或按需要拆分）。
2. Worker 增加 `GET /api/leaderboard`，实现 KV 读取、裁剪/重组、缓存与错误处理。
3. 前端增加 `/leaderboard` 路由页面与导航入口，完成中文 UI。
4. 部署到 preview 验证：
   - `/api/leaderboard` 返回体大小、延迟、缓存命中情况
   - 页面在移动端/桌面端布局与可读性
5. 合并到生产分支触发生产部署。

**Rollback:** 回滚到上一个部署版本即可（移除路由入口与接口）；不涉及数据迁移。

## Open Questions

- （无）
