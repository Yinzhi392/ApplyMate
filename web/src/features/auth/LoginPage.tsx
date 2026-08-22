import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../app/AuthProvider";
import { callApi } from "../../lib/api";
import { createRequestId } from "../../lib/request-id";
import { ErrorNotice, PrimaryButton, Surface } from "../../ui/ui";
import styles from "../Feature.module.css";

export function LoginPage(): React.JSX.Element {
  const auth = useAuth();
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(): Promise<void> {
    if (!accepted) {
      setError("请先阅读并同意用户协议与隐私政策。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const versions = auth.status?.currentVersions;
      if (versions === undefined) {
        throw new Error("协议版本尚未加载，请稍后重试。");
      }
      await callApi("agreement.accept", versions, createRequestId());
      if (auth.status?.inviteRequired === true && !auth.status.isAdmin) {
        await callApi("invite.activate", { code: code.trim() }, createRequestId());
      }
      await auth.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  const needsInvite = auth.status?.inviteRequired === true && !auth.status.isAdmin;
  if (auth.status?.accessState === "disabled") {
    return (
      <div className={styles.stack}>
        <section className={styles.brand}>
          <span aria-hidden="true" className={styles.brandMark}>◔</span>
          <h1>当前账号已停用</h1>
          <p>该浏览器身份暂时无法继续使用。若已申请删除，关联数据会在 24 小时内清理。</p>
        </section>
        <Surface>
          <div className={styles.compactStack}>
            <p className={styles.intro}>如需了解数据处理方式，请查看协议与隐私说明，或联系 applymate67@gmail.com。</p>
            <Link className={styles.linkText} to="/legal">查看协议与隐私 →</Link>
          </div>
        </Surface>
      </div>
    );
  }
  return (
    <div className={styles.stack}>
      <section className={styles.brand}>
        <span aria-hidden="true" className={styles.brandMark}>◔</span>
        <h1>把真实经历，写进每一次开场</h1>
        <p>上传一次简历，之后提交岗位截图或文字，生成有事实依据的专属开场白。</p>
      </section>
      <Surface>
        <div className={styles.compactStack}>
          {needsInvite ? (
            <label className={styles.field}>
              <span>邀请码</span>
              <input
                autoCapitalize="characters"
                className={styles.input}
                maxLength={32}
                onChange={(event) => setCode(event.target.value)}
                placeholder="输入 8 至 32 位邀请码"
                value={code}
              />
            </label>
          ) : null}
          <label className={styles.checkRow}>
            <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
            <span>我已阅读并同意 <Link className={styles.linkText} to="/legal">《用户协议》《隐私政策》和《AI 服务说明》</Link>。</span>
          </label>
          {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
          <PrimaryButton disabled={submitting || (needsInvite && code.trim().length < 8)} onClick={() => void submit()}>
            {submitting ? "正在验证…" : needsInvite ? "验证并进入" : "同意并继续"}
          </PrimaryButton>
          <p className={styles.meta}>身份只保存在当前浏览器。清除浏览器数据后，需要新邀请码并从空账号开始。</p>
        </div>
      </Surface>
    </div>
  );
}
