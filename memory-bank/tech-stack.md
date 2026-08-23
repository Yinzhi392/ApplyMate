# ApplyMate Public Mobile Web v3 技术栈

**日期：** 2026-08-23
**依据：** `memory-bank/design-document.md`
**原则：** 移动优先、平台可替换、严格预算、隐私最小化、无 PWA

## 1. 选型总览

| 层 | 技术 | 用途 |
|---|---|---|
| Web | React 19、Vite 8、TypeScript、React Router 7 | 移动站、BrowserRouter、路由懒加载 |
| 状态 | TanStack Query | API 内存缓存、任务轮询与恢复 |
| 样式 | CSS Modules、系统字体 | 现有暖白/墨蓝灰/青绿色视觉语言 |
| 校验 | Zod + 纯 TypeScript 规则 | API、简历、JD、服务阶段和错误契约 |
| 认证 | CloudBase Web SDK 邮箱 OTP | 开放注册和可信邮箱 UID |
| API | CloudBase Node 普通云函数 `api` | 身份、Schema、事务、任务与轻量读取 |
| Worker | CloudBase Node 普通云函数 `worker` | OCR、脱敏、Hy3、质量门、结果与文件清理 |
| Cleanup | CloudBase Node 普通云函数 `cleanup` | 超时释放、草稿、日志、账号和退休清单 |
| 数据 | CloudBase 文档数据库 | 用户、任务、预算、简历和投递记录 |
| 临时文件 | CloudBase 云存储 | 用户隔离的短生命周期上传 |
| OCR | 腾讯 OCR | 简历图片与 JD 截图 |
| 模型 | TokenHub `hy3` | JD 结构化、证据选择与开场白生成 |
| 文档 | Mammoth、unpdf | DOCX 与文本型 PDF 提取 |
| 测试 | Vitest、Testing Library、jsdom | 单元、契约、集成与恶意输入 |

不采用 PWA、Service Worker、manifest、HashRouter、ORM、独立 API 服务器、消息队列、客户端密钥或备用生成模型。

## 2. Web 实现规则

- `BrowserRouter` 的公开路由为 `/`、`/login`、`/legal`、`/support`，业务路由统一 `/app/*`。
- CloudBase SDK、PDF 解析和各业务页均按需加载。
- Vite 生产 source map 关闭；自定义门禁要求 HTML entry 的静态主 JS gzip 不超过 200KB。
- 电脑端仍使用最大约 480px 的居中移动画布，不增加桌面信息架构。
- 可触控目标、底部操作菜单和 `<dialog>` 确认框替代原生 `prompt/confirm`。
- 启动只注销历史 Service Worker 并清理旧 shell cache；绝不注册新 worker。

## 3. 平台 seam

页面不得直接 import CloudBase SDK：

- `AuthSessionPort`：邮箱验证码、当前会话、退出。
- `TemporaryUploadPort`：用户隔离的上传与删除。
- `BusinessApiPort`：统一 action 请求、错误转换和 requestId。

OCR 与 TokenHub 通过 worker adapter 暴露给领域服务。模型 ID、URL、重试、超时与凭证只存在 provider adapter/环境变量中。

## 4. 图片准备

浏览器使用 Web Worker、`createImageBitmap` 与 `OffscreenCanvas`；不支持时退回主线程 Canvas。最多 5 张 JD 图、并发准备/上传 3 张。正式 profile 只能来自固定 A/B：

- 720/Q80
- 1080/Q78
- 1440/Q75

机械选择要求关键字段保留率至少 99%、无关键字段回归，然后取字节最小；无候选通过则 1440/Q75。

## 5. 服务端与事务

统一请求为 `{ action, payload, requestId? }`。只读可省 requestId，写动作必须 UUID。正式公开模式通过环境变量显式开启，并只接受 `web-email-uid-v1`。

CloudBase JS SDK 3.7.1 提供数据库和 `runTransaction`。生成 admission 在一个事务中处理预算、成功额度槽、任务和 admission；worker/cleanup 使用 admission 状态实现幂等竞争。金额全部使用整数分，禁止浮点货币。

CloudBase 文档数据库不向浏览器开放业务集合。存储路径包含服务端内部 userId；服务端再次校验 fileId 与临时访问 URL 的 bucket、object path 和所有权。

## 6. 安全与隐私

- 前端只包含环境 ID、地域、函数名和公开日期，不包含任何 Secret。
- API 递归移除任意大小写的客户端身份字段。
- 邮箱原文不进入业务数据；可信 UID 先做命名空间哈希。
- OCR 原图不进入 TokenHub；文本先遮盖手机号、邮箱、证件号和详细地址。
- 运行日志只保存状态、时间、数字指标和错误码，不保存用户内容。
- fixture 必须为合成/脱敏数据；敏感信息门禁继续运行。

## 7. 环境与部署

- Legacy/预发布环境保留且不迁移数据。
- 正式生产使用独立 CloudBase 环境，个人版作为待控制台复核的基线。
- `cloudbaserc.json` 在生产环境创建前仍保留旧环境 ID，不代表生产配置。
- BrowserRouter 需要在 CloudBase 静态托管设置 4xx → `index.html`。
- 正式环境默认关闭 AI；完成域名、HTTPS、备案、探针、隔离、质量、时延与合规门后才开放注册。

任何套餐、环境、域名、备案、密钥或部署动作都需要单独授权；付款、实名、验证码和密码由产品负责人操作。

## 8. 本地命令

```text
npm ci --ignore-scripts
npm run typecheck
npm run web:typecheck
npm test
npm run web:build
npm run check
```

`npm run check` 是当前主线门禁。Legacy 小程序文件不参与根 TypeScript build 和主 Vitest，但继续接受敏感信息与基础格式扫描。

## 9. 版本与费用核对

仓库锁文件是本地可复现依据。CloudBase 套餐价格、备案条件、OCR/TokenHub 额度与官方账单均属于会变化的外部事实，不能写死为“已确认”；在购买或上线前必须从控制台和官方文档重新核对。
