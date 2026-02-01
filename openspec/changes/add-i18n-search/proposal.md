## Why

目前网站缺少“玩家搜索翻译”的能力，查找 SC2 本地化文本需要人工打开大文件、手动搜索，效率低且不便于统一分享与复用。

## What Changes

- 新增一个“翻译搜索”页面（导航 Tab），支持按中文子串搜索，并分页展示匹配结果。
- 新增一个搜索 API（Worker）：从 KV 读取并缓存 `ks_gs_new_cn` / `ks_gs_new_en` 两份本地化文件，提供中文搜索与分页返回。
- 展示时对 SC2 本地化标签做清洗：换行标签转换为换行、数值引用标签以 `X` 占位，其他标签忽略/去除。

## Capabilities

### New Capabilities

- `i18n-translation-search`: 提供 SC2 本地化中英文对照的中文搜索与分页展示能力。

### Modified Capabilities

（无）

## Impact

- Worker：新增 `/api/i18n/search` 接口与 KV 读取/缓存逻辑（数据来自 KV，更新频率低，允许一定延迟刷新）。
- Web：新增一个路由页面与导航入口；新增搜索表单、分页与结果列表 UI。
