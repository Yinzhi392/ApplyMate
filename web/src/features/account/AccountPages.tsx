import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../../app/AuthProvider";
import { callApi } from "../../lib/api";
import { renderWebLegalText, WEB_CONTACT_EMAIL, WEB_EFFECTIVE_DATE, WEB_LEGAL_DOCUMENTS } from "../../lib/legal-documents";
import { createRequestId } from "../../lib/request-id";
import { ErrorNotice, Header, PrimaryButton, SecondaryButton, Surface } from "../../ui/ui";
import styles from "../Feature.module.css";

interface UserView {
  user: {
    agreements: Record<string, { acceptedAt?: string; version?: string }>;
    isAdmin: boolean;
    preferenceText: string;
    remainingQuota: number;
  };
}

export function PreferencesPage(): React.JSX.Element {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["user.get"], queryFn: () => callApi<UserView>("user.get", {}) });
  const [draft, setDraft] = useState<string | undefined>();
  const [message, setMessage] = useState("");
  const mutation = useMutation({
    mutationFn: () => callApi("user.updatePreferences", { preferenceText: draft ?? query.data?.user.preferenceText ?? "" }, createRequestId()),
    onSuccess: async () => { setMessage("偏好已保存"); await client.invalidateQueries({ queryKey: ["user.get"] }); },
    onError: (cause) => setMessage(cause instanceof Error ? cause.message : "保存失败。"),
  });
  return (
    <div className={styles.stack}>
      <Header eyebrow="长期生效" title="求职偏好" />
      <p className={styles.intro}>例如远程、到岗时间、每周天数和实习周期。最多 500 字，后续每个岗位都会参考。</p>
      <Surface><label className={styles.field}><span>偏好内容</span><textarea className={styles.textarea} maxLength={500} onChange={(event) => { setDraft(event.target.value); setMessage(""); }} placeholder="例如：目前人在海外，只考虑远程；每周可到岗 3–4 天，可连续实习 3–6 个月。" value={draft ?? query.data?.user.preferenceText ?? ""} /></label></Surface>
      {message === "" ? null : <p className={styles.intro}>{message}</p>}
      <PrimaryButton disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "保存中…" : "保存偏好"}</PrimaryButton>
    </div>
  );
}

export function AccountPage(): React.JSX.Element {
  const navigate = useNavigate();
  const auth = useAuth();
  const query = useQuery({ queryKey: ["user.get"], queryFn: () => callApi<UserView>("user.get", {}) });
  const [error, setError] = useState("");
  async function deleteAccount(): Promise<void> {
    if (!window.confirm("账号删除不可撤销，当前浏览器之后也无法恢复数据。继续吗？")) return;
    try {
      const requested = await callApi<{ confirmationToken: string }>("user.delete", { operation: "request" }, createRequestId());
      if (!window.confirm("最后确认：将在 24 小时内删除全部可关联数据，仅保留匿名聚合指标。")) return;
      await callApi("user.delete", { operation: "confirm", confirmationToken: requested.confirmationToken }, createRequestId());
      await auth.refresh();
      navigate("/login", { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "删除申请失败。") }
  }
  return (
    <div className={styles.stack}>
      <Header eyebrow="当前邮箱账号" title="我的 👋" />
      <p className={styles.intro}>资料、偏好与数据权利都在这里。</p>
      <section><h2 className={styles.sectionTitle}>求职资料</h2><Surface><div className={styles.list}>
        <Link className={styles.listRow} to="/resumes"><span className={styles.icon}>📄</span><div className={styles.rowMain}><strong>简历管理</strong><span>核对事实、设置默认简历</span></div><span className={styles.rowAction}>管理 →</span></Link>
        <Link className={styles.listRow} to="/preferences"><span className={styles.icon}>🎯</span><div className={styles.rowMain}><strong>求职偏好</strong><span>{query.data?.user.preferenceText || "还未补充长期偏好"}</span></div><span className={styles.rowAction}>编辑 →</span></Link>
      </div></Surface></section>
      <section><h2 className={styles.sectionTitle}>使用情况</h2><Surface><div className={styles.list}>
        <div className={styles.listRow}><span className={styles.icon}>⚡</span><div className={styles.rowMain}><strong>今日生成额度</strong><span>北京时间每日零点重置</span></div><span className={styles.rowAction}>剩余 {query.data?.user.remainingQuota ?? "—"} 次</span></div>
      </div></Surface></section>
      <section><h2 className={styles.sectionTitle}>隐私与账号</h2><Surface><div className={styles.list}>
        <Link className={styles.listRow} to="/legal"><span className={styles.icon}>🔒</span><div className={styles.rowMain}><strong>协议与隐私</strong><span>用户协议、隐私政策和 AI 服务说明</span></div><span className={styles.rowAction}>查看 →</span></Link>
        {query.data?.user.isAdmin ? <Link className={styles.listRow} to="/admin"><span className={styles.icon}>🧭</span><div className={styles.rowMain}><strong>管理员</strong><span>用户、额度与测试指标</span></div><span className={styles.rowAction}>进入 →</span></Link> : null}
        <button className={styles.listRow} onClick={() => void deleteAccount()} type="button"><span className={styles.icon}>🗑️</span><div className={styles.rowMain}><strong className={styles.dangerText}>删除账号</strong><span>立即停用，并在 24 小时内删除可关联数据</span></div><span className={`${styles.rowAction} ${styles.dangerText}`}>删除 →</span></button>
      </div></Surface></section>
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
    </div>
  );
}

export function LegalPage(): React.JSX.Element {
  const auth = useAuth();
  const user = useQuery({
    enabled: auth.status?.accessState === "active",
    queryKey: ["user.get", "legal"],
    queryFn: () => callApi<UserView>("user.get", {}),
  });
  const acceptedAt = user.data?.user.agreements.userAgreement?.acceptedAt;
  return (
    <div className={styles.stack}>
      <Header eyebrow="小范围测试版" title="协议与隐私" />
      <p className={styles.intro}>生效日期：{WEB_EFFECTIVE_DATE} · 联系邮箱：{WEB_CONTACT_EMAIL}</p>
      {WEB_LEGAL_DOCUMENTS.map((document) => (
        <Surface key={document.title}>
          <h2 className={styles.sectionTitle}>{document.title}</h2>
          <p className={styles.meta}>版本：{document.version}</p>
          <div className={styles.compactStack}>
            {document.sections.map((section) => (
              <div key={section.heading}>
                <h3 className={styles.legalHeading}>{section.heading}</h3>
                <p className={styles.legalBody}>{section.body}</p>
              </div>
            ))}
          </div>
        </Surface>
      ))}
      <Surface><p className={styles.meta}>当前身份</p><p className={styles.legalBody}>服务端用户协议版本：{auth.status?.currentVersions.userAgreementVersion ?? "加载中"}<br />服务端隐私政策版本：{auth.status?.currentVersions.privacyPolicyVersion ?? "加载中"}<br />同意时间：{acceptedAt === undefined ? "尚未同意或当前身份不可用" : new Date(acceptedAt).toLocaleString("zh-CN")}</p></Surface>
      <SecondaryButton onClick={() => void navigator.clipboard.writeText(renderWebLegalText())}>复制全文</SecondaryButton>
    </div>
  );
}

interface AdminStats { [key: string]: unknown }

export function AdminPage(): React.JSX.Element {
  const auth = useAuth();
  const query = useQuery({
    enabled: auth.status?.isAdmin === true,
    queryKey: ["admin.stats"],
    queryFn: () => callApi<AdminStats>("admin.stats", {}),
  });
  const [error, setError] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [message, setMessage] = useState("");
  async function setUserEnabled(enabled: boolean): Promise<void> {
    try {
      await callApi(
        "admin.userSetEnabled",
        { targetUserId, enabled, reason: "Web 邮箱测试管理员操作" },
        createRequestId(),
      );
      setError("");
      setMessage(enabled ? "用户已启用" : "用户已停用");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败。");
    }
  }
  if (auth.status?.isAdmin !== true) {
    return (
      <div className={styles.stack}>
        <Header eyebrow="权限受限" title="管理员" />
        <ErrorNotice>当前邮箱身份不是管理员，无法访问此页面。</ErrorNotice>
        <Link className={styles.inlineLink} to="/">返回首页</Link>
      </div>
    );
  }
  return (
    <div className={styles.stack}>
      <Header eyebrow="隐藏入口" title="管理员" />
      <Surface><div className={styles.compactStack}><h2 className={styles.sectionTitle}>用户操作</h2><label className={styles.field}><span>内部 userId</span><input className={styles.input} onChange={(event) => setTargetUserId(event.target.value.trim())} placeholder="user_…" value={targetUserId} /></label><div className={styles.buttonRow}><SecondaryButton onClick={() => void setUserEnabled(true)}>启用用户</SecondaryButton><SecondaryButton onClick={() => void setUserEnabled(false)}>停用用户</SecondaryButton><SecondaryButton onClick={() => void callApi("admin.quotaAdjust", { targetUserId, increase: 5, reason: "Web 邮箱测试临时额度" }, createRequestId()).then(() => setMessage("今日临时增加 5 次")).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "操作失败。"))}>增加 5 次</SecondaryButton></div></div></Surface>
      <Surface><h2 className={styles.sectionTitle}>测试指标</h2><pre className={styles.legalBody}>{query.isLoading ? "加载中…" : JSON.stringify(query.data ?? {}, null, 2)}</pre></Surface>
      {error === "" ? null : <ErrorNotice>{error}</ErrorNotice>}
      {message === "" ? null : <p className={styles.intro}>{message}</p>}
    </div>
  );
}
