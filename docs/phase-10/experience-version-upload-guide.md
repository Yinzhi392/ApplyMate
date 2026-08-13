# ApplyMate 微信体验版上传指南

## 使用边界

本指南只用于将当前构建上传为微信小程序体验版。体验成员使用真实 CloudBase、腾讯 OCR 和 TokenHub AI；普通账号删除和付费兜底保持关闭。不提交正式审核，不公开发布。

## 上传前检查

1. 在微信开发者工具打开 `/Users/mayinzhi/Desktop/投了吗`。
2. 确认右上角显示当前正式注册的小程序 AppID，而不是旧测试号。
3. 点击“编译”，确认模拟器正常打开，Console 没有应用错误。
4. 确认 CloudBase 环境为 `applymate-mvp-d0g005nnw103af4c3`，`api`、`worker`、`cleanup` 均已部署。
5. 在 `api` 与 `worker` 的环境变量中设置 `APPLYMATE_REAL_AI_ENABLED=true`。在 `worker` 设置 `TOKENHUB_API_KEY`、`TOKENHUB_MODEL=hy3`、`TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1`。OCR 优先使用 CloudBase 运行时临时凭证；如运行时没有凭证，再由产品负责人于 `worker` 填入 `TENCENTCLOUD_SECRET_ID` 和 `TENCENTCLOUD_SECRET_KEY`。
6. 确认 OCR 后付费、TokenHub 按 Token 计费和 CloudBase 超额付费均关闭。不要把密钥写入代码、备注或截图。
7. 分别调用 `api` 和 `worker` 的 `{ healthcheck: true }`，应返回 `state=experience_real_ai_live` 且 `acceptsUserTraffic=true`。

## 先部署真实 AI 云函数

在项目根目录打开终端，确认 CloudBase CLI 已登录后执行：

```bash
cd /Users/mayinzhi/Desktop/投了吗
npx tcb fn deploy --all --force
```

CloudBase CLI 会读取仓库根目录的 `cloudbaserc.json`，把 `api`、`worker`、`cleanup` 部署到固定环境。若命令要求网页授权，用当前腾讯云账号完成授权后回到终端等待三项部署结束。不要在终端或聊天中粘贴任何 Secret、TokenHub Key 或 CloudBase API Key。

部署结束后进入 CloudBase 控制台逐项核对：

1. `api`：保留现有 `CLOUDBASE_APIKEY`、管理员等变量，新增或修改 `APPLYMATE_REAL_AI_ENABLED=true`。
2. `worker`：保留现有 `CLOUDBASE_APIKEY` 和 `TOKENHUB_API_KEY`，设置 `APPLYMATE_REAL_AI_ENABLED=true`、`TOKENHUB_MODEL=hy3`、`TOKENHUB_BASE_URL=https://tokenhub.tencentmaas.com/v1`。
3. `cleanup`：保留现有 CloudBase 数据库访问配置，不需要 TokenHub 或 OCR 密钥。
4. 保存环境变量后重新部署或等待函数配置生效；不要删除原有变量，也不要截图密钥值。
5. 在微信开发者工具 Console 执行下面两段健康检查：

```js
wx.cloud.callFunction({ name: "api", data: { healthcheck: true } }).then(console.log)
wx.cloud.callFunction({ name: "worker", data: { healthcheck: true } }).then(console.log)
```

两者都必须返回 `experience_real_ai_live` 和 `acceptsUserTraffic: true`。否则不要上传微信体验版。

## 上传为开发版本

1. 点击微信开发者工具顶部右侧“上传”。如果按钮不可用，先用该小程序管理员或项目成员微信扫码登录。
2. 版本号填写 `0.10.1`；若后台已有该版本号，依次使用 `0.10.2`、`0.10.3`，不要覆盖历史版本。
3. 项目备注填写：`体验版真实AI闭环；仅限开发者和体验成员；不提交审核；付费兜底关闭。`
4. 检查上传弹窗中的 AppID 与小程序名称，确认后点击“上传”。
5. 等待工具提示上传成功。此时只是“开发版本”，还不是体验版。

## 设为体验版

1. 登录 [微信公众平台](https://mp.weixin.qq.com/)，进入当前小程序。
2. 打开“管理/版本管理”或“开发管理/开发版本”。不同后台版本的菜单名称可能略有差异。
3. 在“开发版本”找到刚上传的 `0.10.1`。
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
3. 用一份自己有权处理的简历截图验证“上传 → OCR → 核对个人资料”，再提交一份 JD 验证真实开场白。
4. 确认结果页显示真实模型披露和“AI生成内容，请核对真实性”。
5. 在 CloudBase 查看临时文件已清理，再复核腾讯云账单仍为 0 元，OCR 后付费和 TokenHub 按 Token 计费仍关闭。
