# ApplyMate Public Mobile Web v3 进度

**最后更新：** 2026-08-24
**分支：** `codex/mobile-web-public-v3`
**阶段：** 本地正式站重构；尚未创建或部署生产环境

## 当前结论

项目主方向已从微信小程序切换为只面向手机的公开 Web。没有推倒共享 Schema、OCR/脱敏、Hy3 worker、幂等和视觉语言；小程序最终版已用 `legacy-miniprogram-final` 标签归档，并退出根构建/测试。

正式 v3 设计规格已在独立提交 `b9accb1` 固化。当前工作区包含 Web、共享契约、严格 TypeScript 领域服务和 CloudBase deploy 公开模式的实现；用户本机 `project.config.json`、`project.private.config.json` 与 `cloudbaserc.json` 保留在本地，但退出 Git 跟踪并由示例配置替代。

## 已完成

### 1. 文档与历史

- 创建分支 `codex/mobile-web-public-v3`。
- 标签 `legacy-miniprogram-final` 指向 `b99be7e`。
- 新增 `docs/superpowers/specs/2026-08-23-mobile-web-public-v3-design.md`。
- design、architecture、tech stack、implementation plan 和本进度文档已切换 v3 口径。
- 根 `tsconfig.json`、`tsconfig.check.json` 与 `vitest.config.mjs` 排除 Legacy 小程序主线；源码仍保留。

### 2. Web

- BrowserRouter：公开 `/`、`/login`、`/legal`、`/support`；业务 `/app/*`。
- 新增产品首页、支持页、服务阶段 banner 和 active/read_only/retired 路由/交互门。
- CloudBase 认证、临时上传、API 调用拆为三个 seam，CloudBase SDK 延迟加载。
- 修复 Web 存储上传把文件名字符串误传为 `filePath` 的问题；现在按 CloudBase Web 契约传入真实 `File`，失败会立即显示可理解错误并允许重试。
- 路由和 PDF 解析按需加载，生产 source map 关闭；静态首屏 JS gzip 200KB 自动门禁。
- 删除 manifest、Service Worker、PWA 安装和 AI 改写。
- 新增退出登录；账号页按最新产品确认取消数据导出入口，服务端兼容契约暂时保留但不向网页暴露。
- 原生 prompt/confirm 已替换为可访问 `<dialog>` action sheet/confirm dialog。
- JD 最多 5 图，Worker/Canvas 后台压缩和最多并发上传 3；点击生成才创建 AI 任务。
- 实现 720/Q80、1080/Q78、1440/Q75 固定候选和机械 profile 选择。

### 3. 共享与 API 领域

- 新增 `ServicePhase`、`AiAvailability`、`ServiceAccess` 及日期解析。
- 新增 `user.export`、预算/只读/活跃任务/频率错误码。
- 新增严格 TypeScript admission core：100/80/90 元、每日成功 20、同时 1、10 分钟 3。
- 新增严格 TypeScript service gate 和版本化用户导出服务。
- API 递归删除任意大小写的 uid/email/openid/userId/ownerId/identityHash 等客户端字段。
- `auth.status` 和 `user.get` 可返回 `serviceAccess`。

### 4. CloudBase deploy 公开模式

- `APPLYMATE_PUBLIC_WEB_V3=true` 时只接受 `web-email-uid-v1`；匿名/OpenID 直接拒绝。
- 公开动作 allowlist 不含邀请码、AI 改写、管理员加量和小程序动作。
- `service_config/public` 或当月 `budget_periods` 缺失时 fail closed，但 auth.status 仍可解释暂停状态。
- `generation.create` 用 CloudBase `runTransaction` 同时检查/写入任务、admission、每日成功额度槽和预算预留。
- API 派发失败释放；worker 成功结算、失败释放；cleanup 超时竞争释放。
- `user.export` 只导出当前用户记录并递归去身份；服务端兼容契约保留，但正式 Web 不再显示或加载浏览器导出入口。
- `admin.stats` 增加预算和服务阶段，预算上限不可在网页提高。
- cleanup 增加 24 小时草稿、180 天日志、账号 admission 释放和退休清单。
- `retirementDelete` 固定返回 `DESTRUCTIVE_AUTHORIZATION_REQUIRED`，当前没有生产全量删除路径。

### 5. 生成误杀修复（旧预发布 Worker 已部署）

- 复核线上 worker 与仓库：核心生成/校验代码一致，线上仍运行 `greeting-v8.19-low-latency`；唯一文件差异是本地新增预算结算，与本次失败无关。
- 历史真实 Hy3 报告已经记录 3/3 响应在 5.5 秒内返回但被旧 v8 本地门禁全部拒绝；本轮又在生产实际调用函数稳定复现：公司、岗位和简历事实均正确的 3 段简洁开场白在真实性检查前，仅因少于 350 字被 `greeting_length` 拒绝。
- 删除生成路径的 350–450 字和 3–4 段失败关闭，Prompt 改为建议 180–320 字、2–3 段；保留未知 factId、无来源数字、事实证据、隐私和提示注入硬门，并新增“至少一项当前简历事实被正文实际引用”的门禁。
- 公开错误文案已拆分为结构异常与无来源事实两类，不再显示“真实性或格式检查”混合文案；安全诊断继续只保存 gate 名和数字/布尔指标，不保存模型正文、JD 或简历原文。
- 新增生产运行路径回归测试：合法简洁正文成功；无事实的极短通用正文仍失败且不会触发第二次模型调用。
- 2026-08-24 经产品负责人单独授权，将提交 `bfd6840` 的 `worker` 部署到旧预发布环境。函数修改时间从 2026-08-23 15:34:18 更新为 2026-08-24 09:39:51，状态为 `Deployment completed`；只读健康检查 5ms，返回 `experience_real_ai_live`、`acceptsUserTraffic=true`，模型、OCR 与 CloudBase 凭证诊断均存在。
- 部署后已把线上代码下载到临时目录核验：`experience-worker.js` SHA-256 为 `da748d2400109879342f42e9053fd0f56b5878c5f9f240121ee275b3ae35ab88`，与本地提交逐字节一致；`index.js`、`greeting-calibration.js`、`budget-admission.js` 也与本地一致。

### 6. 开场白 v9.1 自适应质量规则（旧预发布已部署，待真实质量复测）

- 新增先红后绿回归：旧逻辑在三档篇幅、2–3 段经历/数字、gaps 内部化、教育优势门槛、到岗信息末段和 2,200 token 六类规则上按预期失败；实现后定向测试通过。
- Prompt/披露升级为 `experience-evidence-adaptive-v9.1`，server pipeline 升级为 `greeting-v9.1-target-reference`；继续单次 `hy3` JSON 调用，模型预算 2,200 token、超时 14 秒、temperature 0.1，无备用模型或第二次自动调用。
- strong/partial/low 分别建议 550–800/350–550/180–350 可见字符和 4–5/3–4/2–3 段；长度仍不是独立失败门。结构化契约允许 2–5 段，low 可保留 `foundation` 级可迁移证据。
- `gaps` 只保留在内部计划，正文硬门拒绝缺点披露；到岗、实习周期、每周天数和远程/线下若写入正文，只能位于最后一段。
- 教育背景复用现有可追溯 `PreferenceFact`：只有用户明确写明教育背景是优势/请突出教育，或确认事实含前 5%/突出奖学金时才允许展开；否则只用专业和在读状态定位，禁止推断学校层次。
- 合成金标准与回归已覆盖高/中/低三档自适应篇幅、低匹配 `foundation` 证据、正向可迁移表达、2–3 段事实选择、关键数字和既有真实性门；这些本地证据不能替代真实 JD 文案质量复测。
- 代码提交为 `5969120 feat: adapt greeting quality by match strength`。2026-08-24 经产品负责人明确授权，只把该提交的 Worker 代码部署到旧预发布环境 `applymate-mvp-d0g005nnw103af4c3`；未部署 API、静态 Web，未创建资源或触碰生产环境。
- 部署后 Worker 修改时间为 2026-08-24 11:23:06，状态 `Active/Available`；只读健康检查 5ms，返回 `experience_real_ai_live`、`acceptsUserTraffic=true`，模型、OCR 与 CloudBase 凭证诊断均为可用。
- 下载线上代码到临时目录核验：`experience-worker.js` SHA-256 `461850fde3412094550eb8b5c8524960074927e431cef6054197430d906c0d2f`，`greeting-calibration.js` `e172f6c5cb1a956a301e0278151b18141a98f14bcd7e0facd4f0f5e3304e614f`，`index.js` `a9104722aafb0a3c662ee4ca250bfa1f8a581df5317402855dc73fed114d5005`，`budget-admission.js` `95846f3a575b9f26355e7dab6259545dc2611d8871de66293c08dfd6652a3974`；四个文件均与本地逐字节一致。
- 真实任务 `job_generation_f87c6fc5e6fb3d56c243fbd3` 首次暴露 `greeting_target_mention` 误杀：模型已生成 4 段、372 个可见字符，但旧诊断把“岗位未提及”和“公司未提及”合并为同一 gate，无法确认具体是哪一个字符串条件。新增先红后绿回归复现这一类问题后，岗位允许当前标题、自然简称或“该岗位”，公司允许已识别全称、规范化简称、“贵司”或省略；其他公司名和跨 JD 内容仍由真实性门拒绝。
- 目标引用失败诊断新增 `missingRoleMention`、`missingCompanyMention` 安全布尔项，公开提示改为具体的岗位称呼问题，不再误报“结构不完整”。
- 修复提交为 `6491495 fix: accept natural greeting target references`。2026-08-24 按既有授权只部署旧预发布 `worker`；函数修改时间更新为 2026-08-24 11:41:50，状态 `Deployment completed`。只读健康检查 5ms，返回 `experience_real_ai_live`、`acceptsUserTraffic=true`，未调用 OCR 或模型。
- 下载线上代码复核：`experience-worker.js` SHA-256 为 `976a3948132d48fd32edcf806e98ce3d28b558c25f141bd973b47dfd33e7df9c`；`greeting-calibration.js`、`index.js`、`budget-admission.js` 分别保持 `e172f6c5cb1a956a301e0278151b18141a98f14bcd7e0facd4f0f5e3304e614f`、`a9104722aafb0a3c662ee4ca250bfa1f8a581df5317402855dc73fed114d5005`、`95846f3a575b9f26355e7dab6259545dc2611d8871de66293c08dfd6652a3974`；四个线上文件均与本地逐字节一致。
- 自动化、健康检查和哈希一致只证明部署与安全门正确，不代表真实文案质量通过。v9.1 的目标称呼修复已经完成线上核验；下一次真实任务以最新版本记录为准，仍须按本人 `jobId` 核对 Prompt 披露、正文质量和耗时。

### 7. 开场白 v9.2 数字等价校验修复（旧预发布已部署，待真实复测）

- 真实任务 `job_generation_51130b78a3a8ce6b11af3f69` 使用 2 张完整 JD 截图，OCR/岗位识别/模型生成均完成；失败诊断为 `greeting_numeric_source`、`unsupportedNumericCount=3`。任务总耗时约 9.9 秒，故障不在截图数量、上传、OCR 或模型超时，而在模型结果返回后的本地真实性门。
- 根因是旧门禁只识别阿拉伯数字：简历事实中的中文数词若被 Hy3 自然改写为阿拉伯数字，会被当成三个新数字。新增先红后绿回归稳定复现“三轮/五十条/四个月”被写成 `3轮/50条/4个月` 时的相同误杀。
- 数字比较现先统一中文数词、阿拉伯数字、百分比和区间连接符，再绑定相邻单位；`百分之五`/`5%`、`零到一`/`0-1` 等价，而月/天互换及真正无来源数字仍失败。“第一”“一名学生”等中文语法成分不进入成果数字门。
- Prompt/披露升级为 `experience-evidence-adaptive-v9.2`，server pipeline 升级为 `greeting-v9.2-numeric-equivalence`；模型、调用次数、2,200 token、14 秒超时和 temperature 0.1 均不变。
- 修复提交为 `3c5663e fix: normalize sourced greeting numbers`。2026-08-24 经产品负责人确认，只部署旧预发布环境 `applymate-mvp-d0g005nnw103af4c3` 的 Worker；API、cleanup、Web 均未部署，未创建资源且未触碰生产环境。
- 部署后 Worker 修改时间为 2026-08-24 12:54:32，状态 `Deployment completed`。只读健康检查 5ms，返回 `experience_real_ai_live`、`acceptsUserTraffic=true`，模型、OCR 与 CloudBase 凭证诊断均存在；健康检查未调用 OCR 或 Hy3。
- 下载线上代码到临时目录复核：`experience-worker.js` SHA-256 为 `63a537bf48bf318d4ed24357942c8e6e91385310a6a27cece445e44bda80bb02`；`greeting-calibration.js`、`index.js`、`budget-admission.js` 分别为 `e172f6c5cb1a956a301e0278151b18141a98f14bcd7e0facd4f0f5e3304e614f`、`a9104722aafb0a3c662ee4ca250bfa1f8a581df5317402855dc73fed114d5005`、`95846f3a575b9f26355e7dab6259545dc2611d8871de66293c08dfd6652a3974`；四个线上文件与本地逐字节一致。
- 本地完整门禁为 118 个测试文件、595 项测试、生产构建和 6 项浏览器 E2E 全部通过。以上只证明部署与安全门行为，正文质量仍需用户创建新任务并按本人 `jobId` 验收 `serverPipelineVersion=greeting-v9.2-numeric-equivalence`。

### 8. 首页产品介绍与开发者入口（旧预发布静态托管已部署）

- 产品负责人确认把首页“隐私边界”卡替换为产品介绍，把“六个月服务周期”卡替换为开发者联系；隐私和服务周期信息继续保留在协议、支持页与页脚入口。
- 产品介绍使用定性价值表达“提升获得 HR 回复和索要简历的机会”，不发布没有真实样本和 A/B 数据支持的“增加 60%”效果承诺。
- 开发者入口使用已确认公开邮箱 `applymate67@gmail.com` 和 GitHub 个人主页 `https://github.com/Yinzhi392`；顶部次要入口改为页内“三步完成”的“看看怎么使用”。
- 新增浏览器回归覆盖产品文案、无 `60%`、邮件 `mailto:` 和 GitHub 链接；完整门禁为 118 个测试文件、595 项测试、生产构建和 7 项浏览器 E2E 全部通过。
- 代码提交为 `f853769 feat: refresh landing product story`。2026-08-24 按产品负责人确认，把 `dist/web` 的 27 个文件全部部署到旧预发布静态托管根目录；API、Worker、cleanup 均未部署。
- 线上默认域名实测显示新产品介绍和开发者标题；“邮件联系”解析为 `mailto:applymate67@gmail.com`，“GitHub 主页”解析为 `https://github.com/Yinzhi392`，页面不存在 `60%` 文案。默认访问地址保持不变。

### 9. 账号页操作区修复（旧预发布静态托管已部署）

- 浏览器批注截图中的蓝色虚线和编号属于批注选区；页面自身的黑色实线来自 `.listRow` 复用于原生 `<button>` 时只设置了 `border-bottom`，未清除浏览器默认的其余边框。
- `.listRow` 现在先执行 `border: 0` 再恢复设计系统底部分隔线；`button.listRow` 明确使用全宽、透明背景和左对齐，保留全局可访问 `:focus-visible` 轮廓。
- 按产品确认移除账号页“导出我的数据”及浏览器导出模块加载，支持页不再宣称可下载 JSON；服务端 `user.export` 兼容契约暂时保留，不扩大为 API/云函数删除。
- “退出登录”图标由符号箭头改为 `👋` emoji。新增先红后绿账号页契约，防止默认按钮黑边、导出入口和旧图标回归。
- 本地完整门禁通过：118 个测试文件、596 项测试、生产构建和 7 项浏览器 E2E 全绿；HTML entry 主 JS gzip 90.23KB。
- 修复提交为 `da65661 fix: clean up account actions`。27 个 `dist/web` 文件已部署到旧预发布静态托管根目录；API、Worker、cleanup 均未部署，未创建资源或触碰生产环境。
- 线上登录态实测 `/app/account`：不存在“导出我的数据”，退出按钮包含 `👋`；按钮计算样式为透明背景，上/左/右边框均 `0px`，仅保留 `1px` 底部分隔线。`index.html`、账号页 chunk 与功能 CSS 的线上 SHA-256 分别为 `00ee7d6a430352c3b4ce5f1c5fc881aa7ec2bac80b21aefdde79a336abf332f1`、`741c936ebf20065a775c818ec9aaadb971cb83ac868fe085209742093d225d94`、`4aefa64c7f060b16c7376160bc0b5b55d592e9759e641a3ac57d4935ae80d8ce`，均与本地构建一致。

### 10. SPA 刷新与双邮箱隔离（旧预发布已验收）

- 修复前，旧预发布 `/app`、`/app/account`、`/app/jobs/new`、`/legal`、`/support` 直达均返回默认 404，BrowserRouter 无法启动。CloudBase 托管配置当时为 `indexDocument=index.html`、错误文档为空。
- 2026-08-24 按产品负责人授权，把旧预发布托管错误文档设置为 `index.html`；未新增路由规则、资源、套餐或生产配置。配置回读确认 `errorDocument=index.html`。
- CloudBase CDN 实测会保留 HTTP 404 同时返回 SPA `index.html`；浏览器直达并刷新 `/app/account` 可正常启动 React、恢复邮箱会话和原深链。新增 `npm run hosting:spa:check -- <baseUrl>`，对五个关键深链同时检查 HTML、标题和 root，并明确记录该 404-with-SPA-entry 行为。
- 自动化新增两可信邮箱身份隔离：不同内部 userId、伪造客户端身份递归删除、简历/记录/任务按当前身份过滤、跨账号 get 返回 `NOT_FOUND`、外账号临时上传路径被拒绝，且原始可信 UID 不落库。
- 真实云端顺序验收通过：账号 A 有 2 份已确认简历、5 条记录、剩余 15 次；账号 B 为 0 份简历、0 条记录、剩余 20 次，无法读取账号 A 的两个已知任务；重新登录 A 后 2/5/15 状态完整恢复，没有账号错位。
- 验收同时发现记录详情把 `application.get` 失败误判为 data 未到达，导致跨账号 `NOT_FOUND` 永久显示“正在读取记录”。已先补状态回归再调整分支顺序，线上现在显示不泄露资源存在性的“记录不存在或无权访问”并提供返回入口。
- 完整 `APPLYMATE_E2E_PORT=4189 npm run check` 通过：119 个测试文件、600 项测试和 7 项浏览器 E2E 全绿；首屏主 JS gzip 90.23KB。27 个 `dist/web` 文件已覆盖到旧预发布根目录，API、Worker、cleanup 均未部署。
- 线上 `index.html` SHA-256 为 `4e48deb785d05610cc86db406701868f540b856c71bb69637dc8193d9bd8f2ec`，记录页 chunk 为 `d084d3ae60979597e8943775c8bbcd25b4d792ade99de73341b0779f20a61173`，均与本地构建一致；线上不存在记录实测已显示新错误页。

### 11. GitHub 开源交付（已公开）

- 原仓库地址保持 `https://github.com/Yinzhi392/ApplyMate`；公开前只发现远程 `main`，当前 Web v3 分支比远程主线多 20 个线性提交。
- 新增中英文 README、品牌 Hero、三张真实本地页面截图、MIT License、贡献指南、安全策略、行为准则、Roadmap 与 Changelog。
- 新增 Issue 表单、PR 模板、CODEOWNERS、Dependabot 和 GitHub Actions；CI 使用 Node.js 22，安装 Chrome 后运行完整 `npm run check`，不连接真实 OCR、模型或生产环境。
- 本机 `cloudbaserc.json`、`project.config.json` 与 `project.private.config.json` 由 Git 忽略；仓库只保留无真实环境 ID/AppID 的示例文件，且不改变现有预发布网站地址或云端资源。
- 工作树敏感扫描已通过；完整历史没有私钥、腾讯云 SecretId、GitHub Token 或通用 Secret 赋值命中。历史中的环境 ID/AppID 属于公开标识而非凭证，现行默认分支仍不再用真实值作为开箱配置。
- `APPLYMATE_E2E_PORT=4193 npm run check` 完整通过：开源文档链接、fixture、敏感信息、严格类型、119 个 Vitest 文件/600 项测试、生产构建和 7 项 Chrome 移动端回归全部通过；首屏主 JS gzip 90.23KB。
- 生产依赖 `npm audit --omit=dev --audit-level=high` 返回 0 个已知漏洞；CI 使用当前 GitHub 官方 Action 主版本 `checkout@v6`、`setup-node@v7` 与 `upload-artifact@v7`。
- 开源准备提交 `5907e80e557439267bae70602919e485e36f955f` 已快进推送到远程 `main`；对应 GitHub Actions 运行 `32704013598` 在 1 分 55 秒内完成，完整质量门全部通过。
- 2026-08-24 经产品负责人动作前确认，原仓库已由 Private 切换为 Public；连接器回读确认 `visibility=public`、默认分支为 `main`，仓库地址保持 `https://github.com/Yinzhi392/ApplyMate`。
- GitHub 主页已复验中英文 README、品牌 Hero、三张产品截图、MIT License、贡献与安全入口可以渲染；仓库简介更新为“移动端求职开场白助手：用已确认的简历事实生成岗位专属开场白，隐私优先、事实可追溯。”
- Topics 已设置为 `ai`、`career`、`chinese`、`cloudbase`、`job-search`、`mobile-web`、`privacy`、`react`、`resume`、`typescript`；Discussions 与 Private vulnerability reporting 已开启。
- Dependabot 已创建 3 个初始版本更新 PR；未自动合并，继续按 CI、变更范围和兼容性逐个审阅。

## 本地验证证据

最近一次分项验证：

- `npm run typecheck`：通过。
- `npm run web:typecheck`：通过。
- `APPLYMATE_E2E_PORT=4187 npm run check`：完整通过；Playwright 配置支持任务级端口覆盖，避免占用用户正在使用的 4173 预览。
- Vitest：119 个当前主线测试文件、600 项测试通过（Legacy 小程序测试退出主线后计数降低）。
- Web build：通过；HTML entry 主 JS gzip 90.23KB，仍低于 200KB 硬门；CloudBase SDK 与 PDF 为动态 chunk，未生成 source map。
- Playwright + 本机 Chrome：7 项通过，覆盖 320/390/430px、截图附件、44px 主触控目标、软键盘压缩高度、无横向溢出、首页产品/开发者入口、BrowserRouter 直达/刷新/未登录重定向，以及无 manifest、Service Worker 和 cache。
- fixture 隔离、敏感信息、严格 TypeScript、Web TypeScript 与 deploy 目标语法/契约均通过。
- 独立端口 Playwright：7 项通过；本轮使用 4188 运行同一套配置后，完整 `npm run check` 全绿。

## 当前未完成或外部阻塞

### 本地代码

- JD 截图上传新增分段可观测性：岗位页分别展示本地纯压缩与网络上传耗时、压缩前后字节；CloudBase 存储失败只记录 allowlist 内的脱敏诊断字段。运行时已明确不执行字段保留率、虚构率、OCR、模型或隐私分析。
- 固定 JD 图像 profile 的 A/B 选择函数已实现，但尚未用固定真实脱敏图片测量 99% 关键字段保留率。
- 严格 TypeScript cleanup 已定义孤立文件 port；部署 cleanup 仍需正式 CloudBase 存储枚举 adapter。
- `api/deploy/live-api.js` 与 `experience-api.js` 仍承载 Legacy 兼容业务。`index.js` 已收薄、公开路径已隔离和测试，但“完全消除 src/deploy 双实现”尚未全部完成。
- 官方账单快照字段已纳入预算状态，自动采集尚未接入。

### 云端/人工

- 2026-08-23 已完成一轮旧 CloudBase 环境元数据只读盘点；盘点中后段 CLI 身份再次失效，集合计数、索引/数据库 ACL、函数环境变量名和 OCR/TokenHub 套餐仍待补齐。
- 当前只发现 Legacy 环境 `applymate-mvp-d0g005nnw103af4c3`：上海、小程序来源、体验版、预付费、状态正常，到期日 2027-02-10；数据库和存储在线。
- api/worker/cleanup 均为 Node.js 20.19、256MB、45 秒、Active；三者均没有触发器，因此 cleanup 当前没有定时执行证据。
- 旧静态托管在线且错误文档已设为 `index.html`；仍存在 `manifest.webmanifest`、`sw.js`、旧约 1.125MB JS 和最高约 3.7MB source map。未删除这些历史文件，新 Web 本身不注册或引用它们。
- 旧身份配置同时启用邮箱、匿名和用户名登录；存储为 PRIVATE/创建者和管理员读写，无自定义存储规则；CORS 仍包含旧域名、平台默认项和通配配置，没有正式产品域名。
- 已只读定位本地 Web 截图上传失败：当前安全域名列表没有 `127.0.0.1`/`localhost`，而测试页来源是 `http://127.0.0.1:4173`。CloudBase Web SDK 直传对象存储因此被 CORS 拒绝并包装为 `OPERATION_FAIL [storage]`。产品负责人已单独授权新增 `127.0.0.1`，但旧体验套餐返回 `CreateAuthDomain: 当前套餐无法执行此操作`；安全域名列表未改变，也没有升级、付费或扩大域名范围。
- 产品负责人随后单独授权把当前 `dist/web` 部署到旧环境静态托管根目录。默认托管域名的首页、邮箱登录和真实 JD 生成均已完成后续验证；旧 manifest、Service Worker、历史哈希资源/source map 未删除。错误文档已在本轮改为 `index.html`，详见第 10 节。
- 该托管预览随后出现一次“AI 返回内容未通过真实性或格式检查”失败。旧任务 jobId 未提供，因此没有读取该用户任务记录或执行跨用户日志扫描；误杀修复现已部署并完成线上代码核验，仍须由用户在托管域名完成邮箱验证码登录后，用其已确认默认简历和指定两张 JD 截图创建新任务，按该用户自己的 jobId 完成真实 OCR/Hy3 验收。
- 当前账期为 2026-08-10 至 2026-09-10，套餐内资源点 126.44/3000，资源包和按量费用均显示 0；资源点主要来自 NoSQL 47.42、函数 38.28、API 35.46、存储 5.28。该快照不等于 OCR/TokenHub 独立账单。
- 旧数据库存在 users、invites、resumes、applications、ai_jobs、daily_usage、feedback、audit_logs；不存在 v3 所需 service_config、budget_periods、ai_task_admissions。未读取或导出任何用户记录。
- 未购买套餐、未创建新生产环境、未创建集合/权限/触发器、未部署。
- 未购买域名、未配置 HTTPS、未备案。
- 未配置生产 OCR/TokenHub/密钥或公开注册。
- 两邮箱真云隔离已完成；仍未完成三类真机、30 次质量/隐私/时延验收和专业合规复核。
- 未执行任何生产数据删除。

## 下一执行顺序

1. 用户在托管域名完成邮箱验证码登录并确认默认简历后，用指定两张 JD 截图创建新任务；按本人 jobId 验证上传、OCR、Hy3、校验和结果正文。
2. 用固定脱敏 JD 图片完成三规格 A/B。
3. 收敛剩余 Legacy deploy 双实现、装配存储孤儿清理和账单快照 adapter。
4. 用户在 CloudBase 登录界面完成登录后，补齐旧环境集合计数/ACL/变量名和 OCR/TokenHub 套餐、额度、账单只读快照。
5. 分别请求新环境/套餐/域名/备案/密钥/生产部署授权，再按实施计划的固定顺序上线。

## 授权记录

用户已批准“ApplyMate Web v3 正式公开站重构计划”以及本地代码和文档实施。该批准不包含域名购买、套餐开通、新环境创建、备案、密钥写入、生产部署或最终数据删除；这些动作继续要求逐项授权。付款、实名、验证码和密码始终由用户本人操作。

2026-08-24 用户单独确认将 `Yinzhi392/ApplyMate` 由 Private 切换为 Public，并授权发布仓库简介、Topics、开启 Discussions 与 Private vulnerability reporting；原仓库 URL 和现有网站地址均保持不变。

2026-08-24 用户单独授权部署提交 `bfd6840` 到旧预发布 `worker`，该部署和线上代码核验已完成；未部署 API/cleanup、未创建资源、未修改套餐或密钥。
