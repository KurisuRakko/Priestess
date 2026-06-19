import { useEffect, useRef, useState, type ReactNode } from "react";
import { ImageUp, LockKeyhole, LogOut, MoreVertical, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  getPriestessDisplayAvatarUrl,
  getSafePriestessAvatarUrl,
  usePriestessTranslation,
  type LocalAccountChoiceApp,
} from "@priestess/shared";
import { AccountDialogShell } from "./AccountDialogShell";
import type { AuthAccountChoice, AuthAccountChoicesStatus } from "../lib/useAuthAccountChoices";
import "./AccountPickerCard.css";

export type AccountPickerAction = "avatar" | "password" | "profile";

const ACTION_DIALOG_EXIT_DELAY_MS = 170;

type AccountPickerCardProps = {
  accounts: AuthAccountChoice[];
  app: LocalAccountChoiceApp | null;
  busyAccountId: string;
  disabled?: boolean;
  error: string;
  removingAccountId: string;
  onOpenAccountAction: (account: AuthAccountChoice, action: AccountPickerAction) => Promise<void> | void;
  onRemoveAccount: (account: AuthAccountChoice) => Promise<void> | void;
  onRetry: () => void;
  onSelectAccount: (account: AuthAccountChoice) => void;
  onUseAnotherAccount: () => void;
  status: AuthAccountChoicesStatus;
};

export function AccountPickerCard({
  accounts,
  app,
  busyAccountId,
  disabled = false,
  error,
  removingAccountId,
  onOpenAccountAction,
  onRemoveAccount,
  onRetry,
  onSelectAccount,
  onUseAnotherAccount,
  status,
}: AccountPickerCardProps) {
  const { t } = usePriestessTranslation("login");
  const shouldReduceMotion = useReducedMotion();
  const actionTransitionTimeoutRef = useRef<number | null>(null);
  const [actionAccount, setActionAccount] = useState<AuthAccountChoice | null>(null);
  const [removeAccount, setRemoveAccount] = useState<AuthAccountChoice | null>(null);
  const appLabel = app?.appId || t("当前应用");
  const originLabel = app?.returnToOrigin || t("等待后端确认回跳地址");
  const isLoading = status === "loading";
  const isError = status === "error";
  const isBusy = Boolean(busyAccountId || removingAccountId);
  const actionAccountKey = actionAccount ? getAccountKey(actionAccount) : "";
  const removeAccountKey = removeAccount ? getAccountKey(removeAccount) : "";
  const isActionDialogBusy = Boolean(actionAccountKey && (busyAccountId === actionAccountKey || removingAccountId === actionAccountKey));
  const isRemoveDialogBusy = Boolean(removeAccountKey && removingAccountId === removeAccountKey);

  useEffect(() => () => {
    if (actionTransitionTimeoutRef.current !== null) {
      window.clearTimeout(actionTransitionTimeoutRef.current);
    }
  }, []);

  const runAfterActionDialogCloses = (callback: () => void) => {
    if (actionTransitionTimeoutRef.current !== null) {
      window.clearTimeout(actionTransitionTimeoutRef.current);
      actionTransitionTimeoutRef.current = null;
    }
    setActionAccount(null);

    if (shouldReduceMotion) {
      window.requestAnimationFrame(callback);
      return;
    }

    actionTransitionTimeoutRef.current = window.setTimeout(() => {
      actionTransitionTimeoutRef.current = null;
      callback();
    }, ACTION_DIALOG_EXIT_DELAY_MS);
  };

  const closeActionDialog = () => {
    if (!isActionDialogBusy) {
      setActionAccount(null);
    }
  };

  const openAccountAction = (account: AuthAccountChoice, action: AccountPickerAction) => {
    if (isActionDialogBusy) {
      return;
    }
    runAfterActionDialogCloses(() => {
      void onOpenAccountAction(account, action);
    });
  };

  const openRemoveDialog = (account: AuthAccountChoice) => {
    if (isActionDialogBusy) {
      return;
    }
    runAfterActionDialogCloses(() => setRemoveAccount(account));
  };

  const closeRemoveDialog = () => {
    if (!isRemoveDialogBusy) {
      setRemoveAccount(null);
    }
  };

  const confirmRemoveAccount = () => {
    if (!removeAccount || isRemoveDialogBusy) {
      return;
    }
    void Promise.resolve(onRemoveAccount(removeAccount)).finally(() => setRemoveAccount(null));
  };

  return (
    <>
      <div className="login-card__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <path d="M24 5c5.5 4.5 5.5 10.5 0 16-5.5-5.5-5.5-11.5 0-16Z" />
          <path d="M43 24c-4.5 5.5-10.5 5.5-16 0 5.5-5.5 11.5-5.5 16 0Z" />
          <path d="M24 43c-5.5-4.5-5.5-10.5 0-16 5.5 5.5 5.5 11.5 0 16Z" />
          <path d="M5 24c4.5-5.5 10.5-5.5 16 0-5.5 5.5-11.5 5.5-16 0Z" />
          <circle cx="24" cy="24" r="3.2" />
        </svg>
      </div>

      <div className="login-card__heading account-picker__heading">
        <h1 id="login-title">{t("选择账号")}</h1>
        <p>
          {t("继续访问")} <strong>{appLabel}</strong>
          <span>{originLabel}</span>
        </p>
      </div>

      <div className="account-picker" aria-busy={isLoading}>
        {isLoading ? (
          <AccountPickerLoadingRows ariaLabel={t("正在读取账号")} />
        ) : isError ? (
          <div className="account-picker__notice" role="status">
            <strong>{t("账号选择暂时不可用")}</strong>
            <span>{error || t("请稍后重试，或使用其他账号登录。")}</span>
            <button className="secondary-button account-picker__retry" disabled={disabled} onClick={onRetry} type="button">
              <RefreshCw aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{t("重试")}</span>
            </button>
          </div>
        ) : accounts.length > 0 ? (
          <div className="account-picker__list">
            {accounts.map((account, index) => {
              const accountKey = getAccountKey(account, index);
              const isAccountBusy = busyAccountId === accountKey;
              const isAccountRemoving = removingAccountId === accountKey;
              const isAccountSignedOut = isSignedOutAccount(account);
              const isAccountLocked = disabled || isBusy;
              const isSelectLocked = isAccountLocked || isAccountSignedOut;
              const accountMeta = getAccountMetaLabel(account);

              return (
                <div
                  key={accountKey}
                  aria-busy={isAccountBusy || isAccountRemoving || undefined}
                  className={`account-picker__row${isAccountLocked ? " account-picker__row--disabled" : ""}${isAccountRemoving ? " account-picker__row--removing" : ""}${isAccountSignedOut ? " account-picker__row--signed-out" : ""}`}
                >
                  <button
                    aria-label={getAccountSelectLabel(account, appLabel, isAccountBusy, t)}
                    className="account-picker__row-main"
                    disabled={isSelectLocked}
                    onClick={() => onSelectAccount(account)}
                    type="button"
                  >
                    <AccountAvatar account={account} />
                    <span className="account-picker__identity">
                      <span className="account-picker__name">{getAccountDisplayLabel(account, t)}</span>
                      <span className="account-picker__meta">{accountMeta}</span>
                      {account.current ? <span className="account-picker__state">{t("已登录")}</span> : null}
                      {isAccountSignedOut ? <span className="account-picker__state account-picker__state--signed-out">{t("已登出")}</span> : null}
                      {isAccountBusy || isAccountRemoving ? (
                        <span className="account-picker__state account-picker__state--busy">
                          {isAccountBusy ? t("继续中") : t("登出中")}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <button
                    aria-label={getAccountMoreActionsLabel(account, t)}
                    className="account-picker__more"
                    disabled={isAccountLocked}
                    onClick={() => setActionAccount(account)}
                    title={getAccountMoreActionsLabel(account, t)}
                    type="button"
                  >
                    {isAccountRemoving ? <RefreshCw aria-hidden="true" size={17} strokeWidth={1.8} /> : <MoreVertical aria-hidden="true" size={18} strokeWidth={1.8} />}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="account-picker__notice" role="status">
            <strong>{t("没有可用账号")}</strong>
            <span>{t("请先登录或创建 Priestess 账号，再选择账号继续。")}</span>
          </div>
        )}

        <button className="account-picker__other" disabled={disabled || isBusy} onClick={onUseAnotherAccount} type="button">
          <span className="account-picker__other-icon" aria-hidden="true">
            <Plus size={21} strokeWidth={1.8} />
          </span>
          <span>{t("使用其他账号")}</span>
        </button>
      </div>

      <AccountPickerActionsDialog
        account={actionAccount}
        busy={isActionDialogBusy}
        onClose={closeActionDialog}
        onOpenAccountAction={(action) => {
          if (actionAccount) {
            openAccountAction(actionAccount, action);
          }
        }}
        onSignOut={() => {
          if (actionAccount) {
            openRemoveDialog(actionAccount);
          }
        }}
      />

      <AccountDialogShell labelledBy="account-picker-remove-title" open={Boolean(removeAccount)}>
        <button aria-label={t("关闭登出账号确认")} className="account-dialog__close" disabled={isRemoveDialogBusy} onClick={closeRemoveDialog} type="button">
          <X size={17} strokeWidth={1.8} />
        </button>
        <span className="account-dialog__icon account-dialog__icon--secure" aria-hidden="true">
          <LogOut size={21} strokeWidth={1.8} />
        </span>
        <div>
          <h3 id="account-picker-remove-title">{t("登出这个账号？")}</h3>
          <p>{removeAccount ? getAccountRemoveDescription(removeAccount, t) : ""}</p>
        </div>
        <div className="account-dialog__actions">
          <button className="account-button account-button--quiet" disabled={isRemoveDialogBusy} onClick={closeRemoveDialog} type="button">{t("取消")}</button>
          <button className="account-button account-button--danger" disabled={isRemoveDialogBusy || !removeAccount?.userId} onClick={confirmRemoveAccount} type="button">
            {isRemoveDialogBusy ? t("登出中") : t("登出账号")}
          </button>
        </div>
      </AccountDialogShell>
    </>
  );
}

export function getAccountKey(account: AuthAccountChoice, index = 0) {
  return account.choiceId || account.userId || account.username || account.email || `account-${index}`;
}

export function getAccountRemoveLabel(
  account: AuthAccountChoice,
  translate: (key: string, options?: Record<string, unknown>) => string = interpolateSourceText,
) {
  return translate("移除 {{displayLabel}} 的登录状态", {
    displayLabel: getAccountDisplayLabel(account, translate),
  });
}

export function getAccountRemoveDescription(
  account: AuthAccountChoice,
  translate: (key: string, options?: Record<string, unknown>) => string = interpolateSourceText,
) {
  const displayLabel = getAccountDisplayLabel(account, translate);
  const metaLabel = getAccountMetaLabel(account);
  return translate("这会从当前浏览器移除 {{displayLabel}}{{metaText}}，不会删除 Priestess 用户资料。", {
    displayLabel,
    metaText: metaLabel && metaLabel !== displayLabel ? `（${metaLabel}）` : "",
  });
}

export function getAccountMoreActionsLabel(
  account: AuthAccountChoice,
  translate: (key: string, options?: Record<string, unknown>) => string = interpolateSourceText,
) {
  return translate("打开 {{displayLabel}} 的更多操作", {
    displayLabel: getAccountDisplayLabel(account, translate),
  });
}

export function getAccountSelectLabel(
  account: AuthAccountChoice,
  appLabel: string,
  isBusy = false,
  translate: (key: string, options?: Record<string, unknown>) => string = interpolateSourceText,
) {
  const displayLabel = getAccountDisplayLabel(account, translate);
  const metaLabel = getAccountMetaLabel(account);
  const actionLabel = isBusy ? translate("正在使用") : translate("使用");
  const metaText = metaLabel && metaLabel !== displayLabel ? `，${metaLabel}` : "";
  const currentText = account.current ? translate("，已登录") : "";

  return translate("{{action}} {{displayLabel}}{{metaText}}{{currentText}} 继续访问 {{appLabel}}", {
    action: actionLabel,
    appLabel: appLabel || translate("当前应用"),
    currentText,
    displayLabel,
    metaText,
  });
}

export function AccountPickerActionsDialog({ account, busy, onClose, onOpenAccountAction, onSignOut }: {
  account: AuthAccountChoice | null;
  busy: boolean;
  onClose: () => void;
  onOpenAccountAction: (action: AccountPickerAction) => void;
  onSignOut: () => void;
}) {
  const { t } = usePriestessTranslation("login");

  return (
    <AccountDialogShell className="account-dialog--account-actions" labelledBy="account-picker-actions-title" open={Boolean(account)}>
      <button aria-label={t("关闭账号操作弹窗")} className="account-dialog__close" disabled={busy} onClick={onClose} type="button">
        <X size={17} strokeWidth={1.8} />
      </button>
      {account ? (
        <>
          <div className="account-picker-actions__header">
            <AccountAvatar account={account} />
            <div className="account-picker-actions__identity">
              <span>{t("账号操作")}</span>
              <h3 id="account-picker-actions-title">{getAccountDisplayLabel(account, t)}</h3>
              <span>{getAccountMetaLabel(account)}</span>
            </div>
          </div>
          {isSignedOutAccount(account) ? (
            <div className="account-picker-actions__notice" role="status">
              {t("这个账号已在此浏览器登出，不能修改资料、密码或头像。")}
            </div>
          ) : null}
          <div className="account-picker-actions__list">
            {isEditableAccount(account) ? (
              <>
                <AccountActionButton disabled={busy} icon={<LockKeyhole size={19} strokeWidth={1.8} />} label={t("修改密码")} onClick={() => onOpenAccountAction("password")} />
                <AccountActionButton disabled={busy} icon={<Pencil size={19} strokeWidth={1.8} />} label={t("设定资料")} onClick={() => onOpenAccountAction("profile")} />
                <AccountActionButton disabled={busy} icon={<ImageUp size={19} strokeWidth={1.8} />} label={t("设定头像")} onClick={() => onOpenAccountAction("avatar")} />
              </>
            ) : null}
            <AccountActionButton
              danger
              disabled={busy || !account.userId}
              icon={busy ? <RefreshCw size={19} strokeWidth={1.8} /> : <LogOut size={19} strokeWidth={1.8} />}
              label={busy ? t("登出中") : t("登出账号")}
              onClick={onSignOut}
            />
          </div>
        </>
      ) : null}
    </AccountDialogShell>
  );
}

function AccountActionButton({ danger = false, disabled, icon, label, onClick }: {
  danger?: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`account-picker-actions__button${danger ? " account-picker-actions__button--danger" : ""}`} disabled={disabled} onClick={onClick} type="button">
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function interpolateSourceText(key: string, options: Record<string, unknown> = {}) {
  return key.replace(/\{\{(\w+)\}\}/g, (_, optionKey: string) => String(options[optionKey] ?? ""));
}

function AccountAvatar({ account }: { account: AuthAccountChoice }) {
  const avatarUrl = getPriestessDisplayAvatarUrl(account.avatarUrl);

  return (
    <span className="account-picker__avatar">
      <img alt="" src={avatarUrl} />
    </span>
  );
}

export function getSafeAvatarUrl(value: string) {
  return getSafePriestessAvatarUrl(value);
}

function getAccountDisplayLabel(account: AuthAccountChoice, translate: (key: string, options?: Record<string, unknown>) => string = interpolateSourceText) {
  return account.displayName || account.username || account.email || account.userId || translate("这个账号");
}

function getAccountMetaLabel(account: AuthAccountChoice) {
  return account.email || account.username || account.userId;
}

function isEditableAccount(account: AuthAccountChoice) {
  return account.authenticated && !account.revoked;
}

function isSignedOutAccount(account: AuthAccountChoice) {
  return !isEditableAccount(account);
}

function AccountPickerLoadingRows({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div className="account-picker__list account-picker__list--loading" aria-label={ariaLabel}>
      {[0, 1].map((item) => (
        <div className="account-picker__row account-picker__row--skeleton" key={item}>
          <span className="account-picker__avatar account-picker__skeleton" />
          <span className="account-picker__identity">
            <span className="account-picker__skeleton account-picker__skeleton-name" />
            <span className="account-picker__skeleton account-picker__skeleton-meta" />
          </span>
        </div>
      ))}
    </div>
  );
}
