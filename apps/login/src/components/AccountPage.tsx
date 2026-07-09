import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Copy,
  Database,
  CircleDashed,
  Laptop,
  Languages,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Server,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
} from "lucide-react";
import {
  BrandMark,
  copyTextToClipboard,
  FloatingBackdrop,
  getLocalSession,
  getPriestessDisplayAvatarUrl,
  getPriestessApiErrorMessage,
  logoutLocalSession,
  PRIESTESS_DEFAULT_AVATAR_URL,
  usePriestessTranslation,
  type LocalSession,
} from "@priestess/shared";
import { AccountSectionView, InfoCard } from "./AccountPagePrimitives";
import { AccountDevicesSection } from "./AccountDevicesSection";
import { AccountPrivacySection } from "./AccountPrivacySection";
import { AccountSecuritySection } from "./AccountSecuritySection";
import { AccountServicesSection } from "./AccountServicesSection";
import "./AccountPage.css";
import { PasswordChangeDialog } from "./PasswordChangeDialog";
import { ProfileQuickEditDialog, type ProfileQuickEditMode } from "./ProfileQuickEditDialog";
import {
  getAccountManagementActionSection,
  readAccountManagementAction,
  removeAccountManagementActionFromSearch,
  type AccountManagementActionSection,
} from "../lib/accountManagementAction";

type AccountPageProps = {
  onNavigateToLogin: () => void;
  onRequireLogin: () => void;
  onNotice: (message: string) => void;
};

type AccountSection = "overview" | "security" | "devices" | "services" | "privacy";

const ACCOUNT_NAV_ITEMS: Array<{ icon: ReactNode; id: AccountSection; label: string }> = [
  { icon: <UserRound size={17} strokeWidth={1.8} />, id: "overview", label: "你的信息" },
  { icon: <ShieldCheck size={17} strokeWidth={1.8} />, id: "security", label: "安全" },
  { icon: <Laptop size={17} strokeWidth={1.8} />, id: "devices", label: "设备" },
  { icon: <WalletCards size={17} strokeWidth={1.8} />, id: "services", label: "服务" },
  { icon: <Database size={17} strokeWidth={1.8} />, id: "privacy", label: "隐私活动" },
];

const ACCOUNT_SECTION_IDS = new Set<AccountSection>(ACCOUNT_NAV_ITEMS.map((item) => item.id));

export function AccountPage({ onNavigateToLogin, onRequireLogin, onNotice }: AccountPageProps) {
  const { t } = usePriestessTranslation("account");
  const [activeSection, setActiveSection] = useState<AccountSection>(() => readSectionFromHash());
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isPasswordChangeOpen, setIsPasswordChangeOpen] = useState(false);
  const [profileQuickEditMode, setProfileQuickEditMode] = useState<ProfileQuickEditMode | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);

  const loadSession = useCallback(async(signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");

    try {
      // 个人中心只读取 Phainon 兼容的本地会话，不在前端填充模拟账户资料。
      const nextSession = await getLocalSession({ signal });
      if (signal?.aborted) return;
      setSession(nextSession);
    } catch (requestError) {
      if (signal?.aborted) return;
      setSession(null);
      setError(getPriestessApiErrorMessage(requestError, t("无法读取当前会话")));
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const abortController = new AbortController();
    void loadSession(abortController.signal);
    return () => abortController.abort();
  }, [loadSession]);

  useEffect(() => {
    const syncSectionFromHash = () => setActiveSection(readSectionFromHash());
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  const user = session?.user ?? null;
  const isAuthenticated = Boolean(session?.authenticated && user);
  const shouldRedirectToLogin = !isLoading && !error && !isAuthenticated;
  const displayName = user?.displayName || user?.username || t("Priestess 用户");
  const isInitialSessionLoading = isLoading && session === null;

  const selectSection = (section: AccountSection) => {
    setActiveSection(section);
    writeSectionToHash(section);
  };

  const copyAccountValue = async(label: string, value: string) => {
    const cleanValue = value.trim();
    if (!cleanValue || cleanValue === t("未提供") || cleanValue === t("未设置")) {
      onNotice(t("{{label}}暂无可复制内容", { label }));
      return;
    }

    try {
      // 复制动作只发生在用户点击后，失败时给出可理解反馈，不把数据写入任何本地存储。
      const copied = await copyTextToClipboard(cleanValue);
      onNotice(copied ? t("{{label}}已复制", { label }) : t("浏览器没有开放剪贴板权限"));
    } catch {
      onNotice(t("浏览器没有开放剪贴板权限"));
    }
  };

  const logout = async() => {
    setIsLoggingOut(true);
    try {
      // 退出登录只调用现有 local session 删除接口，避免引入新的前后端契约。
      await logoutLocalSession();
      setSession({ authenticated: false, challengeId: "", expiresAt: "", mfaRequired: false, mfaType: "", raw: null, user: null });
      onNotice(t("已退出登录"));
      onNavigateToLogin();
    } catch (requestError) {
      onNotice(getPriestessApiErrorMessage(requestError, t("退出登录失败")));
    } finally {
      setIsLoggingOut(false);
    }
  };

  useEffect(() => {
    if (!shouldRedirectToLogin) return;

    // 个人中心只允许已确认的登录会话进入；无会话或会话检查失败都回登录页，避免泄露受保护页面。
    onRequireLogin();
  }, [onRequireLogin, shouldRedirectToLogin]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const accountAction = readAccountManagementAction();
    if (!accountAction) return;

    const actionSection = getAccountManagementActionSection(accountAction);
    setActiveSection(actionSection);
    if (accountAction === "password") {
      setIsPasswordChangeOpen(true);
    } else if (accountAction === "avatar") {
      setProfileQuickEditMode("avatar");
    }

    // action 只负责首次打开目标状态；profile 是已弃用的兼容入口，只进入主界面并清理 URL。
    clearAccountManagementActionFromUrl(actionSection);
  }, [isAuthenticated]);

  if (shouldRedirectToLogin) {
    return null;
  }

  return (
    <main className="account-shell">
      <FloatingBackdrop />
      <header className="account-topbar" aria-label={t("Priestess 个人中心")}>
        <BrandMark size="sm" />
        {isAuthenticated ? (
          <div className="account-topbar__actions">
            <button className="account-button account-button--danger" disabled={isLoggingOut} onClick={logout} type="button">
              <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{isLoggingOut ? t("退出中") : t("退出")}</span>
            </button>
          </div>
        ) : null}
      </header>

      <section className="account-page" aria-label={t("Priestess 个人中心")}>
        {error ? (
          <div className="account-alert" role="status">
            <AlertTriangle aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>{error}</span>
          </div>
        ) : null}

        {isInitialSessionLoading ? (
          <section className="account-loading-panel" aria-label={t("正在读取个人中心")}>
            <span className="account-loading-panel__icon" aria-hidden="true">
              <CircleDashed className="is-spinning" size={22} strokeWidth={1.8} />
            </span>
            <div>
              <h2>{t("正在连接账户服务")}</h2>
              <p>{t("正在确认账户服务状态，请稍候。")}</p>
            </div>
          </section>
        ) : null}

        {isAuthenticated ? (
          <div className="account-layout">
            <nav className="account-nav" aria-label={t("个人中心分区")}>
              {ACCOUNT_NAV_ITEMS.map((item) => (
                <button
                  aria-current={activeSection === item.id ? "page" : undefined}
                  className={activeSection === item.id ? "is-active" : ""}
                  key={item.id}
                  onClick={() => selectSection(item.id)}
                  type="button"
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{t(item.label)}</span>
                </button>
              ))}
            </nav>

            <div className="account-content">
              {activeSection === "overview" ? (
                <OverviewSection
                  displayName={displayName}
                  onCopy={copyAccountValue}
                  onEditAvatar={() => setProfileQuickEditMode("avatar")}
                  onEditAddress={() => setProfileQuickEditMode("address")}
                  onEditBirthday={() => setProfileQuickEditMode("birthday")}
                  onEditDisplayName={() => setProfileQuickEditMode("displayName")}
                  onEditEmail={() => setProfileQuickEditMode("email")}
                  onEditPreferredLanguages={() => setProfileQuickEditMode("preferredLanguages")}
                  onEditPhone={() => setProfileQuickEditMode("phone")}
                  user={user}
                />
              ) : null}
              {activeSection === "security" ? (
                <AccountSecuritySection
                  enabled={user?.enabled ?? null}
                  onEditEmail={() => setProfileQuickEditMode("email")}
                  onEditPhone={() => setProfileQuickEditMode("phone")}
                  onOpenPasswordChange={() => setIsPasswordChangeOpen(true)}
                  onNotice={onNotice}
                  user={user}
                />
              ) : null}
              {activeSection === "devices" ? <AccountDevicesSection onNotice={onNotice} onRequireLogin={onRequireLogin} /> : null}
              {activeSection === "services" ? <AccountServicesSection /> : null}
              {activeSection === "privacy" ? <AccountPrivacySection /> : null}
            </div>
          </div>
        ) : null}

        <PasswordChangeDialog
          onChanged={(nextSession) => setSession(nextSession)}
          onClose={() => setIsPasswordChangeOpen(false)}
          onNotice={onNotice}
          open={isPasswordChangeOpen}
        />
        <ProfileQuickEditDialog
          mode={profileQuickEditMode}
          onChanged={(nextUser) => setSession((current) => current ? { ...current, user: nextUser } : current)}
          onClose={() => setProfileQuickEditMode(null)}
          onNotice={onNotice}
          user={user}
        />
      </section>
    </main>
  );
}

function OverviewSection({ displayName, onCopy, onEditAddress, onEditAvatar, onEditBirthday, onEditDisplayName, onEditEmail, onEditPreferredLanguages, onEditPhone, user }: {
  displayName: string;
  onCopy: (label: string, value: string) => void;
  onEditAddress: () => void;
  onEditAvatar: () => void;
  onEditBirthday: () => void;
  onEditDisplayName: () => void;
  onEditEmail: () => void;
  onEditPreferredLanguages: () => void;
  onEditPhone: () => void;
  user: LocalSession["user"];
}) {
  const { t } = usePriestessTranslation("account");
  const preferredLanguages = user?.preferredLanguages ?? [];
  return (
    <AccountSectionView icon={<UserRound size={21} strokeWidth={1.8} />} title={t("你的信息")} description={t("查看当前账户会话中已经确认的账户资料。")}>
      <div className="account-card-grid">
        <CopyInfoCard icon={<Copy size={19} strokeWidth={1.8} />} label={t("用户 ID")} onCopy={onCopy} value={user?.userId || t("未提供")} />
        <DisplayNameInfoCard avatarUrl={user?.avatarUrl || ""} displayName={displayName} onEditAvatar={onEditAvatar} onEditDisplayName={onEditDisplayName} />
        <InfoCard icon={<Server size={19} strokeWidth={1.8} />} label={t("用户名")} value={user?.username || t("未提供")} />
        <InfoCard icon={<UsersRound size={19} strokeWidth={1.8} />} label={t("用户组")} value={formatUserGroupLabel(user?.role)} />
        <EditableInfoCard ariaLabel={t("修改邮箱")} icon={<Mail size={19} strokeWidth={1.8} />} label={t("邮箱")} onEdit={onEditEmail} value={user?.email || t("未设置")} />
        <EditableInfoCard ariaLabel={t("修改偏好语言")} icon={<Languages size={19} strokeWidth={1.8} />} label={t("偏好语言")} onEdit={onEditPreferredLanguages} value={formatPreferredLanguagesSummary(preferredLanguages, t)} />
        <EditableCopyInfoCard ariaLabel={t("修改电话号")} icon={<Phone size={19} strokeWidth={1.8} />} label={t("电话号")} onCopy={onCopy} onEdit={onEditPhone} value={user?.phone || t("未设置")} />
        <EditableInfoCard ariaLabel={t("修改生日")} icon={<CalendarDays size={19} strokeWidth={1.8} />} label={t("生日")} onEdit={onEditBirthday} value={user?.birthday || t("未设置")} />
        <EditableCopyInfoCard ariaLabel={t("修改地址")} className="account-info-card--wide" icon={<MapPin size={19} strokeWidth={1.8} />} label={t("地址")} onCopy={onCopy} onEdit={onEditAddress} value={user?.address || t("未设置")} />
      </div>
    </AccountSectionView>
  );
}

function formatUserGroupLabel(role: string | undefined) {
  return role === "admin" ? "Admin" : "User";
}

function formatPreferredLanguagesSummary(languages: string[], t: (key: string, options?: Record<string, unknown>) => string) {
  if (languages.length === 0) {
    return t("未设置");
  }
  const summary = languages.slice(0, 4).map((language, index) => `${t(formatPreferredLanguagePriority(index))}: ${formatPreferredLanguageDisplay(language, t)}`);
  if (languages.length > 4) {
    summary.push(t("另有 {{count}} 项", { count: languages.length - 4 }));
  }
  return summary.join(" · ");
}

function formatPreferredLanguageDisplay(language: string, t: (key: string) => string) {
  const labels: Record<string, string> = {
    "de-DE": "Deutsch",
    "en-US": "English (US)",
    "es-ES": "Español",
    "fr-FR": "Français",
    "ja-JP": "日本語",
    "ko-KR": "한국어",
    "zh-CN": "简体中文",
    "zh-TW": "繁體中文",
  };
  return `${t(labels[language] ?? language)} (${language})`;
}

function formatPreferredLanguagePriority(index: number) {
  const labels = ["第一级", "第二级", "第三级", "第四级"];
  return labels[index] ?? `第 ${index + 1} 级`;
}

function EditableCopyInfoCard({ ariaLabel, className = "", icon, label, onCopy, onEdit, value }: {
  ariaLabel: string;
  className?: string;
  icon: ReactNode;
  label: string;
  onCopy: (label: string, value: string) => void;
  onEdit: () => void;
  value: string;
}) {
  const { t } = usePriestessTranslation("account");
  return (
    <article className={`account-info-card account-info-card--neutral account-info-card--with-action account-info-card--editable-copy${className ? ` ${className}` : ""}`}>
      <button aria-label={ariaLabel} className="account-info-card__copy-edit-button" onClick={onEdit} type="button">
        <span className="account-info-card__icon" aria-hidden="true">{icon}</span>
        <span className="account-info-card__content">
          <span>{label}</span>
          <strong>{value}</strong>
        </span>
      </button>
      <button aria-label={t("复制{{label}}", { label })} className="account-copy-button" onClick={() => onCopy(label, value)} type="button">
        <Copy aria-hidden="true" size={15} strokeWidth={1.8} />
        <span>{t("复制")}</span>
      </button>
    </article>
  );
}

function EditableInfoCard({ ariaLabel, icon, label, onEdit, value }: {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  onEdit: () => void;
  value: string;
}) {
  return (
    <article className="account-info-card account-info-card--neutral account-info-card--editable">
      <button aria-label={ariaLabel} className="account-info-card__text-button account-info-card__full-button" onClick={onEdit} type="button">
        <span className="account-info-card__icon" aria-hidden="true">{icon}</span>
        <span className="account-info-card__content">
          <span>{label}</span>
          <strong>{value}</strong>
        </span>
      </button>
    </article>
  );
}

function DisplayNameInfoCard({ avatarUrl, displayName, onEditAvatar, onEditDisplayName }: {
  avatarUrl: string;
  displayName: string;
  onEditAvatar: () => void;
  onEditDisplayName: () => void;
}) {
  const { t } = usePriestessTranslation("account");
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const displayAvatarUrl = getPriestessDisplayAvatarUrl(avatarUrl);
  const avatarImageUrl = avatarLoadFailed ? PRIESTESS_DEFAULT_AVATAR_URL : displayAvatarUrl;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  return (
    <article className="account-info-card account-info-card--neutral account-info-card--editable">
      <button aria-label={t("修改头像")} className="account-info-card__avatar-button" onClick={onEditAvatar} type="button">
        <span className="account-info-card__icon account-info-card__avatar account-info-card__avatar--image" aria-hidden="true">
          <img
            alt=""
            onError={() => {
              if (avatarImageUrl !== PRIESTESS_DEFAULT_AVATAR_URL) {
                setAvatarLoadFailed(true);
              }
            }}
            src={avatarImageUrl}
          />
        </span>
      </button>
      <button aria-label={t("修改显示名称")} className="account-info-card__text-button" onClick={onEditDisplayName} type="button">
        <span>{t("显示名称")}</span>
        <strong>{displayName}</strong>
      </button>
    </article>
  );
}

function CopyInfoCard({ className = "", icon, label, onCopy, value }: {
  className?: string;
  icon: ReactNode;
  label: string;
  onCopy: (label: string, value: string) => void;
  value: string;
}) {
  const { t } = usePriestessTranslation("account");
  return (
    <article className={`account-info-card account-info-card--neutral account-info-card--with-action${className ? ` ${className}` : ""}`}>
      <span className="account-info-card__icon" aria-hidden="true">{icon}</span>
      <div className="account-info-card__content">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <button aria-label={t("复制{{label}}", { label })} className="account-copy-button" onClick={() => onCopy(label, value)} type="button">
        <Copy aria-hidden="true" size={15} strokeWidth={1.8} />
        <span>{t("复制")}</span>
      </button>
    </article>
  );
}

function readSectionFromHash(): AccountSection {
  if (typeof window === "undefined") {
    return "overview";
  }

  const candidate = window.location.hash.replace(/^#/, "");
  if (ACCOUNT_SECTION_IDS.has(candidate as AccountSection)) {
    return candidate as AccountSection;
  }

  return "overview";
}

function writeSectionToHash(section: AccountSection) {
  if (typeof window === "undefined") {
    return;
  }

  const hash = section === "overview" ? "" : `#${section}`;
  const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(null, "", nextUrl);
}

function clearAccountManagementActionFromUrl(section: AccountManagementActionSection) {
  if (typeof window === "undefined") {
    return;
  }

  const nextSearch = removeAccountManagementActionFromSearch(window.location.search);
  const nextHash = section === "overview" ? "" : `#${section}`;
  window.history.replaceState(null, "", `${window.location.pathname}${nextSearch}${nextHash}`);
}
