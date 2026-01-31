## Context

当前项目使用 Cloudflare Worker（Hono 路由）提供 `/api/*` 数据接口，并使用 KV 存储较大 JSON（如 `bridge_cn.json`）。本次新增“短信验证码桥接”能力：上游服务推送短信全文，Worker 提取最后一个 6 位验证码并写入 KV（3 分钟有效期）；下游服务通过鉴权读取当前验证码。

约束：
- 验证码不绑定玩家/会话，属于“全局唯一”的当前验证码。
- 鉴权仅使用固定 token（可手动轮换），通过 `Authorization: Bearer <token>` 传入。
- 读接口必须禁止缓存，避免旧验证码被缓存导致误用。
- 本功能不需要适配本地 mock KV（写入端可以使用真实 KV 或本地 wrangler KV）。

## Goals / Non-Goals

**Goals:**
- 提供两个稳定的 API：
  - `POST /api/verify-code/write`：鉴权 + 提取验证码 + 写入 KV（3 分钟 TTL，覆盖写）。
  - `GET /api/verify-code/read`：鉴权 + 读取当前验证码（禁用缓存）。
- 兼容现有 Worker/Hono 架构与 KV 绑定方式。
- 输出与错误码明确，便于上游/下游自动化对接。

**Non-Goals:**
- 不做验证码加密下发（鉴权已足够，且客户端为服务端）。
- 不实现验证码与玩家/手机号/会话的绑定。
- 不实现多验证码队列、历史追溯、审计等能力。
- 不实现本地 mock 写入闭环（mock KV 当前为只读，避免影响既有测试夹具）。

## Decisions

1) **鉴权方式：`Authorization: Bearer <token>`**
- 选择原因：标准做法、传输简单；token 可通过环境变量配置并可手动轮换。
- 替代方案：Body 传 token；被拒绝（GET body 不可靠，且多处需要重复解析）。

2) **KV 存储结构：固定 key + JSON value + TTL**
- Key：`sms_verify_code_v1`
- Value：`{"code":"123456","created_at":<unix_ts>}`
- TTL：180 秒（3 分钟）
- 选择原因：全局唯一、覆盖写满足需求；JSON 便于后续扩展与排查（例如增加 `source`、`sms_hash`）。

3) **验证码提取规则：取短信文本中“最后一个” 6 位数字**
- 正则：优先使用“非更长数字的一部分”的匹配（例如 `(?<!\\d)\\d{6}(?!\\d)`）。
- 选择原因：短信中可能包含多段数字（例如电话、订单号、流水号），最后一个更接近验证码的常见格式。

4) **缓存策略**
- `GET /api/verify-code/read`：设置 `Cache-Control: no-store`，并且不使用 Worker `caches.default`。
- 其他 API 仍可保持现有缓存策略。

5) **CORS / Headers**
- `/api/*` 统一 CORS 中间件需要允许 `POST` 与 `Authorization` 头（即使当前客户端为服务端，也能方便浏览器/脚本调试）。

## Risks / Trade-offs

- [Token 泄露] → 读写均可被滥用 → 通过手动轮换 token、避免在日志中输出 token、限制调用来源（可选）缓解。
- [短信格式变化导致提取失败] → 无法写入验证码 → 将错误码与错误信息标准化（400 + 明确 message），便于上游监控与回退。
- [缓存导致读取旧验证码] → 下游使用错误验证码 → 读接口强制 `no-store`，不走边缘缓存。

