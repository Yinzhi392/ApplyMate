# ApplyMate Architecture Memory

**版本：** 微信小程序本地界面 v1.9

**日期：** 2026-08-06

**当前状态：** 阶段 9 的 14 个微信原生小程序页面、三标签导航、客户端输入边界、任务恢复、结果/记录/偏好/管理员交互和本地演示 API 已实现，等待产品负责人在微信开发者工具与真机完成 9.15 验收；验收前不得进入阶段 10。客户端当前固定使用 `touristappid` 与进程内演示 API，不含 `wx.cloud` 调用。`api`、`worker` 与 `cleanup` 仍只有可注入领域服务和内存测试适配器；尚无 CloudBase 部署入口、生产仓储/云存储、真实异步派发器、腾讯 OCR 或 TokenHub 客户端。未创建云环境、外部账号、数据库或真实 AI/OCR 调用，30 组草案也尚未经产品负责人逐组确认。

**权威来源：** [`design-document.md`](./design-document.md)、[`tech-stack.md`](./tech-stack.md)、[`implementation-plan.md`](./implementation-plan.md)

## 1. 当前架构基线

ApplyMate MVP 采用微信原生小程序和腾讯 CloudBase。服务端固定为三个普通云函数：

- `api`：读取可信 OpenID，执行协议、邀请码、权限和输入校验，创建/查询异步任务，处理轻量数据操作。
- `worker`：执行文件文字提取、腾讯 OCR、敏感信息遮盖、TokenHub 文本解析/生成/改写和确定性质量门。
- `cleanup`：回收超时任务、残留文件、过期草稿/幂等记录，并完成账号物理删除。

数据使用 CloudBase 文档数据库，原文件仅临时存入 CloudBase 云存储。运行时不得增加视觉模型、独立服务器、外部队列、Web 框架或付费服务，除非产品负责人另行修订设计并明确批准。

阶段 9 为了在零外部资源条件下验收 UI，引入了严格限定在小程序进程内的演示适配器。页面只依赖 `ApiClient` 接口，不感知演示或未来 CloudBase 调用细节；演示适配器不读取真实文件、不访问网络、不构成生产鉴权或数据持久化实现。

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
- `user.delete` 先签发只保存哈希的 10 分钟确认凭证；有效确认立即禁用并记录最迟 24 小时物理删除时间。cleanup 每次运行立即处理全部待删除账号，不等待截止时间。

阶段 6 继续把平台依赖隔离在端口之后：任务、幂等、额度、简历、生成、投递和临时文件仓储均只有本地内存适配器；派发器只有 `dispatch(jobId)` 契约；生成 worker 使用单一 44 秒总截止，TokenHub 网关的主备尝试总预算也必须小于 45 秒。cleanup 继续回收 10 分钟僵死任务，并重试 OCR 完成后未删掉的 JD 图片引用。以上只能证明领域语义，不能替代 CloudBase 事务、异步任务、云存储、定时触发器或真实模型性能验证。

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

当前已锁定且已由本地 API 组合实现的身份、简历、生成和投递相关动作：

- `agreement.accept`，保存当前协议版本和接受时间
- `user.updatePreferences`
- `job.get`，统一查询简历解析与生成任务
- `resume.parse`，验证输入后创建草稿和 queued 任务并立即返回 `jobId`/`resumeId`
- `resume.confirm`，重算事实身份、删除原文件并完成解析任务
- `resume.list`、`resume.setDefault`、`resume.delete`
- `generation.create`，验证已确认简历和 JD 输入，创建 queued 任务并立即返回 `jobId`
- `generation.confirmJd`，仅对本人的等待任务补齐严格 JD、预留额度并继续同一任务
- `generation.rewrite`，从本人投递记录快照最新手动正文并立即返回异步 `jobId`
- `application.list`、`application.get`、`application.update`、`application.delete`
- `feedback.submit`，为本人单条投递记录创建或覆盖唯一反馈

`user.delete` 已采用申请凭证与确认删除两段式负载；确认后不可由管理员恢复。`admin.stats` 只允许同意当前协议且账号启用的服务端白名单管理员读取，汇总用户、邀请、北京时间当日额度、审计及 OCR/模型/云函数/存储/流量五类资源元数据。管理员邀请码创建/撤销、用户启停和临时额度写操作均受 requestId 幂等保护并保存审计。`admin.quotaAdjust` 仍只增加当日临时次数，次日北京时间失效。

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
- 管理员启停用户时，用户状态和审计记录原子保存。禁用用户只能访问 `auth.status`、`user.get` 与阶段 8 已实现的 `user.delete`；进入待删除状态后管理员不能重新启用。
- `InMemoryIdentityRepository` 仅是本地可验证适配器；生产 CloudBase 事务实现及真实上下文适配器仍需单独授权，不能据此宣称云端已完成。

### 2026-08-05：阶段 4 任务、幂等与额度

- 任务固定从 `queued` 创建，保存状态历史；worker 在任何实际处理前原子认领，同一任务重复派发只有一次进入处理。
- `job.get` 复用阶段 3 的协议、激活和用户隔离门禁，只返回任务类型、中文进度、时间及安全结果/错误，不暴露 userId 或 worker 认领信息。
- 写请求以可信身份哈希、action、requestId 和规范化负载建立幂等映射；完成结果从完成时起保留 24 小时。同 requestId 不同负载冲突，同进程并发重复合并，处理器异常则释放认领。
- 免费资源门禁位于首次幂等操作内部、业务处理器之前：新请求在资源暂停时不会创建任务或预留额度；已经完成的相同请求仍可直接回放原结果。
- 每日额度使用固定 UTC+8 日期键，默认 5 次；`reserved` 与 `succeeded` 原子变更，跨日完成回写原预留日。管理员增加次数只作用当日并与不含 OpenID 的审计原子保存。
- worker 内部截止固定默认 44 秒且拒绝达到平台 45 秒；超时写入唯一失败终态并释放额度，迟到结果不能覆盖。任务按最近状态更新时间连续满 10 分钟仍无终态时由清理服务兜底失败，等待用户确认状态排除；确认后继续会重置该运行窗口。
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

### 2026-08-05：阶段 6 JD 生成与事实质量门

- `generation.create` 只接受文本或 1–6 张图片，并把已确认简历与当前偏好复制为任务快照；任务创建时不预留额度，进入真实生成前才预留。
- JD 图片保持用户顺序，只进入 OCR 端口；提取后立即尝试删除。删除失败的 fileId 只保留为 cleanup 重试引用，不进入 TokenHub 或投递记录。
- JD 严格结构化后以 0.8 阈值决定继续或等待。等待任务清除 worker claim、没有 reservation；`generation.confirmJd` 必须补齐岗位名及全部低置信关键字段，继续使用同一 jobId。
- 公司名缺失不是阻断条件，服务端统一提供“贵司”并写入 warning；岗位名、公司称呼、简体中文、250–350 可见字符、2–3 段和逐项证据均为 AI 硬门。
- 文本模型网关只接收再次遮盖后的 JSON 文本，主/备各最多一次；超时、429、无效输出和提供商失败统一归一。日志契约只有模型、状态、耗时和内容哈希，不含 Prompt 或正文。
- 第一次质量失败携带脱敏上下文、前一稿和错误码纠错一次；第二次失败释放额度，不写 application。成功只保存被引用的脱敏事实、脱敏 JD、逐项 evidence、warnings 和 omitted requirements。
- application 快照独立于简历仓储；删除简历不会删除历史。重复 worker、45 秒截止与 10 分钟 cleanup 竞争依赖任务终态和额度结算幂等保证计数不为负。
- 本地完整链路和页面重建后的 `job.get` 恢复已验证。30 组草案仍为待确认，真实模型准确率、合规率、虚构、耗时和成本不得宣称通过。

### 2026-08-06：阶段 7 改写、记录与反馈

- application 成为同一投递的唯一最新文案记录；手动正文、状态和备忘只覆盖该记录并刷新更新时间，不新增重复历史版本。列表按更新时间倒序，所有详情、更新、删除和反馈均先执行用户隔离。
- 手动文本沿用 AI 检测器但始终允许保存/复制，并额外返回真实可见字符数和段落数；超过 AI 输出 Schema 的长手动文本也必须返回实际计数，不能因为解析失败报告为零。
- `generation.rewrite` 复用 `ai_jobs` 与每日额度，但使用独立 rewrite 仓储保存任务输入快照。创建任务时固定最新正文与 application 版本；完成前版本不一致即冲突失败，避免后台结果覆盖用户后续编辑。
- 改写 worker 固定走 queued → parsing → generating → validating → terminal，最多纠错一次。成功覆盖 application 正文/证据并只结算一次，质量、模型、并发冲突或超时失败释放额度且保留原文。
- 三种预设改写指令由服务端固定；自定义内容只是低优先级不可信数据。整个文本模型请求再次统一脱敏，不允许自定义指令覆盖真实性、隐私、简体中文、长度/段落或逐项证据规则。
- 复制文本由服务端纯规则生成并随详情返回；实际微信剪贴板调用仍属于阶段 9。feedback 以 applicationId 为唯一业务键，覆盖时保留首次创建时间；删除 application 会同时删除其反馈。
- 当前仍是内存仓储与合成模型替身，无法证明 CloudBase 事务、真实异步派发、TokenHub 改写质量、真机剪贴板或实际计费结果。阶段 8 在产品负责人验证前不得开始。

### 2026-08-06：阶段 8 账号删除、清理与管理员运营

- 删除确认凭证明文只在申请响应中返回，仓储只保存带版本域的 SHA-256；10 分钟精确到期。确认与禁用在同一身份仓储操作内完成，写入 `deletionRequestedAt` 和 24 小时截止时间，管理员不能重新启用删除中账号。
- 账号 cleanup 以待删除用户为工作清单，先删除所有业务、文件、日志和该身份幂等映射，最后删除身份索引；任一步异常都会保留身份记录，使下次运行可继续。身份删除成功后才按北京时间日期累加匿名删除数，避免重复 cleanup 重复计数。
- 物理删除覆盖用户、协议/偏好、邀请码关系、简历、任务、生成/改写、投递事实与 JD 快照、反馈、额度/预留、审计、资源日志、临时文件及幂等映射；其他用户记录不受影响。简历单独删除仍保留投递快照。
- 匿名聚合只保留 `dateKey`、固定指标名和计数，不含 userId、身份哈希、任务 ID 或精确事件时间，因此不能回连个人。
- 资源日志使用严格运行时 Schema，只允许五类资源的调用数/单位、估算与实际成本、耗时、状态、模型/Prompt 版本和内容哈希；所有日志必须带内部 userId 以便账号删除，不允许原始 Prompt、正文、截图或联系方式字段。
- 身份审计、额度审计和资源日志只删除严格早于 180 天边界的记录；精确 180 天仍保留。幂等清理由各自 24 小时 `expiresAt` 决定，不受 180 天日志清理影响；未完成任务和匿名聚合不属于该清理范围。
- 当前清理和统计仍为内存端口验证，不能证明 CloudBase 多集合删除、定时触发、事务补偿、真实账单或生产 24 小时 SLA。阶段 9 在产品负责人验证前不得开始。

### 2026-08-06：阶段 9 微信小程序本地界面

- 页面采用原生 TypeScript、WXML、WXSS 和 app.json 三标签导航，不增加跨端框架或 UI 组件库。全局视觉使用暖白、深蓝灰与低饱和青绿，主触控目标至少 88rpx，并为底部安全区预留空间。
- UI 只调用统一 `ApiClient` 的 read/write 接口。当前 app 注入 `createDemoApiClient()`，使协议、邀请码、简历、任务、生成、投递、反馈、删除和管理员契约可完全离线演示；源码完整性测试禁止出现 `wx.cloud`。
- 任务页把最后 jobId 保存到微信本地存储，使用有界轮询恢复排队、解析、等待确认、生成、校验、成功和失败状态。达到本轮轮询上限后只暂停页面查询，不取消后台任务。
- PDF/DOCX 和图片在选择后先执行客户端扩展名、数量和字节提示；这些规则只用于及时反馈，未来服务端仍必须重复验证。演示模式只传递 `demo:` 路径标识，不上传或读取用户文件。
- 结果页从 application 快照解析公司/岗位、逐项证据、未采用要求和警告；手动编辑警告不阻断保存/复制。复制前重新读取服务端组合的 copyText，确保 AI 标识来自可信业务规则。
- 管理员入口只在 `user.get.isAdmin` 为真时显示，页面加载还会再次请求 `auth.status`，业务 API 仍是最终权限边界。演示普通用户无法通过直接路由取得管理员能力。
- 阶段 9 自动化只证明页面文件、绑定、纯交互契约和 30 组合成结果映射。微信文件选择器、真实剪贴板、字号放大、前后台切换、iOS/Android 安全区和弱网行为必须由产品负责人完成 9.15 真机验收。

## 9. 实际构建与检查图

根级 TypeScript 配置引用 shared、三个云函数和 miniprogram。`npm run typecheck` 对全部源代码与测试执行无输出严格检查；`npm run build` 编译五个模块，生成物进入 `dist/` 并被 Git 忽略。微信开发者工具同时使用 TypeScript 编译插件构建 `miniprogram/` 源码。

`npm run check` 按顺序执行：格式检查 → fixture 隔离检查 → TypeScript 检查 → 全部 Vitest → 五模块构建。任一步失败都会保留非零退出码并停止后续命令。阶段 9 本地实现结束时为 85 个测试文件、274 项测试。环境变量检查单独执行，因为尚未获准配置真实外部资源。

## 10. 仓库文件职责

以下清单描述阶段 9 本地实现结束时的项目源文件；`node_modules/` 与 `dist/` 是可重建产物，不属于架构源文件。

### 根目录

- `AGENTS.md`：贡献者约束、目录规范、测试要求以及写代码前必须阅读的记忆文档。
- `.gitignore`：排除依赖、构建、环境密钥、覆盖率和本地工作区产物。
- `.env.example`：只列外部资源变量和默认关闭的能力开关，不保存真实值。
- `package.json`：锁定直接依赖和 format、fixture、env、typecheck、test、build、check 命令。
- `package-lock.json`：锁定完整依赖树，保证 `npm ci` 可重复安装。
- `project.config.json`：微信开发者工具本地项目配置，固定 touristappid、小程序根目录和 TypeScript 编译插件，不保存真实 AppID。
- `tsconfig.base.json`：shared 与三个云函数共用的严格 TypeScript 规则。
- `tsconfig.json`：构建入口，通过 project references 连接四个可编译模块。
- `tsconfig.check.json`：对全部 TypeScript 源文件和测试执行无输出类型检查。
- `vitest.config.mjs`：统一 Vitest 的 Node 环境、测试匹配范围和超时。

### 工具脚本

- `scripts/check-format.mjs`：检查 LF、文件末尾换行、尾随空白、BOM 和 JSON 两空格格式。
- `scripts/check-fixtures.mjs`：拒绝未声明合成来源的文本 fixture，并要求二进制侧车元数据。
- `scripts/check-env.mjs`：列出缺失环境变量；不读取或输出密钥值。

### 产品与服务骨架

- `miniprogram/README.md`：说明本地导入方式、演示邀请码、阶段 9 验收路径和未授权能力边界。
- `miniprogram/app.json`：注册 14 个页面、三标签导航和全局窗口样式。
- `miniprogram/app.ts`：创建小程序实例，并把单一演示运行时注入 globalData。
- `miniprogram/app.wxss`：定义暖白/深蓝灰/青绿视觉、卡片、表单、状态、按钮、88rpx 触控高度和安全区规则。
- `miniprogram/sitemap.json`：禁止邀请制内测页面进入微信搜索索引。
- `miniprogram/tsconfig.json`：小程序独立严格 TypeScript 构建配置。
- `miniprogram/core/routes.ts`：页面顺序、三标签清单和标签路由判断的单一来源。
- `miniprogram/core/presenters.ts`：把登录准入、首页简历/额度/资源状态转换成稳定显示模型。
- `miniprogram/core/input-rules.ts`：客户端文档/图片边界、图片重排、偏好字数和分句预览纯规则。
- `miniprogram/core/job-poller.ts`：有限退避轮询、终态/等待确认返回和可恢复暂停错误。
- `miniprogram/core/result-presenter.ts`：把脱敏事实/JD 快照与逐项证据转换成结果页标签，并处理“贵司”和警告文案。
- `miniprogram/services/api-client.ts`：统一客户端 action、读写、UUID requestId、网络异常和 API 错误归一。
- `miniprogram/services/demo-api.ts`：离线进程内演示协议、简历、任务、生成、记录、反馈、删除和管理员契约；禁止作为生产仓储或鉴权。
- `miniprogram/services/runtime.ts`：持有演示 API、演示邀请码和最后 jobId 的微信本地存储恢复接口。
- `miniprogram/services/page-utils.ts`：集中处理提示、错误消息和常用导航。
- `miniprogram/pages/login/index.{json,wxml,ts}`：协议版本、邀请码、管理员免码/禁用状态和首页准入。
- `miniprogram/pages/home/index.{json,wxml,ts}`：默认简历、今日额度、资源暂停、JD 入口和最近记录。
- `miniprogram/pages/resumes/index.{json,wxml,ts}`：三份简历列表、等待确认恢复、默认切换和删除。
- `miniprogram/pages/resume-upload/index.{json,wxml,ts}`：PDF、DOCX、图片和文本选择及上传前边界提示。
- `miniprogram/pages/resume-edit/index.{json,wxml,ts}`：解析任务恢复、结构化事实编辑和简历确认。
- `miniprogram/pages/preferences/index.{json,wxml,ts}`：500 字偏好、分句预览、保存和清空。
- `miniprogram/pages/generation/index.{json,wxml,ts}`：默认简历选择、JD 多图重排/文字粘贴、请求去重和任务创建。
- `miniprogram/pages/job/index.{json,wxml,ts}`：jobId 恢复、状态轮询、弱网暂停和下一流程路由。
- `miniprogram/pages/jd-confirm/index.{json,wxml,ts}`：岗位名必填、公司名可空、职责修订和同任务继续。
- `miniprogram/pages/result/index.{json,wxml,ts}`：正文、证据、遗漏、警告、手动编辑、改写、复制、状态、备忘和反馈。
- `miniprogram/pages/records/index.{json,wxml,ts}`：未投递/已投递筛选、空态和详情导航。
- `miniprogram/pages/application-detail/index.{json,wxml,ts}`：投递正文/备忘快照、结果编辑入口和单条删除。
- `miniprogram/pages/mine/index.{json,wxml,ts}`：简历/偏好/协议入口、管理员隐藏入口和账号删除二次确认。
- `miniprogram/pages/admin/index.{json,wxml,ts}`：二次管理员鉴权、统计、邀请码、用户启停和当日额度操作。
- `shared/README.md`：说明共享 Schema、类型、错误码、状态机和纯规则边界。
- `shared/tsconfig.json`：共享模块的独立构建配置。
- `shared/src/index.ts`：共享模块唯一公共导出入口。
- `shared/src/beijing-date.ts`：供 api 与 cleanup 共用的固定 UTC+8 北京日期键，避免云函数模块反向依赖。
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
- `cloudfunctions/api/src/account-deletion-service.ts`：10 分钟二次确认凭证、哈希保存、立即禁用与 24 小时删除截止语义。
- `cloudfunctions/api/src/admin-stats-service.ts`：组合身份、邀请、当日额度、审计和五类资源元数据的管理员统计视图。
- `cloudfunctions/api/src/application-domain.ts`：投递记录、最新手动正文、状态/备忘、手动警告、脱敏事实/JD 快照和逐项证据的数据类型。
- `cloudfunctions/api/src/application-repository.ts`：application 仓储端口及按用户列表、详情、版本条件保存、删除和按 job 补偿的内存实现。
- `cloudfunctions/api/src/application-service.ts`：投递记录用户隔离、筛选排序、手动正文测量/警告、复制组合、状态/备忘更新和关联数据删除。
- `cloudfunctions/api/src/feedback-domain.ts`：满意/需改进、可选说明和首次/最新时间的数据类型。
- `cloudfunctions/api/src/feedback-repository.ts`：以 applicationId 为唯一业务键的反馈仓储端口和覆盖式内存实现。
- `cloudfunctions/api/src/feedback-service.ts`：反馈所有权、500 字边界、创建/覆盖/清空和详情读取规则。
- `cloudfunctions/api/src/generation-domain.ts`：生成创建/确认请求 Schema、任务输入快照和生成领域状态。
- `cloudfunctions/api/src/generation-repository.ts`：生成记录仓储端口及状态条件写入、job 查询和残留文件扫描的内存实现。
- `cloudfunctions/api/src/jd-input-validation-service.ts`：JD 文本的 Unicode/20,000 字门禁及有序图片所有权/文件门禁组合。
- `cloudfunctions/api/src/generation-workflow-service.ts`：`generation.create` 的确认简历访问、输入快照、任务创建、异步派发和派发失败图片补偿。
- `cloudfunctions/api/src/generation-preparation-service.ts`：认领初始生成任务、OCR/解析状态、有序提取、图片删除、低置信等待和 44 秒准备截止。
- `cloudfunctions/api/src/generation-confirmation-service.ts`：`generation.confirmJd` 的所有权/状态/Schema 校验、首次额度预留、同 job 继续派发和失败补偿。
- `cloudfunctions/api/src/generation-execution-service.ts`：单一总截止、首次生成/一次纠错、确定性质量门、application 快照和终态额度结算。
- `cloudfunctions/api/src/generation-rewrite-domain.ts`：四类改写输入 Schema、最新正文/application 版本快照和 rewrite 任务状态。
- `cloudfunctions/api/src/generation-rewrite-repository.ts`：rewrite 任务仓储端口及内存实现。
- `cloudfunctions/api/src/generation-rewrite-workflow-service.ts`：`generation.rewrite` 的本人记录读取、最新正文快照、任务创建和异步派发。
- `cloudfunctions/api/src/generation-rewrite-execution-service.ts`：改写认领、额度、44 秒截止、一次纠错、逐项质量门、版本条件覆盖和终态结算。
- `cloudfunctions/api/src/identity-domain.ts`：用户、协议、邀请码和管理员审计记录的数据类型。
- `cloudfunctions/api/src/identity-repository.ts`：身份领域仓储端口及支持删除确认、待删除扫描、身份清除、管理员统计和审计保留的本地原子实现。
- `cloudfunctions/api/src/user-service.ts`：身份哈希、首次用户创建、禁用访问规则和偏好更新。
- `cloudfunctions/api/src/agreement-service.ts`：协议版本接受、当前版本判断和业务动作门禁。
- `cloudfunctions/api/src/invite-service.ts`：邀请码规范化哈希、7 天有效期、创建和原子消费。
- `cloudfunctions/api/src/identity-api.ts`：组合身份、协议、邀请、偏好、任务、投递、删除和管理员运营 action 的本地 API。
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
- `cloudfunctions/api/src/operations-domain.ts`：五类资源日志的严格元数据 Schema 与聚合输出类型，拒绝未声明原文字段。
- `cloudfunctions/api/src/operations-repository.ts`：资源调用元数据写入、北京时间日汇总、账号删除和 180 天清理的内存仓储。
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
- `cloudfunctions/worker/src/generation-processing-error.ts`：JD/生成模型输出的稳定处理错误码与重试语义。
- `cloudfunctions/worker/src/jd-structure-parser.ts`：严格 `JobDescription` JSON/Schema 解析和一次主备切换。
- `cloudfunctions/worker/src/jd-parse-pipeline.ts`：按顺序 OCR 或接收粘贴 JD，统一文字边界、本地遮盖和结构化解析。
- `cloudfunctions/worker/src/greeting-model-gateway.ts`：文本模型主备、单次超时、429/失败/无效输出归一及无正文哈希日志。
- `cloudfunctions/worker/src/greeting-generation-pipeline.ts`：把事实 ID、脱敏 JD 和纠错上下文转换为不含图片/fileId 的再次遮盖文本请求。
- `cloudfunctions/worker/src/greeting-rewrite-pipeline.ts`：把固定改写模式、低优先级自定义指令、最新正文和快照转换为再次脱敏的文本模型请求。
- `cloudfunctions/cleanup/README.md`：限定 cleanup 负责超时、文件、过期数据和账号删除，并说明当前无真实调度。
- `cloudfunctions/cleanup/tsconfig.json`：cleanup 的独立构建配置，并引用 shared。
- `cloudfunctions/cleanup/src/index.ts`：cleanup 领域模块公共导出入口，不创建定时器或云连接。
- `cloudfunctions/cleanup/src/resume-cleanup-service.ts`：24 小时草稿与 1 小时孤立文件的精确、幂等回收规则。
- `cloudfunctions/cleanup/src/generation-file-cleanup-service.ts`：对 OCR 后仍残留的 JD fileId 重试所有权删除，只清除已删除引用。
- `cloudfunctions/cleanup/src/account-deletion-cleanup-service.ts`：按待删除身份幂等清空全部可关联数据，并在身份删除后累加不可回连的匿名日指标。
- `cloudfunctions/cleanup/src/operational-log-cleanup-service.ts`：执行严格 180 天日志保留及独立的 24 小时幂等过期清理。
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
- `tests/unit/jd-input-validation.test.ts`：验证 JD 图片顺序/所有权/损坏门禁和提示式文本的 20,000 字边界。
- `tests/unit/jd-structure-parser.test.ts`：验证中英文、缺公司/岗位、重复字段冲突和一次备用解析。
- `tests/unit/greeting-model-gateway.test.ts`：验证超时、429、无效 JSON、主备次数及日志无原文。
- `tests/unit/operations-logging.test.ts`：验证资源日志拒绝原文字段，并按五类资源汇总调用、失败和成本元数据。
- `tests/unit/miniprogram-routing.test.ts`：锁定 14 个页面顺序、三标签路由与普通流程页边界。
- `tests/unit/miniprogram-access-home.test.ts`：验证登录六态显示规则与首页无简历、额度耗尽、资源暂停、最近记录状态。
- `tests/unit/miniprogram-api-client.test.ts`：验证客户端读写 requestId、网络异常、失败响应、异常响应归一和弱网错误分类。
- `tests/unit/miniprogram-inputs.test.ts`：验证客户端 PDF/DOCX、图片数量/大小、图片重排和偏好预览规则。
- `tests/unit/miniprogram-job-poller.test.ts`：验证有界退避、等待确认、成功终态和轮询暂停恢复。
- `tests/unit/miniprogram-result-presenter.test.ts`：验证事实/JD 证据标签、“贵司”提醒和未知来源安全回退。
- `tests/contract/health.test.ts`：证明外部提供商契约测试分组可在无真实服务时运行。
- `tests/contract/tencent-ocr-adapter.test.ts`：验证 OCR 成功元数据、所有权、低置信、超时、429 和资源暂停。
- `tests/contract/resume-privacy-chain.test.ts`：捕获 OCR/模型请求，证明原图只到 OCR 且五类敏感值不进入模型。
- `tests/contract/greeting-privacy-chain.test.ts`：捕获首次/纠错文本请求，证明受保护值、图片和 fileId 不进入模型。
- `tests/contract/greeting-rewrite-pipeline.test.ts`：验证三种预设指令、自定义指令优先级和改写正文/事实/指令的统一脱敏。
- `tests/integration/health.test.ts`：证明本地集成测试不依赖云资源。
- `tests/integration/identity-access.test.ts`：验证管理员启动、同码并发、跨用户隔离、协议变化和账号禁用的完整本地链路。
- `tests/integration/task-infrastructure.test.ts`：验证重复创建、恢复查询、后台完成、额度结算、跨日并发、45 秒上限和 10 分钟回收的完整本地链路。
- `tests/integration/resume-parse-api.test.ts`：验证四种解析入口、立即返回、幂等合并和协议/激活门禁。
- `tests/integration/resume-parse-worker.test.ts`：验证认领、OCR/解析状态、job.get 可编辑结果、安全失败和确认守卫。
- `tests/integration/resume-confirm.test.ts`：验证修改后事实重算、原文件删除、默认、任务完成、重复确认和跨用户拒绝。
- `tests/integration/resume-management.test.ts`：验证列表隔离、默认切换/重选、删除和三份上限。
- `tests/integration/resume-cleanup.test.ts`：验证 24 小时草稿、1 小时孤立文件、引用保护和重复清理。
- `tests/integration/resume-input-closure.test.ts`：用真实提取器与本地外部替身验证四类输入的解析—确认—默认完整闭环。
- `tests/integration/generation-create-api.test.ts`：验证已确认简历、立即返回、资源暂停、幂等和派发失败图片补偿。
- `tests/integration/generation-preparation.test.ts`：验证有序 OCR、遮盖、立即删除、低置信等待和安全失败。
- `tests/integration/generation-confirm-jd.test.ts`：验证同任务确认继续、用户/状态隔离、额度延后预留和派发失败补偿。
- `tests/integration/generation-quality-execution.test.ts`：验证“贵司”、格式/证据质量门、一次纠错、二次失败、总截止和快照。
- `tests/integration/generation-file-cleanup.test.ts`：验证 post-OCR 残留文件重试和引用清除。
- `tests/integration/generation-quota-race.test.ts`：验证重复 worker 与 10 分钟 cleanup 竞争下唯一终态和额度非负。
- `tests/integration/generation-full-chain.test.ts`：验证创建、解析、生成、快照、删除原简历和页面重建恢复的完整本地闭环。
- `tests/integration/application-management.test.ts`：验证投递筛选排序、跨用户隐藏、手动警告、状态/备忘、复制组合和删除。
- `tests/integration/application-feedback.test.ts`：验证每条记录一条可覆盖反馈、500 字边界、清空、隔离和级联删除。
- `tests/integration/generation-rewrite.test.ts`：验证最新正文快照、异步幂等、一次纠错、硬质量门、模型错误、额度和失败不覆盖。
- `tests/integration/account-deletion-confirmation.test.ts`：验证无凭证、10 分钟过期、有效确认、幂等回放、立即禁用和不可恢复。
- `tests/integration/account-deletion-cleanup.test.ts`：验证简历与账号删除差异、全数据清除、跨用户保护、匿名聚合不可回连及重复 cleanup。
- `tests/integration/admin-operations.test.ts`：验证四类管理员写操作的审计/幂等、可信白名单边界和统计输出。
- `tests/integration/log-retention-cleanup.test.ts`：验证 180 天精确边界、账号关联日志清理和未完成任务/匿名指标/有效幂等保护。
- `tests/integration/miniprogram-demo-api.test.ts`：离线走通协议/邀请码、简历/偏好、JD 确认、改写/复制/反馈和账号删除。
- `tests/integration/miniprogram-page-contracts.test.ts`：锁定路由、三标签、核心中文文案、加载/弱网/重试/AI 标识和可见破折号约束。
- `tests/integration/miniprogram-result-fixtures.test.ts`：把阶段 0 的 30 个编号样本映射为结果视图，验证逐项来源与公司回退不缺失。
- `tests/integration/miniprogram-ui-integrity.test.ts`：检查每个路由的配置/模板/控制器、WXML 处理器绑定、触控/安全区和零 wx.cloud 边界。
- `tests/model-evaluation/fixture-structure.test.ts`：机器检查 30 组样本编号、必需段落和六类字段真值。
- `tests/fixtures/README.md`：描述评测样本格式、覆盖矩阵和人工确认流程。
- `tests/fixtures/phase-0-cases.md`：保存 30 组完全虚构的阶段 0 样本草案与字段真值。

### 记忆库

- `memory-bank/design-document.md`：产品需求和系统边界的最高优先级基线。
- `memory-bank/tech-stack.md`：实现设计目标的技术选择与不采用项。
- `memory-bank/implementation-plan.md`：按阶段、步骤和验证项驱动开发。
- `memory-bank/progress.md`：记录真实完成状态、验证证据、例外授权和阻塞。
- `memory-bank/architecture.md`：记录实际架构、文件职责、数据流和关键决策演变。
