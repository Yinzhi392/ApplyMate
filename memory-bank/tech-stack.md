# 《投了吗》ApplyMate 技术栈选型

**版本：** MVP v1.0
**日期：** 2026-08-05
**依据：** [`design-document.md`](./design-document.md)
**文档关系：** 设计文档定义产品需求与边界，本文档定义实现这些需求的技术选择；如有冲突，以设计文档为准。
**选型目标：** 简单、健壮、适合中国大陆微信用户，并能支撑 30–100 人邀请制内测。

## 1. 最终推荐

采用一套完整的腾讯生态方案：

> **微信原生小程序 + TypeScript + CloudBase 普通云函数 + CloudBase 文档数据库/云存储 + 腾讯 TokenHub**

前后端统一使用 TypeScript。小程序不使用跨端框架，后端不使用 Web 框架、ORM、工作流框架或独立服务器。所有业务从一个 `api` 云函数进入，另设一个 `cleanup` 定时云函数处理数据清理。

| 层级 | 推荐技术 | 用途 |
|---|---|---|
| 客户端 | 微信原生小程序、TypeScript、WXML、WXSS | 登录、文件选择、JD 上传、结果编辑与投递记录 |
| UI | 原生组件、自建少量业务组件、WXSS 设计变量 | 保持包体小、行为稳定、视觉统一 |
| 服务端 | CloudBase 普通云函数、Node.js `Nodejs20.19`、TypeScript | API、权限、文件解析、AI 编排、事实校验 |
| 云端 SDK | `wx-server-sdk` 当前稳定版 | 获取可信 OpenID，访问数据库与云存储 |
| 数据库 | CloudBase 文档数据库 | 用户、简历、投递记录、任务、额度和审计数据 |
| 文件存储 | CloudBase 云存储 | 临时保存简历原文件和 JD 截图 |
| AI | 腾讯 TokenHub OpenAI 兼容 HTTP API | 简历/JD 识别、文案生成和改写 |
| 数据校验 | Zod | API 入参、模型 JSON 和持久化前结构校验 |
| DOCX 解析 | Mammoth `extractRawText` | 只提取文字，不渲染用户提供的 HTML |
| PDF 解析 | unpdf | 提取文本型 PDF 的文字和页数 |
| 测试 | Vitest + 脱敏 fixtures | 单元、契约、模型回归和质量门测试 |
| 构建与部署 | npm、TypeScript Compiler、CloudBase CLI、微信开发者工具 | 依赖管理、编译、部署与真机调试 |

CloudBase 当前将 `Nodejs20.19` 作为默认且推荐的普通云函数运行时；文档数据库支持多文档事务，适合实现额度预留、邀请码消费和幂等写入。[CloudBase 云函数配置](https://docs.cloudbase.net/cli-v1/functions/configs) [CloudBase 事务](https://docs.cloudbase.net/database/transaction)

## 2. 为什么这是最合适的方案

### 2.1 与真实使用场景一致

用户主要从 Boss 直聘等应用截图，再切换到微信使用 ApplyMate。微信原生小程序无需下载、登录路径短，也不会受到 Vercel 在中国大陆访问质量不稳定的影响。

小程序可以直接通过 `wx.cloud.callFunction` 调用 CloudBase 云函数，微信身份会随调用链传递；云函数使用 `getWXContext()` 获取的 OpenID 不能被客户端请求参数伪造，因此不需要另建账号、Token 和刷新机制。[CloudBase 小程序调用云函数](https://docs.cloudbase.net/recipes/add-cloud-function-wechat-miniprogram)

### 2.2 足够简单

- 只有一个客户端和两个云函数。
- 不维护服务器、容器、域名、反向代理或独立数据库。
- 前后端同为 TypeScript，不需要同时维护 JavaScript、Python 和 SQL 三套技术。
- 文档数据库可以直接保存结构化简历和生成结果，无需 ORM。
- TokenHub 提供 OpenAI 兼容接口，使用 Node.js 原生 `fetch` 即可，不需要再引入 OpenAI SDK。

### 2.3 关键位置足够健壮

- 所有入参和模型输出由 Zod 在运行时校验，不能只依赖 TypeScript 类型。
- 每条简历事实都有稳定 `factId`，生成结果必须引用事实来源。
- 额度、邀请码和幂等认领使用服务端事务，不使用进程内变量。
- 文件、数据库记录和 AI 调用均按服务端 OpenID 隔离。
- AI 模型隐藏在统一适配器后，可更换模型而不改业务代码。
- 模型失败和质量门失败时释放额度，不产生“扣次但无结果”。

## 3. 客户端技术栈

### 3.1 微信原生小程序

使用：

- TypeScript
- WXML
- WXSS
- 原生 Page/Component
- `wx.cloud`、`wx.chooseMessageFile`、`wx.chooseMedia`、`wx.cloud.uploadFile`

微信官方维护 TypeScript API 类型定义和原生组件生态，适合本项目单平台、移动优先的目标。[微信小程序官方 GitHub 组织](https://github.com/wechat-miniprogram?language=typescript)

不使用 Taro、uni-app 或 React 小程序框架，原因是 MVP 没有多端需求。跨端框架会增加构建层、调试链路、运行差异和包体积，却不能提升核心 AI 能力。

### 3.2 页面状态

MVP 不引入 Redux、MobX 或其他状态库。

- 页面内部状态放在 Page `data`。
- 登录态、当前用户和默认简历 ID 放在 `App.globalData`。
- 页面重新显示时从云端刷新关键数据，不把本地缓存当作事实来源。
- 只缓存无敏感信息的界面偏好和最近一次任务 ID。

如果后续出现大量跨页面实时联动，再评估轻量状态库；MVP 阶段不提前引入。

### 3.3 UI 组件

优先使用原生组件并自建以下少量组件：

- `app-button`
- `status-card`
- `resume-switcher`
- `upload-list`
- `empty-state`
- `quota-pill`
- `confirm-dialog`

颜色、间距、圆角、阴影和字号统一放在 WXSS 变量文件中。暂不引入完整 UI 框架，避免为少量页面承担额外样式覆盖和升级成本。

## 4. 服务端技术栈

### 4.1 CloudBase 普通云函数

使用两个函数：

1. `api`：处理所有用户与管理员 action。
2. `cleanup`：定时清理临时文件、过期草稿、幂等记录和审计日志。

不使用 Express、NestJS 或 HTTP 云函数。小程序可直接调用普通云函数，Web 路由、Cookie、CORS 和 JWT 在该场景中都属于不必要复杂度。

推荐配置：

| 配置 | `api` | `cleanup` |
|---|---:|---:|
| 运行时 | Nodejs20.19 | Nodejs20.19 |
| 超时 | 30 秒 | 60 秒 |
| 内存 | 512MB 起 | 256MB 起 |
| 触发方式 | 小程序调用 | 定时触发器 |

模型调用不得放进数据库事务。事务只负责短时间的额度预留、状态转换和幂等认领；CloudBase 官方也明确建议不要在事务内调用外部 API。[CloudBase 事务限制](https://docs.cloudbase.net/database/transaction)

### 4.2 统一 API

继续使用设计文档确定的请求形式：

```text
{ action, payload, requestId }
```

实现方式为普通 TypeScript action router，不使用路由框架。每个 action 只做三件事：

1. Zod 校验输入。
2. 调用一个领域服务。
3. 返回统一结果或统一错误。

服务端从 CloudBase 上下文读取 OpenID，忽略 payload 中任何用户身份字段。

### 4.3 代码边界

后端建议分为五层：

```text
handler → schema → service → repository/model-adapter → CloudBase/TokenHub
```

- `handler`：解析 action、身份、权限和统一响应。
- `schema`：Zod 请求与模型返回结构。
- `service`：简历、生成、额度、邀请和记录规则。
- `repository`：数据库与云存储访问。
- `model-adapter`：TokenHub 请求、超时、备用模型和用量元数据。

业务层只暴露 `parseResume`、`generateGreeting` 和 `rewriteGreeting`，不允许页面或 action 直接使用模型 ID。

## 5. 数据库与文件存储

### 5.1 CloudBase 文档数据库

保留设计文档的八个集合：

- `users`
- `invites`
- `resumes`
- `applications`
- `ai_jobs`
- `daily_usage`
- `feedback`
- `audit_logs`

CloudBase 文档数据库支持 JSON 文档和多文档事务，与结构化简历、投递记录和任务状态天然匹配，不需要再接 MySQL/PostgreSQL。[CloudBase 文档数据库](https://docs.cloudbase.net/database/introduce)

必要索引：

- `resumes`: `userId + updatedAt`
- `applications`: `userId + status + updatedAt`
- `ai_jobs`: `userId + status + createdAt`
- `daily_usage`: `userId + date` 唯一业务键
- `audit_logs`: `createdAt`

客户端不直接读写数据库。所有读写都经过 `api` 云函数，避免安全规则与业务权限形成两套逻辑。

### 5.2 CloudBase 云存储

只保存临时文件：

```text
temp/{openid-hash}/{requestId}/{filename}
```

- 不把原始简历或 JD 图片写入数据库。
- 模型调用前先把手机号、邮箱、证件号和详细地址遮盖。
- 简历确认后删除原文件。
- JD 任务结束后立即删除图片。
- `cleanup` 定时处理异常残留。

路径使用 OpenID 的服务端哈希，不在小程序界面展示原始 OpenID。

## 6. 文件解析技术

### 6.1 DOCX：Mammoth

使用 Mammoth 的纯文本提取能力，不将 DOCX 转成 HTML 后再展示。Mammoth 官方说明复杂 DOCX 的结构转换可能不完美，并且不会替不可信输入做消毒，因此 ApplyMate 只读取文本并立即进入自己的结构化 Schema。[Mammoth 官方仓库](https://github.com/mwilliamson/mammoth.js/)

### 6.2 PDF：unpdf

使用 unpdf 完成：

- 页数检查
- 文本型 PDF 文字提取
- 空文本/扫描件识别

unpdf 面向 Node.js 和 Serverless 环境提供 PDF 文本提取能力。[unpdf 官方仓库](https://github.com/unjs/unpdf)

### 6.3 扫描型 PDF 的 MVP 决策

MVP **不在云函数内安装 Chromium、Puppeteer、Tesseract、Sharp 或原生 Canvas**。

扫描型 PDF 无可用文本时，直接提示：

> 这份 PDF 可能是扫描件，请改传每页截图。

这是“简单但健壮”的重要取舍：用户本来就可以上传截图，而服务端 PDF 转图片会显著增加依赖体积、冷启动、内存占用和跨平台故障。unpdf 的页面渲染也需要额外 Canvas 依赖；等真实数据证明扫描 PDF 占比较高后，再把转换能力拆成独立函数。[unpdf 页面渲染说明](https://github.com/unjs/unpdf)

## 7. AI 接入技术

### 7.1 TokenHub

使用 Node.js 原生 `fetch` 调用 TokenHub 的 OpenAI 兼容接口，不安装 OpenAI SDK。在线推理境内 Base URL 为：

```text
https://tokenhub.tencentmaas.com/v1
```

TokenHub 官方说明多模态接口兼容 OpenAI Completions 协议，并支持 `youtu-vita` 与 `hy-vision-2.0-instruct`。[TokenHub 多模态理解](https://cloud.tencent.com/document/product/1823/130988)

模型配置保存在云函数环境变量中，不写死在业务代码：

| 能力 | 主模型 | 备用模型 |
|---|---|---|
| 多图 JD/简历理解 | `youtu-vita` | 单图时使用 `hy-vision-2.0-instruct` |
| 文本生成与改写 | `deepseek-v4-flash` 对应当前套餐可用 Model ID | `hy3` |

TokenHub 不同计费产品可能使用不同 Base URL 或带日期的 Model ID。上线前以当前控制台显示为准，适配器只读取配置，不依赖固定名称。官方当前价格中 YT‑VITA 和 DeepSeek V4 Flash 明显低于对应高质量备用模型，符合“成本优先”的原则。[TokenHub 模型价格](https://cloud.tencent.com/document/product/1823/130055)

### 7.2 不使用 AI 编排框架

不使用 LangChain、LlamaIndex 或 Agent 框架。ApplyMate 只有三个确定的模型动作，不需要工具调用、自主规划或长对话记忆。

模型适配器自己实现：

- `AbortController` 超时
- 429/5xx 指数退避一次
- 主备模型切换
- JSON 提取与 Zod 校验
- Token、耗时、模型和 Prompt 版本记录
- 不保存原始 Prompt、简历或截图

### 7.3 生成流程

保留两种内部策略，但对业务层保持同一接口：

1. 默认尝试一次多模态请求返回 JD 与 greeting。
2. 如果 30 组评测证明文案质量不足，则切为 YT‑VITA 提取 JD、DeepSeek 生成文案的两阶段方案。

无论采用哪一种，最终都必须通过同一个本地事实质量门。不要在技术选型阶段提前引入复杂工作流引擎。

## 8. 数据校验与安全

### 8.1 Zod

Zod 同时提供运行时 Schema 校验和 TypeScript 类型推导，适合校验不可信的客户端输入与模型 JSON。[Zod 官方文档](https://zod.dev/)

至少定义：

- `ApiRequestSchema`
- `ResumeProfileSchema`
- `JobDescriptionSchema`
- `GenerationResultSchema`
- 每个 action 的 payload schema

数据库写入前再次校验关键对象，防止旧数据或管理员脚本绕过 API 边界。

### 8.2 安全原则

- TokenHub Key 只放云函数环境变量。
- OpenID 只来自 CloudBase 上下文。
- 文件扩展名、MIME、Magic Bytes、大小和页数同时检查。
- 对用户查询统一附加 `userId` 条件。
- 越权访问统一返回“不存在”，不泄漏资源 ID。
- 邀请码只保存哈希。
- 审计日志只保存元数据与内容哈希。
- 管理员由服务端 OpenID 白名单判断。

## 9. 测试技术栈

使用 Vitest，不同时引入 Jest。Vitest 支持 TypeScript、Mock 和 CI 运行，足够覆盖本项目的纯业务逻辑与适配器契约。[Vitest 官方指南](https://vitest.dev/guide/)

测试分为：

1. **单元测试：** 遮盖、factId、事实校验、额度、邀请码、幂等。
2. **契约测试：** 模型超时、429、无效 JSON、备用模型和自动纠错。
3. **质量评测：** 30 组脱敏简历/JD fixture，要求零虚构。
4. **云端集成测试：** CloudBase 测试环境中的事务、索引和用户隔离。
5. **真机测试：** iOS/Android 微信、弱网、上传中断和前后台切换。

首版不搭建复杂 E2E 测试平台。核心业务用 Vitest 自动化，微信授权、文件选择和剪贴板等平台能力用开发者工具与真机清单验收。

## 10. 构建、版本与环境

### 10.1 包管理

- 使用 npm 和 `package-lock.json`。
- 所有直接依赖锁定确定版本，不使用 `latest` 部署。
- 每次升级 CloudBase SDK、PDF 库或模型配置都先跑 30 组回归评测。
- CI 执行类型检查、测试、依赖审计和云函数构建。

### 10.2 编译

- 小程序 TypeScript 由微信开发者工具编译。
- 云函数使用 `tsc` 编译为 CommonJS。
- 不引入 Webpack、Vite、Turbopack 或复杂 monorepo 工具。
- 只有当云函数部署包超过限制或冷启动不达标时，才引入 esbuild 打包。

### 10.3 环境

最少建立两个隔离环境：

- `applymate-dev`：开发、自动测试和模型评测。
- `applymate-prod`：邀请制真实用户。

两个环境使用不同数据库、存储、TokenHub Key 和费用上限。禁止用生产用户数据做模型 fixture。

## 11. 明确不采用的技术

| 不采用 | 原因 |
|---|---|
| Taro / uni-app | 没有多端目标，增加构建与兼容层 |
| React / Vue / Next.js | 原生小程序不需要 Web 框架 |
| Vercel | 国内用户访问不是核心可控路径 |
| Supabase / Firebase | 增加跨境网络和另一套身份系统 |
| FastAPI / Python | 增加第二语言与独立部署，MVP 无必要 |
| MySQL / PostgreSQL | 当前数据关系简单，CloudBase 文档数据库足够 |
| Prisma / ORM | CloudBase 不需要 ORM，反而增加映射层 |
| Express / NestJS | 普通云函数 action router 已足够 |
| LangChain / Agent 框架 | 只有三个固定 AI 动作，不需要通用编排 |
| Redis / 消息队列 | 30–100 人内测没有必要；用数据库任务状态与幂等即可 |
| Tesseract / Puppeteer / Canvas | 扫描 PDF 可改传截图，原生依赖不值得进入 MVP |
| Sentry / PostHog | 首版使用 CloudBase 日志和自有反馈集合，减少第三方数据外发 |

## 12. 备选方案比较

### 方案 A：微信原生 + CloudBase（推荐）

优点是国内访问稳定、身份链路短、无需服务器、与产品场景完全一致。缺点是平台绑定较强，但 ApplyMate 的首发目标本身就是微信小程序，因此这个缺点在 MVP 阶段可以接受。

### 方案 B：Taro/uni-app + CloudBase

适合已经确定要同时发布微信、支付宝和 H5 的产品。ApplyMate 暂无多端计划，现阶段采用会增加调试成本，不推荐。

### 方案 C：H5/Next.js + 独立后端

技术生态更通用，也更适合海外或桌面端；但需要处理国内部署、域名备案、身份系统、服务器和移动端上传体验，不符合当前“简单且快速内测”的目标。

## 13. 最小依赖清单

建议第一版只引入以下直接依赖：

### 云函数运行依赖

- `wx-server-sdk`
- `zod`
- `mammoth`
- `unpdf`

### 开发依赖

- `typescript`
- `miniprogram-api-typings`
- `vitest`
- `@cloudbase/cli`

除非出现已经量化的问题，否则不再增加框架或基础设施。

## 14. 最终决策

ApplyMate MVP 的技术底座确定为：

```text
微信原生小程序
  └─ TypeScript + WXML + WXSS
       └─ wx.cloud.callFunction
            ├─ api 普通云函数（Nodejs20.19 + TypeScript + Zod）
            │    ├─ CloudBase 文档数据库
            │    ├─ CloudBase 临时云存储
            │    ├─ Mammoth / unpdf
            │    └─ TokenHub 模型适配器
            └─ cleanup 定时云函数
```

这套方案没有多余的中间层，能完整覆盖设计文档中的身份、简历、JD 图片、AI 生成、事实质量门、额度、记录、管理员和数据删除需求，同时保留未来更换模型或拆分重任务的空间。
