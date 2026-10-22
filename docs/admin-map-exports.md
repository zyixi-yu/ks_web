# CN 地图私有下载

翻译 MR（feat/cn_text → main）合并后，ks_ai 独立监视器排队启动 CN-Map-Export。Windows Runner 在交互桌面准备并另存完整 SC2Map，不进入发布、登录或短信流程。地图源固定为翻译合并 SHA；素材 SHA、构建 SHA、桥接数据摘要、版本、MR、流水线、大小和 SHA256 写入清单。

完整文件存入私有 GitLab 项目 zyixi/ks-cn-map-downloads（52）的 Generic Package Registry，每个版本一个 SC2Map 和 manifest.json，不分块、不提交二进制到 Git。目标项目只允许源项目 34 的 CI_JOB_TOKEN 跨项目访问；运行任务的用户还必须有目标项目权限。上传后完整下载核对摘要再发布目录。失败不替换已有目录，后台显示最新 10 个版本。历史包暂不自动删除。

后台 /admin 使用固定账号，最多 3 个。没有公开注册或密码重置端点。账号配置 ADMIN_ACCOUNTS 为服务端 secret，记录 username/salt/hash/version。密码必须由安全随机数生成 32 字节并编码为 43 字符 base64url；不支持自选弱密码。保存带 salt 与域分隔的 SHA256 摘要，明文只交付给管理员。轮换凭据时同步更换 version，撤销该账号旧会话。ADMIN_SESSION_SECRET 独立随机生成。会话为 8 小时签名 HttpOnly/Secure/SameSite=Strict Cookie，所有登录/退出要求同源 POST；免费 Worker rate-limit binding 限每 IP、每节点每分钟 8 次尝试（非全局精确限额）。

MAP_PACKAGE_READ_TOKEN 是项目 52 的独立 read_package_registry deploy token，仅 Worker 持有。下载只允许目录内版本，经鉴权流式转发，无公开桶或存储令牌。MAP_EXPORT_TOKEN 是独立机器凭据，保存在 ks_ai/log/server/map-export-token（0600）并传给导出 CI，不具备超管权限。三个权限面与原 VERIFY_CODE_TOKEN 配置链路分离。

管理员查看游戏验证码只读 sms_verify_code_v1，遵循原始 180 秒有效期，不清码、不续期。导出准备读取独立只读机器接口，不调用会清码的旧 config/read。

部署使用现有 GitLab 和 Workers 免费计划，不开通 Access、R2 或付费订阅；受现有实例存储容量与 Workers 免费额度限制。验证：pnpm typecheck、pnpm exec tsx --test worker/tests/management.test.ts、pnpm build。真实验证还须包含 Windows 保存地图、跨项目上传读回和登录后下载摘要核对。
