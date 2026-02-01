## ADDED Requirements

### Requirement: 站点提供抽屉式导航
系统 MUST 在所有页面顶部提供 App Bar，并通过“菜单按钮”打开抽屉式导航（Drawer）。导航条目 MUST 使用精简中文短标签，并可在移动端良好显示。

#### Scenario: 用户打开抽屉查看导航入口
- **WHEN** 用户点击 App Bar 的菜单按钮
- **THEN** 系统 MUST 打开 Drawer 并展示所有导航入口

#### Scenario: 用户关闭抽屉
- **WHEN** 用户点击遮罩或按下 ESC
- **THEN** 系统 MUST 关闭 Drawer

#### Scenario: 用户通过抽屉切换页面
- **WHEN** 用户在 Drawer 中点击任意导航项
- **THEN** 系统 MUST 跳转到对应路由并关闭 Drawer

### Requirement: 导航文案在 PC 与移动端均精简
系统 MUST 使用短标签化导航文案：`积分`、`议会`、`排行`、`角色`、`翻译`。系统 MAY 在大屏展示副标题，但在移动端 MUST 隐藏或显著弱化副标题以避免拥挤。

#### Scenario: 移动端不出现拥挤换行
- **WHEN** 用户在移动端浏览任意页面
- **THEN** App Bar MUST 保持单行紧凑布局，且不因导航入口过多导致换行挤压

