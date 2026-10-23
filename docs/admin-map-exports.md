# CN 地图私有下载

翻译 MR（feat/cn_text → main）合并后，ks_ai 独立监视器排队启动 CN-Map-Export。Windows Runner 在交互桌面准备并另存完整 SC2Map，不进入发布、登录或短信流程。地图源固定为翻译合并 SHA；素材 SHA、构建 SHA、桥接数据摘要、版本、MR、流水线、大小和 SHA256 写入清单。

完整文件存入 Google Drive 的应用专属私有目录，每个版本一个 SC2Map，清单写入文件元数据。不分块、不提交二进制到 Git，也不公开分享。Worker 创建受限的 resumable upload 会话，CI 直接上传完整文件，再通过 Worker 完整下载核对 SHA256。Worker 再核对 Drive 文件大小、SHA256、目录与清单后发布版本。失败不替换已有目录，后台显示最新 10 个版本；旧地图按下述保留策略自动清理。

后台 /admin 使用固定账号，最多 3 个。没有公开注册或密码重置端点。账号配置 ADMIN_ACCOUNTS 为服务端 secret，记录 username/salt/hash/version。密码必须由安全随机数生成 32 字节并编码为 43 字符 base64url；不支持自选弱密码。保存带 salt 与域分隔的 SHA256 摘要，明文只交付给管理员。轮换凭据时同步更换 version，撤销该账号旧会话。ADMIN_SESSION_SECRET 独立随机生成。会话为 8 小时签名 HttpOnly/Secure/SameSite=Strict Cookie，所有登录/退出要求同源 POST；免费 Worker rate-limit binding 限每 IP、每节点每分钟 8 次尝试（非全局精确限额）。

DRIVE_CLIENT_ID、DRIVE_CLIENT_SECRET、DRIVE_REFRESH_TOKEN、DRIVE_FOLDER_ID 仅作为 Worker 服务端 Secret 保存。OAuth 仅使用 drive.file，限本应用创建或用户明确选中的文件；专属目录也由本应用创建。OAuth 应用需使用正式发布状态，避免测试模式 refresh token 的 7 天有效期。下载只允许目录内已登记版本，经管理员鉴权后流式转发，浏览器与 CI 不持有 Google OAuth 凭据。上传会话 URL 是临时凭据，只返回已认证 CI，禁止记录或重定向。MAP_EXPORT_TOKEN 是独立机器凭据，保存在 ks_ai/log/server/map-export-token（0600）并传给导出 CI，不具备超管权限。三个权限面与原 VERIFY_CODE_TOKEN 配置链路分离。

管理员查看游戏验证码只读 sms_verify_code_v1，遵循原始 180 秒有效期，不清码、不续期。导出准备读取独立只读机器接口，不调用会清码的旧 config/read。

部署使用 Google Drive 免费空间和现有 Workers 免费计划，不开通 Access、R2 或付费订阅；受 Google 账号共享存储空间、Drive API 和 Workers 免费额度限制。验证：pnpm typecheck、pnpm exec tsx --test worker/tests/management.test.ts worker/tests/mapRetention.test.ts、pnpm build。真实验证还须包含 Windows 保存地图、Drive 上传读回和登录后下载摘要核对。

## 自动清理

- 新地图校验、登记成功后异步执行，另有 Workers Cron 每天北京时间 07:30 补扫（UTC 23:30），无需持续运行本地电脑。清理失败不撤销成功登记；错误记录在 Worker 日志，下次登记或定时运行重试。
- 按现有 `merged_at`、`pipeline_id` 排序保留最近 10 个有效版本，仍在后台目录中的文件始终保护。登记先写 Drive 私有标记，再更新 KV；独立保护 Drive 中最新 10 个已登记版本，防止 KV 同步延迟误删。刚登记文件额外保留 1 小时；同一受保护版本的重复文件也先保留。
- 未登记文件的 Drive 创建时间和修改时间均超过 48 小时才清理。新上传须在 24 小时内完成登记，逾期重新上传；给未登记清理留出 24 小时缓冲，已有后台版本不受此限制。旧版未带登记标记的后台文件仍保护，退出目录后适用 48 小时规则。
- 已登记但尚未出现在目录的首次确认可在 30 分钟内重试；之后不能用旧完成请求重新发布已淘汰版本。已在目录中的幂等确认不重写 KV，避免旧区域快照覆盖新目录。
- 仅处理配置的私有目录中、当前用户所有、带本应用 `ks2_export=1` 标记且名称与合法清单一致的 SC2Map。删除前重新检查文件元数据和当前目录；移动、修改、正在上传、身份不明的文件跳过。目录为空、不匹配、分页不完整时停止清理。
- 使用 Drive 文件 DELETE **永久删除**符合条件的旧文件，以释放空间，不累积在回收站。不处理整个云盘、其它目录或超管配置/验证码。每次最多删除 10 个，超出或失败的留到下次；不下载地图正文。
- `POST /api/map-export/cleanup` 使用独立 `MAP_EXPORT_TOKEN`，JSON 必须为 `{"dry_run":true}`（预览）或 `{"dry_run":false}`（执行）。管理员登录不授予此机器维护接口权限。生产 `MAP_RETENTION_ENABLED=true`；预览环境禁用删除和 Cron。

独立 GitLab 流水线计划每天 Asia/Shanghai 06:00 运行，计划页“运行”按钮立即执行同一导出任务。计划使用 ref=main，仅设置 CN_MAP_EXPORT=true 和机器凭据，不固定 CN_MAP_SOURCE_SHA；任务记录此次流水线的实际提交及创建时间，后台标记“计划 / 手动”。翻译触发仍使用对应 MR 合并 SHA。两种入口共用 cn-map-file-export 资源组串行执行。

下载转发使用 Workers 原生 `FixedLengthStream`，保留实际 Content-Length 并校验字节数量。不要替换为逐网络块的 JavaScript TransformStream 计数：真实约 30 MB 下载曾触发 `exceededCpu`，导致 HTTP 200 后截断。CI 必须完整回读并校验 SHA256 后才登记版本。
