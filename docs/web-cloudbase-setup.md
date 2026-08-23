# ApplyMate Public Web v3 CloudBase 上线清单

本文件是执行手册，不代表任何云端动作已经完成。套餐、环境、域名、备案、密钥、部署和生产删除都需要单独授权；登录、付款、实名、验证码和密码由产品负责人本人操作。

## 1. 旧环境只读盘点

2026-08-23 第一轮只读盘点已经获取部分实时快照，随后 CLI 身份再次失效。重新登录后的后续盘点仍只允许读取，不部署、不续费、不创建资源：

- 环境 ID、地域、来源、套餐、价格、到期日和自动续费。
- api/worker/cleanup 版本、运行时、超时、环境变量名与触发器。
- 静态托管文件、域名、HTTPS、缓存和错误页。
- 邮箱/匿名/微信认证方式、CORS、函数调用权限、数据库/存储规则。
- 数据库集合、索引与记录计数；不得导出用户内容。
- OCR、TokenHub Hy3 的余额/套餐/限速/到期与近期开销。
- CloudBase/OCR/TokenHub/存储/流量官方账单快照。

旧环境只作 Legacy/预发布，不迁移 users、OpenID 或测试数据。

### 2026-08-23 Legacy 环境只读快照

- 唯一环境：`applymate-mvp-d0g005nnw103af4c3`，上海、小程序来源、体验版、预付费、状态 NORMAL，到期 2027-02-10。
- 数据库实例与对象存储在线；存储 ACL 为 PRIVATE，仅创建者和管理员读写，未配置自定义存储规则。
- api、worker、cleanup 均为 Node.js 20.19、256MB、45 秒、Active，触发器列表均为空。cleanup 因而没有定时运行证据。
- 静态托管在线，默认首页是 `index.html`，错误页为空；当前不满足 BrowserRouter 刷新回退。托管中仍有旧 `manifest.webmanifest`、`sw.js`、旧大体积 JS 和 source map。
- 邮箱、匿名、用户名登录均开启；手机登录关闭。该身份面不能用于 v3 生产。
- CORS 仍含 Legacy 托管域名、平台默认来源和通配项；只有默认 CloudBase 域名，没有正式产品域名或路由。2026-08-23 复核确认安全域名中也没有 `127.0.0.1` 或 `localhost`，所以从 `http://127.0.0.1:4173` 使用 Web SDK 直传对象存储会被 CORS 拒绝。产品负责人随后明确授权只新增 `127.0.0.1`，但 CloudBase 返回 `CreateAuthDomain: 当前套餐无法执行此操作`，环境未发生变更；没有改用通配符、升级套餐或付费。
- 当前账期 2026-08-10 至 2026-09-10，套餐内资源点 126.44/3000，资源包与按量费用显示 0；NoSQL 47.42、函数 38.28、API 35.46、存储 5.28。
- 已看到 Legacy 业务集合 users、invites、resumes、applications、ai_jobs、daily_usage、feedback、audit_logs；尚无 service_config、budget_periods、ai_task_admissions。

此次没有读取用户记录、调用函数、下载存储对象或修改配置。重新登录后只补齐集合计数、索引/数据库 ACL、函数环境变量名，以及腾讯 OCR/TokenHub 独立套餐、限速、余额、到期和账单；只记录变量名，不读取或输出 Secret 值。

## 2. 新生产环境（独立授权后）

创建独立 CloudBase 环境，初始 AI 关闭。不得复用微信 AppID 或 OpenID。

身份：

- 只启用邮箱验证码注册/登录；关闭匿名。
- api 函数只允许已认证调用。
- 生产函数设置 `APPLYMATE_PUBLIC_WEB_V3=true`。
- 浏览器不得直接读写业务数据库。

集合至少包括：

```text
users resumes applications ai_jobs daily_usage ai_task_admissions
feedback audit_logs service_config budget_periods
```

所有集合的客户端权限设为拒绝。创建用户/状态、任务、application、admission 和预算所需组合索引；具体索引用部署前查询计划验证，不能盲目照搬旧环境。

## 3. 必需配置记录

`service_config/public`：

```json
{
  "_id": "public",
  "recordType": "service_config",
  "publicLaunchAt": "上线时填写批准的 ISO 时间",
  "aiClosesAt": "北京时间满 2 个自然月",
  "dataAccessEndsAt": "北京时间满 6 个自然月",
  "estimatedAiTaskCostFen": 0,
  "resourcePaused": true
}
```

`estimatedAiTaskCostFen` 必须来自 OCR + Hy3 + 变动云资源的保守单任务估计，不能先填 0 后开放 AI。

当月 `budget_periods/budget_YYYY-MM`：

```json
{
  "_id": "budget_YYYY-MM",
  "recordType": "budget_period",
  "periodKey": "YYYY-MM",
  "limitFen": 10000,
  "warningFen": 8000,
  "stopFen": 9000,
  "fixedCostFen": 0,
  "conservativeSettledFen": 0,
  "reservedFen": 0,
  "officialBilledFen": 0,
  "updatedAt": "ISO 时间"
}
```

前三个预算常量必须精确一致。管理员 Web 没有修改它们的动作。

## 4. 环境变量

Web 公开变量：

- `VITE_CLOUDBASE_ENV_ID`
- `VITE_CLOUDBASE_REGION`
- `VITE_API_FUNCTION_NAME=api`
- `VITE_PUBLIC_LAUNCH_AT`
- `VITE_AI_CLOSES_AT`
- `VITE_DATA_ACCESS_ENDS_AT`
- `VITE_JD_IMAGE_PROFILE`

函数变量至少包括：

- `APPLYMATE_PUBLIC_WEB_V3=true`
- `APPLYMATE_REAL_AI_ENABLED=false`（关闭 AI 首次部署）
- OCR 凭证/地域变量
- TokenHub endpoint、正式 hy3 模型 ID 和 API key
- worker 异步派发所需运行时变量

任何 Secret 只进入函数环境变量/受控 Secret 管理，不写仓库、构建产物、聊天或日志。

Web 的三个日期必须与 `service_config/public` 一致。开放注册时才写最终 `publicLaunchAt`；示例 env 日期不是上线承诺。

## 5. 构建与静态托管

1. 执行 `npm ci --ignore-scripts` 与 `npm run check`。
2. 确认 `dist/web` 无 `.map`、无 manifest、无 Service Worker。
3. AI 关闭状态部署 api/worker/cleanup 和 `dist/web`。
4. CloudBase 控制台进入 Static Hosting → Settings → Error Page，把所有 4xx 设置为 `index.html`。
5. 用静态托管域名逐一验证 `/`、`/login`、`/legal`、`/support`、`/app` 直达和刷新。
6. DevTools Application 中确认没有活动 Service Worker，Cache Storage 不含 `applymate-shell-*`。

BrowserRouter 回退步骤依据 CloudBase 官方 React SPA 文档：<https://docs.cloudbase.net/recipes/add-hosting-react>。

## 6. 权限、CORS 与存储

- 数据库业务集合：客户端拒绝全部读写。
- 临时存储路径：`temporary/web/{internalUserId}/...`。
- 上传规则只允许已登录会话写自己的临时路径；读取默认拒绝。
- API 仍校验 fileId、bucket、object path、HTTPS URL 和可信 userId，不能只依赖规则。
- CORS 只允许批准的正式域名和明确的预发布域名，不使用 `*`。
- cleanup 触发器执行僵死任务、草稿、日志、孤立文件和待删除账号；部署后用合成数据逐项验证。

## 7. 上线门

固定顺序：

1. 旧环境预发布。
2. 新环境关闭 AI 部署。
3. 域名、HTTPS 与备案。
4. 合成探针。
5. 两邮箱数据库/文件隔离。
6. 30 次真实生成质量、隐私和 P50/P95。
7. 专业合规复核及模型/标识/备案公示。
8. 设置 `resourcePaused=false`、启用真实 AI，最后开放邮箱注册。

任一预算、TokenHub hy3 额度/价格、质量、隐私、域名、备案或合规门失败都停止上线，不自动改模型或提高预算。

## 8. 退休

两个月时验证服务端和 Web 都进入 read_only；六个月进入 retired。最终删除前先调用只读 `retirementInventory`，补充云存储对象清单并逐项核对。当前 `retirementDelete` 永远拒绝，只有收到独立破坏性操作授权后才允许另行设计和实施删除流程。
