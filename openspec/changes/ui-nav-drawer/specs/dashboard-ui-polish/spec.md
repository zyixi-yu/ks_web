## ADDED Requirements

### Requirement: 排行榜列表移除冗余提示并保持可点击暗示
系统 MUST 在排行榜列表中移除每行“点击查看详情”等冗余提示文本，同时 MUST 提供更标准的可点击暗示（例如右侧 chevron 图标与 hover/active 反馈），并在列表区域仅提示一次交互方式。

#### Scenario: 用户识别榜单条目可点击
- **WHEN** 用户打开排行榜页面
- **THEN** 页面 MUST 在榜单区域提供一次性提示（例如“点击行查看详情”）
- **THEN** 每行 MUST 具备可点击暗示（例如 chevron 图标），且不出现逐行冗余提示

### Requirement: 导航项展示统一图标
系统 SHOULD 为 Drawer 中的导航项提供统一风格的图标（内联 SVG，24x24），以提高可扫性并减少阅读负担。

#### Scenario: 导航列表易于扫读
- **WHEN** 用户打开 Drawer
- **THEN** 每个导航项 SHOULD 同时展示图标与短标题
