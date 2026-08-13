export const CONTACT_EMAIL = "applymate67@gmail.com";
export const EFFECTIVE_DATE = "2026-08-09";
export const USER_AGREEMENT_VERSION = "user-2026-08-09";
export const PRIVACY_POLICY_VERSION = "privacy-2026-08-09";
export const AI_SERVICE_VERSION = "ai-2026-08-09";
export const AI_COPY_LABEL = "AI生成内容，请核对真实性";

export type LegalDocumentId = "user-agreement" | "privacy-policy" | "ai-service";

export interface LegalSection {
  heading: string;
  paragraphs: readonly string[];
}

export interface LegalDocument {
  id: LegalDocumentId;
  title: string;
  version: string;
  effectiveDate: string;
  reviewStatus: string;
  summary: string;
  sections: readonly LegalSection[];
}

const REVIEW_STATUS = "邀请制内测草案，未经专业法律审查";

export const USER_AGREEMENT: LegalDocument = {
  id: "user-agreement",
  title: "投了吗 ApplyMate 用户协议",
  version: USER_AGREEMENT_VERSION,
  effectiveDate: EFFECTIVE_DATE,
  reviewStatus: REVIEW_STATUS,
  summary: "本协议适用于投了吗 ApplyMate 的 30 至 100 人邀请制体验版。请在使用前完整阅读。",
  sections: [
    {
      heading: "一、服务与适用范围",
      paragraphs: [
        "投了吗 ApplyMate 是个人开发者提供的求职辅助工具。体验版帮助用户保存已确认的简历事实、识别岗位信息，并生成个性化求职开场白。产品不会代替用户投递简历、联系招聘方、作出录用承诺或提供职业保证。",
        "本版本仅面向开发者和受邀体验成员，不公开发布。体验版使用真实 CloudBase、腾讯 OCR 和 TokenHub 处理用户主动提交的简历与岗位资料；付费兜底关闭，任一免费额度不足或模型信息不完整时对应入口暂停。只有显式开启本地 demo 参数时才使用合成演示数据。",
      ],
    },
    {
      heading: "二、账号、邀请与协议同意",
      paragraphs: [
        "普通用户通过受邀微信身份和有效邀请码进入。管理员身份由服务端白名单识别。用户应妥善保管邀请码，不得批量尝试、转售或协助他人绕过访问限制。",
        "用户勾选并提交即表示同意当前版本的用户协议和隐私政策。协议发生实质变化时，产品会要求用户重新阅读并同意；不同意新版本的用户可以停止使用并申请删除账号。",
      ],
    },
    {
      heading: "三、用户内容与真实性责任",
      paragraphs: [
        "用户应只上传本人有权处理的简历、岗位描述和补充信息，不得上传他人的身份证件、联系方式、商业秘密、违法内容或与求职无关的敏感材料。",
        "用户应在确认简历事实和复制开场白前核对学校、公司、经历、技能、日期、数字及求职偏好。系统会尽力限制无来源事实，但 OCR 或生成模型仍可能识别错误、遗漏或表达不准确，最终发送责任由用户承担。",
      ],
    },
    {
      heading: "四、AI 生成内容",
      paragraphs: [
        `AI 生成正文会在结果页附近显示“${AI_COPY_LABEL}”，复制时也会另起一行附加相同标识。用户不得故意删除标识后将内容冒充为人工保证，也不得利用服务生成欺诈、歧视、骚扰或其他违法内容。`,
        "模型提供方、Model ID、Prompt 版本和备案或登记信息会在真实能力启用后据实展示。信息未配置完整时，真实生成入口应暂停，不以演示信息冒充真实模型信息。",
      ],
    },
    {
      heading: "五、服务限制与暂停",
      paragraphs: [
        "体验版实行邀请码、每日额度、三份已确认简历上限和最多五张岗位截图限制。免费额度、服务安全或平台能力不足时，相关入口可以暂停，失败任务不会重复扣除生成次数。",
        "用户违反协议、攻击系统、伪造身份、越权读取数据或批量试探邀请码时，产品可以限制或停用账号。停用不影响用户申请删除个人数据。",
      ],
    },
    {
      heading: "六、知识产权与反馈",
      paragraphs: [
        "用户保留其合法上传内容的权利，并仅授权产品为提供本服务而进行必要处理。用户可自行使用经其核对的生成文本，但应遵守招聘平台规则、第三方权利和适用法律。",
        "用户提交的满意度和改进意见可用于优化产品；产品不会将反馈中的个人内容公开展示。",
      ],
    },
    {
      heading: "七、免责声明与责任边界",
      paragraphs: [
        "体验版按现状提供，不保证招聘方回复率、面试机会、录用结果或服务持续可用。因用户提供错误信息、未核对生成内容、违反招聘平台规则或第三方服务故障造成的损失，应由责任方依法承担。",
        "本条不排除依法不能限制或免除的责任，也不影响用户依法享有的个人信息权益。",
      ],
    },
    {
      heading: "八、停止使用、删除与联系",
      paragraphs: [
        "用户可在“我的”页面发起删除账号。二次确认后账号立即停用，全部可关联数据计划在 24 小时内删除，只保留无法重新识别个人的匿名聚合指标。删除不可撤销。",
        `如对协议、账号或数据处理有疑问，请联系 ${CONTACT_EMAIL}。本草案用于邀请制内测确认，公开发布前仍需结合最终主体、类目和实际服务进行专业复核。`,
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  id: "privacy-policy",
  title: "投了吗 ApplyMate 隐私政策",
  version: PRIVACY_POLICY_VERSION,
  effectiveDate: EFFECTIVE_DATE,
  reviewStatus: REVIEW_STATUS,
  summary: "本政策说明邀请制体验版如何处理简历、岗位、微信身份和使用记录。",
  sections: [
    {
      heading: "一、处理原则与当前状态",
      paragraphs: [
        "产品遵循目的明确、最小必要、用户可控和到期删除原则。开发者和受邀体验成员提交的资料会进入已公示的真实 CloudBase、腾讯 OCR 和 TokenHub 处理链路；本地 demo 仅处理合成数据。",
        "真实能力严格使用免费额度且不启用付费兜底。某项资源、模型信息或安全门禁未通过时，对应入口保持关闭，并向用户显示可理解的失败信息。",
      ],
    },
    {
      heading: "二、我们处理的信息",
      paragraphs: [
        "账号与协议信息包括从微信小程序服务端上下文取得的身份标识衍生值、账号状态、管理员标记、邀请码激活状态、协议版本和同意时间。客户端自行提交的 OpenID 不会被信任。",
        "求职信息包括用户上传或粘贴的简历文件与文本、教育和经历等结构化事实、求职偏好、岗位截图或文字、生成正文、证据引用、投递状态、备忘和反馈。",
        "运行信息只记录完成服务所需的任务状态、错误码、模型名称与版本、耗时、Token、成本、Prompt 版本和内容哈希；日志不应保存原始简历、岗位截图或完整生成正文。",
      ],
    },
    {
      heading: "三、处理目的",
      paragraphs: [
        "上述信息用于验证受邀身份、解析和确认简历、识别岗位要求、生成和改写开场白、展示证据、恢复异步任务、管理每日额度、保存投递记录、处理反馈、保障安全以及响应删除请求。",
        "我们不会将简历或岗位信息用于广告画像，不出售个人信息，也不会在未经另行说明和同意的情况下扩大处理目的。",
      ],
    },
    {
      heading: "四、服务提供方与外发链路",
      paragraphs: [
        "拟启用的 CloudBase 用于微信身份上下文、云函数、临时存储和数据库。腾讯 OCR 用于把简历图片、扫描页和岗位截图转换为文本。TokenHub 用于解析脱敏后的文本并生成开场白。",
        "原始图片只发送给腾讯 OCR。发送到 TokenHub 前会遮盖手机号、邮箱、证件号和详细地址，TokenHub 只接收完成任务所需的脱敏文本。真实模型名称、Model ID 和备案或登记信息未核实前，生成入口保持关闭。",
      ],
    },
    {
      heading: "五、保存期限",
      paragraphs: [
        "已确认简历的原文件在结构化信息保存后立即删除；岗位截图处理完成后删除，异常残留最迟在 1 小时内清理；未完成的上传草稿最多保存 24 小时。",
        "幂等请求的终态记录最多保存 24 小时；只含元数据的 AI 调用日志和审计日志最多保存 180 天。投递记录会保存当时引用的脱敏事实和岗位快照，直至用户删除该记录或账号。",
        "用户确认删除账号后，账号立即停用，并在 24 小时内删除全部可关联数据，只保留无法重新识别个人的匿名聚合指标。",
      ],
    },
    {
      heading: "六、安全保护",
      paragraphs: [
        "服务端从可信上下文识别用户并执行数据隔离、权限校验、请求幂等、额度预留、邀请尝试限制和审计。存储路径按用户隔离，日志不记录受保护原文。",
        "互联网服务不存在绝对安全。发现泄露、越权或异常外发时，产品会暂停相关能力、保留必要审计证据并采取补救措施。",
      ],
    },
    {
      heading: "七、用户权利",
      paragraphs: [
        "用户可查看和修改已解析的简历事实、求职偏好、生成记录和反馈，可删除简历或投递记录，也可撤回后续使用并删除账号。删除简历不会删除用户选择保留的既有投递历史快照。",
        `如需查询、更正、删除、解释处理规则或投诉，请通过 ${CONTACT_EMAIL} 联系。我们会在核实请求人与账号关系后处理。`,
      ],
    },
    {
      heading: "八、未成年人、变更与专业复核",
      paragraphs: [
        "本体验版面向能够独立理解和同意本政策的求职者。未成年人应在监护人指导下使用，不应上传身份证件或其他非必要敏感信息。",
        "实质变更会提升版本号并要求重新同意。本草案未经专业法律审查；公开发布前将根据最终个人主体类目、真实供应商条款和监管要求进行专业复核。",
      ],
    },
  ],
};

export const AI_SERVICE_DISCLOSURE: LegalDocument = {
  id: "ai-service",
  title: "投了吗 ApplyMate AI 服务说明",
  version: AI_SERVICE_VERSION,
  effectiveDate: EFFECTIVE_DATE,
  reviewStatus: REVIEW_STATUS,
  summary: "本说明解释 AI 在简历解析和开场白生成中的作用、限制与标识方式。",
  sections: [
    {
      heading: "一、AI 能力范围",
      paragraphs: [
        "AI 用于把 OCR 文本整理为可核对的简历事实、提取岗位要求、依据已确认事实生成或改写简体中文开场白，并逐项返回证据、遗漏和提醒。AI 不会自动投递、代替用户与招聘方沟通或判断是否录用。",
        "新简历只在上传解析后进行一次事实核对；确认后，每次提交岗位会自动重新匹配，不重复要求用户确认个人资料，也不增加岗位确认步骤。",
      ],
    },
    {
      heading: "二、体验版真实模式与演示模式",
      paragraphs: [
        "开发者和受邀体验成员默认使用真实 CloudBase、腾讯 OCR 和 TokenHub。只有显式打开本地 demo 参数时，页面才显示“本地演示数据，未调用真实 OCR 或模型”；演示结果仅用于界面测试。",
        "真实模式展示实际模型名称、提供方、Model ID、Prompt 版本及备案或登记信息。任何一项缺失、免费额度不足或付费兜底无法关闭时，真实生成入口暂停。",
      ],
    },
    {
      heading: "三、数据边界",
      paragraphs: [
        "简历图片、扫描页和岗位截图只发送给腾讯 OCR。OCR 返回文本后，系统先遮盖手机号、邮箱、证件号和详细地址，再把完成任务所需的脱敏文本发送到 TokenHub。",
        "AI 调用日志只保存模型、耗时、Token、成本、Prompt 版本、结果状态和内容哈希，不保存原始简历、岗位截图或完整正文。",
      ],
    },
    {
      heading: "四、事实校验与失败处理",
      paragraphs: [
        "每项可验证陈述应关联到已确认的简历 factId 或岗位字段。数字、日期、公司、学校、经历、技能和偏好无法回溯时，不应作为合格结果保存。",
        "首次质量校验失败时只允许基于已提取的脱敏文本纠错一次，不再次上传图片。第二次仍失败时释放额度，向用户显示可理解的错误，不保存无效结果。",
      ],
    },
    {
      heading: "五、内容标识与用户核对",
      paragraphs: [
        `结果页会显著展示“${AI_COPY_LABEL}”，复制正文时另起一行附加相同标识。该标识不计入正文建议长度。未来如增加文件导出，需要另行实现文件中的隐式标识。`,
        "用户应核对识别结果、事实来源和最终措辞。手动编辑加入无证据事实或超出建议长度时，产品会警告但不阻止保存和复制，最终发送决定由用户作出。",
      ],
    },
    {
      heading: "六、模型信息与联系",
      paragraphs: [
        "体验版使用腾讯云文字识别 GeneralBasicOCR 与 TokenHub Hy3；结果页按每次实际调用保存并展示提供方、Model ID、Prompt 版本和已配置的备案或登记引用。信息不可用时不以候选名称冒充，真实入口会暂停。",
        `如需了解模型、标识、事实校验或数据外发方式，请联系 ${CONTACT_EMAIL}。本说明用于邀请制内测确认，公开发布前仍需专业复核。`,
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  USER_AGREEMENT,
  PRIVACY_POLICY,
  AI_SERVICE_DISCLOSURE,
];

export function getLegalDocument(documentId: LegalDocumentId): LegalDocument {
  return LEGAL_DOCUMENTS.find(({ id }) => id === documentId) ?? USER_AGREEMENT;
}

export function isLegalDocumentId(value: string): value is LegalDocumentId {
  return LEGAL_DOCUMENTS.some(({ id }) => id === value);
}

export function renderLegalDocumentPlainText(document: LegalDocument): string {
  const sections = document.sections.flatMap(({ heading, paragraphs }) => [
    heading,
    ...paragraphs,
  ]);
  return [
    document.title,
    `版本：${document.version}`,
    `生效日期：${document.effectiveDate}`,
    `审核状态：${document.reviewStatus}`,
    document.summary,
    ...sections,
    `联系邮箱：${CONTACT_EMAIL}`,
  ].join("\n\n");
}
