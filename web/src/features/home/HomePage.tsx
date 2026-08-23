import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { useAuth } from "../../app/AuthProvider";
import { callApi } from "../../lib/api";
import type { ResumeListItem } from "../../lib/models";
import { Header, PrimaryLink, Surface } from "../../ui/ui";
import { ServiceBanner } from "../../ui/ServiceBanner";
import styles from "../Feature.module.css";

interface UserView {
  user: { remainingQuota: number; resourcePauseReason: string };
}

export function HomePage(): React.JSX.Element {
  const auth = useAuth();
  const user = useQuery({ queryKey: ["user.get"], queryFn: () => callApi<UserView>("user.get", {}) });
  const resumes = useQuery({
    queryKey: ["resume.list"],
    queryFn: () => callApi<{ resumes: ResumeListItem[] }>("resume.list", {}),
  });
  const defaultResume = resumes.data?.resumes.find((resume) => resume.isDefault);
  const aiAvailable = auth.status?.serviceAccess === undefined ||
    (auth.status.serviceAccess.phase === "active" && auth.status.serviceAccess.aiAvailability === "available");
  const canGenerate = aiAvailable && defaultResume?.status === "confirmed" && (user.data?.user.remainingQuota ?? 0) > 0;
  return (
    <div className={styles.stack}>
      <Header eyebrow="APPLYMATE" title="你好，同学 👋" />
      <ServiceBanner access={auth.status?.serviceAccess} />
      <Surface>
        <div className={styles.compactStack}>
          <div className={styles.split}>
            <div className={styles.statusBlock}>
              <p className={styles.meta}>当前简历</p>
              <p className={styles.value}>{defaultResume?.profile.name ?? (defaultResume === undefined ? "还未添加" : "已确认简历")}</p>
            </div>
            <div className={styles.statusBlock}>
              <p className={styles.meta}>今日剩余</p>
              <p className={styles.value}>{user.data?.user.remainingQuota ?? "—"} / 20</p>
            </div>
          </div>
          <Link className={styles.rowAction} to="/app/resumes">管理简历 →</Link>
        </div>
      </Surface>
      {canGenerate ? (
        <Link className={styles.heroAction} to="/app/jobs/new">
          <strong>提交岗位信息</strong>
          <span>添加最多 5 张截图，或直接粘贴岗位文字</span>
        </Link>
      ) : !aiAvailable ? (
        <PrimaryLink to="/app/records">查看已有记录</PrimaryLink>
      ) : (
        <PrimaryLink to="/app/resumes/new">先添加一份简历</PrimaryLink>
      )}
      {user.data?.user.resourcePauseReason ? <p className={styles.intro}>{user.data.user.resourcePauseReason}，相关入口已暂停。</p> : null}
      <Surface>
        <h2 className={styles.sectionTitle}>每次投递，都有据可查</h2>
        <div className={styles.list}>
          {[["01", "简历事实", "只使用你确认过的经历"], ["02", "岗位要求", "识别岗位职责与技能"], ["03", "专属开场", "按核心能力选择经历"]].map(([icon, title, detail]) => (
            <div className={styles.listRow} key={icon}>
              <span className={styles.icon}>{icon}</span>
              <div className={styles.rowMain}><strong>{title}</strong><span>{detail}</span></div>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}
