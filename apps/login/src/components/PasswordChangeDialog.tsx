import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, X } from "lucide-react";
import {
  changeLocalPassword,
  getPriestessApiErrorMessage,
  toHalfWidth,
  usePriestessTranslation,
  type LocalSession,
} from "@priestess/shared";
import { AccountDialogShell } from "./AccountDialogShell";

const PASSWORD_MIN_LENGTH = 12;

type PasswordChangeDialogProps = {
  onChanged: (session: LocalSession) => void;
  onAfterOpen?: () => void;
  onClose: () => void;
  onNotice: (message: string) => void;
  open: boolean;
};

export function PasswordChangeDialog({ onAfterOpen, onChanged, onClose, onNotice, open }: PasswordChangeDialogProps) {
  const { t } = usePriestessTranslation("account");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setConfirmPassword("");
    setCurrentPassword("");
    setError("");
    setIsSubmitting(false);
    setPassword("");
  }, [open]);

  const close = () => {
    if (isSubmitting) return;
    onClose();
  };

  const submit = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!currentPassword) {
      setError(t("请输入当前密码"));
      return;
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(t("新密码至少需要 {{count}} 个字符", { count: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("两次输入的新密码不一致"));
      return;
    }

    setIsSubmitting(true);
    try {
      // 修改密码后以后端返回的新会话为准，避免旧 session 状态继续留在前端。
      const nextSession = await changeLocalPassword({ currentPassword, password });
      onChanged(nextSession);
      onNotice(t("密码已更新"));
      close();
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, t("密码更新失败")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AccountDialogShell labelledBy="account-password-title" onAfterOpen={onAfterOpen} open={open}>
        <button aria-label={t("关闭密码弹窗")} className="account-dialog__close" disabled={isSubmitting} onClick={close} type="button">
          <X aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
        <span className="account-dialog__icon account-dialog__icon--secure" aria-hidden="true">
          <LockKeyhole size={22} strokeWidth={1.8} />
        </span>
        <div>
          <p>{t("安全与登录")}</p>
          <h3 id="account-password-title">{t("修改密码")}</h3>
          <span>{t("密码会立即用于下一次本地登录；建议使用不重复的长密码。")}</span>
        </div>
        <form className="account-dialog-form" onSubmit={submit}>
          <label>
            <span>{t("当前密码")}</span>
            <input
              autoCapitalize="none"
              autoComplete="current-password"
              autoCorrect="off"
              disabled={isSubmitting}
              lang="en"
              onChange={(event) => setCurrentPassword(toHalfWidth(event.target.value))}
              spellCheck={false}
              type="password"
              value={currentPassword}
            />
          </label>
          <label>
            <span>{t("新密码")}</span>
            <input
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect="off"
              disabled={isSubmitting}
              lang="en"
              onChange={(event) => setPassword(toHalfWidth(event.target.value))}
              spellCheck={false}
              type="password"
              value={password}
            />
          </label>
          <label>
            <span>{t("确认新密码")}</span>
            <input
              autoCapitalize="none"
              autoComplete="new-password"
              autoCorrect="off"
              disabled={isSubmitting}
              lang="en"
              onChange={(event) => setConfirmPassword(toHalfWidth(event.target.value))}
              spellCheck={false}
              type="password"
              value={confirmPassword}
            />
          </label>
          {error ? <div className="account-dialog-form__error" role="status">{error}</div> : null}
          <div className="account-dialog__actions">
            <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={close} type="button">{t("取消")}</button>
            <button className="account-button account-button--primary" disabled={isSubmitting} type="submit">
              <LockKeyhole aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{isSubmitting ? t("更新中") : t("保存")}</span>
            </button>
          </div>
        </form>
    </AccountDialogShell>
  );
}
