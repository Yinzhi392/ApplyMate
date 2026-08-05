# ApplyMate Architecture Memory

**版本：** 身份与准入 v1.3

**日期：** 2026-08-05

**当前状态：** 阶段 3 的本地身份、协议、邀请和用户权限闭环已实现并通过开发者侧全量检查，等待产品负责人验证。`api` 当前提供可注入的领域接口和内存测试仓储，但尚无 CloudBase 部署入口或生产仓储；`worker` 与 `cleanup` 仍为空导出。未创建云环境、外部账号、数据库或 AI/OCR 调用。产品负责人确认前不得进入阶段 4。

**权威来源：** [`design-document.md`](./design-document.md)、[`tech-stack.md`](./tech-stack.md)、[`implementation-plan.md`](./implementation-plan.md)

## 1. 当前架构基线

ApplyMate MVP 采用微信原生小程序和腾讯 CloudBase。服务端固定为三个普通云函数：

- `api`：读取可信 OpenID，执行协议、邀请码、权限和输入校验，创建/查询异步任务，处理轻量数据操作。
- `worker`：执行文件文字提取、腾讯 OCR、敏感信息遮盖、TokenHub 文本解析/生成/改写和确定性质量门。
- `cleanup`：回收超时任务、残留文件、过期草稿/幂等记录，并完成账号物理删除。

数据使用 CloudBase 文档数据库，原文件仅临时存入 CloudBase 云存储。运行时不得增加视觉模型、独立服务器、外部队列、Web 框架或付费服务，除非产品负责人另行修订设计并明确批准。

## 2. 信任与隐私边界

1. 用户身份只来自 CloudBase 运行上下文；客户端提供的 OpenID 无效。
2. 所有简历图片和 JD 截图只发送给腾讯 OCR。
3. DOCX、文本型 PDF 和粘贴文本在服务端提取文字；扫描 PDF 要求改传截图。
4. OCR/提取结果先在本地遮盖手机号、邮箱、证件号和详细地址，再发送给 TokenHub。
5. TokenHub 只接收脱敏文本，永不接收原图。
6. AI 与审计日志最长保存 180 天，只保存模型、耗时、Token、成本估算、Prompt 版本、状态和内容哈希；账号删除会提前删除或匿名化用户关联。
7. 投递历史保存脱敏事实与 JD 快照；删除简历不影响历史，删除账号会删除所有快照。

## 3. 异步数据流

1. 小程序向 `api` 提交写请求和 UUID requestId。
2. `api` 完成权限、幂等和输入检查，创建 `ai_jobs`，立即返回 `jobId`。
3. `api` 异步触发 `worker`；`worker` 事务认领任务，避免重复外部调用。
4. 图片任务进入 OCR；文本任务直接进入解析。所有模型调用前执行脱敏。
5. JD 关键字段可信时直接生成；岗位名缺失或关键字段低置信时进入等待用户确认。
6. 生成或改写结果经过逐项证据、正文格式、敏感信息和提示注入质量门。
7. 首次失败只用已提取脱敏文本纠错一次；再次失败释放额度。
8. 客户端通过 `job.get` 恢复状态和结果。

## 4. 状态、时限与幂等

任务状态固定为：排队、OCR、解析、等待用户确认、生成、校验、成功、失败。不适用状态可跳过，但状态不得倒退，成功和失败为终态。

- 单次 worker 最多运行 45 秒；内部截止早于平台硬上限，以便正常写入失败终态。
- 创建 10 分钟仍无终态的任务由 cleanup 失败并释放额度。
- 等待用户确认不预留额度，最多保留 24 小时。
- 同一用户、action、requestId 和负载返回同一结果；同 requestId 不同负载返回冲突。
- 终态幂等映射保留 24 小时。

## 5. 数据与事实模型

集合固定为 `users`、`invites`、`resumes`、`applications`、`ai_jobs`、`daily_usage`、`feedback` 和 `audit_logs`。

每项简历事实和求职偏好具有稳定 `factId`；偏好来源类型为 `preference`。JD 关键字段具有字段 ID。AI 正文中的每项可验证陈述必须映射到一个或多个有效 `factId` 或 JD 字段，不能只提供整篇共用证据。

每日额度以北京时间维护 `reserved`、`succeeded` 和当日临时增加次数。进入实际生成前预留，成功后转计数，失败后释放；自动纠错不重复扣次。

## 6. 不可违反的运行门槛

- OCR、TokenHub、CloudBase、数据库、存储和流量的实际费用必须为 0 元。
- 所有资源默认未准备，创建或开通前必须逐项取得授权。
- 免费额度耗尽即暂停相关 AI 入口，不自动付费、不更换平台。
- 30 组样本必须由产品负责人逐组确认后才能评测。
- 关键字段准确率 ≥90%、文案合规率 ≥95%、30 组零虚构、中位耗时 ≤10 秒。
- UI 编码前必须确认七个低保真线框。
- 个人主体类目受限时只允许体验版测试，不升级主体、不转 H5、不正式发布。

## 7. API 基线

新增并锁定的动作：

- `agreement.accept`，保存当前协议版本和接受时间
- `user.updatePreferences`
- `job.get`，统一查询简历解析与生成任务
- `generation.confirmJd`，补充 JD 后继续同一任务

`resume.parse` 和 `generation.create` 均立即返回 `jobId`；不再使用 `generation.get`。管理员白名单在同意当前协议后免邀请码进入。`admin.quotaAdjust` 仅增加当日临时次数，次日北京时间失效并记录审计。

## 8. 决策记录

### 2026-08-05：澄清后文档基线

- 将图片运行链路从 TokenHub 视觉模型改为腾讯 OCR；移除 YT-VITA/HY-Vision 主流程。
- 将同步重任务改为 `api + worker + cleanup` 三函数异步架构。
- 将证据从整篇列表提升为逐项陈述映射。
- 固化岗位名、文案长度、复制标识、反馈、协议版本、账号删除和指标口径。
- 将严格零付费设为阶段 0 停止条件。
- 当前只更新文档，未开始开发或开通任何外部资源。

### 2026-08-05：阶段 1 本地骨架

- 产品负责人明确允许本地阶段 1 先行，但没有豁免阶段 0.4–0.17；真实服务、模型评测、UI 与阶段 2 仍受原门槛约束。
- 使用单一根级 npm 包和 TypeScript project references，不引入 monorepo 管理器、Web 框架或打包器。
- shared、api、worker、cleanup 共用严格 TypeScript 基线；小程序暂时只保留目录说明，等待七个线框获批。
- 测试固定分为 unit、contract、integration、model-evaluation，避免不同风险层混在同一入口。
- `wx-server-sdk@4.0.2` 安装后审计发现 5 个高危传递依赖，已从阶段 1 移除；CloudBase 运行 SDK 必须在正式接入前重新验证安全版本或安全替代接入方式，未经确认不得加入。
- fixture 检查把“合成数据声明”变成机器可验证规则：文本需要固定标识，二进制需要 `synthetic=true` 侧车元数据。

### 2026-08-05：阶段 2 共享契约

- 共享层保持纯 TypeScript + Zod，不引用 CloudBase、OCR、TokenHub、小程序或数据库 SDK；因此全部核心边界可在离线环境验证。
- 可见字符按 Unicode 字素计数并排除空白，避免组合 emoji 和组合字符被重复计数；孤立代理字符在 API 输入边界拒绝。
- `factId` 由版本域、来源类型及 NFC/空白归一后的事实文本生成；文本哈希保留完整 SHA-256，文本或来源变化时二者按规则更新。
- JD 关键字段确认阈值固定为 0.8；岗位名缺失或已提取关键字段低于阈值时等待确认，公司缺失只产生“贵司”提醒。
- 逐项证据同时校验 ID 格式和当前任务注册表归属；AI 正文质量门为硬失败，手动文本复用检测结果但仅产生非阻断警告。
- API 负载在 Zod 转换前检查原始对象，拒绝原型污染式键、非普通对象、循环/非 JSON 数据、超长内容及无效 Unicode。
- 当前繁简校验采用保守的常见繁体字符拒绝表，不等同于完整中文转换；阶段 0 模型评测和阶段 6 回归必须继续验证误报/漏报。

### 2026-08-05：阶段 3 身份与准入

- API action 必须显式注册；未知动作和大小写变体拒绝，未预期异常不会暴露路径、堆栈或校验内部信息。
- 可信 OpenID 只从注入的 CloudBase 上下文端口读取，经带版本域的 SHA-256 生成身份哈希和稳定内部 userId；原 OpenID 不进入用户、邀请或审计记录。
- 新增 `agreement.accept` 后 API 契约共 25 个 action。协议两类版本以同一时间保存；版本变化会重新阻断业务动作。
- 阶段 3 只验证写动作必须携带 requestId；请求结果持久幂等、重复负载复用和冲突检测属于阶段 4，当前不得宣称已实现。
- 管理员白名单只在服务端配置并转换为身份哈希。管理员也必须接受当前协议，但免邀请码，可创建和撤销首批邀请码。
- 邀请码只保存规范化哈希，默认 7 天有效；消费邀请和激活用户是同一原子仓储操作，因此同码并发只有一次成功。
- 求职偏好整体替换并复用共享分句/factId 规则；空文本清空，500 个可见字符为硬上限，超限不覆盖旧值。
- 管理员启停用户时，用户状态和审计记录原子保存。禁用用户目前只能访问 `auth.status` 与 `user.get`；`user.delete` 将在其计划步骤实现后开放。
- `InMemoryIdentityRepository` 仅是本地可验证适配器；生产 CloudBase 事务实现及真实上下文适配器仍需单独授权，不能据此宣称云端已完成。

## 9. 实际构建与检查图

根级 TypeScript 配置引用 shared 和三个云函数。`npm run typecheck` 对源代码与测试执行无输出严格检查；`npm run build` 只编译 shared 与三个云函数，生成物进入各自 `dist/` 并被 Git 忽略。小程序代码在后续 UI 阶段由微信开发者工具编译。

`npm run check` 按顺序执行：格式检查 → fixture 隔离检查 → TypeScript 检查 → 全部 Vitest → 云函数构建。任一步失败都会保留非零退出码并停止后续命令。环境变量检查单独执行，因为阶段 1 禁止配置真实外部资源。

## 10. 仓库文件职责

以下清单描述阶段 3 结束时的项目源文件；`node_modules/` 与 `dist/` 是可重建产物，不属于架构源文件。

### 根目录

- `AGENTS.md`：贡献者约束、目录规范、测试要求以及写代码前必须阅读的记忆文档。
- `.gitignore`：排除依赖、构建、环境密钥、覆盖率和本地工作区产物。
- `.env.example`：只列外部资源变量和默认关闭的能力开关，不保存真实值。
- `package.json`：锁定直接依赖和 format、fixture、env、typecheck、test、build、check 命令。
- `package-lock.json`：锁定完整依赖树，保证 `npm ci` 可重复安装。
- `tsconfig.base.json`：shared 与三个云函数共用的严格 TypeScript 规则。
- `tsconfig.json`：构建入口，通过 project references 连接四个可编译模块。
- `tsconfig.check.json`：对全部 TypeScript 源文件和测试执行无输出类型检查。
- `vitest.config.mjs`：统一 Vitest 的 Node 环境、测试匹配范围和超时。

### 工具脚本

- `scripts/check-format.mjs`：检查 LF、文件末尾换行、尾随空白、BOM 和 JSON 两空格格式。
- `scripts/check-fixtures.mjs`：拒绝未声明合成来源的文本 fixture，并要求二进制侧车元数据。
- `scripts/check-env.mjs`：列出缺失环境变量；不读取或输出密钥值。

### 产品与服务骨架

- `miniprogram/README.md`：说明微信原生客户端的未来职责和线框审批门槛。
- `shared/README.md`：说明共享 Schema、类型、错误码、状态机和纯规则边界。
- `shared/tsconfig.json`：共享模块的独立构建配置。
- `shared/src/index.ts`：共享模块唯一公共导出入口。
- `shared/src/text.ts`：Unicode 字素级可见字符、非空段落和 Unicode 合法性规则。
- `shared/src/limits.ts`：文件、页数、文本、简历、事实及 AI 正文的统一边界常量。
- `shared/src/masking.ts`：手机号、邮箱、身份证、护照式证件号和详细地址的本地遮盖及位置元数据。
- `shared/src/facts.ts`：事实来源、文本归一、SHA-256 哈希和稳定 `factId`。
- `shared/src/preferences.ts`：求职偏好分句、去重、500 字限制和 preference 事实生成。
- `shared/src/resume-schema.ts`：严格 `ResumeProfile` 及各类简历事实 Zod Schema。
- `shared/src/job-description.ts`：JD 字段 Schema、重复 ID 检查、0.8 阈值与“贵司”回退。
- `shared/src/evidence.ts`：逐项陈述/来源 Schema 及当前事实、JD 注册表归属校验。
- `shared/src/job-status.ts`：八状态常量、中文展示名和固定转换图。
- `shared/src/api-contract.ts`：25 个 action、读写 requestId 规则、安全负载、统一响应和错误码。
- `shared/src/greeting.ts`：AI 正文硬质量门及手动编辑非阻断警告。
- `shared/src/copy-text.ts`：复制正文与指定 AI 标识的确定性组合。
- `cloudfunctions/api/README.md`：限定 api 只负责身份、验证、任务和轻量读写。
- `cloudfunctions/api/tsconfig.json`：api 的独立构建配置，并引用 shared。
- `cloudfunctions/api/src/index.ts`：api 领域模块的公共导出入口，不实例化 CloudBase 或外部服务。
- `cloudfunctions/api/src/action-registry.ts`：显式 action 注册、调度和安全错误归一。
- `cloudfunctions/api/src/api-entry.ts`：统一请求校验、客户端身份字段移除和可信上下文 OpenID 读取。
- `cloudfunctions/api/src/domain-error.ts`：允许安全返回的领域错误类型。
- `cloudfunctions/api/src/identity-domain.ts`：用户、协议、邀请码和管理员审计记录的数据类型。
- `cloudfunctions/api/src/identity-repository.ts`：身份领域仓储端口及仅供本地测试的原子内存实现。
- `cloudfunctions/api/src/user-service.ts`：身份哈希、首次用户创建、禁用访问规则和偏好更新。
- `cloudfunctions/api/src/agreement-service.ts`：协议版本接受、当前版本判断和业务动作门禁。
- `cloudfunctions/api/src/invite-service.ts`：邀请码规范化哈希、7 天有效期、创建和原子消费。
- `cloudfunctions/api/src/identity-api.ts`：组合身份、协议、邀请、偏好及管理员启停 action 的本地 API。
- `cloudfunctions/worker/README.md`：限定 worker 负责 OCR、脱敏、文本模型和质量门。
- `cloudfunctions/worker/tsconfig.json`：worker 的独立构建配置，并引用 shared。
- `cloudfunctions/worker/src/index.ts`：worker 空入口，无模型或 OCR 行为。
- `cloudfunctions/cleanup/README.md`：限定 cleanup 负责超时、文件、过期数据和账号删除。
- `cloudfunctions/cleanup/tsconfig.json`：cleanup 的独立构建配置，并引用 shared。
- `cloudfunctions/cleanup/src/index.ts`：cleanup 空入口，无删除行为。
- `docs/README.md`：规定线框、评测、隐私、安全、成本和发布证据的存放范围。

### 测试与样本

- `tests/unit/health.test.ts`：证明纯规则单元测试分组可独立运行。
- `tests/unit/text.test.ts`：验证字素计数、空白排除、段落及 250/350 边界。
- `tests/unit/limits.test.ts`：验证所有 MVP 上限的下界、精确上限和越界。
- `tests/unit/masking.test.ts`：验证五类敏感信息命中、分隔符、边界和误报。
- `tests/unit/facts.test.ts`：验证事实来源、归一稳定性、变化与无碰撞样本。
- `tests/unit/preferences.test.ts`：验证偏好分句、去重、来源和 500 字边界。
- `tests/unit/resume-schema.test.ts`：验证合法简历和缺 ID、超长、未知字段拒绝。
- `tests/unit/job-description.test.ts`：验证岗位/公司规则、低置信和字段 ID 唯一性。
- `tests/unit/evidence.test.ts`：验证无来源、错误/未知 ID 和多来源陈述。
- `tests/unit/job-status.test.ts`：穷举验证全部 64 个状态组合。
- `tests/unit/api-contract.test.ts`：验证 action、requestId、负载、响应和错误码。
- `tests/unit/greeting-quality.test.ts`：验证 AI 正文格式、简体、证据、数字、隐私和 Unicode 硬门。
- `tests/unit/manual-edit.test.ts`：验证手动警告与 AI 硬失败分离。
- `tests/unit/copy-text.test.ts`：验证 AI 标识位置和正文独立计数。
- `tests/unit/adversarial.test.ts`：验证提示注入、原型污染、超长输入和无效 Unicode。
- `tests/unit/action-registry.test.ts`：验证显式 action、大小写、领域错误和未知异常的安全响应。
- `tests/unit/trusted-identity.test.ts`：验证只信任上下文 OpenID，并移除客户端伪造身份。
- `tests/unit/user-lifecycle.test.ts`：验证并发首次创建、身份隔离、哈希存储和禁用访问边界。
- `tests/unit/agreement-service.test.ts`：验证协议版本、同意时间、旧版本和业务门禁。
- `tests/unit/identity-status.test.ts`：验证六类准入状态及个人资料安全字段。
- `tests/unit/invite-service.test.ts`：验证邀请码哈希、过期、撤销、重复使用和并发消费。
- `tests/unit/admin-bootstrap.test.ts`：验证管理员协议门槛、首批邀请码创建/撤销和用户激活。
- `tests/unit/user-preferences-api.test.ts`：验证偏好新增、替换、清空、factId 和 500 字边界。
- `tests/unit/admin-user-status.test.ts`：验证白名单管理员启停、伪造拒绝和原子审计。
- `tests/contract/health.test.ts`：证明外部提供商契约测试分组可在无真实服务时运行。
- `tests/integration/health.test.ts`：证明本地集成测试不依赖云资源。
- `tests/integration/identity-access.test.ts`：验证管理员启动、同码并发、跨用户隔离、协议变化和账号禁用的完整本地链路。
- `tests/model-evaluation/fixture-structure.test.ts`：机器检查 30 组样本编号、必需段落和六类字段真值。
- `tests/fixtures/README.md`：描述评测样本格式、覆盖矩阵和人工确认流程。
- `tests/fixtures/phase-0-cases.md`：保存 30 组完全虚构的阶段 0 样本草案与字段真值。

### 记忆库

- `memory-bank/design-document.md`：产品需求和系统边界的最高优先级基线。
- `memory-bank/tech-stack.md`：实现设计目标的技术选择与不采用项。
- `memory-bank/implementation-plan.md`：按阶段、步骤和验证项驱动开发。
- `memory-bank/progress.md`：记录真实完成状态、验证证据、例外授权和阻塞。
- `memory-bank/architecture.md`：记录实际架构、文件职责、数据流和关键决策演变。
