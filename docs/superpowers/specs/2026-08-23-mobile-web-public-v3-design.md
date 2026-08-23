# ApplyMate Web v3 正式公开站设计规格

**日期：** 2026-08-23
**状态：** 产品负责人已批准，进入实施
**目标分支：** `codex/mobile-web-public-v3`
**Legacy 基线：** `legacy-miniprogram-final` → `b99be7e`

## 1. 产品决定

ApplyMate 的正式交付从微信小程序改为移动优先公开网站。项目不推倒重来，继续复用现有 React/Vite Web 骨架、共享 Schema、CloudBase `api/worker/cleanup`、OCR 与脱敏链路、TokenHub Hy3、幂等额度、测试 fixtures 和既有视觉语言。

微信 AppID、OpenID、邀请码、小程序页面、微信开发者工具与小程序发布流程全部退出正式产品。Legacy 小程序以 Git 标签归档，不迁移旧用户、OpenID、测试数据或历史环境数据，也不修改产品负责人本机维护的 `project.config.json` 和 `project.private.config.json`。

正式产品只承诺手机浏览器体验。桌面浏览器显示居中的手机版内容区，不扩展桌面信息密度。产品不提供 PWA 安装、Service Worker 离线缓存、AI 改写或全站日总次数。

## 2. 用户与公开信息架构

公开页面：

- `/`：产品首页，说明价值、三步流程、适用人群、隐私边界、AI 标识和六个月服务周期。
- `/login`：CloudBase 邮箱验证码开放注册与登录。
- `/legal`：用户协议、隐私政策和 AI 服务说明。
- `/support`：联系方式、常见问题、服务阶段和数据操作说明。

登录后的业务页面统一位于 `/app/*`：

- `/app`：用户首页。
- `/app/resumes`、`/app/resumes/new`、`/app/resumes/:id/review`：简历管理。
- `/app/preferences`：求职偏好。
- `/app/jobs/new`、`/app/jobs/:jobId`：JD 输入与任务恢复。
- `/app/results/:applicationId`：结果编辑、复制与保存。
- `/app/records`、`/app/records/:id`：投递记录。
- `/app/account`：账户、导出、退出与删除。
- `/app/admin`：只读运营统计与受保护管理操作。

路由使用 `BrowserRouter`。CloudBase 静态托管必须配置未知路径回退到 `index.html`，并验证直达和刷新。业务导航不暴露 Hash 路由。

## 3. 前端架构与性能

浏览器平台能力在三个 seam 后隔离：

1. `SessionPort`：会话恢复、邮箱验证码、登出。
2. `TemporaryUploadPort`：临时上传、短期 URL、删除。
3. `BusinessApiPort`：统一 `{ action, payload, requestId }` 云函数调用。

页面和业务 feature 只依赖这些小接口，不直接调用 CloudBase SDK。OCR、TokenHub 与 CloudBase 继续作为服务端 Adapter，业务规则不感知 provider 细节。

所有业务路由使用懒加载；文本型 PDF 解析保持按需动态加载；生产构建关闭公开 source map。首屏主 JavaScript gzip 硬门为 200KB，路由级代码与 PDF 引擎不得进入公开首页首包。

移除 `manifest.webmanifest`、Service Worker 注册和安装入口。发布时主动注销旧 ApplyMate Service Worker 并清理旧站点外壳缓存，避免已访问用户被旧版本控制。

交互使用应用内可访问组件，不调用 `window.prompt` 或 `window.confirm`：

- 移动底部操作菜单承载简历等上下文操作。
- 对话框承载删除、放弃和不可撤销确认。
- 加载、空态、错误、弱网、只读期和下线状态采用统一展示。
- 弹层具备标题、说明、可聚焦按钮、Esc 关闭和背景点击规则；破坏性操作必须显式二次确认。

## 4. JD 图片准备与上传

JD 最多 5 张，准备与上传最大并发均为 3。用户选择后立即在 Web Worker/Canvas 后台准备并上传临时文件；点击“生成开场白”后才创建 `generation.create`，从而启动 OCR 和模型任务。

固定候选为：

| 候选 | 长边 | JPEG 质量 |
| --- | ---: | ---: |
| A | 720 | 0.80 |
| B | 1080 | 0.78 |
| C | 1440 | 0.75 |

正式 A/B 使用固定合成及人工确认样本比较关键字段保留率、字段回归、字节数、浏览器准备耗时、上传耗时、OCR 耗时和端到端耗时。机械选择规则为：先筛选关键字段保留率至少 99% 且无关键字段回归的候选，再选字节最小者；全部失败时固定使用 1440/Q75。运行时不根据用户内容做自由模型选择，也不把评测原文持久化。

## 5. 身份与信任边界

正式生产身份只接受 CloudBase 可信上下文中的注册邮箱 UID。匿名身份与 `WX_OPENID` 只可在旧环境 Legacy 路径存在，不能进入新生产业务。

客户端输入中的 `uid`、`email`、`openid`、`userId`、`identityHash` 及大小写/嵌套变体继续递归删除。业务数据库不保存邮箱明文，只保存带版本域的内部身份哈希。所有业务读取、更新、导出和删除都必须同时限定当前内部 `userId`；跨用户资源统一返回不存在。

新生产环境使用显式 `email_only` 身份模式。环境变量缺失或运行时无法证明注册邮箱身份时失败关闭，不自动回退匿名或 OpenID。

## 6. 服务阶段

公共契约：

```ts
type ServicePhase = "active" | "read_only" | "retired";

type AiAvailability =
  | "available"
  | "budget_paused"
  | "scheduled_closed"
  | "resource_paused";

interface ServiceAccess {
  phase: ServicePhase;
  aiAvailability: AiAvailability;
  aiClosesAt: string;
  dataAccessEndsAt: string;
}
```

`publicLaunchAt` 是公开注册开放时间。按北京时间自然月计算：

- 未满 2 个自然月：`active`，在资源和预算均可用时允许新 AI 任务。
- 满 2 个自然月：`read_only`，禁止新简历解析和生成，保留登录、查看、复制、导出和自助删除。
- 满 6 个自然月：`retired`，业务数据读取关闭，只保留公开说明和支持入口。

最终全量删除不由定时任务直接执行。cleanup 只能输出退休期删除清单与核对结果；生产删除必须经过独立破坏性操作授权。

构建期公开配置与服务端 `service_config` 使用同一组日期值。`auth.status` 和 `user.get` 返回 `serviceAccess`，匿名首页不新增业务 API。

## 7. 额度、并发与月度预算

普通用户每日成功生成 20 次，同时最多 1 个 AI 任务；任意滚动 10 分钟最多创建 3 次。失败、超时和幂等重放不计成功额度。项目不设全站日次数。

每月总预算固定 100 元，覆盖 CloudBase 固定套餐、OCR、TokenHub、存储和流量。80 元产生告警；当“实际/保守结算 + 已预留 + 固定成本”达到 90 元时，停止接收新 AI 任务，留下 10 元账单延迟缓冲。管理员网页不能提高 100 元上限。

新增集合：

- `service_config`：公开上线时间、阶段日期、身份模式、资源暂停状态和配置版本。
- `budget_periods`：月度上限、告警线、停止线、固定成本、官方账单快照、已结算和已预留金额。

`generation.create` 在同一事务中完成：

1. 校验服务为 `active` 且 AI 可用。
2. 校验当前用户没有活动 AI 任务及 10 分钟创建限制。
3. 校验用户当日 `reserved + succeeded < 20`。
4. 校验预算预留后仍低于 90 元停止线。
5. 创建任务并写入用户额度与预算预留。

成功时一次性把额度与预算从预留转为结算；失败、45 秒内部截止、10 分钟 stale cleanup 和 worker/cleanup 竞争均只释放一次。相同 requestId/负载重放原结果，不新增任务、额度或预算预留。

## 8. API 与导出

- `generation.create` 始终快返 `{ jobId }`，新增 `MONTHLY_BUDGET_EXHAUSTED`、`SERVICE_READ_ONLY` 和 `ACTIVE_JOB_EXISTS`。
- 正式 Web 不注册或调用 `generation.rewrite`。
- `user.export` 使用游标分页返回版本化 JSON 片段。浏览器读取所有页后在内存中组成单个 JSON Blob 并下载，不写入云存储。
- `admin.stats` 增加固定成本、预留、结算、官方账单快照、预算状态和服务阶段。
- `auth.status` 和 `user.get` 增加 `serviceAccess`。

CloudBase 部署入口只负责初始化与 Adapter 装配。身份、预算、生命周期、额度、任务状态与导出逻辑位于严格 TypeScript module；`deploy/` 中不得长期维护第二套业务规则。短期仍需 CommonJS 时，只允许薄包装并以共享契约测试锁定。

## 9. 数据生命周期

- 首份简历确认后立即删除原件。
- JD 图片处理后立即删除。
- 孤立临时文件最多保留 1 小时。
- 未确认简历草稿最多保留 24 小时。
- AI 与审计日志最长保留 180 天，且不保存原始简历、JD、Prompt、模型原始响应或正文。
- 用户自助删除立即禁用账号，24 小时内删除全部可关联数据。
- `read_only` 仍执行短期文件、草稿、任务、日志与用户删除清理。
- `retired` 只生成全量删除前核对清单，不越过独立授权。

## 10. 环境与上线

旧 CloudBase 环境仅作 Legacy/预发布，不迁移数据。重新登录 CLI 后先只读盘点套餐期限、函数、触发器、托管、认证、CORS、数据库/存储权限、OCR/TokenHub 额度和账单；盘点阶段不部署、续费或创建资源。

新建独立 CloudBase 生产环境。上线顺序固定为：

1. 旧环境预发布验证。
2. 新生产环境关闭 AI 部署。
3. 域名、HTTPS 与备案。
4. 合成探针。
5. 两个真实邮箱隔离测试。
6. 30 次真实生成验收。
7. 专业合规复核。
8. 开放邮箱注册。

正式域名优先 `toulema.cn`，其次 `toulema.com.cn`、`toulemaapp.cn`。购买前必须在注册商再次确认。域名一次性费用不进入每月 100 元云资源预算。

域名购买、套餐开通、新环境创建、备案、密钥、生产部署和最终数据删除全部需要单独授权。付款、实名、验证码和密码由产品负责人本人完成。

## 11. 验收门槛

自动化覆盖邮箱登录与协议、四类简历输入、JD 图片/文字、后台压缩上传、任务恢复、AI 标识复制、记录、导出、自助删除、跨用户隐藏、预算并发、幂等、只读期和退休期。

浏览器 E2E 在 320/390/430px 验证截图、44px 触控目标、软键盘、横向溢出、路由直达/刷新和无 Service Worker 缓存。真机覆盖 iOS Safari、Android Chrome 和微信内置浏览器的相册/相机、邮箱验证码、后台恢复与剪贴板。

正式质量验收执行 30 次生成：人工质量均分至少 4.2/5，零虚构、零串台、零未遮盖隐私；选图到正文 P50 不超过 15 秒、P95 不超过 20 秒。

TokenHub 固定正式 `hy3`，不自动切换备用模型。当前额度、价格或 30 次质量门任一失败即阻止上线并回到产品决策。

公开注册前必须完成专业合规复核。正文和复制内容保留显式 AI 标识，并公示模型及备案/登记信息。

## 12. 明确不在本地实施范围的动作

本规格授权本地代码、测试、文档、Git 分支和 Legacy 标签改造；不授权以下外部或不可逆操作：

- CloudBase 登录、续费、新环境创建、集合创建、函数/托管部署。
- 域名购买、备案、实名、付款、邮箱验证码或密码输入。
- OCR/TokenHub 付费开通、密钥创建或额度购买。
- 对旧环境、旧用户或任何生产数据执行迁移或删除。
- 在没有独立删除清单核对与授权时执行退休期全量删除。
