# Priestess Agent Guide

## 协作边界

- 默认只修改 `/Users/rakko/Documents/priestess` 内的文件。
- 禁止修改 `/Users/rakko/Documents/GitHub/Phainon` 源码，除非用户明确说明“合并源码”或给出同等明确授权。
- 本仓库是单 Git 项目的 npm workspaces monorepo：`apps/login` 是登录前端，`apps/admin` 是管理台前端，`packages/priestess-shared` 是共享 API、基础组件和基础样式。
- 登录前端和管理台前端必须保持独立入口、独立路由和独立 dev 端口；不要把管理台业务面板重新 import 回登录前端，也不要把登录卡片、二维码抽屉或登录动效 import 进管理台前端。
- 跨前端复用逻辑应优先放入 `packages/priestess-shared`；只和单个前端相关的组件、样式和页面状态应留在对应 `apps/*` 子项目内。
- 只修改完成任务必需的部分，优先复用成熟库和现有模式，避免重复造轮子。
- 单个代码文件不超过 1000 行；接近上限时拆分为职责清晰的组件或模块。
- 稳定优先，保持代码简单直观，删除不再使用的逻辑，不保留会让未来维护者困惑的绕法。

## 后端与 Phainon 兼容

- Priestess 当前以独立前端为主；未来如果在本项目内补充后端、mock、代理或本地联调服务，必须以 Phainon 的 Worker/Hono/D1 后端契约为兼容目标。
- 后端接口、Cookie、错误码、字段命名和状态机应优先遵循 `/Users/rakko/Documents/GitHub/Phainon` 中已存在或计划合并的 Priestess 设计，不能在本项目里另起一套不兼容协议。
- 本项目内的后端相关代码应定位为 Phainon 兼容适配层、本地 mock 或迁移前验证代码；一旦需要真实生产能力，应明确说明需要接入 Phainon，而不是用前端临时逻辑掩盖后端缺口。
- 修改 `packages/priestess-shared/src/lib/priestessApi.ts` 或新增 API 调用时，要同步检查 `docs/phainon-qr-login-design.md`，保证路径、请求体、响应 envelope、认证方式和错误处理仍能被 Phainon 后端稳定承接。
- 本地联调默认通过 `VITE_PRIESTESS_API_BASE_URL` 指向 Phainon 兼容后端；不要把长期后端地址、管理员密码、pepper、token 或私钥写入仓库。
- 当前共享 API client 位于 `packages/priestess-shared/src/lib/priestessApi.ts`；新增或修改后端调用时应在共享包内维护契约，再由登录或管理台前端按需引用。

## 代码与注释

- 面向用户沟通使用中文，并在每次回复结尾加 `喵`。
- 代码注释要说明真实业务意图或复杂逻辑，优先使用清晰、专业的中文。
- UI 代码要保持可读、可维护，边界情况尽量自然融入常规逻辑。

## 前端设计风格

- 前端视觉默认遵循 [Innei/Yohaku design-system](https://github.com/Innei/Yohaku/tree/main/design-system) 的设计语言；新增或重做 UI 前，优先查阅其中的 `CHEATSHEET.md`、`SKILL.md` 和相关 `references/` 规范。
- 若项目已经接入 Tailwind 或设计 token，优先复用 Yohaku 的 token 约定；若当前项目尚未接入，不要为了单次改动引入过重依赖，先用现有 CSS 变量和局部样式贴近同一套视觉规则。
- 中性色保持三层语义：`1-4` 用于页面和卡片表面，`5-7` 用于边框、图标和次级文字，`8-10` 用于正文和标题；避免随意使用原始 hex、Tailwind 默认 `neutral-50...950` 或与设计系统冲突的临时颜色。
- 强调色只用于 CTA、焦点态、品牌标记和少量关键状态，整体占比保持克制，避免把页面做成大面积单一强调色。
- 字体遵循角色化层级：正文、标签、标题、展示文字要有清晰区分；中文界面避免粗暴使用 `font-bold`，优先保持中等字重、充足行高和可靠的中日韩字体回退。
- 卡片、弹层、按钮和输入框优先使用克制圆角、细边框或轻量阴影表达层级；避免重阴影、过度发光、复杂渐变和不必要的装饰性背景。
- 使用毛玻璃时只使用少数稳定层级，并始终搭配半透明表面；不要额外发明难以维护的模糊强度。
- 交互组件应保持 Yohaku 式的安静、留白、清晰信息层级和个人内容产品气质，同时必须服务真实功能，不做纯展示性的空壳 UI。

## 安全

- 不要把密钥、私钥、密码、token 或其它长期凭证写入仓库。
- 如果后续需要保存敏感数据，必须使用 1Password CLI 或环境变量等安全渠道。
