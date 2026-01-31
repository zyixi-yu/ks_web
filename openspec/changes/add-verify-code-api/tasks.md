## 1. 配置与鉴权

- [x] 1.1 增加环境变量 `VERIFY_CODE_TOKEN`（部署侧配置，不写入仓库）
- [x] 1.2 在 Worker 增加鉴权解析（`Authorization: Bearer <token>`），并实现常量时间比较

## 2. 写验证码接口

- [x] 2.1 新增 `POST /api/verify-code/write` 路由与请求体校验（JSON: `sms`）
- [x] 2.2 实现短信验证码提取：匹配短信中“最后一个” 6 位数字；失败返回 400
- [x] 2.3 写入 KV 固定 key（`sms_verify_code_v1`）并设置 TTL=180 秒（覆盖写）

## 3. 读验证码接口

- [x] 3.1 新增 `GET /api/verify-code/read` 路由
- [x] 3.2 从 KV 读取当前验证码与创建时间；不存在返回 404
- [x] 3.3 返回 `code/created_at/expires_in` 并设置 `Cache-Control: no-store`

## 4. 跨域与验证

- [x] 4.1 更新 `/api/*` CORS 允许 `POST` 方法与 `Authorization` 头
- [x] 4.2 本地通过 wrangler（非 mock）验证：写入后可读取，180 秒后不可读取
