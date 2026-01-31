## Why

需要一个轻量、可复用的“短信验证码桥接”能力：上游服务将短信全文推送到 Worker，由 Worker 提取 6 位验证码并以 3 分钟有效期写入 KV；下游服务再通过鉴权读取当前验证码。这样可以把验证码的接收/解析/短期存储集中在边缘侧，减少中间系统复杂度。

## What Changes

- 新增写验证码接口：接收 `sms` 文本，提取最后一个 6 位数字验证码，写入 KV（3 分钟 TTL，重复写覆盖）。
- 新增读验证码接口：鉴权后读取 KV 中当前验证码与元信息（无缓存）。
- API 统一使用 `Authorization: Bearer <token>` 鉴权；写接口允许 `POST`，读接口使用 `GET`。

## Capabilities

### New Capabilities

- `verify-code-api`: 提供短信验证码的写入与读取（基于 KV，3 分钟有效期，鉴权访问）。

### Modified Capabilities

- （无）

## Impact

- Worker：新增 `/api/verify-code/write` 与 `/api/verify-code/read` 两个接口；CORS 允许 `POST` 与 `Authorization` 头；读接口禁用缓存。
- KV：新增一个固定 key（例如 `sms_verify_code_v1`）用于存储当前验证码与创建时间。

