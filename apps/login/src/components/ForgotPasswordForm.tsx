import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, KeyRound, UserRound } from "lucide-react";
import { getPriestessApiErrorMessage, requestPasswordReset, usePriestessTranslation } from "@priestess/shared";
import { startLoginTransitionOverlay } from "./LoginTransitionOverlay";
import { readTurnstileSiteKey } from "./TurnstileWidget";

type ForgotPasswordFormProps = {
  defaultIdentity: string;
  disabled: boolean;
  onBackToLogin: () => void;
  onNotice: (message: string) => void;
};

export function ForgotPasswordForm({ defaultIdentity, disabled, onBackToLogin, onNotice }: ForgotPasswordFormProps) {
  const { t } = usePriestessTranslation("login");
  const identityRef = useRef<HTMLInputElement>(null);
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState("");
  const isFormLocked = disabled || isSubmitting;

  useEffect(() => {
    setError("");
    setDevResetUrl("");
    setIdentity(defaultIdentity.trim());
  }, [defaultIdentity]);

  useEffect(() => {
    if (isFormLocked) return undefined;

    // 卡片切换期间表单会被锁住，等动画解锁后再聚焦，避免焦点落到 disabled 输入框上。
    const focusTimer = window.setTimeout(() => {
      identityRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [isFormLocked]);

  const submit = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked) return;

    const normalizedIdentity = identity.trim();
    if (!normalizedIdentity) {
      setError(t("请输入账号或邮箱"));
      identityRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError("");
    setDevResetUrl("");
    const controller = startLoginTransitionOverlay({
      description: t("验证通过后会返回找回密码表单。"),
      loadingTitle: t("请完成人机验证"),
      title: t("正在准备重置申请"),
    });
    try {
      const siteKey = readTurnstileSiteKey();
      if (!siteKey) {
        throw new Error(t("验证码组件未配置，请联系管理员"));
      }
      const turnstileToken = await controller.challenge({
        challengeAction: "password_reset",
        challengeDescription: t("验证通过后会立即回到当前表单并发送重置邮件。"),
        challengeSiteKey: siteKey,
        challengeTitle: t("请完成人机验证"),
      });
      controller.dismiss();
      const result = await requestPasswordReset(normalizedIdentity, turnstileToken);
      setDevResetUrl(result.devResetUrl);
      onNotice(result.devResetUrl ? t("重置链接已生成") : t("如果账号存在，重置请求已受理"));
    } catch (error) {
      controller.dismiss();
      setError(getPriestessApiErrorMessage(error, t("重置请求失败")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="login-card__mark" aria-hidden="true">
        <KeyRound size={38} strokeWidth={1.65} />
      </div>
      <div className="login-card__heading">
        <h1 id="forgot-password-title">{t("找回密码")}</h1>
        <p>{t("提交账号后，系统会创建一次性重置申请；如果账号可用，会发送后续处理指引。")}</p>
      </div>

      <form className="login-form" noValidate onSubmit={submit}>
        <label className="field-group">
          <span className="field-group__label">{t("账号或邮箱")}</span>
          <span className={`text-field ${error ? "text-field--error" : ""}`}>
            <UserRound aria-hidden="true" size={20} strokeWidth={1.8} />
            <input
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "forgot-password-error" : undefined}
              autoComplete="username"
              disabled={isFormLocked}
              name="identity"
              onChange={(event) => {
                setIdentity(event.target.value);
                if (error) setError("");
              }}
              placeholder="mikael@example.com"
              ref={identityRef}
              type="text"
              value={identity}
            />
          </span>
          {error ? <span className="field-error" id="forgot-password-error" role="status">{error}</span> : null}
        </label>

        <button className="primary-button" disabled={isFormLocked} type="submit">
          <span>{isSubmitting ? t("提交中") : t("发送重置申请")}</span>
          <ArrowRight aria-hidden="true" size={20} strokeWidth={1.8} />
        </button>

        {devResetUrl ? (
          <button className="secondary-button" disabled={isFormLocked} onClick={() => window.location.assign(devResetUrl)} type="button">
            {t("打开重置链接")}
          </button>
        ) : null}
      </form>

      <p className="signup-line">
        {t("想起来了？")}
        <button className="text-link signup-line__button" disabled={isFormLocked} onClick={onBackToLogin} type="button">
          <ArrowLeft aria-hidden="true" size={15} strokeWidth={1.9} />
          <span>{t("返回登录")}</span>
        </button>
      </p>
    </>
  );
}
