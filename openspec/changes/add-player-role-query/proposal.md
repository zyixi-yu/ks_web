## Why

目前网站能查积分与排行榜，但玩家想了解“自己某个句柄在游戏内被注入/使用的角色数据（核心 MMR、角色修正、胜场/场次等）”只能进游戏查看或依赖外部工具。把这套数据做成网站内的可直达查询页，并从 KV 读取与地图注入同源的 `bridge_cn.json`，可以让玩家快速自助查询、分享链接直达，减少沟通成本。

## What Changes

- 新增“角色数据”页面（SPA 路由 `/player`），提供输入句柄查询玩家的角色数据；页面文案使用中文。
- 支持可分享的直达链接：`/player/<handle>`（例如 `/player/5-S2-1-10252842`）直接展示对应玩家数据。
- 新增 Worker API：`GET /api/player?player_handle=<handle>`，从 KV 的 `bridge_cn.json` 读取并裁剪/重组玩家数据返回（不透传整份大 JSON）。
- 查询历史在“积分查询”与“角色数据”页面复用：仅查询成功才写入本地历史记录，点击历史可一键再次查询。

## Capabilities

### New Capabilities
- `player-role-query`: 按句柄查询并展示玩家的“角色数据”（来自 KV `bridge_cn.json.mmr_inject`，按游戏消费逻辑计算角色 MMR，并支持 `/player/<handle>` 直达）。

### Modified Capabilities
- （无）

## Impact

- Worker：
  - 新增 `/api/player` 路由，读取 KV `bridge_cn.json` 并从中提取 `mmr_inject[handle]`、`generated_at`、`role_id_to_name`、`role_id_to_team`，返回精简结构。
  - 需要为 `/player` 与 `/player/<handle>` 提供稳定的 SPA 回退（直接输入 URL 可访问；未知路由重定向首页）。
  - 由于 `bridge_cn.json` 体积较大，需要评估与实现缓存策略以降低频繁解析带来的 CPU/延迟压力。
- Web（React SPA）：
  - 新增 `/player` 与 `/player/:handle` 路由页面与导航入口。
  - 抽取并复用“最近查询记录”逻辑，在积分/角色页共享同一份历史。
