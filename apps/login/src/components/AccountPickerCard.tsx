import { ArrowRight, MoreVertical, Plus, RefreshCw, UserRound } from "lucide-react";
import { usePriestessTranslation, type LocalAccountChoiceApp } from "@priestess/shared";
import type { AuthAccountChoice, AuthAccountChoicesStatus } from "../lib/useAuthAccountChoices";
import "./AccountPickerCard.css";

type AccountPickerCardProps = {
  accounts: AuthAccountChoice[];
  app: LocalAccountChoiceApp | null;
  busyAccountId: string;
  disabled?: boolean;
  error: string;
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
  onRetry,
  onSelectAccount,
  onUseAnotherAccount,
  status,
}: AccountPickerCardProps) {
  const { t } = usePriestessTranslation("login");
  const appLabel = app?.appId || t("当前应用");
  const originLabel = app?.returnToOrigin || t("等待后端确认回跳地址");
  const isLoading = status === "loading";
  const isError = status === "error";
  const isBusy = Boolean(busyAccountId);

  return (
    <>
      <div className="login-card__mark account-picker__mark" aria-hidden="true">
        <UserRound size={28} strokeWidth={1.7} />
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

              return (
                <button
                  key={accountKey}
                  aria-busy={isAccountBusy || undefined}
                  aria-label={getAccountSelectLabel(account, appLabel, isAccountBusy, t)}
                  className="account-picker__row"
                  disabled={disabled || isBusy}
                  onClick={() => onSelectAccount(account)}
                  type="button"
                >
                  <AccountAvatar account={account} />
                  <span className="account-picker__identity">
                    <span className="account-picker__name">{getAccountDisplayLabel(account, t)}</span>
                    <span className="account-picker__meta">{account.email || account.username || account.userId}</span>
                    {account.current ? <span className="account-picker__state">{t("已登录")}</span> : null}
                  </span>
                  <span className="account-picker__action" aria-hidden="true">
                    {isAccountBusy ? t("继续中") : <ArrowRight size={18} strokeWidth={1.8} />}
                  </span>
                </button>
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
          <MoreVertical aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
      </div>
    </>
  );
}

export function getAccountKey(account: AuthAccountChoice, index = 0) {
  return account.choiceId || account.userId || account.username || account.email || `account-${index}`;
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

function interpolateSourceText(key: string, options: Record<string, unknown> = {}) {
  return key.replace(/\{\{(\w+)\}\}/g, (_, optionKey: string) => String(options[optionKey] ?? ""));
}

function AccountAvatar({ account }: { account: AuthAccountChoice }) {
  const { t } = usePriestessTranslation("login");
  const fallbackText = getAccountDisplayLabel(account, t).trim().slice(0, 1).toUpperCase();
  const avatarUrl = getSafeAvatarUrl(account.avatarUrl);

  if (avatarUrl) {
    return (
      <span className="account-picker__avatar">
        <img alt="" src={avatarUrl} />
      </span>
    );
  }

  return <span className="account-picker__avatar account-picker__avatar--fallback">{fallbackText}</span>;
}

export function getSafeAvatarUrl(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue.startsWith("//")) {
    return "";
  }
  if (trimmedValue.startsWith("/")) {
    return trimmedValue;
  }

  try {
    const url = new URL(trimmedValue);
    // 头像只渲染普通 Web 资源；其它 scheme 使用首字母兜底，避免把不可信展示字段交给浏览器处理。
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function getAccountDisplayLabel(account: AuthAccountChoice, translate: (key: string, options?: Record<string, unknown>) => string = interpolateSourceText) {
  return account.displayName || account.username || account.email || account.userId || translate("这个账号");
}

function getAccountMetaLabel(account: AuthAccountChoice) {
  return account.email || account.username || account.userId;
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
