## 1. Worker API（/api/leaderboard）

- [ ] 1.1 在 Worker 路由中新增 `GET /api/leaderboard` 处理逻辑
- [ ] 1.2 从 `env.KS_KV` 读取固定 key：`bridge_cn.json`（缺失绑定/缺 key 时返回错误 JSON 且不抛未捕获异常）
- [ ] 1.3 解析 `bridge_cn.json`：提取 `generated_at` 与 `leaderboard` 数据结构（对字段缺失做容错）
- [ ] 1.4 将“列式 leaderboard”重组为“行式条目”：`rank`、`display_name`、`handles[]`、`mmr`、`team_name`（中文：`凯瑞甘`/`幸存者`）
- [ ] 1.5 按 `mmr` 倒序排序并做稳定 tie-break（`identity` 或 `display_name`），固定截断每阵营 Top 50，生成 `boards.kerrigan` 与 `boards.survivor`
- [ ] 1.6 确保返回体不包含 `games_played`
- [ ] 1.7 增加缓存策略：使用 `caches.default` 缓存 `/api/leaderboard` 响应，并设置 `Cache-Control: public, max-age=30`
- [ ] 1.8 追加手动验证：本地与线上分别请求 `/api/leaderboard`，确认字段、条数、排序与错误场景符合 `specs/leaderboard/spec.md`

## 2. 前端页面（/leaderboard）

- [ ] 2.1 增加 `/leaderboard` 路由与页面组件（中文文案）
- [ ] 2.2 页面加载时请求 `GET /api/leaderboard`，实现加载态/错误态
- [ ] 2.3 “更新时间”展示：将 `generated_at` 以北京时间（Asia/Shanghai）格式化为 `YYYY-MM-DD HH:mm` 并标注“北京时间”
- [ ] 2.4 榜单 UI：分别展示“凯瑞甘榜 / 幸存者榜”，桌面端双列、移动端自适应（或 Tab 切换）
- [ ] 2.5 条目展示字段：`rank`、`display_name`、`handles`、`mmr`；不展示 `games_played`
- [ ] 2.6 追加手动验证：移动端/桌面端检查对齐与可读性，确认 Top 50 与排序正确

## 3. 导航与集成

- [ ] 3.1 在现有导航条加入“排行榜”入口，并确保与现有 SPA 路由兼容（刷新不 1101）
- [ ] 3.2 确认开发环境 `vite` 代理（/api）在本地可直连线上 worker 或本地 worker（按现有配置）

## 4. 部署与回归检查

- [ ] 4.1 部署到 preview 分支验证：`/leaderboard`、`/api/leaderboard`、现有页面（积分查询/钻石议会）无回归
- [ ] 4.2 观察 Worker Logs：确保无未捕获异常、缓存策略生效、响应体大小可接受
- [ ] 4.3 合并到生产分支触发生产部署并做一次抽查
