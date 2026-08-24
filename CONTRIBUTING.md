# 参与贡献 ApplyMate

谢谢你愿意把时间放在 ApplyMate 上。这里欢迎代码、测试、文档、文案、无障碍和产品体验贡献；比“改得多”更重要的是，改动能被清楚解释、复现和验证。

## 开始之前

1. 先阅读 [`memory-bank/design-document.md`](memory-bank/design-document.md) 和 [`memory-bank/architecture.md`](memory-bank/architecture.md)。它们是当前产品与架构基线。
2. 对明显的 Bug，可以直接提交带回归测试的 Pull Request。
3. 对新增功能、流程改造、模型策略或云端资源变化，请先开 Issue 说明问题和方案，等范围确认后再实现。
4. 安全与隐私问题不要开公开 Issue，请遵循 [`SECURITY.md`](SECURITY.md)。

## 本地开发

```bash
npm ci --ignore-scripts
cp web/.env.example web/.env.local
npm run web:dev
```

Node.js 版本需为 `>=20 <25`，npm 版本需为 `>=10`。

## 提交前检查

小范围改动至少运行对应测试；准备提交 Pull Request 时运行：

```bash
npm run check
```

完整门禁包含格式、fixture、敏感信息、严格 TypeScript、Vitest、生产构建和浏览器回归。

## 代码约定

- TypeScript、JSON、WXML 和 WXSS 使用两个空格缩进。
- 变量与函数使用 `camelCase`，类型和组件使用 `PascalCase`，常量使用 `UPPER_SNAKE_CASE`。
- 文件与目录使用 `kebab-case`，API action 使用点号命名，例如 `generation.create`。
- 运行时 Schema 以 `Schema` 结尾，例如 `ResumeProfileSchema`。
- 平台、模型 ID 和 provider 细节留在 Adapter 内，不写进页面或领域服务。
- 优先小的领域服务和纯函数，不把新规则堆进云函数入口。

## 四条不可突破的边界

### 1. 真实性

不得新增会根据常识补写经历、技能、任期、成绩或成果数字的路径。生成事实必须能回溯到简历事实、求职偏好或当前岗位字段。

### 2. 隐私

不得在代码、fixture、Issue 或 PR 中放入真实简历、原始 JD 截图、邮箱、手机号、证件号、生产导出、Prompt、临时访问 URL 或密钥。测试数据必须明确是合成或脱敏数据。

### 3. 成本与外部调用

新增 OCR、模型调用、重试、fallback、并发或更高 token 预算时，必须在 PR 中说明调用次数、失败行为和成本影响。测试不应在默认情况下调用真实付费服务。

### 4. 数据生命周期

新增持久化字段、日志或文件时，必须说明用途、保留时间、删除路径和跨用户隔离方式。任何全量删除功能都需要独立的破坏性操作授权，不能顺手加入普通维护逻辑。

## Pull Request 应包含

- 改动解决的问题和非目标
- 受影响的设计或架构章节
- 测试命令与结果
- 视觉改动的手机截图
- 隐私、额度、模型成本和数据生命周期影响
- 如有迁移或配置变化，写出回滚方式

提交信息使用 Conventional Commits，例如：

```text
docs: clarify self-hosting boundary
feat: add resume parser
fix: release failed budget reservation
```

## 适合第一次贡献的方向

- 文档链接、错别字和中英文表达
- 无障碍标签、焦点顺序和小屏布局
- 合成 fixture 与回归测试
- 错误提示和空状态
- 不增加外部调用的纯前端体验改进

如果范围不确定，先开一个简短 Issue。把问题说清楚，本身就是很有价值的贡献。
