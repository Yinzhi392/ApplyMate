# ApplyMate Architecture Memory

**版本：** 简历解析与管理 v1.5

**日期：** 2026-08-05

**当前状态：** 阶段 5 的本地简历上传校验、DOCX/PDF 提取、OCR/模型契约、脱敏、结构化解析、等待确认、确认/默认/删除和生命周期清理已实现，等待产品负责人验证。`api`、`worker` 与 `cleanup` 只提供可注入领域服务和内存测试适配器；尚无 CloudBase 部署入口、生产仓储/云存储、真实异步派发器、腾讯 OCR 或 TokenHub 客户端。未创建云环境、外部账号、数据库或 AI/OCR 调用。产品负责人确认前不得进入阶段 6。

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

阶段 5 继续把平台依赖隔离在端口之后：任务、幂等、额度、简历和临时文件仓储均只有本地内存适配器；派发器只有 `dispatch(jobId)` 契约；简历 worker 采用 44 秒默认内部截止；cleanup 以 10 分钟、24 小时和 1 小时三个包含边界分别回收僵死任务、未确认草稿和孤立文件。以上只能证明领域语义，不能替代 CloudBase 事务、异步任务、云存储或定时触发器的真实验证。

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

当前已锁定且已由本地 API 组合实现的简历相关动作：

- `agreement.accept`，保存当前协议版本和接受时间
- `user.updatePreferences`
- `job.get`，统一查询简历解析与生成任务
- `resume.parse`，验证输入后创建草稿和 queued 任务并立即返回 `jobId`/`resumeId`
- `resume.confirm`，重算事实身份、删除原文件并完成解析任务
- `resume.list`、`resume.setDefault`、`resume.delete`

`generation.confirmJd`、`generation.create` 和其他阶段 6+ 动作仍只存在于共享契约，尚未注册业务处理器。管理员白名单在同意当前协议后免邀请码进入。`admin.quotaAdjust` 仅增加当日临时次数，次日北京时间失效并记录审计。

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

### 2026-08-05：阶段 4 任务、幂等与额度

- 任务固定从 `queued` 创建，保存状态历史；worker 在任何实际处理前原子认领，同一任务重复派发只有一次进入处理。
- `job.get` 复用阶段 3 的协议、激活和用户隔离门禁，只返回任务类型、中文进度、时间及安全结果/错误，不暴露 userId 或 worker 认领信息。
- 写请求以可信身份哈希、action、requestId 和规范化负载建立幂等映射；完成结果从完成时起保留 24 小时。同 requestId 不同负载冲突，同进程并发重复合并，处理器异常则释放认领。
- 免费资源门禁位于首次幂等操作内部、业务处理器之前：新请求在资源暂停时不会创建任务或预留额度；已经完成的相同请求仍可直接回放原结果。
- 每日额度使用固定 UTC+8 日期键，默认 5 次；`reserved` 与 `succeeded` 原子变更，跨日完成回写原预留日。管理员增加次数只作用当日并与不含 OpenID 的审计原子保存。
- worker 内部截止固定默认 44 秒且拒绝达到平台 45 秒；超时写入唯一失败终态并释放额度，迟到结果不能覆盖。创建满 10 分钟仍无终态的任务由清理服务兜底失败，等待用户确认状态排除。
- 当前 `InMemoryJobRepository`、`InMemoryIdempotencyRepository` 和 `InMemoryQuotaRepository` 只用于离线验证。真实 CloudBase 事务仓储、异步派发与 cleanup 定时入口仍需外部资源逐项授权。

### 2026-08-05：阶段 5 简历解析与管理

- 临时文件路径只含带版本的内部用户哈希段和随机 fileId；扩展名、MIME、Magic Bytes、所有权、大小、图片数及 PDF 页数均在外发前校验。
- DOCX 只使用 Mammoth `extractRawText`；文本型 PDF 使用 unpdf，扫描 PDF 明确要求改传截图，不在服务端静默渲染或返回空结果。
- 图片字节只能经 `TencentOcrAdapter` 进入 OCR provider；OCR/文件提取文字必须通过 `ResumePrivacyGateway` 后才能进入结构化模型。该网关只返回遮盖类型与数量，不返回敏感值。
- 主模型输出只接受严格 JSON/Schema；无效、截断或错误结构最多调用一次备用模型。事实 ID 和哈希由服务端根据来源类型及规范化文本生成，客户端/模型提供的标识不能在确认时成为权威值。
- `resume.parse` 只同步创建草稿与任务。worker 清除已处理的粘贴原文并停在等待确认；未确认 profile 由独立访问守卫禁止作为生成证据。
- `resume.confirm` 是事实进入可信区的边界：重新校验 Schema、重算全部事实身份、拒绝重复事实、删除原文件并完成任务。相同内容重复确认不重复写入。
- 每用户最多保留三份简历记录。删除默认简历时，按 `confirmedAt/createdAt` 最新优先并以 resumeId 稳定破同分；没有确认简历时默认值为空。
- cleanup 精确回收满 24 小时的未确认草稿和满 1 小时且不再被任何简历引用的临时文件。真实定时触发、CloudBase 存储删除和事务补偿仍待授权验证。

## 9. 实际构建与检查图

根级 TypeScript 配置引用 shared 和三个云函数。`npm run typecheck` 对源代码与测试执行无输出严格检查；`npm run build` 只编译 shared 与三个云函数，生成物进入各自 `dist/` 并被 Git 忽略。小程序代码在后续 UI 阶段由微信开发者工具编译。

`npm run check` 按顺序执行：格式检查 → fixture 隔离检查 → TypeScript 检查 → 全部 Vitest → 云函数构建。任一步失败都会保留非零退出码并停止后续命令。阶段 5 当前为 55 个测试文件、187 项测试。环境变量检查单独执行，因为尚未获准配置真实外部资源。

## 10. 仓库文件职责

以下清单描述阶段 5 结束时的项目源文件；`node_modules/` 与 `dist/` 是可重建产物，不属于架构源文件。

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
- `cloudfunctions/api/src/api-entry.ts`：统一请求校验、客户端身份字段移除、可信上下文 OpenID 读取、写请求幂等编排和首次执行资源门禁。
- `cloudfunctions/api/src/domain-error.ts`：允许安全返回的领域错误类型。
- `cloudfunctions/api/src/identity-domain.ts`：用户、协议、邀请码和管理员审计记录的数据类型。
- `cloudfunctions/api/src/identity-repository.ts`：身份领域仓储端口及仅供本地测试的原子内存实现。
- `cloudfunctions/api/src/user-service.ts`：身份哈希、首次用户创建、禁用访问规则和偏好更新。
- `cloudfunctions/api/src/agreement-service.ts`：协议版本接受、当前版本判断和业务动作门禁。
- `cloudfunctions/api/src/invite-service.ts`：邀请码规范化哈希、7 天有效期、创建和原子消费。
- `cloudfunctions/api/src/identity-api.ts`：组合身份、协议、邀请、偏好、任务查询、简历解析/确认/管理、临时额度及管理员启停 action 的本地 API。
- `cloudfunctions/api/src/job-domain.ts`：任务种类、状态历史、认领信息、安全结果和错误的数据类型。
- `cloudfunctions/api/src/job-repository.ts`：任务仓储端口及支持原子创建、认领、转换和超时扫描的内存实现。
- `cloudfunctions/api/src/job-service.ts`：任务创建、用户隔离查询、状态转换及幂等终态写入规则。
- `cloudfunctions/api/src/job-dispatch-service.ts`：API 只派发 jobId 的端口、创建派发服务和 worker 认领协调器。
- `cloudfunctions/api/src/idempotency-domain.ts`：pending/completed 幂等记录和原子认领结果类型。
- `cloudfunctions/api/src/idempotency-repository.ts`：幂等仓储端口及支持回放、冲突、放弃和 24 小时清理的内存实现。
- `cloudfunctions/api/src/idempotency-service.ts`：规范化负载哈希、身份/action/requestId 键哈希和同进程重复请求合并。
- `cloudfunctions/api/src/quota-domain.ts`：北京时间日期键、默认每日 5 次、预留/用量/临时调整审计类型。
- `cloudfunctions/api/src/quota-repository.ts`：额度仓储端口及原子预留、结算、临时增加与审计的内存实现。
- `cloudfunctions/api/src/quota-service.ts`：额度预留、成功、释放、当日查询和管理员临时增加规则。
- `cloudfunctions/api/src/resource-gate-service.ts`：OCR、模型、计算/存储三类零付费资源可用性门禁。
- `cloudfunctions/api/src/temporary-file-domain.ts`：临时文件的所有者、内部存储键、原名、MIME、字节和上传时间记录。
- `cloudfunctions/api/src/temporary-file-repository.ts`：临时文件仓储端口及支持到期扫描的本地内存实现。
- `cloudfunctions/api/src/temporary-file-service.ts`：不暴露 OpenID/原名的隔离路径、所有权读取/删除和到期文件查询。
- `cloudfunctions/api/src/resume-file-validation-service.ts`：PDF、DOCX、JPEG、PNG、WebP 的扩展名/MIME/Magic Bytes 和文件数/大小门禁。
- `cloudfunctions/api/src/resume-text-validation-service.ts`：粘贴简历的非空、Unicode 与 20,000 可见字符门禁。
- `cloudfunctions/api/src/resume-domain.ts`：解析/确认请求 Schema、草稿/确认状态和简历记录类型。
- `cloudfunctions/api/src/resume-repository.ts`：简历仓储端口及支持三份上限、确认状态条件写入、默认原子切换/重选、过期扫描的内存实现。
- `cloudfunctions/api/src/resume-workflow-service.ts`：`resume.parse` 的输入校验、草稿/任务创建、三份限制和异步派发编排。
- `cloudfunctions/api/src/validated-temporary-file-adapter.ts`：把所有权和文件门禁后的临时文件以最小字节接口交给 worker/OCR。
- `cloudfunctions/api/src/resume-parse-execution-service.ts`：认领解析任务、44 秒截止、状态推进、等待确认结果和安全失败写入。
- `cloudfunctions/api/src/resume-access-service.ts`：只允许已确认简历成为后续生成事实来源的访问守卫。
- `cloudfunctions/api/src/resume-confirmation-service.ts`：确认 Schema、重算事实身份、拒绝重复事实、删除原文件和完成任务。
- `cloudfunctions/api/src/resume-management-service.ts`：当前用户的安全列表、默认切换、删除、文件清理和默认重选。
- `cloudfunctions/api/src/worker-execution-service.ts`：44 秒默认内部截止、取消信号、唯一终态和额度结算。
- `cloudfunctions/api/src/stale-job-cleanup-service.ts`：创建满 10 分钟的非终态任务回收和额度释放规则。
- `cloudfunctions/worker/README.md`：限定 worker 负责 OCR、脱敏、文本模型和质量门，并说明外部实现仍为替身。
- `cloudfunctions/worker/tsconfig.json`：worker 的独立构建配置，并引用 shared。
- `cloudfunctions/worker/src/index.ts`：worker 领域模块的公共导出入口，不实例化外部提供商。
- `cloudfunctions/worker/src/resume-processing-error.ts`：文件、OCR、模型和提取文本的稳定处理错误码。
- `cloudfunctions/worker/src/docx-text-extractor.ts`：使用 Mammoth 输出 DOCX 纯文本并归一损坏/空文档错误。
- `cloudfunctions/worker/src/pdf-text-extractor.ts`：使用 unpdf 检查 10 页上限、提取文本并识别扫描/加密/损坏 PDF。
- `cloudfunctions/worker/src/tencent-ocr-adapter.ts`：只接受验证图片的 OCR provider 端口、置信门槛、调用元数据和错误归一。
- `cloudfunctions/worker/src/resume-privacy-gateway.ts`：模型外发前唯一脱敏网关，只暴露遮盖后文本及无值摘要。
- `cloudfunctions/worker/src/resume-structure-parser.ts`：严格结构化模型输出、一次备用切换及稳定 ResumeProfile 事实生成。
- `cloudfunctions/worker/src/resume-parse-pipeline.ts`：按输入类型提取有序文本、复用文本边界并串接隐私网关和结构化解析。
- `cloudfunctions/cleanup/README.md`：限定 cleanup 负责超时、文件、过期数据和账号删除，并说明当前无真实调度。
- `cloudfunctions/cleanup/tsconfig.json`：cleanup 的独立构建配置，并引用 shared。
- `cloudfunctions/cleanup/src/index.ts`：cleanup 领域模块公共导出入口，不创建定时器或云连接。
- `cloudfunctions/cleanup/src/resume-cleanup-service.ts`：24 小时草稿与 1 小时孤立文件的精确、幂等回收规则。
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
- `tests/unit/job-service.test.ts`：验证任务创建、并发认领、固定状态转换、唯一终态和跨用户隐藏。
- `tests/unit/idempotency-service.test.ts`：验证规范化负载、并发合并、冲突、失败重试及完成后 24 小时保留。
- `tests/unit/api-idempotency.test.ts`：验证 API 重复写回放且不会再次更新时间。
- `tests/unit/job-get-api.test.ts`：验证 8 个任务状态的安全中文响应、成功结果和跨用户隐藏。
- `tests/unit/beijing-quota-date.test.ts`：验证固定 UTC+8 日期键及北京时间零点边界。
- `tests/unit/quota-service.test.ts`：验证并发 5 次上限、成功/释放幂等结算及跨日归属。
- `tests/unit/admin-quota-adjust.test.ts`：验证管理员当日临时额度、次日失效、审计和幂等回放。
- `tests/unit/job-dispatch.test.ts`：验证 API 提前返回及重复派发只处理一次。
- `tests/unit/worker-deadline.test.ts`：验证 44 秒内部截止、失败释放、迟到结果隔离和正常成功。
- `tests/unit/stale-job-cleanup.test.ts`：验证 10 分钟精确回收、重复清理和等待确认排除。
- `tests/unit/resource-gate.test.ts`：验证三类资源暂停、数据访问保留及完成请求回放。
- `tests/unit/temporary-file-service.test.ts`：验证隔离路径、同名唯一、所有权隐藏和删除。
- `tests/unit/resume-file-validation.test.ts`：验证五类文件签名、10MB/6 张边界、伪类型、GIF 和损坏输入。
- `tests/unit/resume-text-validation.test.ts`：验证空文本、20,000 字精确边界和 Unicode 合法性。
- `tests/unit/docx-text-extractor.test.ts`：用真实 Mammoth fixture 验证段落、表格、损坏和外部内容。
- `tests/unit/pdf-text-extractor.test.ts`：用合成 PDF 验证 1/10/11 页、扫描、加密与损坏分支。
- `tests/unit/resume-structure-parser.test.ts`：验证稳定事实、严格输出、一次备用切换和双失败语义。
- `tests/unit/resume-parse-pipeline.test.ts`：验证四类提取路由、图片顺序、统一文本边界和模型前脱敏。
- `tests/contract/health.test.ts`：证明外部提供商契约测试分组可在无真实服务时运行。
- `tests/contract/tencent-ocr-adapter.test.ts`：验证 OCR 成功元数据、所有权、低置信、超时、429 和资源暂停。
- `tests/contract/resume-privacy-chain.test.ts`：捕获 OCR/模型请求，证明原图只到 OCR 且五类敏感值不进入模型。
- `tests/integration/health.test.ts`：证明本地集成测试不依赖云资源。
- `tests/integration/identity-access.test.ts`：验证管理员启动、同码并发、跨用户隔离、协议变化和账号禁用的完整本地链路。
- `tests/integration/task-infrastructure.test.ts`：验证重复创建、恢复查询、后台完成、额度结算、跨日并发、45 秒上限和 10 分钟回收的完整本地链路。
- `tests/integration/resume-parse-api.test.ts`：验证四种解析入口、立即返回、幂等合并和协议/激活门禁。
- `tests/integration/resume-parse-worker.test.ts`：验证认领、OCR/解析状态、job.get 可编辑结果、安全失败和确认守卫。
- `tests/integration/resume-confirm.test.ts`：验证修改后事实重算、原文件删除、默认、任务完成、重复确认和跨用户拒绝。
- `tests/integration/resume-management.test.ts`：验证列表隔离、默认切换/重选、删除和三份上限。
- `tests/integration/resume-cleanup.test.ts`：验证 24 小时草稿、1 小时孤立文件、引用保护和重复清理。
- `tests/integration/resume-input-closure.test.ts`：用真实提取器与本地外部替身验证四类输入的解析—确认—默认完整闭环。
- `tests/model-evaluation/fixture-structure.test.ts`：机器检查 30 组样本编号、必需段落和六类字段真值。
- `tests/fixtures/README.md`：描述评测样本格式、覆盖矩阵和人工确认流程。
- `tests/fixtures/phase-0-cases.md`：保存 30 组完全虚构的阶段 0 样本草案与字段真值。

### 记忆库

- `memory-bank/design-document.md`：产品需求和系统边界的最高优先级基线。
- `memory-bank/tech-stack.md`：实现设计目标的技术选择与不采用项。
- `memory-bank/implementation-plan.md`：按阶段、步骤和验证项驱动开发。
- `memory-bank/progress.md`：记录真实完成状态、验证证据、例外授权和阻塞。
- `memory-bank/architecture.md`：记录实际架构、文件职责、数据流和关键决策演变。
