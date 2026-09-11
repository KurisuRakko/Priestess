import { motion, useReducedMotion } from "motion/react";
import { LogOut, Users, X } from "lucide-react";
import { usePriestessTranslation } from "@priestess/shared";
import { AccountDialogShell } from "./AccountDialogShell";
import { DURATION_BASE, EASE_LAYOUT } from "../lib/motionTokens";
import "./AccountMenu.css";

/**
 * 顶栏头像与菜单头像共用同一个 layoutId，由 motion 负责把头像从左上角飞到卡片顶部。
 * 同一时刻全页只能有一个元素带这个 layoutId，所以顶栏与菜单必须互斥渲染。
 */
export const ACCOUNT_MENU_AVATAR_LAYOUT_ID = "account-topbar-avatar";

type AccountMenuDialogProps = {
  avatarUrl: string;
  displayName: string;
  /** 退出请求进行中：两个菜单项都要禁用 */
  isLoggingOut: boolean;
  onAvatarError: () => void;
  onClose: () => void;
  onSignOut: () => void;
  onSwitchAccount: () => void;
  open: boolean;
};

export function AccountMenuDialog({
  avatarUrl,
  displayName,
  isLoggingOut,
  onAvatarError,
  onClose,
  onSignOut,
  onSwitchAccount,
  open,
}: AccountMenuDialogProps) {
  const { t } = usePriestessTranslation("account");
  const shouldReduceMotion = useReducedMotion();

  return (
    <AccountDialogShell
      className="account-menu-dialog"
      labelledBy="account-menu-title"
      onDismiss={isLoggingOut ? undefined : onClose}
      open={open}
    >
      <button
        aria-label={t("关闭账号菜单")}
        className="account-dialog__close"
        disabled={isLoggingOut}
        onClick={onClose}
        type="button"
      >
        <X aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
      <span className="account-menu-dialog__avatar-slot">
        <motion.img
          alt=""
          className="account-menu-dialog__avatar"
          layoutId={shouldReduceMotion ? undefined : ACCOUNT_MENU_AVATAR_LAYOUT_ID}
          onError={onAvatarError}
          src={avatarUrl}
          transition={{ duration: DURATION_BASE, ease: EASE_LAYOUT }}
        />
      </span>
      <h3 className="account-menu-dialog__name" id="account-menu-title">{displayName}</h3>
      <div className="account-menu-dialog__items">
        <button className="account-menu-item" disabled={isLoggingOut} onClick={onSwitchAccount} type="button">
          <Users aria-hidden="true" size={17} strokeWidth={1.8} />
          <span>{t("切换账号")}</span>
        </button>
        <button className="account-menu-item account-menu-item--danger" disabled={isLoggingOut} onClick={onSignOut} type="button">
          <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
          <span>{isLoggingOut ? t("退出中") : t("退出")}</span>
        </button>
      </div>
    </AccountDialogShell>
  );
}
