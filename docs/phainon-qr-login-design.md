# Phainon 优先的 Priestess 扫码登录设计

## 目标

Priestess v1 实现 OIDC 扫码登录、本地用户会话、账号资料、头像、Passkey 主登录和 TOTP 自助能力，后续按 Phainon 的 Worker/Hono/D1 结构合并到 `/Users/rakko/Documents/GitHub/Phainon`。当前目标不是复刻完整 Kita/Casdoor IAM，而是做一个稳定、可迁移、可测试的最小登录平台。

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
- `profile.ts`：本地用户资料更新、PNG 头像上传到 R2、上传日志和审计。
- `passkeys.ts`：Passkey options、verification、credential 管理和审计。
- `registration.ts`：邮箱/手机号五步注册路由、邀请码与验证码 challenge，以及 Turnstile/验证码发送编排。
- `registration-repository.ts`：注册验证码请求 repository 接口和 D1 实现。
- `routes.ts`：公开登录接口、二维码接口和管理员用户管理接口。

`src/features/oidc/routes.ts` 保留现有外部 OIDC 流程；`AUTH_LOGIN_MODE=external_oidc|priestess_native` 中 `priestess_native` 是生产主路径和缺省值，只有显式 `external_oidc` 才进入旧外部 OIDC 兼容模式。历史值 `local_qr` 仅作为后端兼容别名接受，文档、示例和状态响应统一使用 `priestess_native`。外部 OIDC 兼容配置统一使用 `EXTERNAL_OIDC_*` 和 `EXTERNAL_OIDC_TRANSACTION_TTL_SECONDS` 主名，旧 `OIDC_*` / `AUTH_TRANSACTION_TTL_SECONDS` 只作为 legacy alias fallback。新的主路径把原本 OIDC 中转能力收口到 `/auth/priestess/oidc/*`：`/auth/priestess/oidc/login?app_id=...&return_to=...` 仍由 Phainon Worker 校验 app/return URL，再跳转到 Priestess 前端 `/login`；旧 `/auth/login`、`/auth/exchange`、`/auth/refresh`、`/auth/logout`、`/auth/me` 仅作为兼容别名。

## Phainon 兼容基线

- Priestess 仓库内若临时加入后端、mock server、API proxy 或本地调试服务，只能作为 Phainon 兼容层使用；真实生产后端以 Phainon Worker/Hono/D1 实现为准。
- API path、HTTP method、Cookie 名称、JSON 字段、错误码、QR 状态机、Passkey 校验约束和审计事件必须能直接映射到 Phainon 的实现，避免前端和后端各自形成一套协议。
- `packages/priestess-shared/src/lib/priestessApi.ts` 可以兼容 Phainon 迁移过程中的 response envelope 差异，但不能依赖只存在于本项目 mock 里的特殊字段；新增兼容分支时要在本文档同步说明真实后端含义。
- 本地联调使用 `VITE_PRIESTESS_API_BASE_URL` 指向 Phainon 兼容后端。没有显式 API base 时，请求只能落到同源生产部署或受控预览环境，不能静默请求 Vite dev server 假装成功。
- 密码 pepper、管理员密码、session secret、Passkey 配置和长期 token 只允许通过 1Password CLI、Wrangler secret 或运行时环境变量注入，不进入 Priestess 仓库。
- 如果某个页面流程必须依赖 Phainon 尚未实现的能力，应把缺口记录为后端接入事项；前端只能做清晰失败态或受控 mock，不做会掩盖生产缺口的永久绕行。
- 外部 OIDC 兼容流继续使用 `state`、`nonce` 和 PKCE S256；Priestess native 流只把一次性 `login_code` 放入回跳 hash，前端立刻 exchange，不保存 access token、refresh token 或 ID token。
- Phainon access token 校验必须同时检查签名、`iss`、`exp`、`typ=access`、`aud` 存在且等于 `app_id`；固定资源 API 还要传入自己的 audience 白名单，`/auth/priestess/oidc/me` 只作为通用 introspection-style endpoint 校验 token 自洽和 app enabled。
- refresh token 必须轮转；已轮转的旧 token hash 写入 `refresh_token_rotations`，旧 token 复用时撤销整条 refresh session，写 `auth.refresh_token_reuse` 审计且只记录 `app_id`、`session_id`、`subject` 和时间信息，不记录 token/hash 明文。
- `return_to` 保持 Phainon 现有前缀兼容策略：同 origin 下允许登记路径本身及其子路径，不允许 sibling path 或跨 origin。高安全应用推荐登记精确 callback URL；登记根路径 `/` 会允许该 origin 下所有路径，属于兼容配置而不是安全默认。
- 前端和后端日志/错误展示都不得记录或回显 `login_code`、`access_token`、`refresh_token`、`id_token`、`password`、`secret`、`cookie`、`session_id` 等敏感字段。

## API

### PC 端二维码流程

- `POST /auth/priestess/qr/sessions`
  - 输入：`app_id`、`return_to`
  - 行为：校验 Phainon 现有 OIDC app 和 return URL，创建 QR session。
  - 输出：`session_id`、`qr_url`、`expires_in`、`expires_at`

- `GET /auth/priestess/qr/sessions/:sessionId/status`
  - 行为：PC 轮询二维码状态。
  - 安全约束：创建 QR session 时服务端同时下发 HttpOnly `phainon_priestess_qr_poll` cookie；状态轮询必须带同一会话的 cookie，避免只凭二维码里的 `sessionId` 窃取 `login_code`。
  - 输出：`pending`、`scanned`、`pre_confirmed`、`confirmed`、`rejected`、`expired`
  - 当状态首次进入 `confirmed` 时生成一次性 `login_code`，并返回带 hash 参数的 `redirect_url`。
  - 过期会话通过正常轮询路径标记为 `expired`，PC poll cookie 也会随终态清理。

### 手机端确认流程

- `GET /auth/priestess/qr/sessions/:sessionId`
  - 需要本地用户 session cookie。
  - 需要可信 `Origin` 或 `Referer`，因为该读取会把状态推进到 `scanned`。
  - 首次读取会把状态从 `pending` 推进到 `scanned`。
  - 响应使用统一手机确认 envelope：`session`、`user`、`requires_confirmation`、`requires_totp=false`、`can_confirm`、`can_reject`、`can_final_confirm`、`security_level`、`security_reason`、`server_time`。`session` 内包含 `app_id`、`app_name`、`return_to`、`return_to_origin`、脱敏 `pc_context`、脱敏 `phone_context`、`created_at`、`updated_at`、`expires_at`、`expires_in` 和 `status`。

- `POST /auth/priestess/qr/sessions/:sessionId/confirm`
  - 需要本地用户 session cookie。
  - 输入：`action=confirm|reject`
  - `reject` 直接进入 `rejected`。
  - `confirm` 会按 Cloudflare 请求头粗略计算风险等级：
    - 同 IP、本地/私网、或同 `CF-IPCountry` 且同 `CF-Ray` colo，判定 Level 1，直接 `confirmed`。
    - 其它情况判定 Level 2，进入 `pre_confirmed`，需要二次确认。
  - 响应额外返回 `security_reason`：`same_ip`、`local_network`、`same_region`、`unknown_context`、`different_region`。
  - 手机扫码确认不额外追加 TOTP challenge；即使当前用户已启用 TOTP，也直接进入 Level 1/Level 2 判断。

- `POST /auth/priestess/qr/sessions/:sessionId/confirm-final`
  - 需要本地用户 session cookie。
  - 只允许最初点击确认的同一用户完成二次确认。
  - 成功后返回同一套手机确认 envelope，`requires_confirmation=false`，PC 端随后通过 poll cookie 读取一次性 `login_code`。
  - 高风险 `pre_confirmed` 状态仍允许同一手机端拒绝本次登录；拒绝和最终确认都会写入低噪声安全审计。

### 本地用户登录

- `GET /auth/priestess/session`：读取当前本地用户会话。
- `POST /auth/priestess/session`：用户名或邮箱 + 密码登录，设置 HttpOnly cookie；请求体继续使用兼容字段 `{ "username": string, "password": string }`，其中 `username` 表示登录标识。
- `DELETE /auth/priestess/session`：撤销当前本地用户会话。
- `GET /auth/priestess/devices/sessions`：读取当前用户所有未过期、未撤销的本地浏览器会话，返回简化 UA、IP、创建时间、最近使用时间和过期时间。
- `DELETE /auth/priestess/devices/sessions/:sessionId`：撤销当前用户的指定本地浏览器会话；后端必须同时校验 `session_id` 和当前 `user_id`，若撤销当前浏览器则清除 HttpOnly cookie。
- `GET /auth/priestess/services/sessions`：读取当前用户仍保持登录的 Rakko OIDC 服务，后端按 `subject` 聚合活跃 refresh session，只返回应用名称、`app_id`、会话数量和时间字段，不返回 refresh token hash 或完整 claims。
- `DELETE /auth/priestess/services/sessions/:appId`：撤销当前用户在指定 Rakko 服务下仍活跃的 refresh session；后端必须同时约束 `app_id` 和当前 `user_id`，不能按 app 全局撤销其它用户会话。已签发的 access token 等 TTL 自然过期。

### 应用授权账号选择

- `GET /auth/priestess/account-choices?app_id=...&return_to=...`
  - 行为：在第三方应用发起 `/login?app_id=...&return_to=...` 时读取当前浏览器信任范围内可用于本次授权的 Priestess 本地账号。
  - 输出：`accounts` 和 `app`。`accounts[]` 至少包含 `choice_id`、`user_id`、`username`、`display_name`、`email`、`avatar_url`、`current`、`authenticated`、`revoked`、`last_used_at`、`expires_at`；`app` 第一版只要求 `app_id` 和 `return_to_origin`。
  - `choice_id` 必须是短时、不可猜、只对当前浏览器和本次授权上下文有效的 opaque id；不能使用裸 `user_id`、session id、cookie 值或 refresh token hash。
  - 后端返回属于当前浏览器信任范围的账号；如果账号对应会话已被管理员或设备管理强制撤销，应返回 `authenticated=false` 或 `revoked=true`，前端会在账号行显示已登出且不允许修改资料、密码或头像。没有可用账号时返回空数组，而不是让前端伪造账号列表。
  - `app_id` 和 `return_to` 仍由 Phainon 后端按现有 OIDC app/return URL 规则校验；前端展示 `return_to_origin` 只用于说明目标应用，不能替代服务端校验。
  - 如果该接口暂未上线，Priestess 前端会兼容退回 `GET /auth/priestess/session`，只把当前已认证会话展示为一个账号选择项；正式多账号验收必须以后端返回多个 `choice_id` 为准。

- `DELETE /auth/priestess/account-choices/:userId`
  - 行为：从当前 `phainon_priestess_browser` 容器移除一个已登录账号，并撤销该账号对应的本地用户 session；这不是永久删除 Priestess 用户、资料、Passkey 或服务授权。
  - 鉴权：必须来自可信 Priestess 前端 Origin/Referer，并且请求携带有效的浏览器容器 cookie。后端只能操作当前浏览器容器中已经可见的 `user_id`。
  - 输出：`removed`、`revoked`、`current`、`authenticated`、`user_id`。如果移除的是当前 `phainon_priestess_session`，后端同时清除当前 session cookie；其它浏览器账号仍留在账号选择列表里。
  - 前端不能用一次性 `choice_id` 做删除凭证；`choice_id` 只服务本次授权，并会在授权时消费。

- `POST /auth/priestess/account-choices/:userId/activate`
  - 行为：把当前浏览器容器中某个仍有效的账号激活为当前 `phainon_priestess_session`，用于账号选择页跳转个人中心前切换到正确账号。
  - 鉴权：必须来自可信 Priestess 前端 Origin/Referer，并且请求携带有效的浏览器容器 cookie；后端只能激活当前浏览器容器中仍有效、未撤销、未过期且用户启用的账号。
  - 输入：可选 `{ "choice_id": string }`。后端可用它拒绝明显过期或跨 Origin 的账号选择项，但不能只信任 `choice_id`，必须同时校验浏览器容器和服务端 session 记录。
  - 输出：`LocalSession` 兼容 payload，并设置新的 `phainon_priestess_session` HttpOnly cookie。

- `POST /auth/priestess/authorize`
  - 现有输入 `{ "app_id": string, "return_to": string }` 保持“当前本地会话授权”的语义。
  - 新增可选输入 `{ "choice_id": string }`。传入时后端必须校验该选择项属于同一 `app_id` / `return_to` 授权请求、同一浏览器信任上下文且仍未过期。
  - 账号选择本身不额外强制 TOTP 或 Passkey step-up；如果后端风险策略需要重新验证，应返回明确错误码或 challenge，再由前端复用现有 TOTP/登录路径。
  - 输出继续兼容 `redirect_url` / `redirectUrl`，由后端签发最终回跳地址；前端不得自行拼接 `login_code` 或信任未校验的 `return_to`。

### 本地账号资料与头像

- `PATCH /auth/priestess/profile`
  - 需要当前本地用户 session。
  - 输入：`display_name`、`email`、`phone`、`address`、`birthday`、`avatar_url`、`password_manager`，均为可选字段；`email` 必须是非空合法邮箱，后端会 trim 并转小写，当前用户个人中心不开放清空邮箱，重复邮箱返回 `local_user_exists`；`phone=null` 或空字符串表示清除电话号，非空值按注册链路手机号规则规范化并保持唯一；`address=null` 或空字符串表示清除地址，非空值最多 200 字符；`birthday=null` 或空字符串表示清除生日，非空值必须是合法 `YYYY-MM-DD` 且不能晚于当前日期；`avatar_url=null` 或空字符串表示清除 R2 头像，非空头像值必须是当前用户已有的 Priestess R2 头像读取 URL，不能写入 GitHub/raw/CDN 等外部图床地址；`password_manager=null` 表示清除用户偏好的第三方密码管理器。
  - `password_manager` 只保存 `{ provider, label }` 这类偏好元数据，不保存主密码、token、私钥或第三方保险库凭证，也不默认进入 OIDC claims。
  - `address` 和 `birthday` 只作为 Priestess 个人资料返回，不默认进入 OIDC claims；`phone` 继续作为 `phone_number` claim 输出。
  - 输出：最新 `user`，其中 `avatar_url` 会在后续 `login_code`、`refresh` 和 `/auth/priestess/oidc/me` 中传播为 OIDC `picture` claim。

- `POST /auth/priestess/profile/avatar`
  - 需要当前本地用户 session 和 multipart PNG 文件。
  - 行为：写入 Phainon `PRIESTESS_AVATARS` R2 bucket，并返回 Worker 公开读取 URL；后端固定 Priestess 头像 key 前缀，避免前端覆盖其它业务对象。
  - 输出：`avatar_url`、上传文件元信息和最新 `user`。

### 本地用户注册

- `POST /auth/priestess/register/invite-check`
  - 输入：`identity`、`identity_type=email|phone`、`invite_code`、`turnstile_token`。
  - 行为：只在邀请步骤校验一次 Turnstile，成功后返回绑定身份的邀请码 challenge。

- `POST /auth/priestess/register/verification-requests`
  - 输入：`identity`、`identity_type=email|phone`、`invite_code`、`invite_challenge`。
  - 行为：邀请码 challenge 有效时发送邮箱或手机验证码，不再次请求 Turnstile；滚动发布期间后端仍兼容旧 `turnstile_token` 请求格式。

- `POST /auth/priestess/register/verification-check`
  - 输入：身份、邀请码 challenge、`verification_code` 和 `verification_request_id`。
  - 行为：立即消费验证码并返回不含明文验证码的短期 `verification_challenge`。

- `POST /auth/priestess/register/confirm`
  - 输入：`identity`、`identity_type`、`password`、`invite_code`、`invite_challenge`、`verification_challenge`、`display_name`、`username`。
  - 行为：服务端重新验证两个 challenge 后创建本地用户；`username` 继续检查格式、唯一性和保留名，邮箱注册写入 `email`，手机号注册写入规范化 `phone`。
  - 成功后复用本地登录 session 逻辑写入 `phainon_priestess_session` HttpOnly cookie，并返回 `LocalSession` 兼容 payload。

邀请码必须通过 1Password CLI / Wrangler secret 注入，不进入仓库、前端配置、URL、日志或本地存储。注册验证码请求只保存 `identity_hash`、`identity_mask`、`code_hash` 和发送状态，不保存明文验证码、Turnstile token、密码或完整手机号。前端应把身份、邀请码 challenge、验证码和 verification challenge 错误映射回五步中的对应页面；前端校验只能改善体验，服务端校验始终是最终事实。

密码保存策略：

- 新密码写入格式为 `v2.bcrypt-pepper.$2b$...`。
- 写入前先做 `HMAC-SHA-256(PRIESTESS_PASSWORD_PEPPER, password)`，再对 HMAC 结果做 bcrypt。
- `PRIESTESS_PASSWORD_PEPPER` 必须通过 1Password CLI / Wrangler secret 注入，不进入仓库。
- 旧版裸 bcrypt hash 仍可校验；成功登录后会自动升级为 v2。升级缺少 pepper 时返回配置错误，不写回半成品 hash。
- 新密码长度要求 12 到 4096 字符，管理员创建和重置使用同一策略。
- 不存在用户仍执行固定假 bcrypt 校验，避免用户名枚举侧信道。
- 密码登录失败会写入 `auth_local_login_risk_buckets` 软锁 bucket：
  - 同一用户名+IP 10 分钟内 10 次失败，锁定密码登录 10 分钟。
  - 同一用户名 30 分钟内 20 次失败，锁定密码登录 30 分钟。
  - bucket key、username 和 IP 都只保存加盐 hash；上下文只保存国家、colo、masked IP 和 UA。
  - 成功密码登录会清理对应风险 bucket；Passkey 登录不受密码软锁影响。
- `PATCH /auth/priestess/password`
  - 需要当前本地用户 session；请求体为 `{ "current_password": string, "password": string }`。
  - 后端校验当前密码，用现有 pepper+bcrypt 规则写入新密码，撤销旧 session 并签发新的 `phainon_priestess_session` cookie。

### Passkey 登录

- `POST /auth/priestess/passkeys/registration/options`
  - 需要本地用户 session。
  - 输入：可选 `name`，作为用户在个人中心设定的 Passkey 显示名称，后端校验长度并绑定到本次 registration challenge。
  - 生成 WebAuthn registration options，默认 `residentKey=required`、`userVerification=required`。

- `POST /auth/priestess/passkeys/registration/verify`
  - 需要本地用户 session。
  - 校验 challenge、expected origin、RP ID 和用户验证；成功后保存 credential，名称优先使用 registration options 阶段绑定到 challenge 的值。

- `POST /auth/priestess/passkeys/authentication/options`
  - 无需用户名，生成 discoverable credential 登录 options。
  - 服务端只保存 `challenge_hash`，不保存明文 challenge。

- `POST /auth/priestess/passkeys/authentication/verify`
  - 校验 challenge、expected origin、RP ID、user verification 和 counter。
  - 成功后更新 credential counter / `last_used_at`，并创建现有 `phainon_priestess_session` cookie。

- `GET /auth/priestess/passkeys`
  - 当前用户列出自己的 Passkey，不返回 public key。

- `PATCH /auth/priestess/passkeys/:credentialId`
  - 当前用户重命名自己的可用 Passkey，请求体为 `{ "name": string }`。

- `DELETE /auth/priestess/passkeys/:credentialId`
  - 当前用户禁用自己的 Passkey；密码回退仍作为 v1 可用恢复路径。

默认配置：

- `PASSKEY_RP_ID=phainon.rakko.cn`
- `PASSKEY_RP_NAME=Phainon Priestess`
- `PASSKEY_EXPECTED_ORIGIN=https://phainon.rakko.cn`
- `PASSKEY_CHALLENGE_TTL_SECONDS=300`

Passkey 私钥永远只在用户设备或平台 authenticator 内；服务端只保存 credential id、公钥、counter、transports、device type、backup 状态和必要审计信息。

### 管理员用户维护

- `GET /admin/priestess/users`：列出本地用户，不回显密码哈希；每个用户包含 `role=user|admin`。
- `POST /admin/priestess/users`：创建本地用户，需要 admin session 和管理员密码确认；`role` 可选，缺省为 `user`。
- `PUT /admin/priestess/users/:userId`：更新显示名、邮箱、启用状态、角色或重置密码，需要 admin session 和管理员密码确认；角色变更会撤销该用户仍活跃的 OIDC refresh session。
- `GET /admin/priestess/qr-sessions?status=&limit=`：列出最近 QR session，返回脱敏后的 PC/Phone context，不返回 poll token hash 或 login code hash。
- `DELETE /admin/priestess/qr-sessions/:sessionId`：管理员强制将 QR session 标记为 `expired`，需要 admin session 和管理员密码确认。
- `GET /admin/priestess/login-risk?status=locked&limit=`：列出本地密码登录风险 bucket；返回 bucket key、scope、失败次数、锁定时间和脱敏上下文，不返回 hash 材料。
- `DELETE /admin/priestess/login-risk/:bucketKey`：管理员清除一个登录风险 bucket，需要 admin session 和管理员密码确认。
- `GET /admin/priestess/users/:userId/passkeys`：管理员查看用户 Passkey，不返回 public key。
- `DELETE /admin/priestess/users/:userId/passkeys/:credentialId`：管理员强制禁用用户 Passkey，需要 admin session 和管理员密码确认。

真实密码或临时密码不得写入仓库；如需保存长期值，应放入 1Password CLI 管理。

`role` 当前只有 `user` 和 `admin` 两档。Phainon migration 会把既有用户默认设为普通用户，并把 `username='rakko'` 的本地用户设为管理员。后端会把角色写入本地 session payload、OIDC stored claims 和 refresh 返回的 `user.role`；管理台只能通过后端接口更新角色，不能在前端伪造权限状态。

## D1 表

新增 migration：`0033_priestess_qr_login.sql`、`0034_priestess_login_risk.sql`、`0035_priestess_password_reset.sql`、`0037_priestess_totp_factors.sql`、`0038_priestess_registration.sql`、`0039_priestess_profile.sql`、`0040_priestess_user_phone.sql`、`0041_priestess_password_manager.sql`、`0042_priestess_profile_contact.sql`、`0064_priestess_user_roles.sql`、`0065_refresh_token_history.sql`。

- `auth_local_users`
  - `user_id`
  - `username`
  - `display_name`
  - `email`
  - `phone`
  - `address`
  - `birthday`
  - `avatar_url`
  - `password_hash`
  - `role`
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

- `refresh_token_rotations`
  - `token_hash`
  - `session_id`
  - `app_id`
  - `subject`
  - `rotated_at`
  - `expires_at`
  - `reuse_detected_at`

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

- `auth_local_registration_verification_requests`
  - `request_id`
  - `identity_type`
  - `identity_hash`
  - `identity_mask`
  - `code_hash`
  - `status`
  - `attempt_count`
  - `delivery`
  - `delivery_status`
  - `expires_at`
  - `consumed_at`
  - `context_json`
  - `created_at`
  - `updated_at`

- `auth_local_totp_factors`
  - `factor_id`
  - `user_id`
  - `secret_encrypted`
  - `enabled`
  - `last_used_at`
  - `disabled_at`
  - `created_at`
  - `updated_at`

- `auth_local_auth_challenges`
  - `challenge_id`
  - `user_id`
  - `purpose`
  - `secret_encrypted`
  - `expires_at`
  - `consumed_at`
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
- `priestess.profile.update`
- `priestess.profile.avatar_upload`
- `priestess.session.revoke`
- `priestess.qr.cleanup`
- `priestess.qr.admin_expire`
- `priestess.qr.level2`
- `priestess.qr.final_confirm`
- `priestess.qr.reject`
- `priestess.qr.login_code_issued`
- `priestess.login.locked`
- `priestess.login.unlock`
- `priestess.login.success_after_lock`
- `priestess.login.risk_cleanup`

## 前端页面

- `/login`
  - 展示二维码、倒计时、刷新按钮和状态。
  - 带 `app_id` / `return_to` 时进入应用授权入口，成功后仍由后端返回的 `redirect_url` 完成应用回跳。
  - 不带应用授权参数时作为 Priestess 本地登录入口，已登录浏览器直接进入 `/manage`，登录成功后跳转到安全 `next`，没有 `next` 时默认进入 `/manage`。
  - `next` 只接受 Priestess 前端本地个人中心相对路径，例如 `/manage#devices`；它不替代 OIDC `return_to`，也不能携带外部 URL。

- `/qr-login`
  - 兼容 `sessionId` 和旧 `id` 参数。
  - 未登录时显示本地账号登录。
  - 已登录后展示应用名称、风险提示、拒绝/允许按钮。
  - 启用 TOTP 的用户扫码登录时不再额外输入动态验证码；Level 2 风险继续走最终确认。

- `/manage`
  - 账号中心展示头像、昵称、账号资料、已登录浏览器、已登录 Rakko 服务、Passkey 和 TOTP 状态。
  - 支持编辑昵称、上传或清除 R2 PNG 头像、新增/重命名/停用 Passkey、启用/停用 TOTP。
  - 未登录时跳转到 `/login?next=...`，登录后回到原个人中心分区；`/Manage` 和 `/auth-ui/account` 只作为兼容入口规范化到 `/manage`。

这两个页面是公开页面，不能被 Phainon admin gate 包裹。

## 验证

建议验证命令：

```bash
npm test -- tests/oidc.test.ts tests/oidc-qr-login.test.ts tests/admin.test.ts
npm test -- tests/priestess-profile.test.ts tests/priestess-passkey.test.ts tests/priestess-totp.test.ts tests/image-hosting.test.ts
npm test -- tests/oidc.test.ts tests/oidc-qr-login.test.ts tests/admin.test.ts tests/priestess-profile.test.ts tests/priestess-passkey.test.ts tests/priestess-totp.test.ts tests/priestess-login-risk.test.ts tests/security.test.ts
npm run frontend:typecheck
npm run build
```

部署前必须先运行 D1 migration，并确认 `AUTH_LOGIN_MODE`、必要的 `EXTERNAL_OIDC_*` 兼容配置、`PRIESTESS_PASSWORD_PEPPER`、`PRIESTESS_AUTH_ENCRYPTION_KEY`、`PRIESTESS_AVATARS` R2 binding、Passkey RP 配置、管理员密码哈希、本地用户初始密码等配置已通过安全渠道设置。
