# AGENTS.md

## 本目录职责
- 维护前端工程级约束，包括依赖、构建、CRACO 配置、Cypress 入口和 `web/src` 页面代码的整体协作方式。
- 这里是前端模块根目录，负责定义前端改动的总体边界，而不是承载页面实现。

## 允许修改范围
- 允许修改前端工程配置、测试入口、构建脚本和对 `web/src`、`web/cypress` 的上层约束。
- 前端业务页面、组件和 API 请求代码仍应分别落到 `web/src` 对应子目录。

## 必须复用的现有实现或组件入口
- 优先复用现有 `package.json` 脚本、CRACO 配置、Ant Design 体系和已有测试命令。
- 依赖安装与脚本执行统一使用 `yarn`，不要切换到 `npm install`。

## 禁止事项
- 不要手改 `web/build`、`web/build (1)`、`web/node_modules` 或 `web/public` 产物。
- 不要把页面级规则写到工程根目录 `AGENTS.md` 里重复描述。

## 本目录最小验证命令
- `cd web && yarn build`
- `cd web && yarn test --watchAll=false`
- 仅文档变更时至少确认脚本路径和目录结构未失真。

## 与上级规则的继承或覆盖说明
- 继承仓库根目录规则；本目录额外强调“前端工程配置与页面代码分层”。
- `web/src` 和 `web/cypress` 下如有更近规则，优先使用更近规则。
