# Product

<!-- impeccable:product-schema 1 -->

## Platform

mobile-web

## Users

寻找实习、校招或初级岗位的大学生和应届生。他们通常在手机招聘平台浏览岗位，希望快速写出真实、具体且与岗位匹配的开场白。

## Product Purpose

用户确认一次简历，之后提交岗位截图或文字，ApplyMate 根据已确认事实与求职偏好生成岗位专属开场白。成功意味着减少重复上传和整理，同时不牺牲真实性与隐私。

## Positioning

ApplyMate 不自动投递，也不凭空优化经历；它把生成文案中的每项可验证陈述回溯到用户确认的简历事实、求职偏好或岗位字段。

## Operating Context

产品运行在手机浏览器中，覆盖 iOS Safari、Android Chrome 和微信内置浏览器；电脑端显示居中的手机版。核心流程为邮箱验证码注册、协议、确认简历、提交岗位、异步生成、核对复制和保存投递记录。

## Capabilities and Constraints

- 公开页面为首页、登录、协议与支持；登录后业务统一位于 `/app/*`。
- 每个账号最多保存 3 份简历；JD 支持文字或最多 5 张截图。
- 简历只需进行一次轻量事实核对：AI 排序加分项，用户只纠错；具体岗位会按 JD 自动重排已确认事实。
- 个人每日成功生成 20 次，同时最多 1 个 AI 任务，10 分钟最多创建 3 次。
- 月度云资源预算 100 元；80 元告警，90 元暂停新 AI 任务。
- 无邀请码、匿名账号、PWA 或 AI 改写。
- 正式开放满 2 个自然月只读，满 6 个月退休。
- 未单独授权不得购买、创建、配置、部署或删除生产云资源。

## Brand Commitments

中文名“投了吗”，英文名 ApplyMate。语气专业、直接、低焦虑，不使用未经真实数据支持的成功率宣传。

## Evidence on Hand

产品与系统事实以 `memory-bank/design-document.md` 为唯一有效基线；实施状态分别记录在 `memory-bank/implementation-plan.md`、`memory-bank/progress.md` 和 `memory-bank/architecture.md`。

## Product Principles

- 真实优先，每项陈述有来源。
- 隐私优先，原图不进入文本模型。
- 移动优先，减少切换和重复输入。
- 每个页面只突出一个下一步。
- 用户始终拥有最终确认权。

## Accessibility & Inclusion

关键触控目标至少 44pt/48dp，支持键盘焦点、屏幕阅读顺序、系统字号和安全区；重要状态不能只依赖颜色表达。
