import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, KeyRound, X } from "lucide-react";
import { getPriestessApiErrorMessage, requestPasswordReset } from "@priestess/shared";
import "./PasswordRecovery.css";

type ForgotPasswordDialogProps = {
  defaultIdentity: string;
  isOpen: boolean;
  onClose: () => void;
  onNotice: (message: string) => void;
};

export function ForgotPasswordDialog({ defaultIdentity, isOpen, onClose, onNotice }: ForgotPasswordDialogProps) {
  const identityRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setDevResetUrl("");
    window.setTimeout(() => {
      if (identityRef.current) {
        identityRef.current.value = defaultIdentity.trim();
        identityRef.current.focus();
      }
    }, 0);
  }, [defaultIdentity, isOpen]);

  if (!isOpen) {
    return null;
  }

  const submit = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identity = identityRef.current?.value.trim() ?? "";
    if (!identity) {
      setError("请输入账号或邮箱");
      identityRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError("");
    setDevResetUrl("");
    try {
      const result = await requestPasswordReset(identity);
      setDevResetUrl(result.devResetUrl);
      onNotice(result.devResetUrl ? "本地重置链接已生成" : "如果账号存在，重置请求已受理");
    } catch (error) {
      setError(getPriestessApiErrorMessage(error, "重置请求失败"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="recovery-overlay" role="presentation">
      <section aria-labelledby="forgot-password-title" aria-modal="true" className="recovery-dialog" role="dialog">
        <button aria-label="关闭" className="recovery-dialog__close" onClick={onClose} type="button">
          <X aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
        <span className="recovery-dialog__icon" aria-hidden="true">
          <KeyRound size={24} strokeWidth={1.8} />
        </span>
        <div className="recovery-dialog__heading">
          <h2 id="forgot-password-title">找回密码</h2>
          <p>提交账号后，系统会创建一次性重置申请；生产环境通过邮件发送链接，本地联调会返回开发链接。</p>
        </div>

        <form className="recovery-form" onSubmit={submit}>
          <label>
            <span>账号或邮箱</span>
            <input autoComplete="username" name="identity" ref={identityRef} type="text" />
          </label>
          {error ? <div className="recovery-error" role="status">{error}</div> : null}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            <span>{isSubmitting ? "提交中" : "发送重置申请"}</span>
            <ArrowRight aria-hidden="true" size={20} strokeWidth={1.8} />
          </button>
        </form>

        {devResetUrl ? (
          <button className="secondary-button recovery-dialog__dev-link" onClick={() => window.location.assign(devResetUrl)} type="button">
            打开本地重置链接
          </button>
        ) : null}
      </section>
    </div>
  );
}
