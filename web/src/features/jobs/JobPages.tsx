import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";

import { useAuth } from "../../app/AuthProvider";
import { callApi } from "../../lib/api";
import { uploadWithConcurrency } from "../../lib/cloudbase";
import type { JobView, ResumeListItem } from "../../lib/models";
import { createRequestId } from "../../lib/request-id";
import { ErrorNotice, Header, PrimaryButton, SecondaryButton, Surface } from "../../ui/ui";
import styles from "../Feature.module.css";

type InputMode = "images" | "text";

export function JobCreatePage(): React.JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<InputMode>("images");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploadPromise = useRef<Promise<string[]> | null>(null);
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);
  const resumes = useQuery({ queryKey: ["resume.list"], queryFn: () => callApi<{ resumes: ResumeListItem[] }>("resume.list", {}) });
  const defaultResume = resumes.data?.resumes.find((resume) => resume.isDefault && resume.status === "confirmed");

  function chooseFiles(nextFiles: File[]): void {
    const limited = nextFiles.slice(0, 5);
    setFiles(limited);
    setError(nextFiles.length > 5 ? "最多添加 5 张岗位截图。" : "");
    uploadPromise.current = limited.length === 0
      ? null
      : uploadWithConcurrency(limited, auth.status?.userId ?? "", 3);
  }
  async function submit(): Promise<void> {
    if (defaultResume === undefined) {
      setError("请先设置一份已确认的默认简历。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = mode === "text"
        ? { resumeId: defaultResume.resumeId, inputType: "text" as const, text }
        : { resumeId: defaultResume.resumeId, inputType: "images" as const, fileIds: await (uploadPromise.current ?? Promise.resolve([])) };
      const created = await callApi<{ jobId: string }>("generation.create", payload, createRequestId());
      navigate(`/jobs/${created.jobId}?kind=generation`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "岗位提交失败，请重试。");
    } finally { setBusy(false); }
  }
  const ready = defaultResume !== undefined && (mode === "text" ? text.trim().length > 20 : files.length > 0);
  return (
    <div className={styles.stack}>
      <Header eyebrow="新岗位" title="提交岗位信息" />
      <p className={styles.intro}>选择图片后会在后台安全上传，但只有你点击生成后才开始 OCR 和模型处理。</p>
      <div className={styles.tabs}>
        <button className={mode === "images" ? styles.activeTab : styles.tab} onClick={() => setMode("images")} type="button">岗位截图</button>
        <button className={mode === "text" ? styles.activeTab : styles.tab} onClick={() => setMode("text")} type="button">粘贴文字</button>
      </div>
      <Surface>
        {mode === "images" ? (
          <div className={styles.compactStack}>
            <label className={styles.dropZone}>
              <input accept="image/*" multiple onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))} type="file" />
              <span>{files.length === 0 ? "一次选择最多 5 张 JD 截图" : `已选择 ${files.length} / 5 张，可重新选择`}</span>
            </label>
            <div className={styles.previews}>
              {previews.map(({ file, url }, index) => (
                <div className={styles.preview} key={`${file.name}-${file.size}`}>
                  <img alt={`岗位截图 ${index + 1}`} src={url} />
                  <button aria-label={`删除第 ${index + 1} 张截图`} onClick={() => chooseFiles(files.filter((_, fileIndex) => fileIndex !== index))} type="button">×</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <label className={styles.field}><span>岗位文字</span><textarea className={styles.textarea} onChange={(event) => setText(event.target.value)} placeholder="粘贴岗位职责与任职要求" value={text} /></label>
        )}
      </Surface>
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
      <PrimaryButton disabled={!ready || busy} onClick={() => void submit()}>{busy ? "正在创建任务…" : "生成开场白"}</PrimaryButton>
    </div>
  );
}

const stages = ["读取岗位输入", "识别岗位职责与要求", "匹配简历事实并生成"];

export function JobProgressPage(): React.JSX.Element {
  const { jobId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const navigated = useRef(false);
  const query = useQuery({
    queryKey: ["job.get", jobId],
    queryFn: () => callApi<JobView & { kind?: string; result?: Record<string, unknown> }>("job.get", { jobId }),
    refetchInterval: (state) => ["succeeded", "failed"].includes(state.state.data?.status ?? "") ? false : 1_000,
  });
  const job = query.data;
  useEffect(() => {
    if (navigated.current || job?.status !== "succeeded") return;
    navigated.current = true;
    const result = job.result ?? {};
    const kind = params.get("kind") ?? job.kind;
    if (kind === "resume" || job.kind === "resume_parse") {
      const resumeId = String(result.resumeId ?? params.get("resumeId") ?? "");
      navigate(`/resumes/${resumeId}/review`, { replace: true });
    } else {
      const applicationId = String(result.applicationId ?? job.applicationId ?? "");
      navigate(`/results/${applicationId}`, { replace: true });
    }
  }, [job, navigate, params]);
  const activeIndex = job?.status === "queued" ? 0 : job?.status === "ocr" || job?.status === "parsing" ? 1 : 2;
  return (
    <div className={styles.stack}>
      <Header eyebrow="任务会自动恢复" title={job?.status === "failed" ? "处理未完成" : "正在生成开场白"} />
      <p className={styles.intro}>可以切到其他应用，回来后会继续显示当前进度。</p>
      <Surface>
        <div className={styles.compactStack}>
          <div className={styles.split}><p className={styles.value}>{job?.statusLabel ?? "排队"}</p><span className={styles.pill}>{job?.status === "failed" ? "可重试" : "处理中"}</span></div>
          <div aria-label="任务进度" className={styles.progress}><span style={{ width: `${job?.status === "succeeded" ? 100 : (activeIndex + 1) * 30}%` }} /></div>
        </div>
      </Surface>
      <Surface>
        <ol className={styles.progressSteps}>{stages.map((stage, index) => <li key={stage}>{index <= activeIndex ? stage : `等待：${stage}`}</li>)}</ol>
      </Surface>
      {job?.status === "failed" ? <ErrorNotice>{job.error?.message ?? "处理失败，且本次不会扣除额度。"}</ErrorNotice> : null}
      {query.error === null ? null : <ErrorNotice>{query.error.message}</ErrorNotice>}
      {job?.status === "failed" ? <SecondaryButton onClick={() => navigate("/jobs/new", { replace: true })}>重新提交</SecondaryButton> : null}
    </div>
  );
}
