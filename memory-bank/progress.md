# ApplyMate Progress

## 当前状态

**日期：** 2026-08-05

**阶段：** 阶段 1——仓库骨架与本地检查（等待产品负责人验证）

**结论：** 阶段 1 本地骨架已实现并完成开发者侧验证，现交由产品负责人复验。确认前不得进入阶段 2。本阶段没有实现业务行为，也没有开通微信、CloudBase、腾讯 OCR 或 TokenHub 资源。

## 已完成

- 阅读并核对 `memory-bank/` 中原有产品设计、技术栈和实施计划。
- 将所有图片链路改为“腾讯 OCR → 本地脱敏 → TokenHub 文本模型”。
- 将服务端架构改为 `api + worker + cleanup` 三个普通云函数。
- 固化异步状态、45 秒执行上限、10 分钟回收和 24 小时幂等窗口。
- 补齐 `user.updatePreferences`、`job.get`、`generation.confirmJd` 及逐项证据契约。
- 固化岗位名、正文格式、手动编辑警告、AI 改写、复制标识、反馈和账号删除规则。
- 将 30 组人工确认评测、七个低保真线框和严格零付费设为开发前门槛。
- 初始化本架构记忆与进度记录，并同步贡献者指南中的 worker 目录。

## 当前等待

- 阶段 0.4–0.17 尚未完成，包括 30 组逐组确认、平台逐项授权、零付费验证、真实 OCR/模型评测和七个线框确认。
- 本次阶段 1 是产品负责人明确批准的本地骨架先行例外，不表示上述门槛已经通过。
- 阶段 1 完成后等待产品负责人运行并确认测试；确认前不得开始阶段 2。

## 当前执行

1. 已重新完整阅读 architecture、design、implementation-plan、progress 和 tech-stack。
2. 已确认工作分支为 `phase-1-scaffold`，不直接在 main 开发。
3. 阶段 1.2–1.9 已完成并形成 `chore: scaffold phase 1 workspace` 本地提交；当前只等待产品负责人测试。

## 阶段 1 逐步记录

- **1.1 文档与授权复核：** 已完整阅读 memory-bank 五份文档。产品负责人明确授权仅本地阶段 1；阶段 0 未完成门槛继续保留。
- **1.2 目录骨架：** 已创建 miniprogram、api、worker、cleanup、shared、unit/contract/integration/model-evaluation tests、docs 和 scripts。三个函数入口仅为空导出，不包含业务行为。
- **1.3 依赖与锁文件：** 已锁定 8 个直接依赖，连续两次干净安装保持同一锁文件哈希。`wx-server-sdk@4.0.2` 因带入 5 个高危传递依赖被移出阶段 1；当前安装审计为 0 个漏洞，CloudBase 运行 SDK 选择推迟到安全版本验证后。
- **1.4 TypeScript：** shared 与三个云函数共用严格配置。正常检查通过；临时注入类型错误时准确报出 TS2322，移除后恢复通过。
- **1.5 Vitest 分组：** 已建立 unit、contract、integration、model-evaluation 四组。每组都通过“故意失败应被捕获→移除后恢复通过”的红绿验证；当前共 6 项测试通过。
- **1.6 本地检查：** 已建立格式、fixture 隔离、类型、测试、构建和全量 check。各命令独立通过；临时尾随空格使全量 check 正确以退出码 1 停止，证明失败可传递。
- **1.7 环境模板：** `.env.example` 只含变量名、说明、空值和默认关闭的资源开关；缺失变量检查会清晰失败，使用 test-only 占位值可通过，真实 `.env` 不会进入 Git。
- **1.8 Fixture 隔离：** 文本 fixture 必须含 `SYNTHETIC_FIXTURE: true`，二进制必须有 `synthetic=true` 侧车。无标识手机号/邮箱样本被检查器拒绝，删除后恢复通过。
- **1.9 里程碑收尾：** architecture 已更新为实际工程骨架并逐文件说明职责；阶段 1 已形成 `chore: scaffold phase 1 workspace` 本地提交。现在只等待产品负责人测试，不开始阶段 2。

## 阶段 1 验证证据

- `npm ci --ignore-scripts` 连续两次成功；两次锁文件 SHA-256 均为 `55302f5a3827e418cc1c6c8e34e3177d6b812f18fbbb09ee252ca25455d285ca`。
- `npm audit` 在移除存在高危传递依赖的 wx-server-sdk 后报告 0 个漏洞。
- `npm run typecheck` 通过；临时类型错误以 TS2322 失败，撤销后恢复通过。
- unit、contract、integration 各 1 项测试通过，model-evaluation 3 项通过；四组均能捕获故意失败。
- `npm run check` 覆盖格式、fixture 隔离、类型、6 项测试和构建；临时格式错误可正确传递退出码 1。
- `npm run env:check` 在变量缺失时列出全部缺项并失败，使用纯测试占位值时通过。
- fixture 隔离检查会拒绝无合成标识的手机号和邮箱样本，删除测试文件后恢复通过。
- 未创建真实 `.env`、云环境、外部账号、OCR/模型请求或业务数据库。

## 产品负责人测试入口

1. 执行 `npm ci --ignore-scripts`。
2. 执行 `npm run check`。
3. 可选执行 `npm run env:check`，在未配置外部资源时预期返回缺失变量错误。
4. 检查三个 `cloudfunctions/*/src/index.ts` 仅为空导出，确认本阶段没有业务实现。
5. 测试通过后明确回复；在此之前阶段 2 保持未开始。

## 本次验证记录

- 文档一致性：三份核心文档均包含腾讯 OCR、TokenHub 脱敏文本、worker、统一任务查询、JD 确认、逐项证据和实际费用为零的锁定要求。
- 实施步骤：共 139 个小步骤，每一步都有独立的指令与验证列，且计划中不含代码块。
- 路径与链接：五份 memory-bank 文档均存在，文档内相对链接指向有效文件。
- Git 差异：通过空白错误检查；本次仅修改 AGENTS.md 和 memory-bank 下五份 Markdown 文档。
- 业务代码与外部资源：未创建；仓库根目录仍只有 `.git` 和 `memory-bank` 两个目录。
