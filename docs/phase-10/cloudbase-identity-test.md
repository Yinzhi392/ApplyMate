# CloudBase 身份闭环测试

**范围：** 验证微信受信身份、CloudBase 用户记录、协议同意和受限邀请码消费。默认小程序仍使用演示 API；本测试不会上传简历/JD、调用 OCR/TokenHub、写入任务或消耗生成额度。

## 前提

- 微信开发者工具已打开仓库根目录，并使用绑定当前 CloudBase 环境的合法 AppID；
- `api` 函数状态为 Active；
- 保持 CloudBase 体验版与所有后付费开关为关闭状态。

## 开启与验证

1. 在开发者工具 Console 执行：

   ```js
   wx.setStorageSync("applymate:runtime-mode", "cloudbase_identity_test")
   ```

2. 重新编译小程序，打开登录页；邀请码输入框不会再显示演示邀请码。
3. 勾选协议并提交。真实 `api` 应在 `users` 集合创建一条仅含 `identityHash` 的用户记录，页面随后进入“需要邀请码”的状态。
4. 在控制台的 `users` 集合核对：不得出现原始 OpenID、简历正文、JD、图片、TokenHub Key 或 OCR 内容。
5. 受限云端版本允许 `invite.activate`。有效邀请码成功后应进入 active；简历、岗位、任务和 AI action 仍须返回暂停。

## 第二微信身份扫码验证

1. 在微信开发者工具的编译模式中选择“第二身份邀请码验证”。该本地编译条件会携带 `applymateRuntime=cloudbase_identity_test`，测试者无需操作 Console。
2. 点击“预览”，由已加入项目/体验成员的另一个微信身份扫码。
3. 在手机上勾选当前协议并输入管理员创建的真实邀请码；成功后页面应在原地显示登录成功。
4. 随后核对 `users` 只有身份哈希和激活状态，`invites` 已变为 consumed 且只记录内部 userId；不得保存明文邀请码或 OpenID。
5. 使用第三个未激活身份输入同一码时必须失败。若暂时只有一个额外身份，先记录一次消费通过，第二消费者拒绝证据保持待补，不得宣称完整一次性消费验收完成。

## 恢复演示模式

在 Console 执行后重新编译：

```js
wx.removeStorageSync("applymate:runtime-mode")
```

## 失败处理

- `UNAUTHENTICATED`：确认当前 AppID 与 CloudBase 环境绑定，并用微信开发者工具重新登录/编译。
- 网络错误：不要重复点击；恢复网络后重新打开页面。此身份操作没有客户端自报 OpenID。
- 任何非预期成功的简历、岗位或生成请求：立即停止测试并记录 action；这些能力在当前版本必须保持暂停。

## 验收记录

- **日期：** 2026-08-11（北京时间）
- **结果：** 产品负责人确认本测试已完成且无问题。
- **已确认边界：** 真实身份与协议状态可用；邀请码、简历、岗位、任务和 AI 能力仍保持失败关闭。
- **隐私记录：** 本文不保存、也不要求记录原始 OpenID、邀请码、简历、JD、图片或外部凭证。
