# AGENTS.md

## 本目录职责
- 维护前端 provider 配置表单字段组件。
- 重点是不同 provider 类型的表单段落复用与字段一致性。

## 允许修改范围
- 允许修改 provider 字段组件、字段显隐逻辑和局部样式。
- 资源保存逻辑仍优先在对应页面和 `backend/`。

## 必须复用的现有实现或组件入口
- 优先复用现有 `*ProviderFields.js` 模式、字段分组和命名约定。
- 新增 provider 类型前先检查现有字段组件能否组合复用。

## 禁止事项
- 不要在字段组件里直接处理页面级提交逻辑。
- 不要为相似 provider 再复制一份几乎相同的字段集合。

## 本目录最小验证命令
- `cd web && yarn fix`
- 如改动字段较广，可补跑 `cd web && yarn build`。

## 与上级规则的继承或覆盖说明
- 继承 `web/src/AGENTS.md`；本目录额外强调“provider 表单配置复用”。
- 当前目录只覆盖 provider 字段组件。
