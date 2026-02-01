## ADDED Requirements

### Requirement: 提供本地化翻译搜索 API
系统 MUST 提供一个只读搜索接口，用于在本地化中文文本中进行子串检索，并返回中英对照的分页结果。系统 MUST 从 Cloudflare KV 的 `ks_gs_new_cn` 与 `ks_gs_new_en` 中读取词库数据（格式为 `key=value`，按 key 一一对应）。

#### Scenario: 按中文关键词搜索并分页返回
- **WHEN** 客户端以 `GET /api/i18n/search?q=<查询>&page=<页码>&pageSize=<大小>` 请求搜索
- **THEN** 系统 MUST 对中文文本做子串匹配并返回分页结果
- **THEN** 返回结果 MUST 包含 `total`、`page`、`pageSize` 与 `items`
- **THEN** `items` 中每项 MUST 包含 `key`、`en`、`cn`

#### Scenario: 支持多关键词 AND 搜索
- **WHEN** `q` 包含多个关键词（以空白分隔）
- **THEN** 系统 MUST 仅返回同时包含所有关键词的条目

#### Scenario: 缺失参数的处理
- **WHEN** `q` 为空或仅包含空白
- **THEN** 系统 MUST 返回空结果（`total=0`，`items=[]`），且不报错

### Requirement: 清洗并规范化展示文本
系统 MUST 在返回结果前清洗 SC2 本地化标签，以便前端直接展示纯文本内容。

#### Scenario: 换行标签渲染为换行
- **WHEN** 文本包含换行标签（例如 `<n/>`，大小写不敏感）
- **THEN** 系统 MUST 将其转换为换行符 `\n`

#### Scenario: 数值引用标签渲染为 X
- **WHEN** 文本包含数值引用标签（例如 `<d ref=\"...\"/>`，大小写不敏感）
- **THEN** 系统 MUST 将其转换为大写占位符 `X`

#### Scenario: 其他标签不应在展示文本中出现
- **WHEN** 文本包含其他本地化标签（例如 `<c ...>...</c>`、`<img .../>` 等）
- **THEN** 系统 MUST 在展示文本中去除这些标签（保留可见文字内容）

### Requirement: Web 提供翻译搜索页面
Web MUST 提供一个独立页面用于翻译搜索，并通过导航入口可访问。页面 MUST 支持中文查询、分页（默认每页 20）以及展示 key/英文/中文三列信息。

#### Scenario: 用户在页面中搜索并翻页
- **WHEN** 用户在“翻译搜索”页面输入中文并提交
- **THEN** 页面 MUST 调用搜索 API 并展示结果列表
- **THEN** 页面 MUST 支持分页切换，并在翻页时请求对应页数据
