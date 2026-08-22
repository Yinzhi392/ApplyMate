import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { callApi } from "../../lib/api";
import { createRequestId } from "../../lib/request-id";
import { ErrorNotice, Header, PrimaryButton, SecondaryButton, Surface } from "../../ui/ui";
import styles from "../Feature.module.css";

interface ApplicationDetail {
  application: {
    applicationId: string;
    companyName?: string;
    greetingBody: string;
    jobTitle?: string;
    memo?: string;
    status: "not_applied" | "applied";
  };
  copyText: string;
  generationDisclosure?: { label?: string; modelName?: string };
}

export function ResultPage(): React.JSX.Element {
  const { applicationId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["application.get", applicationId], queryFn: () => callApi<ApplicationDetail>("application.get", { applicationId }) });
  const [body, setBody] = useState("");
  const [savedBody, setSavedBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const next = query.data?.application.greetingBody;
    if (next !== undefined && savedBody === "") {
      setBody(next);
      setSavedBody(next);
    }
  }, [query.data, savedBody]);
  async function save(): Promise<boolean> {
    if (body === savedBody) return true;
    setBusy(true);
    setError("");
    try {
      await callApi("application.update", { applicationId, greetingBody: body }, createRequestId());
      setSavedBody(body);
      await queryClient.invalidateQueries({ queryKey: ["application.get", applicationId] });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试。");
      return false;
    } finally { setBusy(false); }
  }
  async function copy(): Promise<void> {
    setError("");
    try {
      const copyText = `${body.trim()}\n\nAI生成内容，请核对真实性`;
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      void callApi("analytics.track", { event: "greeting_copied", applicationId }, createRequestId()).catch(() => undefined);
    } catch {
      setError("复制失败，请长按正文手动复制。");
    }
  }
  async function rewrite(): Promise<void> {
    if (!(await save())) return;
    setBusy(true);
    setError("");
    try {
      const created = await callApi<{ jobId: string }>("generation.rewrite", { applicationId, mode: "rephrase" }, createRequestId());
      navigate(`/jobs/${created.jobId}?kind=generation`, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "改写失败，请稍后重试。"); }
    finally { setBusy(false); }
  }
  async function leave(to: string): Promise<void> {
    if (await save()) navigate(to, { replace: true });
  }
  if (query.isLoading) return <div className={styles.skeleton}>正在读取生成结果…</div>;
  if (query.error !== null || query.data === undefined) return <ErrorNotice>{query.error?.message ?? "结果不存在。"}</ErrorNotice>;
  return (
    <div className={styles.stack}>
      <Header eyebrow="已生成" title="专属开场白" />
      <p className={styles.intro}>{query.data.application.companyName ?? "贵司"} · {query.data.application.jobTitle ?? "该岗位"}</p>
      <Surface>
        <textarea aria-label="开场白正文" className={styles.editor} onChange={(event) => { setBody(event.target.value); setCopied(false); }} value={body} />
        <p className={styles.disclosure}>AI生成内容，请核对真实性。复制时会自动附加同一标识。</p>
      </Surface>
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
      <PrimaryButton onClick={() => void copy()}>{copied ? "已复制" : "复制开场白"}</PrimaryButton>
      <div className={styles.buttonRow}><SecondaryButton disabled={busy} onClick={() => void save()}>{body === savedBody ? "已保存" : "保存修改"}</SecondaryButton><SecondaryButton disabled={busy} onClick={() => void rewrite()}>AI 改写</SecondaryButton></div>
      <Surface>
        <div className={styles.compactStack}>
          <h2 className={styles.sectionTitle}>准备投下一个岗位？</h2>
          <p className={styles.intro}>当前修改会先保存，再进入一份全新的岗位草稿。</p>
          <PrimaryButton disabled={busy} onClick={() => void leave("/jobs/new")}>继续投下一个岗位</PrimaryButton>
          <SecondaryButton disabled={busy} onClick={() => void leave("/")}>返回首页</SecondaryButton>
        </div>
      </Surface>
    </div>
  );
}
