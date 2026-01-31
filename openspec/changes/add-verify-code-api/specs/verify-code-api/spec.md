## ADDED Requirements

### Requirement: 写入短信验证码
系统 SHALL 提供写入接口以接收短信全文，并从短信文本中提取验证码后写入 KV。验证码为全局唯一，重复写入 SHALL 覆盖旧值。验证码 SHALL 具备 3 分钟有效期。

#### Scenario: 鉴权成功且短信包含验证码
- **WHEN** 客户端以 `POST /api/verify-code/write` 请求，携带 `Authorization: Bearer <token>`，并在 JSON body 中提供 `sms`
- **THEN** 系统 SHALL 从 `sms` 中提取“最后一个” 6 位数字作为 `code`
- **THEN** 系统 SHALL 将 `code` 写入 KV 的固定 key（例如 `sms_verify_code_v1`），并设置 180 秒 TTL
- **THEN** 系统 SHALL 返回 `200` 且响应包含 `expires_in: 180`

#### Scenario: 鉴权失败
- **WHEN** 客户端调用 `POST /api/verify-code/write` 但缺失或提供错误的 `Authorization` token
- **THEN** 系统 SHALL 返回 `401`

#### Scenario: 短信不包含可提取的 6 位验证码
- **WHEN** 客户端鉴权成功调用 `POST /api/verify-code/write`，但 `sms` 中不存在可提取的 6 位数字验证码
- **THEN** 系统 SHALL 返回 `400`

### Requirement: 读取短信验证码
系统 SHALL 提供读取接口以返回当前验证码与元信息。读取接口 SHALL 鉴权，且 SHALL 禁用缓存以避免返回过期/旧验证码。

#### Scenario: 鉴权成功且验证码存在
- **WHEN** 客户端以 `GET /api/verify-code/read` 请求并携带 `Authorization: Bearer <token>`
- **THEN** 系统 SHALL 从 KV 固定 key 读取当前验证码与创建时间
- **THEN** 系统 SHALL 返回 `200` 且响应包含 `code`、`created_at`、`expires_in`
- **THEN** 系统 SHALL 设置 `Cache-Control: no-store`

#### Scenario: 鉴权成功但验证码不存在（过期或未写入）
- **WHEN** 客户端鉴权成功调用 `GET /api/verify-code/read`，但 KV 中不存在当前验证码
- **THEN** 系统 SHALL 返回 `404`

#### Scenario: 鉴权失败
- **WHEN** 客户端调用 `GET /api/verify-code/read` 但缺失或提供错误的 `Authorization` token
- **THEN** 系统 SHALL 返回 `401`

