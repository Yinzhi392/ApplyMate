# CloudBase 管理员初始化与邀请码测试

**状态：** `api` 受限版本已于 2026-08-13 部署。正式 AppID `wx1883d1aeb40ede10` 已完成腾讯云账号关联与既有环境转换；产品负责人从微信开发者工具实际调用 healthcheck，返回 `ok: true`、`invite_live_limited` 且 `acceptsUserTraffic: false`。可达性前置门槛已通过，临时哈希仍为空，尚未执行管理员初始化。

## 安全边界

- 只配置令牌的 SHA-256 哈希，绝不配置或发送原始 OpenID。
- 原始令牌只由产品负责人临时保管，不发送给开发者、不写入仓库或截图。
- 初始化记录一经成功即永久绑定当前微信身份；即使令牌泄露，其他身份也不能成为管理员。
- 初始化后立即删除该环境变量；邀请码和业务能力以外的接口仍保持暂停。

## 部署后的操作

> 前置门槛：必须先在 CloudBase“环境管理 → 小程序认证”完成正式小程序关联，并使用不含敏感信息的 healthcheck 证明开发者工具可调用目标环境。未通过时不生成令牌、不配置哈希。

1. 在自己的本机终端用一条命令同时生成随机令牌和对应哈希：

   ```sh
   node -e "const c=require('crypto'); const token=c.randomBytes(32).toString('base64url'); const hash=c.createHash('sha256').update('applymate-admin-bootstrap-v1\\0'+token).digest('hex'); console.log('TOKEN='+token+'\\nHASH='+hash)"
   ```

2. 临时保存 `TOKEN` 与 `HASH` 两行值，不要发送到聊天、截图或写入仓库。该命令不会把原始令牌写入终端历史；完成第 6 步后删除临时记录并清空终端屏幕。

3. 在 CloudBase 的 `api` 云函数环境变量中仅新增：

   | 名称 | 值 |
   | --- | --- |
   | `APPLYMATE_ADMIN_BOOTSTRAP_TOKEN_SHA256` | 第 1 步输出的 `HASH` 值（64 位小写十六进制） |

4. 在绑定环境的小程序开发者工具 Console 中，以当前产品负责人的微信身份先初始化 CloudBase，再调用一次；把 `TOKEN` 替换为原始令牌：

   ```js
   wx.cloud.init({
     env: 'applymate-mvp-d0g005nnw103af4c3',
     traceUser: true
   })

   wx.cloud.callFunction({
     name: 'api',
     data: {
       action: 'admin.bootstrap',
       payload: { token: 'TOKEN' },
       requestId: '请替换为新的 UUID v4'
     }
   })
   ```

5. 预期返回 `{ ok: true, data: { bootstrapped: true, isAdmin: true } }`。重新编译后，`auth.status` 应显示管理员且不再要求邀请码。
6. 立即从云函数环境变量中删除 `APPLYMATE_ADMIN_BOOTSTRAP_TOKEN_SHA256`，再次部署或保存配置；随后使用管理员页创建一枚邀请码，并以另一个测试身份验证激活。

## 失败处理

- `FORBIDDEN`：检查协议是否已同意、令牌本地计算是否使用了固定前缀，或初始化是否已被同一身份完成；不要反复猜测。
- `UNAUTHENTICATED`：确认开发者工具 AppID 已绑定目标 CloudBase 环境，再重新编译。
- `RESOURCE_PAUSED`：表示新函数尚未部署，或调用了不在本步骤范围内的能力。
- `-601034` / “没有权限”：表示请求尚未进入函数；先完成正式小程序 AppID 与目标 CloudBase 环境的账号绑定和小程序认证。测试号没有可用管理员关系时不能绕过该门槛。
- 任何出现 OpenID、原始令牌、简历、JD 或 OCR 文本的日志/截图都应立即停止并删除该材料。
