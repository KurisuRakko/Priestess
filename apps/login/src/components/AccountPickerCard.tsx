import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronLeft, ImageUp, LockKeyhole, LogOut, MoreVertical, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useIsPresent, useReducedMotion } from "motion/react";
import {
  getPriestessDisplayAvatarUrl,
  getSafePriestessAvatarUrl,
  usePriestessTranslation,
  type LocalAccountChoiceApp,
} from "@priestess/shared";
import { AccountDialogShell } from "./AccountDialogShell";
import {
  captureAccountPickerIdentitySource,
  type LoginIdentityMotionSource,
} from "./loginIdentityMotion";
import type { AuthAccountChoice, AuthAccountChoicesStatus } from "../lib/useAuthAccountChoices";
import "./AccountPickerCard.css";

export type AccountPickerAction = "avatar" | "password" | "profile";
export type AccountPickerMode = "authorization" | "standalone";

const ACCOUNT_SHARED_LAYOUT_DURATION_MS = 520;
const ACCOUNT_SHARED_LAYOUT_TRANSITION = {
  duration: ACCOUNT_SHARED_LAYOUT_DURATION_MS / 1000,
  ease: [0.16, 1, 0.3, 1],
} as const;
const ACCOUNT_VIEW_TRANSITION = {
  duration: 0.22,
  ease: [0.4, 0, 0.2, 1],
} as const;
const ACCOUNT_ACTION_ENTER_TRANSITION = {
  duration: 0.34,
  ease: [0.16, 1, 0.3, 1],
} as const;

type AccountPickerCardProps = {
  accounts: AuthAccountChoice[];
  app: LocalAccountChoiceApp | null;
  busyAccountId: string;
  disabled?: boolean;
  error: string;
  mode: AccountPickerMode;
  removingAccountId: string;
  onOpenAccountAction: (
    account: AuthAccountChoice,
    action: AccountPickerAction,
    identitySource: LoginIdentityMotionSource | null,
  ) => Promise<void> | void;
  onRemoveAccount: (account: AuthAccountChoice) => Promise<void> | void;
  onRetry: () => void;
  onSelectAccount: (account: AuthAccountChoice, identitySource: LoginIdentityMotionSource | null) => void;
  onUseAnotherAccount: () => void;
  status: AuthAccountChoicesStatus;
};

export function AccountPickerCard({
  accounts,
  app,
  busyAccountId,
  disabled = false,
  error,
  mode,
  removingAccountId,
  onOpenAccountAction,
  onRemoveAccount,
  onRetry,
  onSelectAccount,
  onUseAnotherAccount,
  status,
}: AccountPickerCardProps) {
  const { t } = usePriestessTranslation("login");
  const shouldReduceMotion = Boolean(useReducedMotion());
  const layoutGroupId = useId();
  const backButtonRef = useRef<HTMLButtonElement | null>(null);
  const actionViewRef = useRef<HTMLElement | null>(null);
  const moreButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusTimerRef = useRef<number | null>(null);
  const [actionAccount, setActionAccount] = useState<AuthAccountChoice | null>(null);
  const [removeAccount, setRemoveAccount] = useState<AuthAccountChoice | null>(null);
  const appLabel = app?.appId || t("当前应用");
  const originLabel = app?.returnToOrigin || t("等待后端确认回跳地址");
  const isStandalone = mode === "standalone";
  const isLoading = status === "loading";
  const isError = status === "error";
  const isBusy = Boolean(busyAccountId || removingAccountId);
  const actionAccountKey = actionAccount ? getAccountKey(actionAccount) : "";
  const currentActionAccount = actionAccount
    ? accounts.find((account, index) => getAccountKey(account, index) === actionAccountKey) ?? actionAccount
    : null;
  const removeAccountKey = removeAccount ? getAccountKey(removeAccount) : "";
  const isActionViewBusy = disabled || Boolean(removeAccount) || Boolean(actionAccountKey && (
    busyAccountId === actionAccountKey
    || removingAccountId === actionAccountKey
  ));
  const isRemoveDialogBusy = Boolean(removeAccountKey && removingAccountId === removeAccountKey);

  useEffect(() => {
    if (!actionAccount || status !== "ready") return;
    const accountStillExists = accounts.some((account, index) => getAccountKey(account, index) === actionAccountKey);
    if (!accountStillExists) {
      setActionAccount(null);
    }
  }, [accounts, actionAccount, actionAccountKey, status]);

  useEffect(() => {
    if (!actionAccountKey) return undefined;
    // 等共享元素抵达详情头部后再转移焦点，避免键盘焦点环在移动途中跳闪。
    const focusDelay = shouldReduceMotion ? 0 : ACCOUNT_SHARED_LAYOUT_DURATION_MS;
    const focusTimer = window.setTimeout(() => backButtonRef.current?.focus({ preventScroll: true }), focusDelay);
    return () => window.clearTimeout(focusTimer);
  }, [actionAccountKey, shouldReduceMotion]);

  useEffect(() => () => {
    if (returnFocusTimerRef.current !== null) {
      window.clearTimeout(returnFocusTimerRef.current);
    }
  }, []);

  const openActionView = (account: AuthAccountChoice) => {
    if (disabled || isBusy) return;
    if (returnFocusTimerRef.current !== null) {
      window.clearTimeout(returnFocusTimerRef.current);
      returnFocusTimerRef.current = null;
    }
    setActionAccount(account);
  };

  const closeActionView = () => {
    if (!currentActionAccount || isActionViewBusy) return;
    const returnFocusKey = getAccountKey(currentActionAccount);
    setActionAccount(null);
    const focusDelay = shouldReduceMotion ? 0 : ACCOUNT_SHARED_LAYOUT_DURATION_MS;
    returnFocusTimerRef.current = window.setTimeout(() => {
      moreButtonRefs.current.get(returnFocusKey)?.focus({ preventScroll: true });
      returnFocusTimerRef.current = null;
    }, focusDelay);
  };

  const openAccountAction = (action: AccountPickerAction) => {
    if (!currentActionAccount || isActionViewBusy) return;
    const identitySource = actionViewRef.current
      ? captureAccountPickerIdentitySource(actionViewRef.current)
      : null;
    void onOpenAccountAction(currentActionAccount, action, identitySource);
  };

  const openRemoveDialog = () => {
    if (!currentActionAccount || isActionViewBusy) return;
    setRemoveAccount(currentActionAccount);
  };

  const closeRemoveDialog = () => {
    if (!isRemoveDialogBusy) {
      setRemoveAccount(null);
    }
  };

  const confirmRemoveAccount = () => {
    if (!removeAccount || isRemoveDialogBusy) return;
    void Promise.resolve(onRemoveAccount(removeAccount)).finally(() => setRemoveAccount(null));
  };

  return (
    <>
      {/* 列表和详情共用稳定 layoutId，让头像与身份信息接管新位置，而不是复制一份淡入。 */}
      <LayoutGroup id={layoutGroupId}>
        <AnimatePresence initial={false} mode="popLayout">
          {currentActionAccount ? (
            <AccountPickerMotionView
              key="account-actions"
              shouldReduceMotion={shouldReduceMotion}
              view="actions"
            >
              <AccountPickerActionsView
                account={currentActionAccount}
                backButtonRef={backButtonRef}
                busy={isActionViewBusy}
                layoutKey={actionAccountKey}
                onBack={closeActionView}
                onOpenAccountAction={openAccountAction}
                onSignOut={openRemoveDialog}
                sectionRef={actionViewRef}
                shouldReduceMotion={shouldReduceMotion}
                signingOut={removingAccountId === actionAccountKey}
              />
            </AccountPickerMotionView>
          ) : (
            <AccountPickerMotionView
              key="account-list"
              shouldReduceMotion={shouldReduceMotion}
              view="list"
            >
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
                {isStandalone ? (
                  <p>{t("选择账号进入 Priestess 个人中心")}</p>
                ) : (
                  <p>
                    {t("继续访问")} <strong>{appLabel}</strong>
                    <span>{originLabel}</span>
                  </p>
                )}
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

                      return (
                        <div
                          key={accountKey}
                          aria-busy={isAccountBusy || isAccountRemoving || undefined}
                          className={`account-picker__row${isAccountLocked ? " account-picker__row--disabled" : ""}${isAccountBusy ? " account-picker__row--authorizing" : ""}${isAccountRemoving ? " account-picker__row--removing" : ""}${isAccountSignedOut ? " account-picker__row--signed-out" : ""}`}
                        >
                          <button
                            aria-label={getAccountSelectLabel(account, appLabel, isAccountBusy, t, mode)}
                            className="account-picker__row-main"
                            disabled={isSelectLocked}
                            onClick={(event) => {
                              onSelectAccount(
                                account,
                                captureAccountPickerIdentitySource(event.currentTarget),
                              );
                            }}
                            type="button"
                          >
                            <AccountAvatar
                              account={account}
                              layoutKey={accountKey}
                              shouldReduceMotion={shouldReduceMotion}
                            />
                            <AccountIdentity
                              account={account}
                              busyLabel={isAccountRemoving ? t("登出中") : ""}
                              layoutKey={accountKey}
                              shouldReduceMotion={shouldReduceMotion}
                            />
                          </button>
                          <button
                            aria-label={getAccountMoreActionsLabel(account, t)}
                            className="account-picker__more"
                            disabled={isAccountLocked}
                            onClick={() => openActionView(account)}
                            ref={(element) => {
                              if (element) moreButtonRefs.current.set(accountKey, element);
                              else moreButtonRefs.current.delete(accountKey);
                            }}
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
            </AccountPickerMotionView>
          )}
        </AnimatePresence>
      </LayoutGroup>

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

type AccountPickerMotionViewProps = {
  children: ReactNode;
  shouldReduceMotion: boolean;
  view: "actions" | "list";
};

const AccountPickerMotionView = forwardRef<HTMLDivElement, AccountPickerMotionViewProps>(function AccountPickerMotionView({
  children,
  shouldReduceMotion,
  view,
}, ref) {
  const isPresent = useIsPresent();
  const travel = view === "actions" ? 32 : -24;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      aria-hidden={isPresent ? undefined : true}
      className="account-picker-card-view"
      data-account-picker-presence={isPresent ? "present" : "exiting"}
      data-account-picker-view={view}
      exit={shouldReduceMotion ? { opacity: 0 } : {
        opacity: 0,
        transition: {
          opacity: ACCOUNT_VIEW_TRANSITION,
          y: ACCOUNT_SHARED_LAYOUT_TRANSITION,
        },
        y: travel,
      }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: travel }}
      inert={isPresent ? undefined : true}
      ref={ref}
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
      transition={shouldReduceMotion ? { duration: 0 } : ACCOUNT_VIEW_TRANSITION}
    >
      {children}
    </motion.div>
  );
});

export function AccountPickerActionsView({
  account,
  backButtonRef,
  busy,
  layoutKey,
  onBack,
  onOpenAccountAction,
  onSignOut,
  sectionRef,
  shouldReduceMotion,
  signingOut = false,
}: {
  account: AuthAccountChoice;
  backButtonRef?: RefObject<HTMLButtonElement | null>;
  busy: boolean;
  layoutKey?: string;
  onBack: () => void;
  onOpenAccountAction: (action: AccountPickerAction) => void;
  onSignOut: () => void;
  sectionRef?: RefObject<HTMLElement | null>;
  shouldReduceMotion?: boolean;
  signingOut?: boolean;
}) {
  const { t } = usePriestessTranslation("login");
  const resolvedLayoutKey = layoutKey || getAccountKey(account);
  const reduceMotion = Boolean(shouldReduceMotion);

  return (
    <section className="account-picker-actions" aria-labelledby="account-picker-actions-title" ref={sectionRef}>
      {/* 返回导航独占顶部 leading 行，账号身份另起内容层，避免两种层级互相抢对齐基线。 */}
      <div className="account-picker-actions__navigation">
        <motion.button
          animate={{ opacity: 1, x: 0 }}
          aria-label={t("返回账号选择")}
          className="login-card__back-button account-picker-actions__back"
          disabled={busy}
          initial={reduceMotion ? false : { opacity: 0, x: -18 }}
          onClick={onBack}
          ref={backButtonRef}
          title={t("返回账号选择")}
          transition={reduceMotion ? { duration: 0 } : {
            duration: 0.32,
            ease: [0.16, 1, 0.3, 1],
          }}
          type="button"
          whileHover={reduceMotion || busy ? undefined : { x: -3 }}
          whileTap={reduceMotion || busy ? undefined : { x: -1 }}
        >
          <ChevronLeft aria-hidden="true" size={28} strokeWidth={2.1} />
        </motion.button>
        <h2 id="account-picker-actions-title">{t("账号操作")}</h2>
        <span aria-hidden="true" />
      </div>

      <div className="account-picker-actions__profile">
        <AccountAvatar
          account={account}
          layoutKey={resolvedLayoutKey}
          shouldReduceMotion={reduceMotion}
        />
        <AccountIdentity
          account={account}
          busyLabel={busy ? t("处理中") : ""}
          layoutKey={resolvedLayoutKey}
          shouldReduceMotion={reduceMotion}
        />
      </div>

      {isSignedOutAccount(account) ? (
        <div className="account-picker-actions__notice" role="status">
          {t("这个账号已在此浏览器登出，不能修改资料、密码或头像。")}
        </div>
      ) : null}

      <motion.div
        animate="visible"
        className="account-picker-actions__list"
        initial={reduceMotion ? false : "hidden"}
        variants={{
          hidden: {},
          visible: {
            transition: {
              delayChildren: 0.14,
              staggerChildren: 0.045,
            },
          },
        }}
      >
        {isEditableAccount(account) ? (
          <>
            <AccountActionButton disabled={busy} icon={<LockKeyhole size={19} strokeWidth={1.8} />} label={t("修改密码")} onClick={() => onOpenAccountAction("password")} reduceMotion={reduceMotion} />
            <AccountActionButton disabled={busy} icon={<Pencil size={19} strokeWidth={1.8} />} label={t("设定资料")} onClick={() => onOpenAccountAction("profile")} reduceMotion={reduceMotion} />
            <AccountActionButton disabled={busy} icon={<ImageUp size={19} strokeWidth={1.8} />} label={t("设定头像")} onClick={() => onOpenAccountAction("avatar")} reduceMotion={reduceMotion} />
          </>
        ) : null}
        <AccountActionButton
          danger
          disabled={busy || !account.userId}
          icon={signingOut ? <RefreshCw size={19} strokeWidth={1.8} /> : <LogOut size={19} strokeWidth={1.8} />}
          label={signingOut ? t("登出中") : t("登出账号")}
          onClick={onSignOut}
          reduceMotion={reduceMotion}
        />
      </motion.div>
    </section>
  );
}

function AccountActionButton({
  danger = false,
  disabled,
  icon,
  label,
  onClick,
  reduceMotion,
}: {
  danger?: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  reduceMotion: boolean;
}) {
  return (
    <motion.button
      className={`account-picker-actions__button${danger ? " account-picker-actions__button--danger" : ""}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
      variants={reduceMotion ? undefined : {
        hidden: { opacity: 0, y: 32 },
        visible: {
          opacity: 1,
          transition: ACCOUNT_ACTION_ENTER_TRANSITION,
          y: 0,
        },
      }}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </motion.button>
  );
}

function AccountAvatar({
  account,
  layoutKey,
  shouldReduceMotion,
}: {
  account: AuthAccountChoice;
  layoutKey?: string;
  shouldReduceMotion?: boolean;
}) {
  const avatarUrl = getPriestessDisplayAvatarUrl(account.avatarUrl);

  return (
    <motion.span
      className="account-picker__avatar"
      data-account-shared-part="avatar"
      layoutId={layoutKey ? `${layoutKey}-avatar` : undefined}
      transition={shouldReduceMotion ? { duration: 0 } : { layout: ACCOUNT_SHARED_LAYOUT_TRANSITION }}
    >
      <img alt="" src={avatarUrl} />
    </motion.span>
  );
}

function AccountIdentity({
  account,
  busyLabel,
  layoutKey,
  shouldReduceMotion,
}: {
  account: AuthAccountChoice;
  busyLabel: string;
  layoutKey?: string;
  shouldReduceMotion?: boolean;
}) {
  const { t } = usePriestessTranslation("login");

  return (
    <motion.span
      className="account-picker__identity"
      data-account-shared-part="identity"
      layout="position"
      layoutId={layoutKey ? `${layoutKey}-identity` : undefined}
      transition={shouldReduceMotion ? { duration: 0 } : { layout: ACCOUNT_SHARED_LAYOUT_TRANSITION }}
    >
      <span className="account-picker__name">{getAccountDisplayLabel(account, t)}</span>
      <span className="account-picker__meta">{getAccountMetaLabel(account)}</span>
      {account.current ? <span className="account-picker__state">{t("已登录")}</span> : null}
      {isSignedOutAccount(account) ? <span className="account-picker__state account-picker__state--signed-out">{t("已登出")}</span> : null}
      {busyLabel ? <span className="account-picker__state account-picker__state--busy">{busyLabel}</span> : null}
    </motion.span>
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
  mode: AccountPickerMode = "authorization",
) {
  const displayLabel = getAccountDisplayLabel(account, translate);
  const metaLabel = getAccountMetaLabel(account);
  const actionLabel = isBusy ? translate("正在使用") : translate("使用");
  const metaText = metaLabel && metaLabel !== displayLabel ? `，${metaLabel}` : "";
  const currentText = account.current ? translate("，已登录") : "";

  const options = {
    action: actionLabel,
    appLabel: appLabel || translate("当前应用"),
    currentText,
    displayLabel,
    metaText,
  };

  return mode === "standalone"
    ? translate("{{action}} {{displayLabel}}{{metaText}}{{currentText}} 进入 Priestess 个人中心", options)
    : translate("{{action}} {{displayLabel}}{{metaText}}{{currentText}} 继续访问 {{appLabel}}", options);
}

export function getSafeAvatarUrl(value: string) {
  return getSafePriestessAvatarUrl(value);
}

function interpolateSourceText(key: string, options: Record<string, unknown> = {}) {
  return key.replace(/\{\{(\w+)\}\}/g, (_, optionKey: string) => String(options[optionKey] ?? ""));
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
