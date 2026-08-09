const screens = [
  ["login", "登录与准入"],
  ["home", "首页"],
  ["resumes", "简历列表"],
  ["resume-upload", "上传简历"],
  ["resume-edit", "核对个人资料"],
  ["preferences", "求职偏好"],
  ["generation", "提交岗位"],
  ["job", "任务进度"],
  ["result", "生成结果"],
  ["records", "投递记录"],
  ["application-detail", "记录详情"],
  ["mine", "我的"],
  ["admin", "管理员"],
];

const state = {
  screen: "login",
  loginMode: "first",
  inputMode: "image",
  resumeMode: "file",
  recordFilter: "all",
  jdImages: 3,
};

const icon = (name) => {
  const paths = {
    home: '<path d="M3 10.5 10 4l7 6.5v6.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 17.3z"/><path d="M7.5 19v-5.5h5V19"/>',
    records: '<path d="M5 3.5h10a2 2 0 0 1 2 2v13l-3-2-4 2-4-2-3 2v-13a2 2 0 0 1 2-2Z"/><path d="M6.5 8h7M6.5 11.5h7"/>',
    mine: '<circle cx="10" cy="7" r="3.2"/><path d="M4.5 18c.7-3.2 2.5-4.8 5.5-4.8s4.8 1.6 5.5 4.8"/>',
  };
  return `<svg class="tab-icon" viewBox="0 0 20 20" aria-hidden="true">${paths[name]}</svg>`;
};

const tabs = (active) => `
  <nav class="bottom-tabs" aria-label="主导航">
    <button class="tab-button" data-nav="home" ${active === "home" ? 'aria-current="page"' : ""}>${icon("home")}<span>首页</span></button>
    <button class="tab-button" data-nav="records" ${active === "records" ? 'aria-current="page"' : ""}>${icon("records")}<span>记录</span></button>
    <button class="tab-button" data-nav="mine" ${active === "mine" ? 'aria-current="page"' : ""}>${icon("mine")}<span>我的</span></button>
  </nav>`;

const header = (title, subtitle = "", options = {}) => `
  <header class="app-header ${options.divided ? "is-divided" : ""}">
    <div>
      <h1 class="app-title">${title}</h1>
      ${subtitle ? `<p class="app-subtitle">${subtitle}</p>` : ""}
    </div>
    ${options.action ? `<button class="header-link" data-nav="${options.action.nav}">${options.action.label}</button>` : ""}
  </header>`;

const screen = (content, options = {}) => `
  <section class="app-screen ${options.className || ""}" data-preview-screen="${state.screen}">
    ${options.header || ""}
    ${content}
    ${options.tabs || ""}
  </section>`;

function loginForm() {
  const admin = state.loginMode === "admin";
  const stale = state.loginMode === "stale";
  return `
    <div class="screen-scroll">
      <div class="login-intro">
        <span class="brand-mark" aria-hidden="true"></span>
        <h1>${stale ? "协议有更新，请重新确认" : "把真实经历，写进每一次开场"}</h1>
        <p class="lead">${stale ? "确认最新协议后即可继续使用，原有简历和记录不受影响。" : "确认一次简历，之后提交岗位截图或文字，生成有事实依据的专属开场白。"}</p>
      </div>
      <form id="login-form" class="login-form" novalidate>
        ${
          admin || stale
            ? `<div class="quiet-panel"><strong>${admin ? "管理员身份已识别" : "当前账号已激活"}</strong><p class="field-help">${admin ? "管理员无需邀请码，仍需同意当前版本协议。" : "本次只需重新同意协议，不会再次验证邀请码。"}</p></div>`
            : `<div class="field-group"><label class="field-label" for="invite-code">邀请码</label><input id="invite-code" class="input" autocomplete="off" placeholder="输入 8–16 位邀请码" value="${state.loginMode === "error" ? "WRONGCODE" : ""}"/><p id="invite-error" class="field-error">${state.loginMode === "error" ? "邀请码无效或已使用，请检查后重试。" : ""}</p></div>`
        }
        <label class="checkbox-row"><input id="agreement" type="checkbox" ${state.loginMode === "error" ? "checked" : ""}/><span>我已阅读并同意《用户协议》和《隐私政策》，理解简历与岗位信息的处理方式。</span></label>
        <button class="button button-primary" type="submit">${stale ? "同意并继续" : "验证并登录"}</button>
        <p class="field-help">提交期间不会重复处理。弱网或邀请码错误时，页面会保留已填写内容。</p>
      </form>
      ${loginStateSwitch()}
    </div>`;
}

function loginStateSwitch() {
  return `<div class="login-state-switch" aria-label="视觉稿状态切换">
    ${[
      ["first", "首次用户"],
      ["error", "错误邀请码"],
      ["admin", "管理员"],
      ["stale", "协议更新"],
      ["returning", "老用户直达"],
      ["success", "成功"],
      ["disabled", "禁用"],
    ]
      .map(([value, label]) => `<button class="state-chip" type="button" data-login-mode="${value}" aria-pressed="${state.loginMode === value}">${label}</button>`)
      .join("")}
  </div>`;
}

function renderLogin() {
  if (state.loginMode === "success") {
    return screen(
      `<div class="screen-scroll"><div class="center-state"><div class="success-mark" aria-hidden="true">✓</div><h1>验证成功</h1><p class="lead">账号已激活。先确认一份简历，就可以开始为岗位生成专属开场白。</p><button class="button button-primary" data-nav="home">开始使用</button></div>${loginStateSwitch()}</div>`,
      { className: "login-screen" },
    );
  }
  if (state.loginMode === "disabled") {
    return screen(
      `<div class="screen-scroll"><div class="center-state"><div class="restricted-mark" aria-hidden="true">!</div><h1>账号暂不可用</h1><p class="lead">该账号已被停用，当前无法继续生成。你仍可申请删除全部个人数据。</p><div class="callout callout-danger">删除账号后不可撤销，全部可关联数据将在 24 小时内删除。</div><button class="button button-danger" data-action="delete-account">删除账号</button></div>${loginStateSwitch()}</div>`,
      { className: "login-screen" },
    );
  }
  return screen(loginForm(), { className: "login-screen" });
}

function renderHome() {
  return screen(
    `<div class="screen-scroll home-scroll">
       <span class="home-glow home-glow-one" aria-hidden="true"></span><span class="home-glow home-glow-two" aria-hidden="true"></span>
       <section class="home-hero glass-panel">
         ${header("你好，同学", "准备好后，直接提交一个岗位。", { action: { nav: "resumes", label: "管理简历" } })}
         <div class="home-metrics">
           <div class="home-metric"><span>当前简历</span><strong>产品运营简历</strong></div>
           <div class="home-metric"><span>今日剩余</span><strong>3 / 5</strong></div>
         </div>
       </section>
       <section class="home-launch">
         <button class="primary-launch" data-nav="generation">
           <strong>提交岗位信息</strong>
           <span>添加最多 5 张截图，或直接粘贴岗位文字。</span>
           <span class="launch-arrow" aria-hidden="true">→</span>
         </button>
       </section>
       <section class="home-journey">
         <h2>每次投递，都有据可查</h2>
         <div class="journey-grid">
           <div class="journey-item"><span class="journey-index">01</span><strong>简历事实</strong><span>使用已确认的经历</span></div>
           <div class="journey-item"><span class="journey-index">02</span><strong>岗位要求</strong><span>识别职责与技能</span></div>
           <div class="journey-item"><span class="journey-index">03</span><strong>专属开场</strong><span>逐项核对匹配依据</span></div>
         </div>
       </section>
     </div>`,
    { tabs: tabs("home") },
  );
}

function renderResumes() {
  return screen(
    `${header("我的简历", "最多保存 3 份，只有已确认事实会参与生成。")}
     <div class="screen-scroll">
       <section class="resume-card-list">
         <article class="resume-card glass-panel"><div class="resume-card-copy"><div class="resume-title-row"><strong>产品运营简历</strong><span class="badge">默认</span></div><span>已确认 · 12 项事实</span></div><button class="resume-menu" data-action="resume-menu" aria-label="产品运营简历更多操作">···</button></article>
         <article class="resume-card glass-panel"><div class="resume-card-copy"><div class="resume-title-row"><strong>数据分析实习简历</strong></div><span>已确认 · 15 项事实</span></div><button class="resume-menu" data-action="resume-menu" aria-label="数据分析实习简历更多操作">···</button></article>
         <article class="resume-card glass-panel"><div class="resume-card-copy"><div class="resume-title-row"><strong>内容策划简历</strong></div><span>等待确认 · 8 项事实</span></div><button class="resume-menu" data-action="resume-menu" aria-label="内容策划简历更多操作">···</button></article>
       </section>
       <section class="resume-note"><strong>一次核对，持续复用</strong><p class="field-help">只有你确认过的事实会参与生成，之后提交岗位无需重复核对。</p></section>
       <section class="section">
         <div>
           <button class="button button-primary" data-nav="resume-upload" disabled>添加一份简历</button>
         </div>
       </section>
     </div>`,
  );
}

function renderResumeUpload() {
  const isText = state.resumeMode === "text";
  return screen(
    `${header("添加简历", "选择一种方式，解析后仍需你确认。", { divided: true })}
     <div class="screen-scroll">
       <div class="segmented"><button data-resume-mode="file" aria-pressed="${!isText}">上传文件</button><button data-resume-mode="text" aria-pressed="${isText}">粘贴文字</button></div>
       <section class="section">
         ${
           isText
             ? `<div class="field-group"><label class="field-label" for="resume-text">简历文字</label><textarea id="resume-text" class="textarea" placeholder="粘贴教育、实习、项目和技能等内容"></textarea><p class="field-help">最多 20,000 个可见字符。</p></div>`
             : `<button class="upload-zone" data-action="fake-upload"><span class="upload-symbol" aria-hidden="true">＋</span><strong>选择 PDF、DOCX 或图片</strong><span class="field-help">单文件不超过 10MB；图片最多 6 张</span></button>`
         }
       </section>
       <section class="section"><div class="callout">扫描型 PDF 无法提取文字时，会提示你改传页面截图，不会返回空结果。</div></section>
     </div>
     <div class="fixed-action"><button class="button button-primary" data-nav="job">开始解析</button></div>`,
  );
}

function renderResumeEdit() {
  return screen(
    `${header("核对个人资料", "AI 已提取 12 项事实，其中 1 项需要核对。", { divided: true })}
     <div class="screen-scroll">
       <section class="section">
         <div class="review-guidance"><strong>AI 负责排序，你只需纠正事实</strong><p>确认一次后，后续提交岗位时，AI 会按 JD 自动重新排序，无需再次确认简历。</p></div>
       </section>
       <section class="section">
         <div class="section-heading"><h2>本次最有价值的 3 项</h2><span>AI 初步判断</span></div>
         <div class="strength-list">
           <div class="strength-row"><span class="strength-rank">1</span><span class="strength-copy"><strong>项目成果</strong><span>独立规划 12 期内容，平均互动率提升 18%</span></span><strong class="strength-score">25%</strong></div>
           <div class="strength-row"><span class="strength-rank">2</span><span class="strength-copy"><strong>专业技能</strong><span>Excel、Figma、内容策划与数据分析</span></span><strong class="strength-score">20%</strong></div>
           <div class="strength-row"><span class="strength-rank">3</span><span class="strength-copy"><strong>能力证据</strong><span>完成 20 人访谈并整理需求优先级</span></span><strong class="strength-score">15%</strong></div>
         </div>
         <p class="field-help weight-note">权重用于初始排序，不代表录用概率；具体岗位会按 JD 重新计算。</p>
       </section>
       <section class="section">
         <div class="section-heading"><h2>市场基准权重</h2><span>具体岗位会重排</span></div>
         <div class="weight-list">
           <div class="weight-row"><span><strong>相关实习 / 工作经历</strong><small>暂未识别</small></span><strong>25%</strong></div>
           <div class="weight-row"><span><strong>相关项目与量化成果</strong><small>已识别 2 项</small></span><strong>25%</strong></div>
           <div class="weight-row"><span><strong>专业技能与工具</strong><small>已识别 4 项</small></span><strong>20%</strong></div>
           <div class="weight-row"><span><strong>有经历支撑的个人能力</strong><small>已识别 2 项证据</small></span><strong>15%</strong></div>
           <div class="weight-row"><span><strong>教育背景与专业匹配</strong><small>已识别 1 项</small></span><strong>8%</strong></div>
           <div class="weight-row"><span><strong>证书、语言、奖项与领导经历</strong><small>暂未识别</small></span><strong>5%</strong></div>
           <div class="weight-row is-review"><span><strong>GPA / 均分</strong><small>金融、咨询、量化或 JD 明确要求时提高权重</small></span><strong>2%</strong></div>
         </div>
       </section>
       <section class="section">
         <div class="section-heading"><h2>需要你核对</h2><span class="badge badge-warning">1 项</span></div>
         <div class="review-list">
           <div class="review-row needs-review"><div class="review-copy"><span class="review-label">需核对 · 教育背景</span><strong>华南理工大学 · 市场营销</strong><p>本科 · 2023.09–2027.06</p></div><div class="review-actions"><button class="mini-action" data-action="mark-fact-correct">正确</button><button class="mini-action" data-action="edit-fact">修改</button></div></div>
         </div>
       </section>
       <section class="section">
         <div class="section-heading"><h2>其余已识别事实</h2><span>11 项</span></div>
         <div class="review-list">
           <div class="review-row"><div class="review-copy"><span class="review-label">项目成果</span><strong>校园内容运营项目</strong><p>独立规划 12 期内容，平均互动率提升 18%</p></div><div class="review-actions"><button class="mini-action" data-action="edit-fact">修改</button><button class="mini-action danger-text" data-action="delete-fact">删除</button></div></div>
           <div class="review-row"><div class="review-copy"><span class="review-label">项目成果 · 能力证据</span><strong>用户调研与数据复盘</strong><p>访谈 20 名同学并整理需求优先级</p></div><div class="review-actions"><button class="mini-action" data-action="edit-fact">修改</button><button class="mini-action danger-text" data-action="delete-fact">删除</button></div></div>
           <div class="review-row"><div class="review-copy"><span class="review-label">专业技能与工具</span><strong>Excel · Figma · 内容策划 · 数据分析</strong><p>个人能力只从这些真实经历中推断，不单独生成自我评价。</p></div><div class="review-actions"><button class="mini-action" data-action="edit-fact">修改</button><button class="mini-action danger-text" data-action="delete-fact">删除</button></div></div>
         </div>
       </section>
     </div>
     <div class="fixed-action"><button class="button button-primary" data-action="confirm-resume">确认事实并保存</button></div>`,
  );
}

function renderPreferences() {
  return screen(
    `${header("求职偏好", "这些内容也会成为可追溯事实。", { divided: true })}
     <div class="screen-scroll">
       <div class="field-group"><label class="field-label" for="preference-text">补充你的长期偏好</label><textarea id="preference-text" class="textarea">可尽快到岗，每周可实习 4 天。优先考虑远程或广州、深圳岗位。</textarea><p class="field-help">52 / 500 字 · 按句子或换行拆分</p></div>
       <section class="section"><div class="section-heading"><h2>将保存为 3 项事实</h2></div><div class="fact-line"><strong>到岗时间</strong><span>可尽快到岗</span></div><div class="fact-line"><strong>出勤安排</strong><span>每周可实习 4 天</span></div><div class="fact-line"><strong>地点偏好</strong><span>远程或广州、深圳</span></div></section>
     </div>
     <div class="fixed-action"><button class="button button-primary" data-action="save-preferences">保存偏好</button></div>`,
  );
}

function imageTiles() {
  return Array.from({ length: state.jdImages }, (_, index) => `
    <div class="image-tile" data-image-index="${index}">
      <span class="image-order">${index + 1}</span>
      <span class="image-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <span class="tile-actions"><button class="icon-button" data-action="move-image" data-index="${index}" aria-label="向前移动第 ${index + 1} 张">↥</button><button class="icon-button" data-action="remove-image" data-index="${index}" aria-label="删除第 ${index + 1} 张">×</button></span>
    </div>`).join("");
}

function renderGeneration() {
  const isImage = state.inputMode === "image";
  return screen(
    `${header("提交岗位", "截图和文字草稿会分别保留。", { divided: true })}
     <div class="screen-scroll">
       <div class="segmented"><button data-input-mode="image" aria-pressed="${isImage}">添加截图</button><button data-input-mode="text" aria-pressed="${!isImage}">粘贴文字</button></div>
       <section class="section">
         ${
           isImage
             ? `<div class="section-heading"><h2>岗位截图</h2><span>${state.jdImages} / 5</span></div><div class="image-grid">${imageTiles()}${state.jdImages < 5 ? `<button class="upload-zone" data-action="add-image"><span class="upload-symbol">＋</span><strong>继续添加</strong></button>` : ""}</div><p class="field-help">可一次选择多张；长按拖动用于真机排序，视觉稿也提供可见排序按钮。</p>`
             : `<div class="field-group"><label class="field-label" for="jd-text">岗位信息</label><textarea id="jd-text" class="textarea" placeholder="粘贴完整岗位职责、要求、地点和工作方式">负责内容选题与数据复盘，协助用户调研；熟悉 Excel，可每周到岗 4 天。</textarea><p class="field-help">87 / 20,000 字</p></div>`
         }
       </section>
       <section class="section"><div class="field-group"><label class="field-label" for="resume-choice">本次使用简历</label><button id="resume-choice" class="list-row"><span class="list-row-main"><strong>产品运营简历</strong><span>默认 · 12 项已确认事实</span></span><span class="chevron">›</span></button></div></section>
     </div>
     <div class="fixed-action"><button class="button button-primary" data-nav="job">识别并生成</button></div>`,
  );
}

function renderJob() {
  return screen(
    `${header("正在生成开场白", "岗位识别后会直接生成，无需再次确认。", { divided: true })}
     <div class="screen-scroll">
       <section class="section"><div class="surface surface-pad"><div class="section-heading"><h2>正在生成开场白</h2><span>约 6 秒</span></div><div class="progress-track"><i></i></div><p class="field-help" style="margin-top:10px">已完成岗位识别，正在匹配你的简历事实。</p></div></section>
       <section class="section"><div class="step-list"><div class="step is-done"><span class="step-dot">✓</span><span>读取岗位截图</span></div><div class="step is-done"><span class="step-dot">✓</span><span>识别岗位职责与要求</span></div><div class="step is-current"><span class="step-dot">3</span><span>匹配简历事实并生成</span></div><div class="step"><span class="step-dot">4</span><span>检查事实来源与格式</span></div></div></section>
       <section class="section"><div class="callout">弱网时可稍后回到此页继续查询，不会重复扣除额度。</div></section>
     </div>
     <div class="fixed-action"><button class="button button-primary" data-nav="result">查看生成结果</button></div>`,
  );
}

function renderResult() {
  return screen(
    `${header("专属开场白", "内容已通过事实来源检查。", { divided: true })}
     <div class="screen-scroll">
       <div class="greeting-panel glass-panel">
         <div class="greeting-editor" contenteditable="true" role="textbox" aria-label="可编辑开场白">
           <p>您好，我对贵司的产品运营实习岗位很感兴趣。我在校园内容运营项目中独立规划过 12 期内容，并结合数据复盘持续调整选题，相关经历与岗位提到的内容策划、数据分析职责较为匹配。</p>
           <p>我也完成过 20 人用户访谈和需求优先级整理，熟悉 Excel 与 Figma。每周可实习 4 天并能尽快到岗，希望有机会进一步介绍我的项目方法和执行经验，谢谢。</p>
         </div>
         <div class="editor-meta"><span>286 个可见字符 · 2 段</span><span>已保存</span></div>
       </div>
       <section class="section"><button class="button button-primary" data-action="copy-greeting">复制开场白</button><div class="button-row" style="margin-top:10px"><button class="button button-secondary" data-action="save-greeting">保存修改</button><button class="button button-secondary" data-action="rewrite">AI 改写</button></div></section>
       <section class="section">
         <div class="disclosure"><button class="disclosure-button" data-action="toggle-disclosure" aria-expanded="false"><span>匹配依据、遗漏与提醒</span><span class="chevron">›</span></button><div class="disclosure-content"><div class="fact-line"><strong>“独立规划 12 期内容”</strong><span>简历事实：校园内容运营项目 → JD：内容策划</span></div><div class="fact-line"><strong>“完成过 20 人用户访谈”</strong><span>简历事实：用户调研项目 → JD：用户调研</span></div><div class="callout">公司名未识别，正文已使用“贵司”。请在复制前核对。</div></div></div>
         <div class="disclosure"><button class="disclosure-button" data-action="toggle-disclosure" aria-expanded="false"><span>投递状态、备忘与反馈</span><span class="chevron">›</span></button><div class="disclosure-content"><div class="field-group"><label class="field-label">投递备忘</label><textarea class="textarea" placeholder="例如：8 月 7 日已在 Boss 直聘发送"></textarea></div></div></div>
       </section>
       <section class="section result-exit glass-panel"><h2>准备投下一个岗位？</h2><p class="field-help">当前修改会先保存，再进入一份全新的岗位草稿。</p><div class="result-exit-actions"><button class="button button-primary" data-action="continue-next-job">继续投下一个岗位</button><button class="button button-secondary" data-action="return-home">返回首页</button></div></section>
     </div>`,
  );
}

function renderRecords() {
  const records = [
    ["产品运营实习生", "星禾科技", "已投递", "今天 14:32", "内容策划、数据复盘和用户调研经历与岗位职责较为匹配。"],
    ["用户增长实习生", "远帆网络", "未投递", "昨天 20:18", "校园项目中的访谈与需求整理可以支撑用户增长相关工作。"],
    ["新媒体运营实习生", "青屿文化", "已投递", "8 月 3 日", "独立完成内容选题与复盘，能够快速进入账号运营节奏。"],
  ];
  const filtered = records.filter((item) => state.recordFilter === "all" || item[2] === (state.recordFilter === "sent" ? "已投递" : "未投递"));
  return screen(
    `${header("投递记录", "最近投递统一在这里管理。")}
     <div class="screen-scroll">
       <div class="segmented" style="grid-template-columns:repeat(3,1fr)"><button data-record-filter="all" aria-pressed="${state.recordFilter === "all"}">全部</button><button data-record-filter="pending" aria-pressed="${state.recordFilter === "pending"}">未投递</button><button data-record-filter="sent" aria-pressed="${state.recordFilter === "sent"}">已投递</button></div>
       <section class="section">${filtered.map((item) => `<article class="record-row" tabindex="0" data-nav="application-detail"><div class="record-row-header"><div><h3>${item[0]}</h3><p class="caption">${item[1]}</p></div><span class="badge ${item[2] === "未投递" ? "badge-neutral" : ""}">${item[2]}</span></div><p>${item[4]}</p><div class="record-meta"><span>${item[3]}</span><span>查看详情 ›</span></div></article>`).join("")}</section>
     </div>`,
    { tabs: tabs("records") },
  );
}

function renderApplicationDetail() {
  return screen(
    `${header("记录详情", "产品运营实习生 · 星禾科技", { divided: true, action: { nav: "result", label: "编辑" } })}
     <div class="screen-scroll">
       <section class="section"><div class="section-heading"><h2>投递状态</h2><span class="badge">已投递</span></div><p class="meta">更新于今天 14:32</p></section>
       <section class="section"><div class="section-heading"><h2>开场白快照</h2></div><div class="quiet-panel"><p class="lead">您好，我对贵司的产品运营实习岗位很感兴趣。我在校园内容运营项目中独立规划过 12 期内容……</p></div></section>
       <section class="section"><div class="section-heading"><h2>当时的匹配来源</h2><span>3 项</span></div><div class="fact-line"><strong>内容策划</strong><span>校园内容运营项目</span></div><div class="fact-line"><strong>用户调研</strong><span>20 人访谈与需求整理</span></div><div class="fact-line"><strong>到岗安排</strong><span>每周 4 天，可尽快到岗</span></div></section>
       <section class="section"><div class="section-heading"><h2>备忘</h2><button class="text-button" data-action="edit-note">编辑</button></div><p class="lead">已在 Boss 直聘发送，等待回复。</p></section>
       <section class="section"><button class="button button-danger" data-action="delete-record">删除这条记录</button></section>
     </div>`,
  );
}

function renderMine() {
  return screen(
    `${header("我的", "管理个人资料、协议与账号。")}
     <div class="screen-scroll">
       <section class="section"><div class="section-heading"><h2>求职资料</h2></div><div class="list-group"><button class="list-row" data-nav="resumes"><span class="list-row-main"><strong>我的简历</strong><span>2 份 · 默认产品运营简历</span></span><span class="chevron">›</span></button><button class="list-row" data-nav="preferences"><span class="list-row-main"><strong>求职偏好</strong><span>3 项已确认偏好</span></span><span class="chevron">›</span></button></div></section>
       <section class="section"><div class="section-heading"><h2>使用情况</h2></div><div class="list-group"><div class="list-row"><span class="list-row-main"><strong>今日额度</strong><span>北京时间 00:00 重置</span></span><span class="badge">剩余 3 次</span></div><button class="list-row" data-nav="admin"><span class="list-row-main"><strong>管理员工具</strong><span>仅白名单账号可见</span></span><span class="chevron">›</span></button></div></section>
       <section class="section"><div class="section-heading"><h2>协议与隐私</h2></div><div class="list-group"><button class="list-row" data-action="show-policy"><span class="list-row-main"><strong>用户协议与隐私政策</strong><span>已同意 v1.0 · 2026-08-06</span></span><span class="chevron">›</span></button><button class="list-row" data-action="delete-account"><span class="list-row-main"><strong style="color:var(--danger)">删除账号</strong><span>删除全部可关联数据</span></span><span class="chevron">›</span></button></div></section>
     </div>`,
    { tabs: tabs("mine") },
  );
}

function renderAdmin() {
  return screen(
    `${header("管理员", "受保护的内测运营工具。", { divided: true })}
     <div class="screen-scroll">
       <section class="section"><div class="metric-strip"><div class="metric"><strong>36</strong><span>已激活用户</span></div><div class="metric"><strong>0 元</strong><span>今日实际费用</span></div></div></section>
       <section class="section"><div class="section-heading"><h2>邀请码</h2><button class="text-button" data-action="create-invite">创建</button></div><div class="list-group"><div class="list-row"><span class="list-row-main"><strong>APPLY-9K3F</strong><span>未使用 · 7 天后过期</span></span><button class="text-button" data-action="revoke-invite">撤销</button></div><div class="list-row"><span class="list-row-main"><strong>APPLY-2M8Q</strong><span>已激活 · 今天 12:08</span></span><span class="badge badge-neutral">已使用</span></div></div></section>
       <section class="section"><div class="section-heading"><h2>资源状态</h2><span>严格零付费</span></div><div class="list-group"><div class="list-row"><span class="list-row-main"><strong>腾讯 OCR</strong><span>未连接 · 入口保持暂停</span></span><span class="badge badge-warning">待授权</span></div><div class="list-row"><span class="list-row-main"><strong>TokenHub</strong><span>未连接 · 无模型调用</span></span><span class="badge badge-warning">待授权</span></div></div></section>
       <section class="section"><button class="button button-secondary" data-action="admin-users">管理用户与临时额度</button></section>
     </div>`,
  );
}

const renderers = {
  login: renderLogin,
  home: renderHome,
  resumes: renderResumes,
  "resume-upload": renderResumeUpload,
  "resume-edit": renderResumeEdit,
  preferences: renderPreferences,
  generation: renderGeneration,
  job: renderJob,
  result: renderResult,
  records: renderRecords,
  "application-detail": renderApplicationDetail,
  mine: renderMine,
  admin: renderAdmin,
};

const nav = document.querySelector("#screen-nav");
const phone = document.querySelector("#phone-content");
const title = document.querySelector("#stage-title");
const toast = document.querySelector("#toast");

function renderNavigation() {
  nav.innerHTML = screens
    .map(([id, label], index) => `<button class="screen-nav-button" type="button" data-screen="${id}" ${state.screen === id ? 'aria-current="page"' : ""}><span class="screen-index">${String(index + 1).padStart(2, "0")}</span><span>${label}</span></button>`)
    .join("");
}

function render() {
  const item = screens.find(([id]) => id === state.screen);
  title.textContent = item ? item[1] : "ApplyMate";
  phone.innerHTML = renderers[state.screen]();
  renderNavigation();
  bindInteractions();
  window.location.hash = state.screen;
}

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function navigate(target) {
  if (!renderers[target]) return;
  state.screen = target;
  render();
  phone.focus({ preventScroll: true });
}

function bindInteractions() {
  phone.querySelectorAll("[data-nav]").forEach((element) => {
    element.addEventListener("click", () => navigate(element.dataset.nav));
    if (element.matches("article")) {
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") navigate(element.dataset.nav);
      });
    }
  });

  phone.querySelectorAll("[data-login-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.loginMode === "returning") {
        navigate("home");
        return;
      }
      state.loginMode = button.dataset.loginMode;
      render();
    });
  });

  phone.querySelector("#login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const agreement = phone.querySelector("#agreement");
    const code = phone.querySelector("#invite-code");
    if (!agreement.checked) {
      showToast("请先阅读并同意协议");
      agreement.focus();
      return;
    }
    if (code && code.value.trim().toUpperCase() !== "APPLYMATE") {
      code.classList.add("is-error");
      phone.querySelector("#invite-error").textContent = "邀请码无效或已使用，请检查后重试。演示码为 APPLYMATE。";
      code.focus();
      return;
    }
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "正在验证…";
    await new Promise((resolve) => window.setTimeout(resolve, 480));
    state.loginMode = "success";
    render();
  });

  phone.querySelectorAll("[data-input-mode]").forEach((button) => button.addEventListener("click", () => {
    state.inputMode = button.dataset.inputMode;
    render();
  }));
  phone.querySelectorAll("[data-resume-mode]").forEach((button) => button.addEventListener("click", () => {
    state.resumeMode = button.dataset.resumeMode;
    render();
  }));
  phone.querySelectorAll("[data-record-filter]").forEach((button) => button.addEventListener("click", () => {
    state.recordFilter = button.dataset.recordFilter;
    render();
  }));

  phone.querySelectorAll('[data-action="toggle-disclosure"]').forEach((button) => button.addEventListener("click", () => {
    const disclosure = button.closest(".disclosure");
    const open = disclosure.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  }));

  phone.querySelectorAll('[data-action="add-image"]').forEach((button) => button.addEventListener("click", () => {
    state.jdImages = Math.min(5, state.jdImages + 1);
    render();
  }));
  phone.querySelectorAll('[data-action="remove-image"]').forEach((button) => button.addEventListener("click", () => {
    state.jdImages = Math.max(1, state.jdImages - 1);
    render();
  }));
  phone.querySelectorAll('[data-action="move-image"]').forEach((button) => button.addEventListener("click", () => showToast(`第 ${Number(button.dataset.index) + 1} 张已向前移动（视觉演示）`)));

  phone.querySelectorAll('[data-action="mark-fact-correct"]').forEach((button) => button.addEventListener("click", () => {
    button.closest(".review-row")?.classList.add("is-confirmed");
    button.textContent = "已核对";
    button.disabled = true;
    showToast("已标记为正确");
  }));

  phone.querySelectorAll('[data-action="continue-next-job"]').forEach((button) => button.addEventListener("click", () => {
    state.inputMode = "image";
    state.jdImages = 0;
    showToast("已保存当前修改，并创建全新岗位草稿");
    navigate("generation");
  }));
  phone.querySelectorAll('[data-action="return-home"]').forEach((button) => button.addEventListener("click", () => navigate("home")));

  phone.querySelectorAll("[data-action]").forEach((button) => {
    if (["toggle-disclosure", "add-image", "remove-image", "move-image", "mark-fact-correct", "continue-next-job", "return-home"].includes(button.dataset.action)) return;
    button.addEventListener("click", () => {
      const messages = {
        "copy-greeting": "已复制，并在末行附加 AI 生成标识",
        "save-greeting": "修改已保存",
        rewrite: "改写会消耗 1 次额度（视觉演示未调用模型）",
        "delete-account": "视觉稿：此处进入不可撤销的二次确认",
        "confirm-resume": "事实已确认；后续岗位会自动重新排序",
        "edit-fact": "视觉稿：打开这一项的编辑状态",
        "delete-fact": "视觉稿：删除前会再次确认",
        "save-preferences": "求职偏好已保存",
        "fake-upload": "视觉稿不读取真实文件",
        "resume-menu": "根据简历状态显示可用操作，并在删除前再次确认",
      };
      showToast(messages[button.dataset.action] || "操作已记录（视觉演示）");
    });
  });
}

nav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-screen]");
  if (button) navigate(button.dataset.screen);
});

document.querySelector("#previous-screen").addEventListener("click", () => {
  const index = screens.findIndex(([id]) => id === state.screen);
  navigate(screens[(index - 1 + screens.length) % screens.length][0]);
});

document.querySelector("#next-screen").addEventListener("click", () => {
  const index = screens.findIndex(([id]) => id === state.screen);
  navigate(screens[(index + 1) % screens.length][0]);
});

const initialHash = window.location.hash.slice(1);
if (renderers[initialHash]) state.screen = initialHash;
render();
