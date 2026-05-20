import { FormEvent, useMemo, useRef, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { BrandMark, FloatingBackdrop, confirmPasswordReset, getPriestessApiErrorMessage } from "@priestess/shared";
import "./PasswordRecovery.css";

type ResetPasswordPageProps = {
  onNavigateToLogin: () => void;
  onNotice: (message: string) => void;
};

export function ResetPasswordPage({ onNavigateToLogin, onNotice }: ResetPasswordPageProps) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestId = params.get("request_id") ?? "";
  const token = params.get("token") ?? "";
  const hasLink = Boolean(requestId && token);

  const submit = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = passwordRef.current?.value ?? "";
    const confirmation = confirmRef.current?.value ?? "";
    if (!hasLink) {
      setError("重置链接无效或缺少参数");
      return;
    }
    if (password.length < 10) {
      setError("新密码至少需要 10 个字符");
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirmation) {
      setError("两次输入的新密码不一致");
      confirmRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await confirmPasswordReset({ password, requestId, token });
      if (passwordRef.current) passwordRef.current.value = "";
      if (confirmRef.current) confirmRef.current.value = "";
      window.history.replaceState(null, "", "/auth-ui/login");
      onNotice("密码已重置，请重新登录");
      onNavigateToLogin();
    } catch (error) {
      setError(getPriestessApiErrorMessage(error, "密码重置失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="recovery-page">
      <FloatingBackdrop />
      <header className="topbar recovery-page__topbar" aria-label="Priestess">
        <BrandMark size="sm" />
        <button className="topbar__action" onClick={onNavigateToLogin} type="button">返回登录</button>
      </header>
      <section className="recovery-card" aria-labelledby="reset-password-title">
        <span className="recovery-dialog__icon" aria-hidden="true">
          <KeyRound size={24} strokeWidth={1.8} />
        </span>
        <div className="recovery-dialog__heading">
          <h1 id="reset-password-title">设置新密码</h1>
          <p>重置链接只能使用一次；成功后旧登录会话会失效。</p>
        </div>
        <form className="recovery-form" onSubmit={submit}>
          <label>
            <span>新密码</span>
            <input autoComplete="new-password" disabled={!hasLink} ref={passwordRef} type="password" />
          </label>
          <label>
            <span>确认新密码</span>
            <input autoComplete="new-password" disabled={!hasLink} ref={confirmRef} type="password" />
          </label>
          {error || !hasLink ? <div className="recovery-error" role="status">{error || "重置链接无效或缺少参数"}</div> : null}
          <button className="primary-button" disabled={isSubmitting || !hasLink} type="submit">
            <span>{isSubmitting ? "重置中" : "重置密码"}</span>
            <ArrowRight aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
        </form>
      </section>
    </main>
  );
}
