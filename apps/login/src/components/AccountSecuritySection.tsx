import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  KeyRound,
  LockKeyhole,
  Mail,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import {
  getLocalTotp,
  getPriestessApiErrorMessage,
  listLocalPasskeys,
  usePriestessTranslation,
  type LocalPasskey,
  type LocalSession,
  type LocalTotpFactor,
} from "@priestess/shared";
import { PasskeyManageDialog } from "./PasskeyManageDialog";
import { TotpManageDialog } from "./TotpManageDialog";
import "./AccountSecurity.css";

type AccountSecuritySectionProps = {
  enabled: boolean | null;
  onEditEmail: () => void;
  onEditPhone: () => void;
  onNotice: (message: string) => void;
  onOpenPasswordChange: () => void;
  user: LocalSession["user"];
};

type SecurityActionRowProps = {
  badge?: ReactNode;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  title: string;
};

export function AccountSecuritySection({
  enabled,
  onEditEmail,
  onEditPhone,
  onNotice,
  onOpenPasswordChange,
  user,
}: AccountSecuritySectionProps) {
  const { t } = usePriestessTranslation("account");
  const [isPasskeyDialogOpen, setIsPasskeyDialogOpen] = useState(false);
  const [isPasskeysLoading, setIsPasskeysLoading] = useState(false);
  const [isTotpDialogOpen, setIsTotpDialogOpen] = useState(false);
  const [isTotpLoading, setIsTotpLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState("");
  const [passkeys, setPasskeys] = useState<LocalPasskey[]>([]);
  const [totp, setTotp] = useState<LocalTotpFactor | null>(null);
  const [totpError, setTotpError] = useState("");
  const activePasskeyCount = passkeys.filter((passkey) => !passkey.disabledAt).length;
  const totpEnabled = Boolean(totp?.enabled && !totp.disabledAt);
  const accountProtected = enabled !== false;

  const loadPasskeys = useCallback(async(signal?: AbortSignal) => {
    setIsPasskeysLoading(true);
    setPasskeyError("");
    try {
      // 安全页列表只展示属于当前用户的真实 Passkey 数量；新增或禁用后复用同一刷新逻辑。
      const nextPasskeys = await listLocalPasskeys({ signal });
      if (signal?.aborted) return;
      setPasskeys(nextPasskeys);
    } catch (requestError) {
      if (signal?.aborted) return;
      setPasskeys([]);
      setPasskeyError(getPriestessApiErrorMessage(requestError, t("无法读取 Passkey")));
    } finally {
      if (!signal?.aborted) {
        setIsPasskeysLoading(false);
      }
    }
  }, [t]);

  const loadTotp = useCallback(async(signal?: AbortSignal) => {
    setIsTotpLoading(true);
    setTotpError("");
    try {
      const nextTotp = await getLocalTotp({ signal });
      if (signal?.aborted) return;
      setTotp(nextTotp);
    } catch (requestError) {
      if (signal?.aborted) return;
      setTotp(null);
      setTotpError(getPriestessApiErrorMessage(requestError, t("无法读取 TOTP 状态")));
    } finally {
      if (!signal?.aborted) {
        setIsTotpLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const abortController = new AbortController();
    void loadPasskeys(abortController.signal);
    void loadTotp(abortController.signal);
    return () => abortController.abort();
  }, [loadPasskeys, loadTotp]);

  const passkeyDescription = useMemo(() => {
    if (isPasskeysLoading) return t("正在读取");
    if (passkeyError) return t("请打开管理弹窗重试");
    return activePasskeyCount === 0 ? t("未设置") : t("{{count}} 个可用", { count: activePasskeyCount });
  }, [activePasskeyCount, isPasskeysLoading, passkeyError, t]);

  const totpDescription = useMemo(() => {
    if (isTotpLoading) return t("正在读取");
    if (totpError) return t("请稍后重试读取状态");
    return totpEnabled ? t("认证器动态验证码已可用") : t("可打开后启用认证器验证");
  }, [isTotpLoading, totpEnabled, totpError, t]);

  const totpBadge = totpError ? (
    <SecurityBadge tone="error">{t("读取失败")}</SecurityBadge>
  ) : totpEnabled ? (
    <SecurityBadge tone="good">{t("已启用")}</SecurityBadge>
  ) : !isTotpLoading ? (
    <SecurityBadge tone="warn">{t("未启用")}</SecurityBadge>
  ) : undefined;

  const passkeyBadge = passkeyError ? (
    <SecurityBadge tone="error">{t("读取失败")}</SecurityBadge>
  ) : activePasskeyCount > 0 ? (
    <SecurityBadge tone="good">{t("已设置")}</SecurityBadge>
  ) : !isPasskeysLoading ? (
    <SecurityBadge tone="warn">{t("未设置")}</SecurityBadge>
  ) : undefined;

  return (
    <section className="account-security-view" aria-labelledby="account-security-title">
      <header className="account-security-hero">
        <h2 id="account-security-title">{t("安全与登录")}</h2>
      </header>

      <div className={`account-security-check${accountProtected ? "" : " account-security-check--danger"}`} role="status">
        <span className="account-security-check__icon" aria-hidden="true">
          {accountProtected ? <ShieldCheck size={34} strokeWidth={1.9} /> : <LockKeyhole size={34} strokeWidth={1.9} />}
        </span>
        <div>
          <strong>{accountProtected ? t("你的账户已受保护") : t("账户当前已停用")}</strong>
          <p>{accountProtected ? t("Priestess 已读取当前安全设置；请保持登录方式可用。") : t("此账户当前不可用，请联系管理员恢复后再继续登录。")}</p>
        </div>
      </div>

      <section className="account-security-group" aria-labelledby="account-security-signin-title">
        <div className="account-security-group__heading">
          <h3 id="account-security-signin-title">{t("你如何登录 Priestess")}</h3>
          <p>{t("保持这些信息可用，方便你安全访问账户。")}</p>
        </div>

        <div className="account-security-list">
          <SecurityActionRow
            badge={totpBadge}
            description={totpDescription}
            icon={<ShieldCheck size={23} strokeWidth={1.9} />}
            onClick={() => setIsTotpDialogOpen(true)}
            title={t("二步验证")}
          />
          <SecurityActionRow
            badge={passkeyBadge}
            description={passkeyDescription}
            icon={<KeyRound size={23} strokeWidth={1.9} />}
            onClick={() => setIsPasskeyDialogOpen(true)}
            title={t("Passkey 与安全密钥")}
          />
          <SecurityActionRow
            description={t("可修改当前登录密码")}
            icon={<LockKeyhole size={23} strokeWidth={1.9} />}
            onClick={onOpenPasswordChange}
            title={t("密码")}
          />
          <SecurityActionRow
            badge={user?.phone ? undefined : <SecurityBadge tone="warn">{t("未设置")}</SecurityBadge>}
            description={user?.phone || t("点击设置登录手机号")}
            icon={<MessageSquareText size={23} strokeWidth={1.9} />}
            onClick={onEditPhone}
            title={t("登录手机号")}
          />
          <SecurityActionRow
            badge={user?.email ? undefined : <SecurityBadge tone="warn">{t("未设置")}</SecurityBadge>}
            description={user?.email || t("点击设置恢复邮箱")}
            icon={<Mail size={23} strokeWidth={1.9} />}
            onClick={onEditEmail}
            title={t("恢复邮箱")}
          />
        </div>
      </section>

      <PasskeyManageDialog
        error={passkeyError}
        isLoading={isPasskeysLoading}
        onChanged={loadPasskeys}
        onClose={() => setIsPasskeyDialogOpen(false)}
        onNotice={onNotice}
        open={isPasskeyDialogOpen}
        passkeys={passkeys}
      />
      <TotpManageDialog
        error={totpError}
        factor={totp}
        isLoading={isTotpLoading}
        onChanged={(nextTotp) => setTotp(nextTotp)}
        onClose={() => setIsTotpDialogOpen(false)}
        onNotice={onNotice}
        onRefresh={loadTotp}
        open={isTotpDialogOpen}
      />
    </section>
  );
}

function SecurityActionRow({ badge, description, icon, onClick, title }: SecurityActionRowProps) {
  return (
    <button className="account-security-row" onClick={onClick} type="button">
      <span className="account-security-row__icon" aria-hidden="true">{icon}</span>
      <span className="account-security-row__content">
        <span className="account-security-row__title">{title}</span>
        <span className="account-security-row__description">
          {badge}
          <span>{description}</span>
        </span>
      </span>
      <ChevronRight className="account-security-row__chevron" aria-hidden="true" size={20} strokeWidth={1.8} />
    </button>
  );
}

function SecurityBadge({ children, tone }: { children: ReactNode; tone: "good" | "warn" | "error" }) {
  return (
    <span className={`account-security-badge account-security-badge--${tone}`}>
      {tone === "good" ? <Check size={14} strokeWidth={2.1} /> : null}
      <span>{children}</span>
    </span>
  );
}
