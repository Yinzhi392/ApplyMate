import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";

import { useAuth } from "../../app/AuthProvider";
import { callApi } from "../../lib/api";
import {
  describeJdImageUploadProgress,
  prepareAndUploadJdImages,
  type JdImageUploadProgress,
  type PreparedJdUpload,
} from "../../lib/jd-image-preparation";
import { cloudbaseTemporaryUploadPort } from "../../lib/temporary-upload";
import type { JobView, ResumeListItem } from "../../lib/models";
import { createRequestId } from "../../lib/request-id";
import { ErrorNotice, Header, PrimaryButton, SecondaryButton, Surface } from "../../ui/ui";
import { ServiceBanner } from "../../ui/ServiceBanner";
import styles from "../Feature.module.css";
import { createJobProgressContent } from "./job-progress";

type InputMode = "images" | "text";

export function JobCreatePage(): React.JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<InputMode>("images");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<JdImageUploadProgress[]>([]);
  const uploadPromise = useRef<Promise<PreparedJdUpload[]> | null>(null);
  const uploadRunId = useRef(0);
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach(({ url }) => URL.revokeObjectURL(url)), [previews]);
  const resumes = useQuery({ queryKey: ["resume.list"], queryFn: () => callApi<{ resumes: ResumeListItem[] }>("resume.list", {}) });
  const defaultResume = resumes.data?.resumes.find((resume) => resume.isDefault && resume.status === "confirmed");

  function startUpload(nextFiles: File[]): Promise<PreparedJdUpload[]> | null {
    const runId = uploadRunId.current + 1;
    uploadRunId.current = runId;
    setUploadProgress([]);
    const nextUpload = nextFiles.length === 0
      ? null
      : prepareAndUploadJdImages(
          nextFiles,
          auth.status?.userId ?? "",
          cloudbaseTemporaryUploadPort,
          3,
          undefined,
          (progress) => {
            if (uploadRunId.current !== runId) return;
            setUploadProgress((current) => {
              const updated = [...current];
              updated[progress.index] = progress;
              return updated;
            });
          },
        );
    uploadPromise.current = nextUpload;
    if (nextUpload !== null) {
      void nextUpload.catch((cause: unknown) => {
        if (uploadPromise.current !== nextUpload) return;
        uploadPromise.current = null;
        setError(cause instanceof Error ? cause.message : "图片上传失败，请重新选择图片。");
      });
    }
    return nextUpload;
  }

  function chooseFiles(nextFiles: File[]): void {
    const limited = nextFiles.slice(0, 5);
    const previousUpload = uploadPromise.current;
    if (previousUpload !== null) {
      void previousUpload
        .then((uploads) => cloudbaseTemporaryUploadPort.delete(uploads.map(({ fileId }) => fileId)))
        .catch(() => undefined);
    }
    setFiles(limited);
    setError(nextFiles.length > 5 ? "最多添加 5 张岗位截图。" : "");
    startUpload(limited);
  }
  async function submit(): Promise<void> {
    if (defaultResume === undefined) {
      setError("请先设置一份已确认的默认简历。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let uploads: PreparedJdUpload[] = [];
      if (mode === "images") {
        uploads = await (uploadPromise.current ?? startUpload(files) ?? Promise.resolve([]));
      }
      const payload = mode === "text"
        ? { resumeId: defaultResume.resumeId, inputType: "text" as const, text }
        : {
            resumeId: defaultResume.resumeId,
            inputType: "images" as const,
            fileIds: uploads.map(({ fileId }) => fileId),
            fileAccessUrls: uploads.map(({ accessUrl }) => accessUrl),
          };
      const created = await callApi<{ jobId: string }>("generation.create", payload, createRequestId());
      navigate(`/app/jobs/${created.jobId}?kind=generation`, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "岗位提交失败，请重试。");
    } finally { setBusy(false); }
  }
  const aiAvailable = auth.status?.serviceAccess === undefined ||
    (auth.status.serviceAccess.phase === "active" && auth.status.serviceAccess.aiAvailability === "available");
  const ready = aiAvailable && defaultResume !== undefined && (mode === "text" ? text.trim().length > 20 : files.length > 0);
  const uploadStatus = describeJdImageUploadProgress(uploadProgress.filter(Boolean), files.length);
  return (
    <div className={styles.stack}>
      <Header eyebrow="新岗位" title="提交岗位信息" />
      <ServiceBanner access={auth.status?.serviceAccess} />
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
      {mode === "images" && uploadStatus !== "" ? <p aria-live="polite" className={styles.uploadStatus}>{uploadStatus}</p> : null}
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
      <PrimaryButton disabled={!ready || busy} onClick={() => void submit()}>{busy ? "正在创建任务…" : "生成开场白"}</PrimaryButton>
    </div>
  );
}

export function JobProgressPage(): React.JSX.Element {
  const { jobId = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const navigated = useRef(false);
  const query = useQuery({
    queryKey: ["job.get", jobId],
    queryFn: () => callApi<JobView & { kind?: string; result?: Record<string, unknown> }>("job.get", { jobId }),
    refetchInterval: (state) => ["succeeded", "failed", "awaiting_user_confirmation"].includes(state.state.data?.status ?? "") ? false : 1_000,
  });
  const job = query.data;
  useEffect(() => {
    const kind = params.get("kind") ?? job?.kind;
    const complete = job?.status === "succeeded" ||
      (job?.status === "awaiting_user_confirmation" && (kind === "resume" || job?.kind === "resume_parse"));
    if (navigated.current || !complete) return;
    navigated.current = true;
    const result = job.result ?? {};
    if (kind === "resume" || job.kind === "resume_parse") {
      const resumeId = String(result.resumeId ?? params.get("resumeId") ?? "");
      navigate(`/app/resumes/${resumeId}/review`, { replace: true });
    } else {
      const applicationId = String(result.applicationId ?? job.applicationId ?? "");
      navigate(`/app/results/${applicationId}`, { replace: true });
    }
  }, [job, navigate, params]);
  const kind = params.get("kind") ?? job?.kind;
  const progressContent = createJobProgressContent(kind, job?.status, job?.error?.stage);
  const { activeIndex, stages, title } = progressContent;
  return (
    <div className={styles.stack}>
      <Header eyebrow="任务会自动恢复" title={title} />
      <p className={styles.intro}>可以切到其他应用，回来后会继续显示当前进度。</p>
      <Surface>
        <div className={styles.compactStack}>
          <div className={styles.split}><p className={styles.value}>{job?.statusLabel ?? "排队"}</p><span className={styles.pill}>{job?.status === "failed" ? "可重试" : "处理中"}</span></div>
          <div aria-label="任务进度" className={styles.progress}><span style={{ width: `${["succeeded", "awaiting_user_confirmation"].includes(job?.status ?? "") ? 100 : (activeIndex + 1) * 30}%` }} /></div>
        </div>
      </Surface>
      <Surface>
        <ol className={styles.progressSteps}>{stages.map((stage, index) => <li key={stage}>{index <= activeIndex ? stage : `等待：${stage}`}</li>)}</ol>
      </Surface>
      {job?.status === "failed" ? <ErrorNotice>{job.error?.message ?? "处理失败，且本次不会扣除额度。"}</ErrorNotice> : null}
      {query.error === null ? null : <ErrorNotice>{query.error.message}</ErrorNotice>}
      {job?.status === "failed" ? <SecondaryButton onClick={() => navigate("/app/jobs/new", { replace: true })}>重新提交</SecondaryButton> : null}
    </div>
  );
}
