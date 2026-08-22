# 阶段 10 协议草案确认

本目录包含 ApplyMate 30 至 100 人邀请制体验版的三份项目专用草案：

- `user-agreement-draft.md`
- `privacy-policy-draft.md`
- `ai-service-disclosure-draft.md`

当前状态：**产品负责人已于 2026-08-09 确认用于 30 至 100 人邀请制体验版，并于 2026-08-13 明确体验成员使用真实 AI**。草案未经专业法律审查，不代表已经满足公开发布条件；公开发布前仍须专业复核。真实 CloudBase、腾讯 OCR 和 TokenHub 仅在零费用与安全门禁通过时启用。

微信测试资源核对见 [`wechat-test-resource-review.md`](./wechat-test-resource-review.md)。该记录只证明小程序测试号的开发和二维码预览能力，不代表个人主体类目或正式发布资格通过。

CloudBase 免费环境核对见 [`cloudbase-free-environment-review.md`](./cloudbase-free-environment-review.md)。首个错误的 PostgreSQL/PG 环境已彻底释放；新的上海 0 元文档数据库环境已经创建并建立八个 `ADMINONLY` 空集合。服务端 SDK 安全门记录见 [`cloudbase-sdk-audit.md`](./cloudbase-sdk-audit.md)，审计通过前不部署云函数。

腾讯 OCR 免费资源核对见 [`ocr-free-resource-review.md`](./ocr-free-resource-review.md)，30 组字段评测见 [`ocr-phase0-evaluation.md`](./ocr-phase0-evaluation.md)。0.11 的 OCR 字段证据判定为 180/180，但中位耗时 19.77 秒且最大耗时 55.36 秒，时延门槛失败；0.13 外发数据边界与 0.14 五类资源零费用审计随后已通过。

TokenHub 免费资源核对见 [`tokenhub-free-resource-review.md`](./tokenhub-free-resource-review.md)，原单模型冒烟失败保留于 [`tokenhub-phase0-smoke-evaluation.md`](./tokenhub-phase0-smoke-evaluation.md)，调整后 30 组正式结果见 [`tokenhub-phase0-evaluation.md`](./tokenhub-phase0-evaluation.md)。最终采用“Hy3 单次选事实 + 本地确定性生成/改写”，字段准确率 98.89%、文案合规率 100%、零虚构、端到端中位 3.41 秒，0.12 已通过。评测后 Hy3 剩余 96.9%、DeepSeek 剩余 99.8%，按 Token 计费均未启用。

当前 v8 三组真实 TokenHub 复评与 worker 部署记录见 [`greeting-v8-live-evaluation.md`](./greeting-v8-live-evaluation.md)。2026-08-21 三次调用均在 5.5 秒内返回，但全部被 v8 本地质量门拒绝，故不得把部署写成质量验收通过。

2026-08-22 的 v8.17 安全通用正文被真机证明不可用：它会把事实清单机械拼接成无法发送给 HR 的文案，机械兜底已永久移除。产品负责人最新批准低延迟信息流框架 v2：选图后最多 3 张原图后台并发上传，API 只返回 jobId，worker 一次批量签名后并行 OCR，job.get 返回本人首屏预览。Hy3 仍只调用一次；恢复 350–450 个可见字符、3–4 段、目标称呼、未知事实引用、数字来源和隐私格式的本地失败关闭，失败不追加模型调用或通用正文。当前仅完成本地实现，未部署、未上传小程序；双指标真机验收完成前 10.18 仍不得标记完成。

五类资源的统一暂停规则见 [`zero-cost-resource-checklist.md`](./zero-cost-resource-checklist.md)。该检查表把 OCR、模型、云函数、存储和流量分别判定，再映射到现有业务门禁；任一状态未知、检查过期、付费兜底开启、实际费用非零或免费剩余量不足时均失败关闭。0.10 只完成本地策略与测试，真实运行时采集器尚未部署。

外发链路证据见 [`phase0-egress-audit.md`](./phase0-egress-audit.md)。阶段 10.6 已实际运行一次完全合成的“腾讯 OCR → 本地脱敏 → Hy3”链路：5 类受保护信息均被遮盖，图片只出现在 OCR 请求，Hy3 收到的请求不含图片、Base64、fileId 或受保护文本；证据不保存请求/响应原文或凭证。30 组五类资源用量、目录价估算和实际零费用证据见 [`phase0-resource-cost-audit.md`](./phase0-resource-cost-audit.md)。0.14 与 10.6 均不替代发布前 10.12 的账单再复核。

当前端到端、安全与删除验证边界见 [`e2e-security-deletion-test-report.md`](./e2e-security-deletion-test-report.md)。本地完整闭环与删除语义、云端未认证失败关闭、合成可靠性链和八集合合成账号物理删除均已通过；开发者/体验成员真实业务流量已获授权，普通账号删除仍关闭。

测试体验版发布候选的统一结论见 [`test-release-report.md`](./test-release-report.md)。报告只支持受限的开发者/体验成员测试，不支持正式公开发布；10.9 真机与第二微信身份消费均按产品负责人要求豁免并作为残余风险保留。产品负责人已于 2026-08-13 完成 10.14 明确批准。

产品负责人已完成 10.14 批准。手动上传步骤见 [`experience-version-upload-guide.md`](./experience-version-upload-guide.md)；该指南在“设为体验版”处停止，明确禁止提交审核或正式发布。

阶段 0.15 的统一结论见 [`phase0-decision-report.md`](./phase0-decision-report.md) 与机器可读的 [`phase0-decision-report.json`](./phase0-decision-report.json)。0.11R 的 30 组全量复验将 OCR 中位时延降至 1,429 ms、最大时延降至 1,940 ms，字段为 180/180，调用后实际费用仍为 0 元；阶段 0 的技术门槛、0.17 批准记录和 10.6 外发审计均已完成。本轮体验版真实 AI 授权取代此前“真实入口关闭”的历史边界，但不授权付费兜底、正式审核或公开发布。

阶段 0.11R 的安全诊断证据见 [`ocr-latency-diagnostic.md`](./ocr-latency-diagnostic.md) 与 [`ocr-latency-remediation-evaluation.md`](./ocr-latency-remediation-evaluation.md)。未来运行时保留用户原图，只向 OCR 发送 720×1080、质量 80 的 JPEG 临时副本，随后删除两者。

确认时请重点核对：

1. 个人开发者和邀请制体验版的表述是否准确；
2. 数据类型、处理目的、服务提供方和外发链路；
3. 1 小时、24 小时和 180 天保存期限；
4. 账号删除、用户权利和联系邮箱；
5. AI 事实校验、内容标识和模型信息公示方式。

小程序展示内容的唯一代码源位于 `miniprogram/core/legal-documents.ts`。三份 Markdown 用于人工审阅，修改草案时必须同步更新代码源并通过一致性测试。
