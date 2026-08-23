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
- Vitest：115 个当前主线测试文件、569 项测试通过（Legacy 小程序测试退出主线后计数降低）。
- Web build：通过；HTML entry 主 JS gzip 71.66KB，CloudBase SDK 与 PDF 为动态 chunk，未生成 source map。
- Playwright + 本机 Chrome：6 项通过，覆盖 320/390/430px、截图附件、44px 主触控目标、软键盘压缩高度、无横向溢出、BrowserRouter 直达/刷新/未登录重定向，以及无 manifest、Service Worker 和 cache。
- fixture 隔离、敏感信息、严格 TypeScript、Web TypeScript 与 deploy 目标语法/契约均通过。

## 当前未完成或外部阻塞

### 本地代码

- 固定 JD 图像 profile 的 A/B 选择函数已实现，但尚未用固定真实脱敏图片测量 99% 关键字段保留率。
- 严格 TypeScript cleanup 已定义孤立文件 port；部署 cleanup 仍需正式 CloudBase 存储枚举 adapter。
- `api/deploy/live-api.js` 与 `experience-api.js` 仍承载 Legacy 兼容业务。`index.js` 已收薄、公开路径已隔离和测试，但“完全消除 src/deploy 双实现”尚未全部完成。
- 官方账单快照字段已纳入预算状态，自动采集尚未接入。

### 云端/人工

- CloudBase CLI 登录已失效；历史部署记录不代表 2026-08-23 的云端状态。
- 未执行旧环境只读盘点。
- 未购买套餐、未创建新生产环境、未创建集合/权限/触发器、未部署。
- 未购买域名、未配置 HTTPS、未备案。
- 未配置生产 OCR/TokenHub/密钥或公开注册。
- 未完成两邮箱真云隔离、三类真机、30 次质量/隐私/时延验收和专业合规复核。
- 未执行任何生产数据删除。

## 下一执行顺序

1. 用固定脱敏 JD 图片完成三规格 A/B。
2. 收敛剩余 Legacy deploy 双实现、装配存储孤儿清理和账单快照 adapter。
3. 用户在 CloudBase 登录界面完成登录后，只读盘点旧环境。
4. 分别请求新环境/套餐/域名/备案/密钥/部署授权，再按实施计划的固定顺序上线。

## 授权记录

用户已批准“ApplyMate Web v3 正式公开站重构计划”以及本地代码和文档实施。该批准不包含域名购买、套餐开通、新环境创建、备案、密钥写入、生产部署或最终数据删除；这些动作继续要求逐项授权。付款、实名、验证码和密码始终由用户本人操作。
