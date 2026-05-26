import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, X } from "lucide-react";
import { usePriestessTranslation } from "@priestess/shared";
import { AccountDialogShell } from "./AccountDialogShell";

type PasskeySetupDialogProps = {
  defaultName: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  open: boolean;
};

export function PasskeySetupDialog({ defaultName, isSubmitting, onClose, onSubmit, open }: PasskeySetupDialogProps) {
  const { t } = usePriestessTranslation("account");
  const [error, setError] = useState("");
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (!open) return;
    setError("");
    setName(defaultName);
  }, [defaultName, open]);

  const close = () => {
    if (isSubmitting) return;
    onClose();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || nextName.length > 80) {
      setError(t("Passkey 名称不能为空，且最多 80 个字符"));
      return;
    }
    setError("");
    onSubmit(nextName);
  };

  return (
    <AccountDialogShell labelledBy="account-passkey-setup-title" open={open}>
        <button aria-label={t("关闭 Passkey 新增弹窗")} className="account-dialog__close" disabled={isSubmitting} onClick={close} type="button">
          <X aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
        <span className="account-dialog__icon account-dialog__icon--secure" aria-hidden="true">
          <KeyRound size={22} strokeWidth={1.8} />
        </span>
        <div>
          <p>{t("安全与登录")}</p>
          <h3 id="account-passkey-setup-title">{t("新增 Passkey")}</h3>
          <span>{t("浏览器会打开系统凭据窗口；完成后 Priestess 会保存验证结果。")}</span>
        </div>
        <form className="account-dialog-form" onSubmit={submit}>
          <label>
            <span>{t("Passkey 名称")}</span>
            <input disabled={isSubmitting} maxLength={80} onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          {error ? <div className="account-dialog-form__error" role="status">{error}</div> : null}
          <div className="account-dialog__actions">
            <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={close} type="button">{t("取消")}</button>
            <button className="account-button account-button--primary" disabled={isSubmitting} type="submit">
              <KeyRound aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{isSubmitting ? t("等待浏览器") : t("继续")}</span>
            </button>
          </div>
        </form>
    </AccountDialogShell>
  );
}
