# Phainon 优先的 Priestess 扫码登录设计

## 目标

Priestess v1 实现 OIDC 扫码登录、本地用户会话和 Passkey 主登录能力，后续按 Phainon 的 Worker/Hono/D1 结构合并到 `/Users/rakko/Documents/GitHub/Phainon`。当前目标不是复刻完整 Kita/Casdoor IAM，而是做一个稳定、可迁移、可测试的最小登录平台。

## 参考来源

- Kita 后端状态机：`/Users/rakko/Documents/GitHub/kita/object/qr_login.go`
- Kita 后端路由：`/Users/rakko/Documents/GitHub/kita/controllers/qr_login.go`
- Kita PC 端二维码面板：`/Users/rakko/Documents/GitHub/kita/web/src/auth/QrLoginPanel.js`
- Kita 手机确认页：`/Users/rakko/Documents/GitHub/kita/web/src/mobileauth/src/components/ScanLoginConfirm.tsx`

复用重点是流程和状态语义，不直接引入 Kita 的 Go 运行时、完整应用模型、外部地理位置 API 或 Casdoor 全量 IAM 表。

## Phainon 合并形状

新增模块放在 Phainon 的 `src/features/priestess/`：

- `repository.ts`：本地用户、用户会话、QR 登录会话的领域类型和 repository 接口。
- `d1.ts`：D1 持久化实现。
- `session.ts`：本地用户登录 cookie、peppered bcrypt 密码校验、会话读写。
- `request-context.ts`：可信请求上下文读取；生产只信 Cloudflare 请求信息，本地/私网调试才接受 `X-Forwarded-For` / `X-Real-IP`。
- `login-risk.ts`：本地密码登录软锁策略、风险 bucket hash 和脱敏上下文。
- `passkeys.ts`：Passkey options、verification、credential 管理和审计。
- `routes.ts`：公开登录接口、二维码接口和管理员用户管理接口。

`src/features/oidc/routes.ts` 保留现有外部 OIDC 流程；新增 `AUTH_LOGIN_MODE=external_oidc|local_qr`。默认值为 `external_oidc`，未开启时生产行为不变。开启 `local_qr` 后，`/auth/login?app_id=...&return_to=...` 会跳转到 `/auth-ui/login` 的二维码页面。

## Phainon 兼容基线

- Priestess 仓库内若临时加入后端、mock server、API proxy 或本地调试服务，只能作为 Phainon 兼容层使用；真实生产后端以 Phainon Worker/Hono/D1 实现为准。
- API path、HTTP method、Cookie 名称、JSON 字段、错误码、QR 状态机、Passkey 校验约束和审计事件必须能直接映射到 Phainon 的实现，避免前端和后端各自形成一套协议。
- `src/lib/priestessApi.ts` 可以兼容 Phainon 迁移过程中的 response envelope 差异，但不能依赖只存在于本项目 mock 里的特殊字段；新增兼容分支时要在本文档同步说明真实后端含义。
- 本地联调使用 `VITE_PRIESTESS_API_BASE_URL` 指向 Phainon 兼容后端。没有显式 API base 时，请求只能落到同源生产部署或受控预览环境，不能静默请求 Vite dev server 假装成功。
- 密码 pepper、管理员密码、session secret、Passkey 配置和长期 token 只允许通过 1Password CLI、Wrangler secret 或运行时环境变量注入，不进入 Priestess 仓库。
- 如果某个页面流程必须依赖 Phainon 尚未实现的能力，应把缺口记录为后端接入事项；前端只能做清晰失败态或受控 mock，不做会掩盖生产缺口的永久绕行。

## API

### PC 端二维码流程

- `POST /auth/qr/sessions`
  - 输入：`app_id`、`return_to`
  - 行为：校验 Phainon 现有 OIDC app 和 return URL，创建 QR session。
  - 输出：`session_id`、`qr_url`、`expires_in`、`expires_at`

- `GET /auth/qr/sessions/:sessionId/status`
  - 行为：PC 轮询二维码状态。
  - 安全约束：创建 QR session 时服务端同时下发 HttpOnly `phainon_priestess_qr_poll` cookie；状态轮询必须带同一会话的 cookie，避免只凭二维码里的 `sessionId` 窃取 `login_code`。
  - 输出：`pending`、`scanned`、`pre_confirmed`、`confirmed`、`rejected`、`expired`
  - 当状态首次进入 `confirmed` 时生成一次性 `login_code`，并返回带 hash 参数的 `redirect_url`。
  - 过期会话通过正常轮询路径标记为 `expired`，PC poll cookie 也会随终态清理。

### 手机端确认流程

- `GET /auth/qr/sessions/:sessionId`
  - 需要本地用户 session cookie。
  - 需要可信 `Origin` 或 `Referer`，因为该读取会把状态推进到 `scanned`。
  - 首次读取会把状态从 `pending` 推进到 `scanned`。

- `POST /auth/qr/sessions/:sessionId/confirm`
  - 需要本地用户 session cookie。
  - 输入：`action=confirm|reject`
  - `reject` 直接进入 `rejected`。
  - `confirm` 会按 Cloudflare 请求头粗略计算风险等级：
    - 同 IP、本地/私网、或同 `CF-IPCountry` 且同 `CF-Ray` colo，判定 Level 1，直接 `confirmed`。
    - 其它情况判定 Level 2，进入 `pre_confirmed`，需要二次确认。
  - 响应额外返回 `security_reason`：`same_ip`、`local_network`、`same_region`、`unknown_context`、`different_region`。

- `POST /auth/qr/sessions/:sessionId/confirm-final`
  - 需要本地用户 session cookie。
  - 只允许最初点击确认的同一用户完成二次确认。

### 本地用户登录

- `GET /auth/local/session`：读取当前本地用户会话。
- `POST /auth/local/session`：用户名密码登录，设置 HttpOnly cookie。
- `DELETE /auth/local/session`：撤销当前本地用户会话。

密码保存策略：

- 新密码写入格式为 `v2.bcrypt-pepper.$2b$...`。
- 写入前先做 `HMAC-SHA-256(PRIESTESS_PASSWORD_PEPPER, password)`，再对 HMAC 结果做 bcrypt。
- `PRIESTESS_PASSWORD_PEPPER` 必须通过 1Password CLI / Wrangler secret 注入，不进入仓库。
- 旧版裸 bcrypt hash 仍可校验；成功登录后会自动升级为 v2。升级缺少 pepper 时返回配置错误，不写回半成品 hash。
- 新密码长度要求 12 到 4096 字符，管理员创建和重置使用同一策略。
- 不存在用户仍执行固定假 bcrypt 校验，避免用户名枚举侧信道。
- 密码登录失败会写入 `auth_local_login_risk_buckets` 软锁 bucket：
  - 同一用户名+IP 10 分钟内 8 次失败，锁定密码登录 10 分钟。
  - 同一用户名 30 分钟内 20 次失败，锁定密码登录 30 分钟。
  - bucket key、username 和 IP 都只保存加盐 hash；上下文只保存国家、colo、masked IP 和 UA。
  - 成功密码登录会清理对应风险 bucket；Passkey 登录不受密码软锁影响。

### Passkey 登录

- `POST /auth/local/passkeys/registration/options`
  - 需要本地用户 session。
  - 生成 WebAuthn registration options，默认 `residentKey=required`、`userVerification=required`。

- `POST /auth/local/passkeys/registration/verify`
  - 需要本地用户 session。
  - 校验 challenge、expected origin、RP ID 和用户验证；成功后保存 credential。

- `POST /auth/local/passkeys/authentication/options`
  - 无需用户名，生成 discoverable credential 登录 options。
  - 服务端只保存 `challenge_hash`，不保存明文 challenge。

- `POST /auth/local/passkeys/authentication/verify`
  - 校验 challenge、expected origin、RP ID、user verification 和 counter。
  - 成功后更新 credential counter / `last_used_at`，并创建现有 `phainon_priestess_session` cookie。

- `GET /auth/local/passkeys`
  - 当前用户列出自己的 Passkey，不返回 public key。

- `DELETE /auth/local/passkeys/:credentialId`
  - 当前用户禁用自己的 Passkey；密码回退仍作为 v1 可用恢复路径。

默认配置：

- `PASSKEY_RP_ID=phainon.rakko.cn`
- `PASSKEY_RP_NAME=Phainon Priestess`
- `PASSKEY_EXPECTED_ORIGIN=https://phainon.rakko.cn`
- `PASSKEY_CHALLENGE_TTL_SECONDS=300`

Passkey 私钥永远只在用户设备或平台 authenticator 内；服务端只保存 credential id、公钥、counter、transports、device type、backup 状态和必要审计信息。

### 管理员用户维护

- `GET /admin/priestess/users`：列出本地用户，不回显密码哈希。
- `POST /admin/priestess/users`：创建本地用户，需要 admin session 和管理员密码确认。
- `PUT /admin/priestess/users/:userId`：更新显示名、邮箱、启用状态或重置密码，需要 admin session 和管理员密码确认。
- `GET /admin/priestess/qr-sessions?status=&limit=`：列出最近 QR session，返回脱敏后的 PC/Phone context，不返回 poll token hash 或 login code hash。
- `DELETE /admin/priestess/qr-sessions/:sessionId`：管理员强制将 QR session 标记为 `expired`，需要 admin session 和管理员密码确认。
- `GET /admin/priestess/login-risk?status=locked&limit=`：列出本地密码登录风险 bucket；返回 bucket key、scope、失败次数、锁定时间和脱敏上下文，不返回 hash 材料。
- `DELETE /admin/priestess/login-risk/:bucketKey`：管理员清除一个登录风险 bucket，需要 admin session 和管理员密码确认。
- `GET /admin/priestess/users/:userId/passkeys`：管理员查看用户 Passkey，不返回 public key。
- `DELETE /admin/priestess/users/:userId/passkeys/:credentialId`：管理员强制禁用用户 Passkey，需要 admin session 和管理员密码确认。

真实密码或临时密码不得写入仓库；如需保存长期值，应放入 1Password CLI 管理。

## D1 表

新增 migration：`0033_priestess_qr_login.sql`、`0034_priestess_login_risk.sql`。

- `auth_local_users`
  - `user_id`
  - `username`
  - `display_name`
  - `email`
  - `password_hash`
  - `enabled`
  - `created_at`
  - `updated_at`

- `auth_local_user_sessions`
  - `session_id`
  - `user_id`
  - `token_hash`
  - `created_at`
  - `expires_at`
  - `revoked_at`
  - `last_used_at`
  - `ip_address`
  - `user_agent`

- `auth_qr_login_sessions`
  - `session_id`
  - `app_id`
  - `return_to`
  - `status`
  - `confirmed_user_id`
  - `pc_context_json`
  - `phone_context_json`
  - `poll_token_hash`
  - `security_level`
  - `created_at`
  - `expires_at`
  - `updated_at`
  - `login_code_hash`
  - `login_code_issued_at`
  - `rejected_at`

- `auth_passkey_credentials`
  - `credential_id`
  - `user_id`
  - `public_key`
  - `counter`
  - `transports_json`
  - `device_type`
  - `backed_up`
  - `name`
  - `created_at`
  - `last_used_at`
  - `disabled_at`

- `auth_passkey_challenges`
  - `challenge_id`
  - `purpose`
  - `user_id`
  - `challenge_hash`
  - `expires_at`
  - `consumed_at`
  - `context_json`
  - `created_at`

- `auth_local_login_risk_buckets`
  - `bucket_key`
  - `scope`
  - `subject_hash`
  - `username_hash`
  - `ip_hash`
  - `failure_count`
  - `window_started_at`
  - `locked_until`
  - `last_failed_at`
  - `last_reason`
  - `context_json`
  - `expires_at`
  - `created_at`
  - `updated_at`

## 状态机

```text
pending -> scanned -> confirmed
pending -> scanned -> pre_confirmed -> confirmed
pending -> scanned -> rejected
pending/scanned/pre_confirmed -> expired
```

`confirmed` 后 PC 端首次轮询会生成一次性 `login_code`；后续轮询不会重复生成。

公开认证写操作要求可信 `Origin` 或 `Referer`；QR 手机读取也要求可信来源。生产请求上下文只信 Cloudflare 提供的 IP、国家和 colo，本地/私网调试才读取 `X-Forwarded-For` / `X-Real-IP`，降低 IP spoofing 对风控等级的影响。本地用户登录失败会对不存在用户执行固定 bcrypt 假校验，降低用户名枚举侧信道风险。

QR session 生命周期：

- `pending`、`scanned`、`pre_confirmed` 到期后通过读取、确认或 scheduled cleanup 标记为 `expired`。
- Worker 现有 5 分钟 cron 会执行 QR cleanup；默认保留过期记录 300 秒，然后删除所有 `expires_at + 300 <= now` 的 QR session。
- cleanup 只在实际删除记录时写 `priestess.qr.cleanup` 系统审计，避免每次 cron 产生噪声。
- 管理员强制过期写 `priestess.qr.admin_expire` 审计。

Passkey challenge 状态：

```text
created -> consumed
created -> expired
```

registration challenge 绑定当前本地用户；authentication challenge 不绑定用户名，依赖 discoverable credential 找回用户。所有 verify 成功后立即消费 challenge，重复使用、过期、错 origin、错 RP ID 或 counter 回退都会拒绝。

审计事件：

- `priestess.password.upgrade`
- `priestess.password.reset`
- `priestess.passkey.create`
- `priestess.passkey.delete`
- `priestess.passkey.admin_delete`
- `priestess.qr.cleanup`
- `priestess.qr.admin_expire`
- `priestess.qr.level2`
- `priestess.qr.reject`
- `priestess.qr.login_code_issued`
- `priestess.login.locked`
- `priestess.login.unlock`
- `priestess.login.success_after_lock`
- `priestess.login.risk_cleanup`

## 前端页面

- `/auth-ui/login`
  - 展示二维码、倒计时、刷新按钮和状态。
  - 成功后跳转到后端返回的 `redirect_url`。

- `/qr-login`
  - 兼容 `sessionId` 和旧 `id` 参数。
  - 未登录时显示本地账号登录。
  - 已登录后展示应用名称、风险提示、拒绝/允许按钮。

这两个页面是公开页面，不能被 Phainon admin gate 包裹。

## 验证

建议验证命令：

```bash
npm test -- tests/oidc.test.ts tests/oidc-qr-login.test.ts tests/admin.test.ts
npm test -- tests/priestess-passkey.test.ts
npm test -- tests/priestess-login-risk.test.ts
npm test -- tests/oidc.test.ts tests/oidc-qr-login.test.ts tests/admin.test.ts tests/priestess-passkey.test.ts tests/priestess-login-risk.test.ts tests/security.test.ts
npm run frontend:typecheck
npm run build
```

部署前必须先运行 D1 migration，并确认 `AUTH_LOGIN_MODE`、`PRIESTESS_PASSWORD_PEPPER`、Passkey RP 配置、管理员密码哈希、本地用户初始密码等配置已通过安全渠道设置。
