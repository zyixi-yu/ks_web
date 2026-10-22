# 管理后台与 CN 地图文件导出

翻译 MR（`feat/cn_text` → `main`）合并后，ks_ai 的 `CnMapExportMonitor` 为该合并提交创建一次 `CN-Map-Export` 流水线。它与现有战网发布监视器独立；导出只执行 CN 内容准备、Editor 另存为、MPQ 校验、私有上传及回读校验，不调用战网登录/发布，不改变飞书地图轮转状态。

## 权限边界

- `/admin`、`/admin/api/*`：Cloudflare Access 签名 JWT、指定 AUD/issuer、精确管理员邮箱白名单。不能仅凭邮箱请求头访问。
- `/admin/api/maps`：最近 10 个成功导出的版本，按合并时间排序；可任选一个下载。
- `/admin/api/verification-code`：只读当前未过期的短信验证码；不清除或续期。
- `/api/config/*`：继续原来的超管 token 权限；管理员 JWT 不赋予配置权限。
- `/api/map-export/*`：独立机器 token。仅提供导出所需的白名单配置和 bridge 快照，或校验上传并发布目录；不调用会清码的旧 config/read。
- GitLab 包保持私有。下载由 Worker 后端流式代理，项目只读部署令牌不会给浏览器。

## 生产配置

Worker secrets：`MAP_EXPORT_TOKEN`、`MAP_PACKAGE_READ_TOKEN`。
Worker variables：`ACCESS_TEAM_DOMAIN`（完整 https issuer）、`ACCESS_AUD`、`ADMIN_EMAILS`（逗号分隔完整邮箱）。

`MAP_PACKAGE_READ_TOKEN` 必须是项目 34 的部署令牌，仅勾选 `read_package_registry`，由项目 Maintainer 创建。不要用管理员 PAT 或 CI 临时 job token 代替长期下载凭证。

Access 自托管应用路径 `ks.194823.xyz/admin`，覆盖其子路径；邮箱 OTP，精确白名单，8 小时会话。Worker 二次验证确保其他域名或 workers.dev 入口不能绕过权限。若免费套餐激活要求绑卡/超额计费授权，先完成用户选择，不能擅自升级或同意扣费。

ks_ai 本机机器 token 放入 `log/server/map-export-token`，权限 0600，不提交 Git。监视器状态在 `log/server/cn-map-export-state.json`；首次仅补建最新一次真实翻译合并，之后处理新合并。POST 前持久化待对账状态；网络结果不明时根据 `CN_MAP_EXPORT_KEY` 查询，不盲重发。已失败构建保留失败结果，不无限重试。

## 元数据和完整性

每个版本保存 source SHA、构建代码 SHA、场景素材 SHA、bridge SHA256、翻译 MR、流水线、地图编号/版本/名称、合并/构建时间、大小与地图 SHA256。

文件先上传至项目 34 Generic Package `cn-map-export/<sourceSHA>-<pipelineID>/KerriganSurvival2_CN.SC2Map`，CI 下载回读核对大小和 SHA256 后才上传 manifest 并更新目录。Worker 再核对私有 manifest 和文件大小，失败保留已有目录。界面只列最新 10 个；更老的包暂保留于 GitLab，不宣称已实现存储清理。

## 验证

`pnpm exec tsx --test worker/tests/management.test.ts`、`pnpm typecheck`、`pnpm build`。
生产验收必须包括实际 Editor 导出、私有包回读、允许邮箱登录、任选旧版本下载 hash 核对、未登录/伪造请求拒绝、超管配置权限隔离。合成 UI 数据和本地 JWT 测试不替代生产验收。
