# ApplyMate 微信体验版上传指南

## 使用边界

本指南只用于将当前构建上传为微信小程序体验版。体验成员使用真实 CloudBase、腾讯 OCR 和 TokenHub AI；普通账号删除和付费兜底保持关闭。不提交正式审核，不公开发布。

## 上传前检查

1. 在微信开发者工具打开 `/Users/mayinzhi/Desktop/投了吗`。
2. 确认右上角显示当前正式注册的小程序 AppID，而不是旧测试号。
3. 点击“编译”，确认模拟器正常打开，Console 没有应用错误。
4. 确认 CloudBase 环境为 `applymate-mvp-d0g005nnw103af4c3`；2026-08-15 的 `api`、`worker` 与 `cleanup` 修复版本已经部署。
5. 在 `api` 与 `worker` 的环境变量中设置 `APPLYMATE_REAL_AI_ENABLED=true`。在 `worker` 设置 `TOKENHUB_API_KEY`、`TOKENHUB_MODEL=hy3`、`TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1`，以及 OCR 专用的 `APPLYMATE_OCR_SECRET_ID`、`APPLYMATE_OCR_SECRET_KEY`、`APPLYMATE_OCR_REGION`。只有使用临时凭证时才设置 `APPLYMATE_OCR_SESSION_TOKEN`；长期密钥对没有 SessionToken 是正常状态。不得让 OCR 复用 CloudBase 运行时身份。
6. 确认 OCR 后付费、TokenHub 按 Token 计费和 CloudBase 超额付费均关闭。不要把密钥写入代码、备注或截图。
7. 分别调用 `api` 和 `worker` 的 `{ healthcheck: true }`，应返回 `state=experience_real_ai_live` 且 `acceptsUserTraffic=true`。

## 先部署真实 AI 云函数

只有修改云函数源码后才需要重新部署。在项目根目录打开终端，确认 CloudBase CLI 已登录后分别执行：

```bash
cd /Users/mayinzhi/Desktop/投了吗
npx tcb fn deploy api --force
npx tcb fn deploy worker --force
```

CloudBase CLI 会读取仓库根目录的 `cloudbaserc.json`，只把 `api`、`worker` 更新到固定环境。若命令要求网页授权，用当前腾讯云账号完成授权后回到终端等待部署结束。不要在终端或聊天中粘贴任何 Secret、TokenHub Key 或 CloudBase API Key。

部署结束后进入 CloudBase 控制台逐项核对：

1. `api`：保留现有 `CLOUDBASE_APIKEY`、管理员等变量，设置 `APPLYMATE_REAL_AI_ENABLED=true`。
2. `worker`：保留现有 `CLOUDBASE_APIKEY` 和 `TOKENHUB_API_KEY`，设置 `APPLYMATE_REAL_AI_ENABLED=true`、`TOKENHUB_MODEL=hy3`、`TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1`，并保留 OCR 专用的 `APPLYMATE_OCR_SECRET_ID`、`APPLYMATE_OCR_SECRET_KEY` 与 `APPLYMATE_OCR_REGION`。
3. `cleanup`：保留现有 CloudBase 数据库访问配置，不需要 TokenHub 或 OCR 密钥。
4. 保存环境变量后重新部署或等待函数配置生效；不要删除原有变量，也不要截图密钥值。
5. 在微信开发者工具 Console 执行下面两段健康检查：

```js
wx.cloud.callFunction({ name: "api", data: { healthcheck: true } }).then(console.log)
wx.cloud.callFunction({ name: "worker", data: { healthcheck: true } }).then(console.log)
```

两者都必须返回 `experience_real_ai_live` 和 `acceptsUserTraffic: true`。worker 的 `credentialDiagnostic` 必须确认 TokenHub Key、CloudBase API Key、OCR 专用 SecretId 与 SecretKey 均存在；长期 OCR 密钥对对应的 SessionToken 可以为 `false`。否则不要上传微信体验版。

## 上传为开发版本

1. 点击微信开发者工具顶部右侧“上传”。如果按钮不可用，先用该小程序管理员或项目成员微信扫码登录。
2. `0.10.3` 已于 2026-08-22 通过 CLI 上传；后续若再次上传，使用 `0.10.4` 或更高未占用版本号，不要覆盖历史版本。
3. 项目备注填写：`体验版真实AI闭环；仅限开发者和体验成员；不提交审核；付费兜底关闭。`
4. 检查上传弹窗中的 AppID 与小程序名称，确认后点击“上传”。
5. 等待工具提示上传成功。此时只是“开发版本”，还不是体验版。

## 设为体验版

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)，进入当前小程序。
2. 打开“管理/版本管理”或“开发管理/开发版本”。不同后台版本的菜单名称可能略有差异。
3. 在“开发版本”找到刚上传的版本号。
4. 点击该版本右侧“选为体验版”或“设为体验版”。
5. 如需填写启动页面，使用首页路径 `pages/home/index`，不要附加真实身份测试参数。
6. 确认后生成体验版二维码。

## 添加体验成员

1. 在小程序后台进入“成员管理”或“体验成员”。
2. 添加可信测试者的微信号；体验成员必须先被加入，才能扫描体验版二维码。
3. 只邀请已知的开发者或体验成员，不对外公开二维码。

## 必须停止的位置

看到体验版二维码即完成。不要点击“提交审核”“审核版本”或“发布”。若后台提示必须先补充正式类目、主体资质或购买服务，停止操作；这些属于公开发布流程，不在当前授权内。

## 上传后快速验证

1. 管理员或体验成员扫码打开。
2. 确认登录、首页、记录、我的和协议页面可打开。
3. 删除此前失败的简历记录，或直接重新上传一份新文件。旧任务已经进入终态，幂等机制不会自动重放它。
4. 用一份自己有权处理的简历截图验证“上传 → OCR → 核对个人资料”，再提交一份 JD 验证真实开场白。
5. 确认结果页显示真实模型披露和“AI生成内容，请核对真实性”。
6. 在 CloudBase 查看临时文件已清理，再复核腾讯云账单仍为 0 元，OCR 后付费和 TokenHub 按 Token 计费仍关闭。

## 时延与文案复测

1. 经单独授权部署 api、worker 和新版客户端后，先清除开发者工具编译缓存，确认生成请求使用 `jd-submit-v6-background-upload`：选图后立即后台上传原图且最多 3 张并发；点击生成时不得再次上传成功图片。
2. 使用同一份已确认简历，分别用 1、3、5 张截图在 iOS、Android 以及 Wi-Fi、移动网络计时。每次记录“选图完成到正文首次展示”和“点击生成到正文首次展示”，只保存截图数、网络类型、设备类型与秒数，不记录图片或正文。
3. 在 CloudBase 的新任务/投递记录中只核对 `clientPipelineVersion=jd-submit-v6-background-upload`、`serverPipelineVersion=greeting-v8.19-low-latency`、`generationMode=model` 及非内容时延字段。worker 必须一次批量签名 URL；新任务不得出现第二次模型调用、`verified_generic_fallback` 或机械事实清单。
4. 两组硬指标分别为：选图完成到正文 P50 ≤15 秒、P95 ≤20 秒；点击生成到正文 P50 ≤10 秒、P95 ≤15 秒。子预算为后台上传 ≤4 秒、API 创建 ≤1 秒、OCR ≤2 秒、模型 ≤5.5 秒、校验保存与首屏 ≤1.5 秒。任一硬指标不通过，不进入体验版发布。
5. 覆盖删除、排序、单图失败重试、页面恢复和弱网恢复；成功图不得因单图失败重复上传。OCR 空或文件损坏必须返回可操作错误，不能伪造正文。
6. 人工检查正文达到岗位理解、经历选择、语气和完整性目标；180–320 个可见字符、2–3 段只是建议，不得单独触发失败。未知事实、无来源数字、跨 JD、隐私或提示注入必须明确终止，不调用第二个模型或通用正文。
7. 自动化通过不等于人工质量和时延通过；失败只记录安全规则标签，不把原始简历、JD 或正文写入仓库。还须核对已提交文件即时清理、失败清理重试和 1 小时孤立文件调度，再更新 10.18k。

## 上传后无法解析简历时

体验版不需要正式审核也能使用真实 AI。若上传简历后没有进入 OCR/AI 解析，按以下顺序检查，不要切回 demo：

1. 确认登录页显示“体验版·真实 AI”。如果曾用过本地演示启动参数，在开发者工具 Console 执行 `wx.removeStorageSync("applymate:runtime-mode")`，删除编译模式里的 `applymateRuntime=demo`，再重新编译。
2. 重新执行 `api` 和 `worker` 健康检查；两者都必须为 `experience_real_ai_live / acceptsUserTraffic=true`。任一为 paused 都先修复对应函数环境变量，不要重复上传用户文件。
3. 删除此前失败的任务或简历记录并重新选择文件。失败任务是幂等终态，部署修复后不会自动重放。
4. 在 CloudBase 函数日志中只核对稳定错误码与任务状态，不复制 OCR 原文、模型请求、OpenID、Secret 或 API Key。
5. 若新任务仍失败，记录 `jobId`、页面显示的安全错误码和发生时间；不要发送简历原图或云端凭证。
