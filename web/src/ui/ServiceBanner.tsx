import type { ServiceAccess } from "../../../shared/src/service-access";

import styles from "./ui.module.css";

const availabilityLabels: Record<ServiceAccess["aiAvailability"], string> = {
  available: "",
  budget_paused: "本月预算已到安全停止线，新 AI 任务已暂停。",
  resource_paused: "OCR 或模型资源暂不可用，新 AI 任务已暂停。",
  scheduled_closed: "AI 服务期已结束，当前只保留数据查看、导出和删除。",
};

export function ServiceBanner({ access }: { access?: ServiceAccess }): React.JSX.Element | null {
  if (access === undefined || (access.phase === "active" && access.aiAvailability === "available")) return null;
  const message = access.phase === "retired"
    ? "数据访问期已结束。如需帮助，请前往支持页面。"
    : availabilityLabels[access.aiAvailability];
  return <p className={styles.serviceBanner} role="status">{message}</p>;
}
