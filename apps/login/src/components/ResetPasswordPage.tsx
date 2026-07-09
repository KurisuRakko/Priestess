import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { BrandMark, FloatingBackdrop, confirmPasswordReset, getPriestessApiErrorMessage, usePriestessTranslation, visitPasswordResetLink } from "@priestess/shared";
import "./PasswordRecovery.css";

type ResetPasswordPageProps = {
  onNavigateToLogin: () => void;
  onNotice: (message: string) => void;
};

const PASSWORD_MIN_LENGTH = 12;

export function ResetPasswordPage({ onNavigateToLogin, onNotice }: ResetPasswordPageProps) {
  const { t } = usePriestessTranslation("login");
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const visitStartedRef = useRef(false);
  const [error, setError] = useState("");
  const [isLinkAccepted, setIsLinkAccepted] = useState(false);
  const [isLinkChecking, setIsLinkChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestId = params.get("request_id") ?? "";
  const token = params.get("token") ?? "";
  const hasLink = Boolean(requestId && token);

  useEffect(() => {
    if (!hasLink || visitStartedRef.current) return;
    visitStartedRef.current = true;
    setIsLinkChecking(true);
    setError("");
    void visitPasswordResetLink({ requestId, token })
      .then(() => {
        setIsLinkAccepted(true);
      })
      .catch((error) => {
        setIsLinkAccepted(false);
        setError(getPriestessApiErrorMessage(error, t("重置链接无效或已过期")));
      })
      .finally(() => setIsLinkChecking(false));
  }, [hasLink, requestId, t, token]);

  const submit = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = passwordRef.current?.value ?? "";
    const confirmation = confirmRef.current?.value ?? "";
    if (!hasLink || !isLinkAccepted) {
      setError(t("重置链接无效或缺少参数"));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("新密码至少需要 {{count}} 个字符", { count: PASSWORD_MIN_LENGTH }));
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirmation) {
      setError(t("两次输入的新密码不一致"));
      confirmRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await confirmPasswordReset({ password, requestId, token });
      if (passwordRef.current) passwordRef.current.value = "";
      if (confirmRef.current) confirmRef.current.value = "";
      onNotice(t("密码已重置，请重新登录"));
      onNavigateToLogin();
    } catch (error) {
      setError(getPriestessApiErrorMessage(error, t("密码重置失败")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="recovery-page">
      <FloatingBackdrop />
      <header className="topbar recovery-page__topbar" aria-label="Priestess">
        <BrandMark size="sm" />
        <button className="topbar__action" onClick={onNavigateToLogin} type="button">{t("返回登录")}</button>
      </header>
      <section className="recovery-card" aria-labelledby="reset-password-title">
        <span className="recovery-dialog__icon" aria-hidden="true">
          <KeyRound size={24} strokeWidth={1.8} />
        </span>
        <div className="recovery-dialog__heading">
          <h1 id="reset-password-title">{t("设置新密码")}</h1>
          <p>{t("重置链接 10 分钟内有效，最多打开 2 次；成功后旧登录会话会失效。")}</p>
        </div>
        <form className="recovery-form" onSubmit={submit}>
          <label>
            <span>{t("新密码")}</span>
            <input autoComplete="new-password" disabled={!isLinkAccepted || isLinkChecking} ref={passwordRef} type="password" />
          </label>
          <label>
            <span>{t("确认新密码")}</span>
            <input autoComplete="new-password" disabled={!isLinkAccepted || isLinkChecking} ref={confirmRef} type="password" />
          </label>
          {error || !hasLink || isLinkChecking ? <div className="recovery-error" role="status">{error || (isLinkChecking ? t("正在校验重置链接") : t("重置链接无效或缺少参数"))}</div> : null}
          <button className="primary-button" disabled={isSubmitting || isLinkChecking || !isLinkAccepted} type="submit">
            <span>{isSubmitting ? t("重置中") : isLinkChecking ? t("校验中") : t("重置密码")}</span>
            <ArrowRight aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
        </form>
      </section>
    </main>
  );
}
