# ApplyMate Public Mobile Web v3 实施计划

**批准日期：** 2026-08-23
**当前分支：** `codex/mobile-web-public-v3`
**规格：** `docs/superpowers/specs/2026-08-23-mobile-web-public-v3-design.md`

勾选只表示已有可验证证据。任何云资源、购买、备案、部署或生产删除均不会因本文件勾选而获得授权。

## V3.0 设计与历史

- [x] 创建 `codex/mobile-web-public-v3`。
- [x] 用 `legacy-miniprogram-final` 标签归档提交 `b99be7e`。
- [x] 不修改用户自有 `project.config.json` 与 `project.private.config.json` 改动。
- [x] 编写并提交正式 v3 设计规格。
- [x] 同步 design、architecture、tech stack、implementation 和 progress 当前口径。
- [x] 从根 TypeScript build 与主 Vitest 排除 Legacy 小程序。
- [ ] 完成旧环境全量只读盘点。2026-08-23 已取得环境、套餐、到期、函数、触发器、托管、身份、CORS、存储规则及 CloudBase 当前账期快照；CLI 随后再次失去身份，集合计数/ACL/变量名及 OCR/TokenHub 额度、价格和独立账单仍待补齐。盘点不得写入。

## V3.1 正式移动 Web

- [x] 改为 BrowserRouter；公开 `/`、`/login`、`/legal`、`/support`，业务统一 `/app/*`。
- [x] 完成公开首页、支持页、移动居中画布和服务阶段 banner。
- [x] 把 CloudBase 认证、临时上传和业务 API 拆成小 seam。
- [x] 路由、CloudBase SDK、PDF 按需加载；关闭 source map；首屏静态 JS gzip 200KB 硬门。
- [x] 删除 PWA manifest、Service Worker 与安装入口；启动时注销历史 worker/cache。
- [x] 删除正式 Web 的 AI 改写入口与调用。
- [x] 增加退出登录、游标分页导出与浏览器本地 JSON 下载。
- [x] 用可访问 `<dialog>` 操作菜单/确认框替换 `window.prompt/confirm`。
- [x] 统一 active/read_only/retired 的页面守卫和只读交互。
- [x] JD 最多 5 图、后台 Worker/Canvas 压缩、并发上传 3；点击生成才启动 OCR/模型。
- [x] 固定 720/Q80、1080/Q78、1440/Q75 候选与机械选择函数。
- [ ] 在固定真实脱敏 JD 集执行三规格 A/B，并把通过结果写入正式 `VITE_JD_IMAGE_PROFILE`。当前仅实现算法和候选，尚无批准测量结果。

## V3.2 API、预算与生命周期

- [x] 新增 `ServiceAccess` 契约、服务阶段解析和前后端返回字段。
- [x] 公开生产模式只接受可信邮箱 UID，递归删除客户端身份字段。
- [x] 公开 action allowlist 移除邀请码、匿名路径、`generation.rewrite` 与管理员加量。
- [x] 新增 `user.export` 版本化游标数据契约和 CloudBase deploy 处理。
- [x] 新增固定 100/80/90 元预算规则、每日成功 20、同时 1 任务、10 分钟 3 次。
- [x] 新增 `service_config`、`budget_periods`、`ai_task_admissions` 代码契约。
- [x] CloudBase `runTransaction` 同时预留预算、额度、admission 与任务；幂等 job 重放不重复预留。
- [x] worker 成功结算，失败释放；API 派发失败释放；cleanup 超时竞争释放。
- [x] `admin.stats` 在公开模式返回预算与服务阶段，代码无提高 100 元上限入口。
- [x] cleanup 处理 24 小时草稿、180 天日志、待删除账号和预算释放。
- [x] retirement inventory 只读清单；`retirementDelete` 固定拒绝，防止无授权全量删除。
- [x] 严格 TypeScript 领域模块覆盖服务阶段、admission 和导出，并由本地测试验证。
- [ ] 继续把 `deploy/live-api.js` 与 `deploy/experience-api.js` 的 Legacy 兼容业务迁出 CommonJS；当前 `index.js` 已收薄，公开 v3 路径有专用小模块和契约测试，但旧环境兼容实现尚未完全收敛为编译后 TS。
- [ ] 在新环境中创建集合、索引、权限和初始 `service_config`/`budget_periods`。需要单独授权，且初始 AI 必须关闭。
- [ ] 接入官方账单快照采集。当前只定义/展示字段，不会擅自调用或配置账单 API。
- [ ] 为部署 cleanup 装配 CloudBase 存储对象枚举，使 1 小时孤立文件清理从严格 TS port 落到正式 adapter。

## V3.3 自动化与本地质量

- [x] 单元/契约覆盖邮箱身份、身份字段递归删除、服务阶段、预算 admission、导出和图片 profile。
- [x] CloudBase deploy 契约覆盖公开模式邮箱门、动作门、事务预留、幂等和退休清单不删除。
- [x] Web 契约覆盖 BrowserRouter、公开/业务路由、无 PWA、无改写、平台 seam、dialog 和图片 worker。
- [x] 当前主线 typecheck、Web typecheck、Vitest 和生产构建通过。
- [x] 引入 Playwright + 本机 Chrome E2E，覆盖 320/390/430px、触控、软键盘压缩高度、横向溢出、直达/刷新和无 SW 缓存。
- [ ] 对 iOS Safari、Android Chrome、微信内置浏览器进行真机验收。
- [ ] 两邮箱完成数据库与文件租户隔离测试。
- [ ] 完成 30 次真实生成质量/隐私/时延验收。

## V3.4 云端与上线（均未授权/未执行）

- [ ] 旧环境预发布回归。
- [ ] 购买/开通生产 CloudBase 套餐并创建独立环境。
- [ ] 关闭 AI 部署 api/worker/cleanup 和静态 Web。
- [ ] 配置 BrowserRouter 4xx → `index.html` 并验证直达刷新。
- [ ] 再次核验并购买 `toulema.cn`；不可用时依次检查 `toulema.com.cn`、`toulemaapp.cn`。
- [ ] 配置 HTTPS、备案、固定公网 IP 条件和域名解析。
- [ ] 配置 OCR、TokenHub `hy3`、环境变量、权限、CORS、触发器和预算初始数据。
- [ ] 运行合成探针与两邮箱隔离。
- [ ] 完成 30 次真实验收和专业合规复核。
- [ ] 开放邮箱注册并写入最终 `publicLaunchAt`。
- [ ] 两个月只读和六个月退休演练。
- [ ] 退休期生成最终清单；另行授权后才设计/执行全量删除。

## 完成定义

“代码完成”要求 `npm run check`、浏览器 E2E 和无未解释回归；“生产就绪”还要求云端只读盘点、独立环境关闭 AI 部署和权限检查；“公开上线”还要求域名/备案、真机、两邮箱隔离、30 次质量时延门与专业合规复核。三个状态不得互相替代。
