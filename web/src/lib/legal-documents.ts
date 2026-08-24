import { WEB_CONTACT_EMAIL } from "./public-contact";

export const WEB_EFFECTIVE_DATE = "2026-08-23";
export { WEB_CONTACT_EMAIL } from "./public-contact";

export interface WebLegalDocument {
  title: string;
  version: string;
  sections: Array<{ heading: string; body: string }>;
}

export const WEB_LEGAL_DOCUMENTS: WebLegalDocument[] = [
  {
    title: "用户协议",
    version: "user-2026-08-23",
    sections: [
      { heading: "服务范围", body: "ApplyMate 是 30–100 人小范围求职辅助测试工具，提供简历解析、事实核对、岗位识别、开场白生成和投递记录。服务不会自动投递、联系招聘方或承诺回复和录用结果。" },
      { heading: "邮箱登录", body: "首次使用时通过 CloudBase 身份服务向邮箱发送一次性验证码。登录成功后，同一浏览器会在会话有效期内自动恢复；更换设备或清除浏览器数据后，可再次通过邮箱验证码登录同一账号。ApplyMate 业务数据库不保存邮箱明文或密码。" },
      { heading: "内容与责任", body: "用户应只上传本人有权处理的资料，并在发送前核对简历事实和 AI 生成正文。不得使用服务生成欺诈、歧视、骚扰、侵权或违法内容。" },
      { heading: "测试限制", body: "每个用户最多保存 3 份简历，北京时间每日最多成功处理 20 份新 JD；失败和自动重试不扣次数，改写不占新 JD 次数但受独立频率限制。免费资源不足或安全门未通过时，相关能力会暂停。" },
      { heading: "停止与删除", body: "用户可发起账号删除。二次确认后账号立即停用，并计划在 24 小时内删除全部可关联数据，仅保留无法重新识别个人的匿名聚合指标；删除不可撤销。" },
    ],
  },
  {
    title: "隐私政策",
    version: "privacy-2026-08-23",
    sections: [
      { heading: "处理的信息", body: "CloudBase 身份服务会处理用户主动填写的邮箱地址并发送登录验证码。ApplyMate 业务数据库只处理可信 UID 的不可逆衍生标识、协议状态、用户主动提交的简历与求职偏好、JD 截图或文字、生成结果、记录、反馈以及必要的任务状态、错误码、耗时、成本和内容哈希，不保存邮箱明文、手机号、姓名或密码。" },
      { heading: "处理目的与隔离", body: "信息仅用于提供本服务、恢复任务、管理额度、安全审计和响应删除请求。服务端从可信认证上下文识别用户，忽略客户端提交的 UID、userId 或 OpenID；数据库只允许通过 api 访问，所有业务查询同时匹配当前内部 userId。" },
      { heading: "文件与 AI 链路", body: "简历原件只进入 CloudBase 和腾讯 OCR。OCR 文本中的手机号、邮箱、证件号和详细地址会在发送文本模型前遮盖。JD 截图可在用户知情后发送给经评测的多模态提供方。密钥只保存在云函数环境变量中。" },
      { heading: "保存期限", body: "未完成草稿最多保存 24 小时；简历确认后删除原文件；JD 临时文件在处理完成后删除，异常残留由清理任务处理。投递记录保留至用户主动删除记录或账号。旧小程序数据只读保留，不迁移到 Web，也不会在未经授权时删除。" },
      { heading: "本地与 PWA", body: "浏览器只保存 CloudBase 邮箱登录会话及网站运行所需的非业务状态。PWA Service Worker 只缓存公开网站外壳，不缓存邮箱、简历、JD、生成正文、接口响应或其他用户内容。服务不接入第三方广告或行为追踪。" },
      { heading: "用户权利", body: `用户可核对、修改或删除简历事实和记录，更新求职偏好并删除账号。如需查询、解释或投诉，请联系 ${WEB_CONTACT_EMAIL}。` },
    ],
  },
  {
    title: "AI 服务说明",
    version: "ai-web-2026-08-23",
    sections: [
      { heading: "能力边界", body: "AI 用于整理 OCR 文本、提取岗位重点，并依据已确认事实生成或改写简体中文开场白。公司和岗位名仅作为可编辑记录元数据；正文统一使用“贵司该岗位”，字段缺失不会阻止生成。" },
      { heading: "真实性规则", body: "系统区分直接证据、可迁移能力和兴趣，不把相邻能力改写成直接经验，不弱化完整项目，不跨 JD 串台，也不虚构经历、数字、技能或资质。模型格式不完整时会尝试提取有效正文；只有正文为空、含未遮盖隐私或服务不可用时才阻断。" },
      { heading: "内容标识", body: "结果页会显示“AI生成内容，请核对真实性”，复制时另起一行附加相同标识。用户仍须在发送给招聘方前核对内容。" },
      { heading: "供应商与费用", body: "真实供应商、模型 ID、Prompt 版本和备案或登记信息必须按实际调用保存。免费额度、后付费关闭状态或实际账单无法确认时，AI 入口保持暂停，不以候选模型信息冒充真实配置。" },
    ],
  },
];

export function renderWebLegalText(): string {
  return WEB_LEGAL_DOCUMENTS.map((document) => [
    document.title,
    `版本：${document.version}`,
    `生效日期：${WEB_EFFECTIVE_DATE}`,
    ...document.sections.flatMap((section) => [section.heading, section.body]),
  ].join("\n\n")).join("\n\n---\n\n");
}
