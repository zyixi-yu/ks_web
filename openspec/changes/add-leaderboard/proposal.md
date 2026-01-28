## Why

网站目前只有“积分查询 / 钻石议会”两块信息展示，但玩家最关心的“谁强 / 当前排名”缺少一个统一入口。把排行榜做成网站内的独立页面，并通过 Worker 从 KV 读取权威数据源，可以让玩家无需进游戏也能快速查看排名，同时避免前端直连外部源带来的稳定性与 CORS 问题。

## What Changes

- 新增“排行榜”页面（SPA 路由，例如 `/leaderboard`），在导航条中提供入口，页面文案使用中文。
- 新增 Worker API（例如 `GET /api/leaderboard`），从 KV 读取 `bridge_cn.json`，并按方案 B 返回“裁剪/重组后的排行榜数据”（不直接透传原始大 JSON）。
- 前端页面不提供搜索/输入框（只展示排行榜），默认按 MMR 从高到低展示，并区分阵营（Kerrigan / Survivor）。

## Capabilities

### New Capabilities
- `leaderboard`: 在网站中展示游戏排行榜（从 KV 读取 `bridge_cn.json`，通过 Worker API 提供精简后的数据给前端渲染）。

### Modified Capabilities
- （无）

## Impact

- Worker：
  - 增加一个新的 `/api/leaderboard` 路由；需要能访问 KV（读取 key：`bridge_cn.json`）。
  - 需要考虑返回体大小与缓存策略（方案 B 的目标是避免把原始大文件直接下发到浏览器）。
- Web（React SPA）：
  - 增加一个排行榜页面与路由，并在现有导航条上加入入口。
  - 排行榜展示字段参考 `bridge_cn.json` 中用于注入游戏的字段（如 `display_name`、`handles`、`mmr`、`team_str` 等），并确保中文 UI 与可读性（不展示 `games_played`）。
