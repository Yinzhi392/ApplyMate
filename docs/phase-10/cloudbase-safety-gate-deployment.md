# CloudBase 安全门禁部署记录

**记录时间：** 2026-08-11（北京时间）
**环境：** `applymate-mvp-d0g005nnw103af4c3`（上海、体验版、预付费）

## 目的

本次仅验证 CloudBase 普通云函数的部署、运行时和免费环境边界。它不是生产业务上线；小程序继续使用本地演示 API，真实简历、JD、邀请码、OCR、TokenHub、云存储和文档数据库均未接入这三个函数。

## 已部署内容

`cloudbaserc.json` 声明三个 Event 函数，均使用 Node.js 20：

- `api`：10 秒；
- `worker`：45 秒；
- `cleanup`：45 秒。

每个函数当前只接受 `{ "healthcheck": true }`。健康检查返回运行时名称和 `safety_gate`；任意普通业务请求统一返回可重试的 `RESOURCE_PAUSED`。处理器没有数据库、存储、OCR、模型或日志写入代码，因此不会接收或保留用户数据。

## 已验证结果

- 三个函数均由 CloudBase CLI 部署成功，状态为 `Deployment completed`。
- 三个健康检查均成功；`api` 的模拟 `auth.status` 请求被 `RESOURCE_PAUSED` 拒绝。
- 云端配置回读确认：`api` 为 10 秒，`worker` 与 `cleanup` 均为 45 秒；三个函数均为 Event 类型、Node.js 20、无环境变量、无触发器、无层、无云端依赖安装。
- 函数运行时仅执行 4–12 ms；本次调用未写入数据库或存储。
- 部署和调用后 CloudBase 仍显示：资源包使用 0、按量付费使用 0；体验包共 1.23/3000 资源点。云函数、AI、流量均为 0；数据库 0.98、存储 0.01、API 调用 0.24 均属于包含额度。
- `npm audit --omit=dev` 在安装 `@cloudbase/js-sdk@3.7.1` 后为 0 个生产依赖漏洞。未安装 `@cloudbase/node-sdk`，因为候选依赖链含不满足项目门槛的 `axios@0.27.2`。

## 仍然关闭的能力

真实 CloudBase 仓储、可信 OpenID 的实际业务路由、异步任务派发、数据库事务、临时存储、OCR、TokenHub 和定时 cleanup 都尚未实现或启用。任何一项在重新开放前，都必须先具备完整适配器、外发审计、零费用快照和专项测试。
