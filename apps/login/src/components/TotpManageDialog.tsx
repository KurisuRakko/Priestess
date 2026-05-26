import { useEffect, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CircleDashed, KeyRound, RefreshCw, ShieldCheck, X } from "lucide-react";
import {
  confirmLocalTotpSetup,
  createLocalTotpSetup,
  disableLocalTotp,
  getPriestessApiErrorMessage,
  usePriestessTranslation,
  type LocalTotpFactor,
  type LocalTotpSetup,
} from "@priestess/shared";
import { formatDateTime } from "./accountPageFormat";
import { AccountDialogShell } from "./AccountDialogShell";
import "./AccountSecurity.css";

type TotpManageDialogProps = {
  error: string;
  factor: LocalTotpFactor | null;
  isLoading: boolean;
  onChanged: (factor: LocalTotpFactor | null) => void;
  onClose: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => Promise<void> | void;
  open: boolean;
};

export function TotpManageDialog({ error: loadError, factor, isLoading, onChanged, onClose, onNotice, onRefresh, open }: TotpManageDialogProps) {
  const { t } = usePriestessTranslation("account");
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setup, setSetup] = useState<LocalTotpSetup | null>(null);
  const enabled = Boolean(factor?.enabled && !factor.disabledAt);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setDisableCode("");
    setError("");
    setIsSubmitting(false);
    setSetup(null);
  }, [open]);

  const close = () => {
    if (isSubmitting) return;
    onClose();
  };

  const startSetup = async() => {
    setError("");
    setIsSubmitting(true);
    try {
      const nextSetup = await createLocalTotpSetup();
      setSetup(nextSetup);
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, t("无法生成 TOTP 设置")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmSetup = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = normalizeTotpCode(code);
    if (!setup || normalizedCode.length !== 6) {
      setError(t("请输入 6 位动态验证码"));
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      const nextFactor = await confirmLocalTotpSetup({ challengeId: setup.challengeId, code: normalizedCode });
      onChanged(nextFactor);
      onNotice(t("TOTP 已启用"));
      close();
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, t("TOTP 启用失败")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const disable = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedCode = normalizeTotpCode(disableCode);
    if (normalizedCode.length !== 6) {
      setError(t("请输入 6 位动态验证码"));
      return;
    }

    setError("");
    setIsSubmitting(true);
    try {
      await disableLocalTotp(normalizedCode);
      onChanged(null);
      onNotice(t("TOTP 已停用"));
      close();
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, t("TOTP 停用失败")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AccountDialogShell className="account-dialog--wide" labelledBy="account-totp-title" open={open}>
        <button aria-label={t("关闭 TOTP 管理弹窗")} className="account-dialog__close" disabled={isSubmitting} onClick={close} type="button">
          <X aria-hidden="true" size={17} strokeWidth={1.8} />
        </button>
        <span className="account-dialog__icon account-dialog__icon--secure" aria-hidden="true">
          <ShieldCheck size={22} strokeWidth={1.8} />
        </span>
        <div>
          <p>{t("安全与登录")}</p>
          <h3 id="account-totp-title">{t("二步验证")}</h3>
          <span>{t("使用认证器应用生成的动态验证码保护本地登录。")}</span>
        </div>

        {isLoading ? (
          <div className="account-security-empty" role="status">
            <CircleDashed className="is-spinning" size={18} strokeWidth={1.8} />
            <p>{t("正在读取 TOTP 状态")}</p>
          </div>
        ) : loadError ? (
          <div className="account-dialog-form">
            <div className="account-dialog-form__error" role="status">{loadError}</div>
            <div className="account-dialog__actions">
              <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={close} type="button">{t("关闭")}</button>
              <button className="account-button account-button--primary" disabled={isSubmitting} onClick={() => void onRefresh()} type="button">
                <RefreshCw aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>{t("重新读取")}</span>
              </button>
            </div>
          </div>
        ) : enabled ? (
          <form className="account-dialog-form" onSubmit={disable}>
            <div className="account-dialog__facts">
              <div className="account-dialog-fact">
                <span>{t("状态")}</span>
                <strong>{t("已启用")}</strong>
              </div>
              <div className="account-dialog-fact">
                <span>{t("确认时间")}</span>
                <strong>{formatDateTime(factor?.confirmedAt ?? "")}</strong>
              </div>
              <div className="account-dialog-fact">
                <span>{t("最后使用")}</span>
                <strong>{formatDateTime(factor?.lastUsedAt ?? "")}</strong>
              </div>
            </div>
            <label>
              <span>{t("输入动态验证码以停用")}</span>
              <input
                autoComplete="one-time-code"
                disabled={isSubmitting}
                inputMode="numeric"
                maxLength={8}
                onChange={(event) => setDisableCode(event.target.value)}
                value={disableCode}
              />
            </label>
            {error ? <div className="account-dialog-form__error" role="status">{error}</div> : null}
            <div className="account-dialog__actions">
              <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={close} type="button">{t("取消")}</button>
              <button className="account-button account-button--danger" disabled={isSubmitting} type="submit">
                <KeyRound aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>{isSubmitting ? t("停用中") : t("停用 TOTP")}</span>
              </button>
            </div>
          </form>
        ) : setup ? (
          <form className="account-dialog-form" onSubmit={confirmSetup}>
            <div className="account-security-totp-qr">
              <QRCodeSVG value={setup.otpauthUrl} size={172} level="M" />
            </div>
            <span className="account-security-totp-secret">{setup.secret}</span>
            <label>
              <span>{t("认证器应用中的 6 位验证码")}</span>
              <input
                autoComplete="one-time-code"
                disabled={isSubmitting}
                inputMode="numeric"
                maxLength={8}
                onChange={(event) => setCode(event.target.value)}
                value={code}
              />
            </label>
            {error ? <div className="account-dialog-form__error" role="status">{error}</div> : null}
            <div className="account-dialog__actions">
              <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={() => setSetup(null)} type="button">{t("返回")}</button>
              <button className="account-button account-button--primary" disabled={isSubmitting} type="submit">
                <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>{isSubmitting ? t("确认中") : t("确认启用")}</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="account-dialog-form">
            <div className="account-security-empty">
              <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.8} />
              <p>{t("当前没有启用 TOTP。生成密钥后，请用认证器应用扫描二维码并输入验证码。")}</p>
            </div>
            {error ? <div className="account-dialog-form__error" role="status">{error}</div> : null}
            <div className="account-dialog__actions">
              <button className="account-button account-button--quiet" disabled={isSubmitting} onClick={close} type="button">{t("取消")}</button>
              <button className="account-button account-button--primary" disabled={isSubmitting} onClick={startSetup} type="button">
                <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>{isSubmitting ? t("生成中") : t("生成认证器密钥")}</span>
              </button>
            </div>
          </div>
        )}
    </AccountDialogShell>
  );
}

function normalizeTotpCode(value: string) {
  return value.replace(/\s+/g, "").replace(/\D/g, "");
}
