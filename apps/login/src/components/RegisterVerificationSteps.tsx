import type { FormEvent } from "react";
import { ArrowRight, AtSign, CheckCircle2, ShieldCheck } from "lucide-react";
import { usePriestessTranslation } from "@priestess/shared";
import { TurnstileWidget } from "./TurnstileWidget";

type InvitationStepProps = {
  busy: boolean;
  canSubmit: boolean;
  disabled: boolean;
  inviteCode: string;
  inviteError?: string;
  onInviteCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTurnstileError: () => void;
  onTurnstileExpire: () => void;
  onTurnstileToken: (token: string) => void;
  resetSignal: number;
  siteKey: string;
  turnstileError?: string;
};

export function RegisterInvitationStep({
  busy,
  canSubmit,
  disabled,
  inviteCode,
  inviteError,
  onInviteCodeChange,
  onSubmit,
  onTurnstileError,
  onTurnstileExpire,
  onTurnstileToken,
  resetSignal,
  siteKey,
  turnstileError,
}: InvitationStepProps) {
  const { t } = usePriestessTranslation("login");

  return (
    <form className="login-form" noValidate onSubmit={onSubmit}>
      <label className="field-group">
        <span className="field-group__label">{t("邀请码")}</span>
        <span className={`text-field ${inviteError ? "text-field--error" : ""}`}>
          <ShieldCheck aria-hidden="true" size={20} strokeWidth={1.8} />
          <input
            aria-describedby={inviteError ? "register-invite-code-error" : undefined}
            aria-invalid={Boolean(inviteError)}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onInviteCodeChange(event.target.value)}
            placeholder={t("输入邀请码")}
            type="text"
            value={inviteCode}
          />
        </span>
        {inviteError && <span className="field-error" id="register-invite-code-error">{inviteError}</span>}
      </label>

      <label className="field-group">
        <span className="field-group__label">{t("Cloudflare 人机验证")}</span>
        <TurnstileWidget
          disabled={disabled || !siteKey}
          onError={onTurnstileError}
          onExpire={onTurnstileExpire}
          onToken={onTurnstileToken}
          resetSignal={resetSignal}
          siteKey={siteKey}
        />
        {turnstileError && <span className="field-error">{turnstileError}</span>}
      </label>

      <button className="primary-button" disabled={!canSubmit} type="submit">
        <span>{busy ? t("正在校验") : siteKey ? t("校验邀请码") : t("等待人机验证配置")}</span>
        <ShieldCheck aria-hidden="true" size={19} strokeWidth={1.8} />
      </button>
    </form>
  );
}

type VerificationStepProps = {
  busy: boolean;
  code: string;
  codeError?: string;
  disabled: boolean;
  identityType: "email" | "phone";
  onCodeChange: (value: string) => void;
  onSend: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  requestReady: boolean;
  resendCooldownSeconds: number;
  verified: boolean;
};

export function RegisterVerificationStep({
  busy,
  code,
  codeError,
  disabled,
  identityType,
  onCodeChange,
  onSend,
  onSubmit,
  requestReady,
  resendCooldownSeconds,
  verified,
}: VerificationStepProps) {
  const { t } = usePriestessTranslation("login");
  const resendLabel = busy
    ? t("发送中")
    : resendCooldownSeconds > 0
      ? t("{{seconds}} 秒后可重发", { seconds: resendCooldownSeconds })
      : requestReady
        ? t("重新发送验证码")
        : t("发送验证码");

  return (
    <form className="login-form" noValidate onSubmit={onSubmit}>
      {verified ? (
        <p className="signup-line" style={{ justifyContent: "flex-start", marginTop: 0 }}>
          <CheckCircle2 aria-hidden="true" size={19} strokeWidth={1.8} />
          {t("账号验证码已确认")}
        </p>
      ) : (
        <>
          <label className="field-group">
            <span className="field-group__label">{identityType === "email" ? t("邮箱验证码") : t("手机验证码")}</span>
            <span className={`text-field ${codeError ? "text-field--error" : ""}`}>
              <AtSign aria-hidden="true" size={20} strokeWidth={1.8} />
              <input
                aria-describedby={codeError ? "register-verification-code-error" : undefined}
                aria-invalid={Boolean(codeError)}
                autoComplete="one-time-code"
                disabled={disabled}
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder={t("请输入 6 位数字验证码")}
                type="text"
                value={code}
              />
            </span>
            {codeError && <span className="field-error" id="register-verification-code-error">{codeError}</span>}
          </label>

          <button
            className="secondary-button"
            disabled={disabled || resendCooldownSeconds > 0}
            onClick={onSend}
            type="button"
          >
            {resendLabel}
          </button>
        </>
      )}

      <button className="primary-button" disabled={disabled} type="submit">
        <span>{verified ? t("继续设置密码") : t("验证并继续")}</span>
        <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
      </button>
    </form>
  );
}
