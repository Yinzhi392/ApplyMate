# ApplyMate Public Mobile Web v3 架构

**版本：** 3.0
**日期：** 2026-08-23
**产品基线：** `memory-bank/design-document.md`
**正式规格：** `docs/superpowers/specs/2026-08-23-mobile-web-public-v3-design.md`

本文只描述当前主线。此前小程序和 Web v2 架构由 Git 历史与 `legacy-miniprogram-final` 标签保存，不再作为实现依据。

## 1. 系统视图

```text
mobile browser
  ├─ public routes / /login /legal /support
  └─ authenticated /app/*
         │
         ├─ AuthSessionPort ───────── CloudBase email OTP
         ├─ TemporaryUploadPort ───── CloudBase temporary storage
         └─ BusinessApiPort ───────── api cloud function
                                           │
                         ┌─────────────────┼─────────────────┐
                         │                 │                 │
                    CloudBase DB      async SCF worker   cleanup timer
                         │                 │                 │
                         │           Tencent OCR            │
                         │           local masking          │
                         │           TokenHub hy3           │
                         └─────────────────┴─────────────────┘
```

浏览器不直接访问业务集合。平台细节隔离在认证、临时上传和业务 API 三个 seam 后；页面只依赖小接口。OCR 与 TokenHub 只能由 worker 调用。

## 2. 仓库边界

- `web/`：正式 React/Vite 移动 Web。使用 BrowserRouter、路由级懒加载、CSS Modules 和内存查询缓存。
- `shared/`：请求 Schema、服务阶段、错误码、事实、简历/JD、脱敏和复制标识等无平台契约。
- `cloudfunctions/api/src/`：严格 TypeScript 领域服务。身份、服务阶段、预算 admission、导出等规则在此定义和测试。
- `cloudfunctions/api/deploy/`：CloudBase CommonJS 装配与旧环境兼容适配。`index.js` 只初始化 SDK、读取可信身份并装配 handler；`APPLYMATE_PUBLIC_WEB_V3=true` 才启用公开站身份与动作门。
- `cloudfunctions/worker/`：OCR、解析、Hy3、质量/隐私门、结果保存、文件删除和预算结算。
- `cloudfunctions/cleanup/`：僵死任务、admission 释放、草稿、日志、账号删除和退休清单。
- `miniprogram/`：Legacy 源码归档。根 tsconfig 与 Vitest 主线排除其构建和测试。

`cloudfunctions/*/deploy` 仍保留旧环境兼容代码；公开模式通过专用小模块和契约测试收窄动作。后续改动不得把新业务规则再次写入 `index.js`，并应逐步让 deploy 适配直接装配编译后的 TypeScript 模块。

## 3. Web 客户端

### 3.1 路由与渲染

`web/src/app/AppRouter.tsx` 定义公开路由和 `/app/*`。公共首页、协议与支持页不等待 CloudBase SDK；登录或业务路由才动态加载认证模块。读写路由在 read_only/retired 阶段由客户端守卫，同时服务端再次强制执行。

CloudBase 静态托管必须在控制台设置“4xx 错误页 → `/index.html`”，否则 BrowserRouter 的直达/刷新会失败。该配置属于生产环境创建后的独立部署步骤，仓库不能假装已配置。

### 3.2 平台 seam

- `web/src/lib/cloudbase-app.ts`：延迟加载 SDK 并创建单例 app。
- `web/src/lib/session.ts`：邮箱 OTP、会话检查和退出登录。
- `web/src/lib/temporary-upload.ts`：装配默认 CloudBase 临时上传/删除 port。
- `web/src/lib/temporary-upload-adapter.ts`：平台可替换的存储 Adapter；Web 上传必须把浏览器 `File` 直接作为 CloudBase `filePath`，不能用文件名字符串冒充，否则签名长度与实际图片字节不一致。
- `web/src/lib/api.ts`：唯一业务函数调用入口。

兼容文件 `web/src/lib/cloudbase.ts` 只做 re-export，不包含平台业务逻辑。

### 3.3 性能

Vite 关闭生产 source map。路由、CloudBase SDK、PDF 解析均动态加载。构建插件从 HTML entry 递归计算静态首屏 JS，gzip 超过 200KB 时直接失败；动态 CloudBase/PDF chunk 不计入首屏，但仍按功能按需下载。

JD 图像选择后由 `jd-image.worker.ts` 使用 `createImageBitmap + OffscreenCanvas` 压缩；不支持时退回主线程 Canvas。`jd-image-profile.ts` 只接受固定评测结果选择的候选。`prepareAndUploadJdImages` 并发上限固定 3，最多 5 张。选择只准备/上传，点击生成才调用 `generation.create`。

历史 Service Worker 和 manifest 已删除。启动时只执行一次旧 worker 注销与旧 shell cache 清理，不注册新 worker。

## 4. 身份与 API 边界

生产入口要求：

1. `APPLYMATE_PUBLIC_WEB_V3=true`。
2. 可信身份 namespace 必须是 `web-email-uid-v1`。
3. 匿名 UID、OpenID 和 SDK fallback 的 Legacy namespace 均拒绝。
4. 事件中任何大小写组合的 uid、email、openid、userId、ownerId、identityHash 等字段递归删除。

旧环境不设置公开模式变量时继续走 Legacy 兼容路径，便于只读盘点和预发布回归，但不得作为生产配置。

公开模式动作 allowlist 不包含邀请码、`generation.rewrite`、管理员加量或小程序动作。服务阶段进一步收窄：

- active：公开产品完整动作。
- read_only：状态、列表/详情、复制、导出、协议、分析和账号删除。
- retired：`auth.status` 与账号删除边界；Web 引导到 `/support`。

API 响应统一 `{ ok, data }` 或 `{ ok: false, error }`。写动作要求 UUID requestId。所有业务资源按可信内部 userId 过滤。

## 5. 服务配置

`service_config/public` 是服务端配置单例，至少包含：

- `publicLaunchAt`
- `aiClosesAt`
- `dataAccessEndsAt`
- `estimatedAiTaskCostFen`
- `resourcePaused`

构建期 Web 变量必须由同一批准日期生成。配置缺失、日期无效、预算期缺失或真实 AI 未启用时，API 保持认证可用但返回 `resource_paused`/只读的 fail-closed 状态。

服务阶段纯规则位于 `shared/src/service-access.ts` 与 `api/src/service-access-service.ts`。服务端是最终裁决者，客户端 banner/守卫只负责体验。

## 6. 预算、额度与任务事务

集合：

- `budget_periods`：每月固定一条 `budget_YYYY-MM`。
- `ai_task_admissions`：每个 AI 任务一条 admission。
- `daily_usage`：每个生成任务的成功额度槽。
- `ai_jobs`：任务及幂等 jobId。

不可变预算常量：limit 10,000 分、warning 8,000 分、stop 9,000 分。暴露额为：

```text
fixedCostFen + max(conservativeSettledFen, officialBilledFen) + reservedFen
```

公开生产的 `generation.create` 使用 CloudBase `runTransaction`：

1. 以确定性 jobId 检查幂等重放。
2. 检查同用户非终态任务最多 1 个。
3. 检查滚动 10 分钟创建最多 3 次。
4. 检查北京时间当日 `succeeded` 少于 20。
5. 检查固定预算常量和新预留后的 stop 线。
6. 同一事务更新 budget，并创建 admission、成功额度槽和 queued job。

派发失败由 API 事务释放。worker 成功把 admission 转为 `succeeded`，从 reserved 移到保守结算，并把额度槽转为 succeeded；失败转 `released` 并删除额度槽。cleanup 对创建 10 分钟仍非终态的任务进行同样的幂等释放。事务冲突由 SDK 重试；admission 已非 reserved 时直接返回，保证 worker/cleanup 竞争只有一个结算者。

如果 worker 成功写入结果后暂时无法更新预算，保留 reservation 是安全的保守失败：不会超支，只可能提前暂停；cleanup/运营核对必须修复后才重新开放 AI。

## 7. 数据与生命周期

当前业务集合至少包括：

```text
users resumes applications ai_jobs daily_usage ai_task_admissions
feedback audit_logs service_config budget_periods
```

生产新环境不导入旧 users、OpenID 或测试数据。所有集合客户端规则为拒绝读写，只有云函数服务身份访问。

worker `finally` 删除处理过的临时输入，并移除 job 中仅处理时需要的临时访问 URL。严格 TypeScript cleanup 服务覆盖 1 小时孤立文件、24 小时简历草稿与 180 天日志；部署 cleanup 还处理 10 分钟僵死任务、待删除账号和退休清单。

`retirementInventory` 只返回集合计数、存储仍需独立盘点和 `deletionAuthorized: false`。`retirementDelete` 在部署入口固定返回 `DESTRUCTIVE_AUTHORIZATION_REQUIRED`；仓库当前没有生产全量删除实现。

## 8. 用户导出

`user.export` 以 cursor/limit 分页，最大 200。服务端只读取当前 userId 的 users、resumes、applications、ai_jobs、feedback，并递归删除身份和删除确认材料。版本固定 `applymate-user-export-v1`。浏览器逐页取得记录、在本地生成 JSON Blob 和下载，不上传导出文件。

## 9. OCR、模型与隐私

- 腾讯 OCR 只接收经所有权、MIME、Magic Bytes、大小和数量校验的临时文件。
- TokenHub 只接收本地脱敏文本，固定 `hy3`，不自动 fallback。
- Prompt、OCR 原文、简历原文、生成正文、密钥和临时 URL 不写运行日志。
- application 保存事实快照、JD 快照、证据与显式生成标识；复制文本由确定性规则附加 AI 标识。
- 质量或隐私硬门失败时任务失败并释放额度/预算。

## 10. 构建、测试与部署边界

本地主门禁：`npm run check`。它覆盖格式、fixture、敏感信息、严格类型、Web 类型、Vitest、四模块构建与 Web 生产构建。小程序测试文件保留但从主 Vitest 配置排除。

生产部署前还必须完成浏览器 E2E、三类真机、CloudBase 环境只读盘点、两邮箱隔离、30 次真实质量/时延验收和专业合规复核。本地通过不等于云端已配置或已上线。

`cloudbaserc.json` 当前仍指向 Legacy 环境，只能用于旧环境预发布且不得在未授权时执行。新生产环境 ID、数据库集合、权限、触发器、托管、域名、环境变量和预算初始记录都必须在单独授权后配置；不得把新生产环境 ID 提前提交到仓库。

## 11. Legacy 云环境边界

2026-08-23 的只读快照确认旧环境仍是小程序来源的体验版环境。它同时启用了邮箱、匿名和用户名登录，静态托管保留旧 PWA/source map 且未配置 BrowserRouter 错误页，cleanup 没有触发器，数据库也没有 v3 的 `service_config`、`budget_periods`、`ai_task_admissions`。因此它只能作为 Legacy/预发布参考，不能通过切换环境变量直接升级为正式生产。

旧环境中没有执行删除、部署、规则修改或数据迁移。新生产环境必须独立创建，默认关闭 AI，并重新配置身份、集合、拒绝客户端直连的规则、cleanup 触发器、SPA fallback、窄 CORS、预算初始数据和密钥；任何这些云端动作都仍需单独授权。
