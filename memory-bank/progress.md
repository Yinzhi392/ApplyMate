# ApplyMate Public Mobile Web v3 进度

**最后更新：** 2026-08-23
**分支：** `codex/mobile-web-public-v3`
**阶段：** 本地正式站重构；尚未创建或部署生产环境

## 当前结论

项目主方向已从微信小程序切换为只面向手机的公开 Web。没有推倒共享 Schema、OCR/脱敏、Hy3 worker、幂等和视觉语言；小程序最终版已用 `legacy-miniprogram-final` 标签归档，并退出根构建/测试。

正式 v3 设计规格已在独立提交 `b9accb1` 固化。当前工作区包含 Web、共享契约、严格 TypeScript 领域服务和 CloudBase deploy 公开模式的实现；用户自有 `project.config.json` 与未跟踪 `project.private.config.json` 未被修改或纳入提交。

## 已完成

### 1. 文档与历史

- 创建分支 `codex/mobile-web-public-v3`。
- 标签 `legacy-miniprogram-final` 指向 `b99be7e`。
- 新增 `docs/superpowers/specs/2026-08-23-mobile-web-public-v3-design.md`。
- design、architecture、tech stack、implementation plan 和本进度文档已切换 v3 口径。
- 根 `tsconfig.json`、`tsconfig.check.json` 与 `vitest.config.mjs` 排除 Legacy 小程序主线；源码仍保留。

### 2. Web

- BrowserRouter：公开 `/`、`/login`、`/legal`、`/support`；业务 `/app/*`。
- 新增产品首页、支持页、服务阶段 banner 和 active/read_only/retired 路由/交互门。
- CloudBase 认证、临时上传、API 调用拆为三个 seam，CloudBase SDK 延迟加载。
- 修复 Web 存储上传把文件名字符串误传为 `filePath` 的问题；现在按 CloudBase Web 契约传入真实 `File`，失败会立即显示可理解错误并允许重试。
- 路由和 PDF 解析按需加载，生产 source map 关闭；静态首屏 JS gzip 200KB 自动门禁。
- 删除 manifest、Service Worker、PWA 安装和 AI 改写。
- 新增退出登录、版本化数据导出、本地 JSON 下载。
- 原生 prompt/confirm 已替换为可访问 `<dialog>` action sheet/confirm dialog。
- JD 最多 5 图，Worker/Canvas 后台压缩和最多并发上传 3；点击生成才创建 AI 任务。
- 实现 720/Q80、1080/Q78、1440/Q75 固定候选和机械 profile 选择。

### 3. 共享与 API 领域

- 新增 `ServicePhase`、`AiAvailability`、`ServiceAccess` 及日期解析。
- 新增 `user.export`、预算/只读/活跃任务/频率错误码。
- 新增严格 TypeScript admission core：100/80/90 元、每日成功 20、同时 1、10 分钟 3。
- 新增严格 TypeScript service gate 和版本化用户导出服务。
- API 递归删除任意大小写的 uid/email/openid/userId/ownerId/identityHash 等客户端字段。
- `auth.status` 和 `user.get` 可返回 `serviceAccess`。

### 4. CloudBase deploy 公开模式

- `APPLYMATE_PUBLIC_WEB_V3=true` 时只接受 `web-email-uid-v1`；匿名/OpenID 直接拒绝。
- 公开动作 allowlist 不含邀请码、AI 改写、管理员加量和小程序动作。
- `service_config/public` 或当月 `budget_periods` 缺失时 fail closed，但 auth.status 仍可解释暂停状态。
- `generation.create` 用 CloudBase `runTransaction` 同时检查/写入任务、admission、每日成功额度槽和预算预留。
- API 派发失败释放；worker 成功结算、失败释放；cleanup 超时竞争释放。
- `user.export` 只导出当前用户记录并递归去身份；浏览器本地下载。
- `admin.stats` 增加预算和服务阶段，预算上限不可在网页提高。
- cleanup 增加 24 小时草稿、180 天日志、账号 admission 释放和退休清单。
- `retirementDelete` 固定返回 `DESTRUCTIVE_AUTHORIZATION_REQUIRED`，当前没有生产全量删除路径。

## 本地验证证据

最近一次分项验证：

- `npm run typecheck`：通过。
- `npm run web:typecheck`：通过。
- `npm run check`：完整通过。
- Vitest：116 个当前主线测试文件、571 项测试通过（Legacy 小程序测试退出主线后计数降低）。
- Web build：通过；HTML entry 主 JS gzip 71.67KB，CloudBase SDK 与 PDF 为动态 chunk，未生成 source map。
- Playwright + 本机 Chrome：6 项通过，覆盖 320/390/430px、截图附件、44px 主触控目标、软键盘压缩高度、无横向溢出、BrowserRouter 直达/刷新/未登录重定向，以及无 manifest、Service Worker 和 cache。
- fixture 隔离、敏感信息、严格 TypeScript、Web TypeScript 与 deploy 目标语法/契约均通过。

## 当前未完成或外部阻塞

### 本地代码

- JD 截图上传新增分段可观测性：岗位页分别展示本地纯压缩与网络上传耗时、压缩前后字节；CloudBase 存储失败只记录 allowlist 内的脱敏诊断字段。运行时已明确不执行字段保留率、虚构率、OCR、模型或隐私分析。
- 固定 JD 图像 profile 的 A/B 选择函数已实现，但尚未用固定真实脱敏图片测量 99% 关键字段保留率。
- 严格 TypeScript cleanup 已定义孤立文件 port；部署 cleanup 仍需正式 CloudBase 存储枚举 adapter。
- `api/deploy/live-api.js` 与 `experience-api.js` 仍承载 Legacy 兼容业务。`index.js` 已收薄、公开路径已隔离和测试，但“完全消除 src/deploy 双实现”尚未全部完成。
- 官方账单快照字段已纳入预算状态，自动采集尚未接入。

### 云端/人工

- 2026-08-23 已完成一轮旧 CloudBase 环境元数据只读盘点；盘点中后段 CLI 身份再次失效，集合计数、索引/数据库 ACL、函数环境变量名和 OCR/TokenHub 套餐仍待补齐。
- 当前只发现 Legacy 环境 `applymate-mvp-d0g005nnw103af4c3`：上海、小程序来源、体验版、预付费、状态正常，到期日 2027-02-10；数据库和存储在线。
- api/worker/cleanup 均为 Node.js 20.19、256MB、45 秒、Active；三者均没有触发器，因此 cleanup 当前没有定时执行证据。
- 旧静态托管在线但错误页未设为 `index.html`；仍存在 `manifest.webmanifest`、`sw.js`、旧约 1.125MB JS 和最高约 3.7MB source map。未对这些旧文件做删除或覆盖。
- 旧身份配置同时启用邮箱、匿名和用户名登录；存储为 PRIVATE/创建者和管理员读写，无自定义存储规则；CORS 仍包含旧域名、平台默认项和通配配置，没有正式产品域名。
- 已只读定位本地 Web 截图上传失败：当前安全域名列表没有 `127.0.0.1`/`localhost`，而测试页来源是 `http://127.0.0.1:4173`。CloudBase Web SDK 直传对象存储因此被 CORS 拒绝并包装为 `OPERATION_FAIL [storage]`。产品负责人已单独授权新增 `127.0.0.1`，但旧体验套餐返回 `CreateAuthDomain: 当前套餐无法执行此操作`；安全域名列表未改变，也没有升级、付费或扩大域名范围。
- 产品负责人随后单独授权把当前 `dist/web` 部署到旧环境静态托管根目录。27 个构建文件已全部更新，默认托管域名的首页和邮箱登录页实测可打开且无浏览器 warning/error；旧 manifest、Service Worker、历史哈希资源/source map 未删除，错误页仍为空。真实 JD 上传验证等待产品负责人在该新来源完成邮箱验证码登录。
- 当前账期为 2026-08-10 至 2026-09-10，套餐内资源点 126.44/3000，资源包和按量费用均显示 0；资源点主要来自 NoSQL 47.42、函数 38.28、API 35.46、存储 5.28。该快照不等于 OCR/TokenHub 独立账单。
- 旧数据库存在 users、invites、resumes、applications、ai_jobs、daily_usage、feedback、audit_logs；不存在 v3 所需 service_config、budget_periods、ai_task_admissions。未读取或导出任何用户记录。
- 未购买套餐、未创建新生产环境、未创建集合/权限/触发器、未部署。
- 未购买域名、未配置 HTTPS、未备案。
- 未配置生产 OCR/TokenHub/密钥或公开注册。
- 未完成两邮箱真云隔离、三类真机、30 次质量/隐私/时延验收和专业合规复核。
- 未执行任何生产数据删除。

## 下一执行顺序

1. 用固定脱敏 JD 图片完成三规格 A/B。
2. 收敛剩余 Legacy deploy 双实现、装配存储孤儿清理和账单快照 adapter。
3. 用户在 CloudBase 登录界面完成登录后，补齐旧环境集合计数/ACL/变量名和 OCR/TokenHub 套餐、额度、账单只读快照。
4. 分别请求新环境/套餐/域名/备案/密钥/部署授权，再按实施计划的固定顺序上线。

## 授权记录

用户已批准“ApplyMate Web v3 正式公开站重构计划”以及本地代码和文档实施。该批准不包含域名购买、套餐开通、新环境创建、备案、密钥写入、生产部署或最终数据删除；这些动作继续要求逐项授权。付款、实名、验证码和密码始终由用户本人操作。
