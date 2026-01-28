## 1. Worker API（/api/player）

- [x] 1.1 新增 `GET /api/player?player_handle=<handle>` 路由与参数校验（缺参返回 400）
- [x] 1.2 从 `env.KS_KV` 读取固定 key：`bridge_cn.json`（KV 绑定缺失/缺 key/JSON 解析失败时返回错误 JSON 且不抛未捕获异常）
- [x] 1.3 从 `bridge_cn.json` 提取 `generated_at`、`mmr_inject[handle]`、`role_id_to_name`、`role_id_to_team` 并做字段容错
- [x] 1.4 计算角色 MMR：`team -> core_mmr -> mmr = core_mmr + class_mmr`，并生成 `roles_survivor`/`roles_kerrigan`
- [x] 1.5 应用过滤规则：仅保留 `plays > 0` 或 `class_mmr != 0` 的角色条目
- [x] 1.6 计算 `win_rate`（`plays > 0` 时为 `wins/plays`，否则为 null），并输出字段满足 spec
- [x] 1.7 增加缓存策略：按 `player_handle` 作为 cache key 使用 `caches.default`（并设置 `Cache-Control: public, max-age=30`）
- [ ] 1.8 手动验证：存在句柄返回 200；不存在句柄返回 404；缺参返回 400；错误场景返回结构化 `error`

## 2. SPA 路由与回退

- [x] 2.1 React Router 增加 `/player` 与 `/player/:handle` 路由
- [x] 2.2 Worker SPA 回退逻辑支持 `/player` 前缀（`/player` 与 `/player/<handle>` 直连可访问），未知路由重定向到首页
- [ ] 2.3 手动验证：直连 `/player/<handle>` 可正常加载页面并触发查询

## 3. 前端页面（/player）

- [x] 3.1 新增“角色数据”页面组件：输入句柄、加载态/错误态/空态
- [x] 3.2 URL 参数支持：`/player/:handle` 自动填充输入框并自动触发查询
- [x] 3.3 查询成功后更新 URL 为 `/player/<handle>`（便于复制分享）
- [x] 3.4 展示“更新时间”：将 `generated_at` 以北京时间格式化为 `YYYY-MM-DD HH:mm` 并标注“北京时间”
- [x] 3.5 展示核心 MMR（幸存者/凯瑞甘）与两个角色列表（幸存者/凯瑞甘）
- [x] 3.6 列表条目直接展示：`role_name`、`mmr`、`class_mmr`、`wins`、`plays`、`win_rate`（plays=0 时显示 `--`）

## 4. 查询历史复用（积分页 + 角色页）

- [x] 4.1 抽取“最近查询句柄”读写为公共模块（同一 storage key、去重、按时间倒序）
- [x] 4.2 积分页与角色页复用同一份历史：仅查询成功写入；点击历史可一键触发查询
- [ ] 4.3 手动验证：两页历史互通且行为一致

## 5. 回归与部署验证

- [x] 5.1 本地 `pnpm typecheck` 与 `pnpm build` 通过
- [ ] 5.2 preview 部署验证：`/player`、`/player/<handle>`、`/api/player` 正常；现有页面（积分/议会/排行榜）无回归
