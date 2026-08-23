import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../app/AuthProvider";
import { callApi } from "../../lib/api";
import {
  requestEmailVerification,
  signInWithEmailCode,
  type EmailOtpChallenge,
} from "../../lib/cloudbase";
import { isValidEmail, isValidEmailCode, normalizeEmail } from "../../lib/email-auth";
import type { AuthStatus } from "../../lib/models";
import { createRequestId } from "../../lib/request-id";
import { ErrorNotice, PrimaryButton, Surface } from "../../ui/ui";
import styles from "../Feature.module.css";

export function LoginPage(): React.JSX.Element {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [otpChallenge, setOtpChallenge] = useState<EmailOtpChallenge>();
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(): Promise<void> {
    if (!isValidEmail(email)) {
      setError("请输入有效的邮箱地址。");
      return;
    }
    setSending(true);
    setError("");
    try {
      setOtpChallenge(await requestEmailVerification(normalizeEmail(email)));
      setCooldown(60);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证码发送失败，请重试。");
    } finally {
      setSending(false);
    }
  }

  async function submit(): Promise<void> {
    if (!accepted) {
      setError("请先阅读并同意用户协议与隐私政策。");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      let status = auth.status;
      if (!auth.authenticated) {
        if (!isValidEmail(email) || !isValidEmailCode(code) || otpChallenge === undefined) {
          throw new Error("请先获取并输入 6 位邮箱验证码（字母或数字）。");
        }
        await signInWithEmailCode(code.trim(), otpChallenge);
        status = await callApi<AuthStatus>("auth.status", {});
      }
      if (status === undefined) {
        throw new Error("账号状态尚未加载，请稍后重试。");
      }
      if (status.accessState === "disabled") {
        await auth.refresh();
        return;
      }
      if (status.accessState === "agreement_required") {
        await callApi("agreement.accept", status.currentVersions, createRequestId());
      }
      await auth.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证失败，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

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
          {!auth.authenticated ? (
            <>
            <label className={styles.field}>
              <span>邮箱</span>
              <input
                autoCapitalize="none"
                autoComplete="email"
                className={styles.input}
                inputMode="email"
                maxLength={254}
                onChange={(event) => { setEmail(event.target.value); setOtpChallenge(undefined); setCode(""); }}
                placeholder="输入邮箱地址"
                type="email"
                value={email}
              />
            </label>
            <div className={`${styles.buttonRow} ${styles.verificationRow}`}>
              <label className={styles.field}>
                <span>验证码</span>
                <input
                  autoCapitalize="none"
                  autoComplete="one-time-code"
                  className={styles.input}
                  inputMode="text"
                  maxLength={6}
                  onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/giu, "").slice(0, 6))}
                  placeholder="6 位字母或数字"
                  value={code}
                />
              </label>
              <PrimaryButton className={styles.verificationButton} disabled={sending || cooldown > 0 || !isValidEmail(email)} onClick={() => void sendCode()}>
                {sending ? "发送中…" : cooldown > 0 ? `${cooldown} 秒` : "发送验证码"}
              </PrimaryButton>
            </div>
            </>
          ) : null}
          <div className={styles.checkRow}>
            <input
              checked={accepted}
              id="agreement-accepted"
              onChange={(event) => setAccepted(event.target.checked)}
              type="checkbox"
            />
            <span>
              <label htmlFor="agreement-accepted">我已阅读并同意</label>{" "}
              <Link className={styles.linkText} to="/legal">《用户协议》《隐私政策》和《AI 服务说明》</Link>。
            </span>
          </div>
          {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
          <PrimaryButton disabled={submitting || (!auth.authenticated && (otpChallenge === undefined || !isValidEmailCode(code)))} onClick={() => void submit()}>
            {submitting ? "正在登录…" : auth.authenticated ? "同意并继续" : "验证并进入"}
          </PrimaryButton>
          <p className={styles.meta}>登录成功后，同一浏览器会自动恢复账号；清除浏览器数据后可再次使用邮箱验证码登录。</p>
        </div>
      </Surface>
    </div>
  );
}
