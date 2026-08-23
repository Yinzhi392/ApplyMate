import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { ResumeProfile } from "../../../../shared/src/resume-schema";
import { useAuth } from "../../app/AuthProvider";
import { callApi } from "../../lib/api";
import { uploadWithConcurrency } from "../../lib/temporary-upload";
import type { ResumeListItem } from "../../lib/models";
import { prepareResumeFilePayload } from "../../lib/resume-document";
import { createRequestId } from "../../lib/request-id";
import { EmptyState, ErrorNotice, Header, PrimaryButton, PrimaryLink, SecondaryButton, Surface } from "../../ui/ui";
import { ActionSheet, ConfirmDialog } from "../../ui/Dialog";
import { ServiceBanner } from "../../ui/ServiceBanner";
import styles from "../Feature.module.css";

function useResumeList() {
  return useQuery({
    queryKey: ["resume.list"],
    queryFn: () => callApi<{ resumes: ResumeListItem[] }>("resume.list", {}),
  });
}

function resumeTitle(resume: ResumeListItem): string {
  return resume.profile.name?.trim() || "未命名简历";
}

export function ResumeListPage(): React.JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const resumes = useResumeList();
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ResumeListItem>();
  const [deleteTarget, setDeleteTarget] = useState<ResumeListItem>();
  const mutate = useMutation({
    mutationFn: ({ action, resumeId }: { action: "resume.delete" | "resume.setDefault"; resumeId: string }) =>
      callApi(action, { resumeId }, createRequestId()),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["resume.list"] }),
    onError: (cause) => setError(cause instanceof Error ? cause.message : "操作失败。"),
  });
  const list = resumes.data?.resumes ?? [];
  const canCreate = auth.status?.serviceAccess?.phase !== "read_only" &&
    auth.status?.serviceAccess?.phase !== "retired";
  return (
    <div className={styles.stack}>
      <Header action={list.length < 3 && canCreate ? <Link className={styles.rowAction} to="/app/resumes/new">添加</Link> : null} eyebrow="事实来源" title="我的简历" />
      <ServiceBanner access={auth.status?.serviceAccess} />
      <p className={styles.intro}>最多保存 3 份。只有你核对并确认的事实才会参与生成。</p>
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
      {list.length === 0 ? (
        <Surface><EmptyState action={canCreate ? <PrimaryLink to="/app/resumes/new">添加一份简历</PrimaryLink> : undefined} detail={canCreate ? "支持 PDF、DOCX、图片或文字。" : "当前服务期只保留已有数据访问。"} title="还没有简历" /></Surface>
      ) : (
        <div className={styles.compactStack}>
          {list.map((resume) => (
            <Surface key={resume.resumeId}>
              <div className={styles.listRow}>
                <span className={styles.icon}>📄</span>
                <div className={styles.rowMain}>
                  <strong>{resumeTitle(resume)} {resume.isDefault ? <span className={styles.pill}>默认</span> : null}</strong>
                  <span>{resume.status === "confirmed" ? "已确认" : resume.status === "awaiting_confirmation" ? "等待核对" : "处理中"}</span>
                </div>
                <button aria-label={`管理 ${resumeTitle(resume)}`} className={styles.rowAction} onClick={() => setSelected(resume)} type="button">•••</button>
              </div>
            </Surface>
          ))}
        </div>
      )}
      {selected === undefined ? null : (
        <ActionSheet
          actions={[
            ...(selected.status === "awaiting_confirmation" && canCreate
              ? [{ label: "继续核对", onSelect: () => navigate(`/app/resumes/${selected.resumeId}/review`) }]
              : []),
            ...(!selected.isDefault && selected.status === "confirmed" && canCreate
              ? [{ label: "设为默认", onSelect: () => mutate.mutate({ action: "resume.setDefault", resumeId: selected.resumeId }) }]
              : []),
            ...(canCreate
              ? [{ destructive: true as const, label: "删除", onSelect: () => setDeleteTarget(selected) }]
              : []),
          ]}
          onClose={() => setSelected(undefined)}
          title={resumeTitle(selected)}
        />
      )}
      {deleteTarget === undefined ? null : (
        <ConfirmDialog
          confirmLabel="确认删除"
          destructive
          detail="删除后不可恢复；已经保存的历史投递记录仍会保留。"
          onCancel={() => setDeleteTarget(undefined)}
          onConfirm={() => {
            mutate.mutate({ action: "resume.delete", resumeId: deleteTarget.resumeId });
            setDeleteTarget(undefined);
          }}
          title={`删除${resumeTitle(deleteTarget)}？`}
        />
      )}
    </div>
  );
}

type ResumeInputMode = "file" | "text";

export function ResumeNewPage(): React.JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<ResumeInputMode>("file");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      let payload: Record<string, unknown>;
      if (mode === "text") {
        payload = { inputType: "text", text };
      } else {
        payload = await prepareResumeFilePayload(
          files,
          (selected) => uploadWithConcurrency(selected, auth.status?.userId ?? "", 3),
        );
      }
      const created = await callApi<{ jobId: string; resumeId: string }>("resume.parse", payload, createRequestId());
      navigate(`/app/jobs/${created.jobId}?kind=resume&resumeId=${created.resumeId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "简历提交失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  const ready = mode === "text" ? text.trim().length > 20 : files.length > 0;
  return (
    <div className={styles.stack}>
      <Header eyebrow="新增事实来源" title="添加简历" />
      <div className={styles.tabs}>
        <button className={mode === "file" ? styles.activeTab : styles.tab} onClick={() => setMode("file")} type="button">上传文件</button>
        <button className={mode === "text" ? styles.activeTab : styles.tab} onClick={() => setMode("text")} type="button">粘贴文字</button>
      </div>
      <Surface>
        {mode === "file" ? (
          <div className={styles.compactStack}>
            <label className={styles.dropZone}>
              <input accept=".pdf,.docx,image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 6))} type="file" />
              <span>{files.length === 0 ? "选择 PDF、DOCX 或最多 6 张图片" : `已选择 ${files.length} 个文件`}</span>
            </label>
            {files.map((file) => <p className={styles.meta} key={`${file.name}-${file.size}`}>{file.name}</p>)}
          </div>
        ) : (
          <label className={styles.field}><span>简历文字</span><textarea className={styles.textarea} onChange={(event) => setText(event.target.value)} placeholder="粘贴完整简历内容" value={text} /></label>
        )}
      </Surface>
      <p className={styles.intro}>原文件仅用于解析；你确认后会删除，只保留结构化事实。</p>
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
      <PrimaryButton disabled={!ready || busy} onClick={() => void submit()}>{busy ? "正在读取简历…" : "解析简历"}</PrimaryButton>
    </div>
  );
}

const factGroups: Array<{ key: Exclude<keyof ResumeProfile, "resumeId" | "name" | "confirmed">; label: string; icon: string }> = [
  { key: "education", label: "教育背景", icon: "🎓" },
  { key: "experiences", label: "实习 / 工作经历", icon: "💼" },
  { key: "projects", label: "项目经历", icon: "🧩" },
  { key: "skills", label: "专业技能与工具", icon: "🛠️" },
  { key: "languages", label: "语言能力", icon: "🌐" },
  { key: "certificates", label: "证书", icon: "📜" },
  { key: "achievements", label: "成果与优势", icon: "🏅" },
  { key: "preferences", label: "求职偏好", icon: "🎯" },
  { key: "otherFacts", label: "其他事实", icon: "✦" },
];

export function ResumeReviewPage(): React.JSX.Element {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const resumes = useResumeList();
  const source = resumes.data?.resumes.find((resume) => resume.resumeId === id)?.profile as ResumeProfile | undefined;
  const [profile, setProfile] = useState<ResumeProfile | undefined>();
  const current = profile ?? source;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const groups = useMemo(() => factGroups.map((group) => ({ ...group, facts: current?.[group.key] ?? [] })), [current]);

  function updateFact(groupKey: typeof factGroups[number]["key"], factId: string, text: string): void {
    if (current === undefined) return;
    setProfile({ ...current, [groupKey]: current[groupKey].map((fact) => fact.factId === factId ? { ...fact, text } : fact) });
  }
  function deleteFact(groupKey: typeof factGroups[number]["key"], factId: string): void {
    if (current === undefined) return;
    setProfile({ ...current, [groupKey]: current[groupKey].filter((fact) => fact.factId !== factId) });
  }
  async function confirm(): Promise<void> {
    if (current === undefined) return;
    setBusy(true);
    setError("");
    try {
      await callApi("resume.confirm", { resumeId: id, profile: { ...current, confirmed: true } }, createRequestId());
      navigate("/app/resumes", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
    } finally { setBusy(false); }
  }
  if (resumes.isLoading || current === undefined) return <div className={styles.skeleton}>正在读取解析结果…</div>;
  return (
    <div className={styles.stack}>
      <Header eyebrow="仅新简历需要一次" title="核对个人资料" />
      <p className={styles.intro}>AI 会在每个新岗位中自动重新选择最相关事实。这里只需要修正或删除错误信息。</p>
      {groups.filter(({ facts }) => facts.length > 0).map((group) => (
        <Surface key={group.key}>
          <h2 className={styles.sectionTitle}>{group.label} {group.icon}</h2>
          <div className={styles.list}>
            {group.facts.map((fact) => (
              <div className={styles.listRow} key={fact.factId}>
                <input aria-label={`修改${group.label}`} className={styles.input} onChange={(event) => updateFact(group.key, fact.factId, event.target.value)} value={fact.text} />
                <button className={`${styles.rowAction} ${styles.dangerText}`} onClick={() => deleteFact(group.key, fact.factId)} type="button">删除</button>
              </div>
            ))}
          </div>
        </Surface>
      ))}
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
      <div className={styles.buttonRow}><SecondaryButton onClick={() => navigate(-1)}>返回</SecondaryButton><PrimaryButton disabled={busy} onClick={() => void confirm()}>{busy ? "保存中…" : "确认事实并保存"}</PrimaryButton></div>
    </div>
  );
}
