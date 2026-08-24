import { Link } from "react-router-dom";

import { DEVELOPER_GITHUB_URL, WEB_CONTACT_EMAIL } from "../../lib/public-contact";
import { PrimaryLink, Surface } from "../../ui/ui";
import styles from "../Feature.module.css";

export function LandingPage(): React.JSX.Element {
  return (
    <div className={`${styles.stack} ${styles.landing}`}>
      <header className={styles.publicHeader}>
        <Link className={styles.publicBrand} to="/">◔ ApplyMate</Link>
        <Link className={styles.rowAction} to="/login">登录</Link>
      </header>
      <section className={styles.heroCopy}>
        <p className={styles.eyebrowText}>移动端求职开场白助手</p>
        <h1>把真实经历，写进每一次开场。</h1>
        <p>确认一次简历，之后提交岗位截图或文字。ApplyMate 会依据你确认的事实，生成岗位专属开场白。</p>
        <div className={styles.heroButtons}>
          <PrimaryLink to="/login">用邮箱开始</PrimaryLink>
          <a className={styles.textButton} href="#how-it-works">看看怎么使用</a>
        </div>
      </section>
      <div id="how-it-works">
        <Surface>
          <p className={styles.eyebrowText}>三步完成</p>
          <div className={styles.publicSteps}>
            {[
              ["01", "核对简历", "只让你确认过的事实进入生成。"],
              ["02", "提交岗位", "最多 5 张截图，或直接粘贴文字。"],
              ["03", "复制开场", "编辑、保存并带 AI 标识复制。"],
            ].map(([index, title, detail]) => (
              <div className={styles.publicStep} key={index}>
                <span>{index}</span><div><strong>{title}</strong><p>{detail}</p></div>
              </div>
            ))}
          </div>
        </Surface>
      </div>
      <section className={styles.publicGrid}>
        <Surface>
          <p className={styles.eyebrowText}>产品介绍</p>
          <h2 className={styles.sectionTitle}>每个岗位，都值得一段有针对性的开场</h2>
          <p className={styles.intro}>在招聘平台准备主动沟通时，上传完整的岗位截图，ApplyMate 会结合你确认过的简历经历，提炼与岗位最相关的亮点，生成一段可以编辑、复制的求职开场白。帮助你减少重复改写，更清晰地展示岗位匹配度，提升获得 HR 回复和索要简历的机会。</p>
        </Surface>
        <Surface>
          <p className={styles.eyebrowText}>适用人群</p>
          <h2 className={styles.sectionTitle}>实习、校招与初级岗位</h2>
          <p className={styles.intro}>它不替你自动投递，也不编造经历。你仍需在发送前核对正文真实性。</p>
        </Surface>
      </section>
      <Surface>
        <p className={styles.eyebrowText}>找到开发者</p>
        <h2 className={styles.sectionTitle}>反馈问题，也欢迎一起完善 ApplyMate</h2>
        <p className={styles.intro}>ApplyMate 仍在持续完善。如果你遇到使用问题，或者对生成效果和产品功能有建议，欢迎联系开发者。</p>
        <div className={styles.contactLinks}>
          <a className={styles.textButton} href={`mailto:${WEB_CONTACT_EMAIL}`}>邮件联系</a>
          <a
            className={styles.textButton}
            href={DEVELOPER_GITHUB_URL}
            rel="noreferrer"
            target="_blank"
          >
            GitHub 主页
          </a>
        </div>
      </Surface>
      <footer className={styles.publicFooter}>
        <Link to="/legal">协议与隐私</Link><Link to="/support">帮助与支持</Link><span>AI生成内容，请核对真实性</span>
      </footer>
    </div>
  );
}
