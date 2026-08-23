import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../app/AuthProvider";
import { callApi } from "../../lib/api";
import type { ApplicationItem } from "../../lib/models";
import { createRequestId } from "../../lib/request-id";
import { EmptyState, ErrorNotice, Header, PrimaryButton, SecondaryButton, Surface } from "../../ui/ui";
import { ConfirmDialog } from "../../ui/Dialog";
import { ServiceBanner } from "../../ui/ServiceBanner";
import styles from "../Feature.module.css";

export function RecordsPage(): React.JSX.Element {
  const [filter, setFilter] = useState<"all" | "not_applied" | "applied">("all");
  const query = useQuery({
    queryKey: ["application.list", filter],
    queryFn: () => callApi<{ applications: ApplicationItem[] }>("application.list", filter === "all" ? {} : { status: filter }),
  });
  const records = query.data?.applications ?? [];
  return (
    <div className={styles.stack}>
      <Header eyebrow="全部投递" title="记录" />
      <div className={styles.tabs}>
        {(["all", "not_applied", "applied"] as const).map((value) => <button className={filter === value ? styles.activeTab : styles.tab} key={value} onClick={() => setFilter(value)} type="button">{{ all: "全部", not_applied: "未投递", applied: "已投递" }[value]}</button>)}
      </div>
      {query.error === null ? null : <ErrorNotice>{query.error.message}</ErrorNotice>}
      {records.length === 0 ? (
        <Surface><EmptyState detail="完成一次岗位生成后，会自动保存到这里。" title="暂无记录" /></Surface>
      ) : (
        <Surface>
          <div className={styles.list}>{records.map((record) => (
            <Link className={styles.listRow} key={record.applicationId} to={`/app/records/${record.applicationId}`}>
              <span className={styles.icon}>{record.status === "applied" ? "✓" : "↗"}</span>
              <div className={styles.rowMain}><strong>{record.companyName ?? "未填写公司"}</strong><span>{record.jobTitle ?? "该岗位"} · {record.status === "applied" ? "已投递" : "未投递"}</span></div>
              <span className={styles.rowAction}>查看 →</span>
            </Link>
          ))}</div>
        </Surface>
      )}
    </div>
  );
}

interface RecordDetail {
  application: ApplicationItem;
  feedback?: { rating: "satisfied" | "needs_improvement"; note?: string };
}

export function RecordDetailPage(): React.JSX.Element {
  const auth = useAuth();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["application.get", id], queryFn: () => callApi<RecordDetail>("application.get", { applicationId: id }) });
  const [memo, setMemo] = useState<string | undefined>();
  const [rating, setRating] = useState<"satisfied" | "needs_improvement">(query.data?.feedback?.rating ?? "satisfied");
  const [feedbackNote, setFeedbackNote] = useState(query.data?.feedback?.note ?? "");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => callApi("application.update", { applicationId: id, ...payload }, createRequestId()),
    onSuccess: async () => client.invalidateQueries({ queryKey: ["application.get", id] }),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "保存失败。"),
  });
  const application = query.data?.application;
  const writable = auth.status?.serviceAccess?.phase !== "read_only" &&
    auth.status?.serviceAccess?.phase !== "retired";
  useEffect(() => {
    if (query.data?.feedback === undefined) return;
    setRating(query.data.feedback.rating);
    setFeedbackNote(query.data.feedback.note ?? "");
  }, [query.data?.feedback]);
  if (query.isLoading || application === undefined) return <div className={styles.skeleton}>正在读取记录…</div>;
  return (
    <div className={styles.stack}>
      <Header eyebrow={application.companyName ?? "未填写公司"} title={application.jobTitle ?? "该岗位"} />
      <ServiceBanner access={auth.status?.serviceAccess} />
      <Surface><p className={styles.legalBody}>{application.greetingBody}</p></Surface>
      {writable ? <Surface>
        <div className={styles.compactStack}>
          <label className={styles.field}><span>投递状态</span><select className={styles.select} onChange={(event) => mutation.mutate({ status: event.target.value })} value={application.status}><option value="not_applied">未投递</option><option value="applied">已投递</option></select></label>
          <label className={styles.field}><span>备忘</span><textarea className={styles.textarea} maxLength={500} onChange={(event) => setMemo(event.target.value)} placeholder="记录跟进日期或 HR 回复" value={memo ?? application.memo ?? ""} /></label>
          <PrimaryButton disabled={mutation.isPending} onClick={() => mutation.mutate({ memo: memo ?? application.memo ?? "" })}>保存记录</PrimaryButton>
        </div>
      </Surface> : null}
      {writable ? <Surface>
        <div className={styles.compactStack}>
          <h2 className={styles.sectionTitle}>生成反馈</h2>
          <label className={styles.field}><span>本次结果</span><select className={styles.select} onChange={(event) => setRating(event.target.value as typeof rating)} value={rating}><option value="satisfied">满意</option><option value="needs_improvement">需要改进</option></select></label>
          <label className={styles.field}><span>补充说明（可选）</span><textarea className={styles.textarea} maxLength={500} onChange={(event) => setFeedbackNote(event.target.value)} value={feedbackNote} /></label>
          <SecondaryButton onClick={() => void callApi("feedback.submit", { applicationId: id, rating, note: feedbackNote }, createRequestId()).then(() => client.invalidateQueries({ queryKey: ["application.get", id] })).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "反馈保存失败。"))}>保存反馈</SecondaryButton>
        </div>
      </Surface> : null}
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
      <SecondaryButton onClick={() => navigate(`/app/results/${id}`)}>查看并复制开场白</SecondaryButton>
      {writable ? <button className={styles.dangerButton} onClick={() => setConfirmDelete(true)} type="button">删除记录</button> : null}
      {writable && confirmDelete ? (
        <ConfirmDialog
          confirmLabel="删除记录"
          destructive
          detail="这条记录及其反馈将被删除，操作不可恢复。"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            void callApi("application.delete", { applicationId: id }, createRequestId())
              .then(() => navigate("/app/records", { replace: true }))
              .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "删除失败。"));
          }}
          title="确认删除这条投递记录？"
        />
      ) : null}
    </div>
  );
}
