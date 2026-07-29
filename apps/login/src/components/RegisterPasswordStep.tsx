import type { FormEvent } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { usePriestessTranslation } from "@priestess/shared";

type RegisterPasswordStepProps = {
  confirmation: string;
  confirmationError?: string;
  disabled: boolean;
  onConfirmationChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  password: string;
  passwordError?: string;
};

export function RegisterPasswordStep({
  confirmation,
  confirmationError,
  disabled,
  onConfirmationChange,
  onPasswordChange,
  onSubmit,
  password,
  passwordError,
}: RegisterPasswordStepProps) {
  const { t } = usePriestessTranslation("login");

  return (
    <form className="login-form" noValidate onSubmit={onSubmit}>
      <label className="field-group">
        <span className="field-group__label">{t("密码")}</span>
        <span className={`text-field ${passwordError ? "text-field--error" : ""}`}>
          <KeyRound aria-hidden="true" size={20} strokeWidth={1.8} />
          <input
            aria-describedby={passwordError ? "register-password-error" : undefined}
            aria-invalid={Boolean(passwordError)}
            autoComplete="new-password"
            disabled={disabled}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder={t("设置密码")}
            type="password"
            value={password}
          />
        </span>
        {passwordError && <span className="field-error" id="register-password-error">{passwordError}</span>}
      </label>

      <label className="field-group">
        <span className="field-group__label">{t("确认密码")}</span>
        <span className={`text-field ${confirmationError ? "text-field--error" : ""}`}>
          <KeyRound aria-hidden="true" size={20} strokeWidth={1.8} />
          <input
            aria-describedby={confirmationError ? "register-password-confirm-error" : undefined}
            aria-invalid={Boolean(confirmationError)}
            autoComplete="new-password"
            disabled={disabled}
            onChange={(event) => onConfirmationChange(event.target.value)}
            placeholder={t("再输入一次")}
            type="password"
            value={confirmation}
          />
        </span>
        {confirmationError && <span className="field-error" id="register-password-confirm-error">{confirmationError}</span>}
      </label>

      <button className="primary-button" disabled={disabled} type="submit">
        <span>{t("继续")}</span>
        <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
      </button>
    </form>
  );
}
