import { Link } from "react-router-dom";

import { formatPublicDate, PUBLIC_SERVICE_SCHEDULE } from "../../lib/public-config";
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
          <Link className={styles.textButton} to="/support">先了解服务边界</Link>
        </div>
      </section>
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
      <section className={styles.publicGrid}>
        <Surface>
          <p className={styles.eyebrowText}>隐私边界</p>
          <h2 className={styles.sectionTitle}>原件短期存在，模型只看脱敏文字</h2>
          <p className={styles.intro}>简历确认后删除原件，JD 图片处理后删除。手机号、邮箱、证件号和详细地址在进入 Hy3 前遮盖。</p>
        </Surface>
        <Surface>
          <p className={styles.eyebrowText}>适用人群</p>
          <h2 className={styles.sectionTitle}>实习、校招与初级岗位</h2>
          <p className={styles.intro}>它不替你自动投递，也不编造经历。你仍需在发送前核对正文真实性。</p>
        </Surface>
      </section>
      <Surface>
        <p className={styles.eyebrowText}>六个月服务周期</p>
        <h2 className={styles.sectionTitle}>前两个月生成，之后保留数据处理窗口</h2>
        <p className={styles.intro}>AI 计划关闭：{formatPublicDate(PUBLIC_SERVICE_SCHEDULE?.aiClosesAt)}。数据访问计划结束：{formatPublicDate(PUBLIC_SERVICE_SCHEDULE?.dataAccessEndsAt)}。最终全量删除前仍会单独核对。</p>
      </Surface>
      <footer className={styles.publicFooter}>
        <Link to="/legal">协议与隐私</Link><Link to="/support">帮助与支持</Link><span>AI生成内容，请核对真实性</span>
      </footer>
    </div>
  );
}
