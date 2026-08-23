import { Link } from "react-router-dom";

import { formatPublicDate, PUBLIC_SERVICE_SCHEDULE } from "../../lib/public-config";
import { Header, Surface } from "../../ui/ui";
import styles from "../Feature.module.css";

export function SupportPage(): React.JSX.Element {
  return (
    <div className={styles.stack}>
      <Header eyebrow="帮助与支持" title="先把边界说清楚" />
      <Surface>
        <h2 className={styles.sectionTitle}>如何登录？</h2>
        <p className={styles.legalBody}>使用邮箱验证码开放注册。ApplyMate 不自建密码，也不会在业务数据库保存邮箱明文。</p>
      </Surface>
      <Surface>
        <h2 className={styles.sectionTitle}>数据可以带走或删除吗？</h2>
        <p className={styles.legalBody}>可以。登录后可下载版本化 JSON 数据，也可申请删除账号。删除申请会立即停用账号，并在 24 小时内清理可关联数据。</p>
      </Surface>
      <Surface>
        <h2 className={styles.sectionTitle}>服务会持续多久？</h2>
        <p className={styles.legalBody}>AI 计划在 {formatPublicDate(PUBLIC_SERVICE_SCHEDULE?.aiClosesAt)} 关闭；数据访问计划在 {formatPublicDate(PUBLIC_SERVICE_SCHEDULE?.dataAccessEndsAt)} 结束。具体日期以正式上线公告为准。</p>
      </Surface>
      <Surface>
        <h2 className={styles.sectionTitle}>遇到问题</h2>
        <p className={styles.legalBody}>请邮件联系 <a className={styles.linkText} href="mailto:applymate67@gmail.com">applymate67@gmail.com</a>，不要在邮件中附带未脱敏简历或岗位截图。</p>
      </Surface>
      <div className={styles.buttonRow}><Link className={styles.textButton} to="/">返回首页</Link><Link className={styles.textButton} to="/legal">查看协议</Link></div>
    </div>
  );
}
