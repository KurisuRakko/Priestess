import { useEffect, useState, type FormEvent } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { CircleDashed, KeyRound, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import {
  createLocalPasskeyRegistrationOptions,
  deleteLocalPasskey,
  getPriestessApiErrorMessage,
  renameLocalPasskey,
  translatePriestess,
  verifyLocalPasskeyRegistration,
  usePriestessTranslation,
  type LocalPasskey,
} from "@priestess/shared";
import {
  formatDateTime,
  formatPasskeyBackup,
  formatPasskeyDevice,
  formatPasskeyStatus,
  formatPasskeyTransports,
  shortenCredentialId,
} from "./accountPageFormat";
import { AccountDialogShell } from "./AccountDialogShell";
import { PasskeySetupDialog } from "./PasskeySetupDialog";
import "./AccountSecurity.css";

type PasskeyManageDialogProps = {
  error: string;
  isLoading: boolean;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
  onNotice: (message: string) => void;
  open: boolean;
  passkeys: LocalPasskey[];
};

export function PasskeyManageDialog({ error, isLoading, onChanged, onClose, onNotice, open, passkeys }: PasskeyManageDialogProps) {
  const { t } = usePriestessTranslation("account");
  const [deletingPasskeyId, setDeletingPasskeyId] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [renamingPasskeyId, setRenamingPasskeyId] = useState("");

  useEffect(() => {
    if (!open) return;
    setDeletingPasskeyId("");
    setIsRegistering(false);
    setIsSetupOpen(false);
    setRenamingPasskeyId("");
  }, [open]);

  const close = () => {
    if (isRegistering || deletingPasskeyId || renamingPasskeyId) return;
    onClose();
  };

  const createPasskey = async(name: string) => {
    if (isRegistering) return;
    setIsRegistering(true);
    try {
      const result = await createLocalPasskeyRegistrationOptions({ name });
      // WebAuthn options 由后端签发，前端只交给浏览器凭据 API 并回传响应。
      const response = await startRegistration({
        optionsJSON: result.options as Parameters<typeof startRegistration>[0]["optionsJSON"],
      });
      await verifyLocalPasskeyRegistration({
        challengeId: result.challengeId,
        name,
        response,
      });
      await onChanged();
      setIsSetupOpen(false);
      onNotice(t("Passkey 已新增"));
    } catch (requestError) {
      onNotice(getPriestessApiErrorMessage(requestError, t("Passkey 新增失败")));
    } finally {
      setIsRegistering(false);
    }
  };

  const renamePasskey = async(passkey: LocalPasskey, name: string) => {
    const nextName = name.trim();
    if (!nextName || nextName.length > 80) {
      onNotice(t("Passkey 名称不能为空，且最多 80 个字符"));
      return;
    }
    if (nextName === passkey.name) {
      onNotice(t("Passkey 名称没有变化"));
      return;
    }

    setRenamingPasskeyId(passkey.credentialId);
    try {
      await renameLocalPasskey(passkey.credentialId, nextName);
      await onChanged();
      onNotice(t("Passkey 已重命名"));
    } catch (requestError) {
      onNotice(getPriestessApiErrorMessage(requestError, t("Passkey 重命名失败")));
    } finally {
      setRenamingPasskeyId("");
    }
  };

  const disablePasskey = async(passkey: LocalPasskey) => {
    setDeletingPasskeyId(passkey.credentialId);
    try {
      await deleteLocalPasskey(passkey.credentialId);
      await onChanged();
      onNotice(t("Passkey 已禁用"));
    } catch (requestError) {
      onNotice(getPriestessApiErrorMessage(requestError, t("Passkey 禁用失败")));
    } finally {
      setDeletingPasskeyId("");
    }
  };

  const isBusy = isRegistering || Boolean(deletingPasskeyId || renamingPasskeyId);

  return (
    <>
      <AccountDialogShell className="account-dialog--wide" labelledBy="account-passkey-manage-title" open={open}>
          <button aria-label={t("关闭 Passkey 管理弹窗")} className="account-dialog__close" disabled={isBusy} onClick={close} type="button">
            <X aria-hidden="true" size={17} strokeWidth={1.8} />
          </button>
          <span className="account-dialog__icon account-dialog__icon--secure" aria-hidden="true">
            <KeyRound size={22} strokeWidth={1.8} />
          </span>
          <div>
            <p>{t("安全与登录")}</p>
            <h3 id="account-passkey-manage-title">{t("Passkey 与安全密钥")}</h3>
            <span>{t("这里只管理账户服务确认属于当前用户的 Passkey。")}</span>
          </div>
          <div className="account-dialog__actions">
            <button className="account-button account-button--quiet" disabled={isLoading || isBusy} onClick={() => void onChanged()} type="button">
              <RefreshCw aria-hidden="true" className={isLoading ? "is-spinning" : ""} size={17} strokeWidth={1.8} />
              <span>{t("刷新")}</span>
            </button>
            <button className="account-button account-button--primary" disabled={isLoading || isBusy} onClick={() => setIsSetupOpen(true)} type="button">
              <KeyRound aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{t("新增 Passkey")}</span>
            </button>
          </div>

          {error ? <div className="account-dialog-form__error" role="status">{error}</div> : null}
          {isLoading ? (
            <div className="account-security-empty" role="status">
              <CircleDashed className="is-spinning" size={18} strokeWidth={1.8} />
              <p>{t("正在读取 Passkey")}</p>
            </div>
          ) : null}
          {!isLoading && passkeys.length === 0 && !error ? (
            <div className="account-security-empty">
              <KeyRound aria-hidden="true" size={18} strokeWidth={1.8} />
              <p>{t("暂无 Passkey；可以继续使用密码登录。")}</p>
            </div>
          ) : null}

          <div className="account-security-dialog-list">
            {passkeys.map((passkey) => (
              <PasskeyManageCard
                busy={isBusy}
                deleting={deletingPasskeyId === passkey.credentialId}
                key={passkey.credentialId}
                onDelete={disablePasskey}
                onRename={renamePasskey}
                passkey={passkey}
                renaming={renamingPasskeyId === passkey.credentialId}
              />
            ))}
          </div>
      </AccountDialogShell>
      <PasskeySetupDialog
        defaultName={buildDefaultPasskeyName()}
        isSubmitting={isRegistering}
        onClose={() => setIsSetupOpen(false)}
        onSubmit={createPasskey}
        open={open && isSetupOpen}
      />
    </>
  );
}

function PasskeyManageCard({ busy, deleting, onDelete, onRename, passkey, renaming }: {
  busy: boolean;
  deleting: boolean;
  onDelete: (passkey: LocalPasskey) => void;
  onRename: (passkey: LocalPasskey, name: string) => void;
  passkey: LocalPasskey;
  renaming: boolean;
}) {
  const { t } = usePriestessTranslation("account");
  const [draftName, setDraftName] = useState(passkey.name);
  const isDisabled = Boolean(passkey.disabledAt);
  const isBusy = busy || deleting || renaming;

  useEffect(() => {
    setDraftName(passkey.name);
  }, [passkey.name]);

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy || isDisabled) return;
    onRename(passkey, draftName);
  };

  return (
    <article className="account-security-dialog-card">
      <div className="account-security-dialog-card__top">
        <div>
          <h4>{passkey.name || shortenCredentialId(passkey.credentialId)}</h4>
          <p>{formatPasskeyDevice(passkey.deviceType)} · {formatPasskeyStatus(passkey)}</p>
        </div>
        <span className={`account-status-pill account-status-pill--${isDisabled ? "warn" : "good"}`}>{isDisabled ? t("已禁用") : t("可用")}</span>
      </div>
      <dl>
        <div>
          <dt>{t("凭证")}</dt>
          <dd>{shortenCredentialId(passkey.credentialId)}</dd>
        </div>
        <div>
          <dt>{t("备份状态")}</dt>
          <dd>{formatPasskeyBackup(passkey.backedUp)}</dd>
        </div>
        <div>
          <dt>{t("创建时间")}</dt>
          <dd>{formatDateTime(passkey.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("最后使用")}</dt>
          <dd>{formatDateTime(passkey.lastUsedAt)}</dd>
        </div>
        <div>
          <dt>{t("使用次数")}</dt>
          <dd>{passkey.counter ?? t("未返回")}</dd>
        </div>
        <div>
          <dt>{t("传输方式")}</dt>
          <dd>{formatPasskeyTransports(passkey.transports)}</dd>
        </div>
      </dl>
      {!isDisabled ? (
        <form className="account-security-dialog-card__form" onSubmit={submitRename}>
          <input
            aria-label={t("Passkey 名称")}
            disabled={isBusy}
            maxLength={80}
            onChange={(event) => setDraftName(event.target.value)}
            value={draftName}
          />
          <button className="account-copy-button" disabled={isBusy} type="submit">
            <Pencil aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>{renaming ? t("保存中") : t("重命名")}</span>
          </button>
          <button className="account-copy-button account-copy-button--danger" disabled={isBusy} onClick={() => onDelete(passkey)} type="button">
            <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>{deleting ? t("禁用中") : t("禁用")}</span>
          </button>
        </form>
      ) : null}
    </article>
  );
}

function buildDefaultPasskeyName() {
  const platform = typeof navigator === "undefined" ? "" : navigator.platform || "";
  if (/mac/i.test(platform)) return "Mac Passkey";
  if (/win/i.test(platform)) return "Windows Passkey";
  if (/iphone|ipad|ios/i.test(platform)) return "iCloud Passkey";
  if (/android/i.test(platform)) return "Android Passkey";
  return translatePriestess("account:浏览器 Passkey");
}
