import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  UserRound,
  UsersRound,
} from "lucide-react";
import {
  BrandMark,
  FloatingBackdrop,
  getAdminSession,
  getPriestessDisplayAvatarUrl,
  getPriestessApiBaseLabel,
  getPriestessApiErrorMessage,
  detectPriestessLanguage,
  loginAdminSession,
  listAdminQrSessions,
  listAdminUserPasskeys,
  listAdminUsers,
  listLoginRiskBuckets,
  listPasswordResetRequests,
  logoutAdminSession,
  translatePriestess,
  usePriestessTranslation,
  type AdminSession,
  type AdminPasswordResetRequest,
  type AdminPasskey,
  type AdminQrSession,
  type AdminUser,
  type LoginRiskBucket,
} from "@priestess/shared";
import "./AdminPage.css";

type AdminPageProps = {
  onNavigateToLogin: () => void;
  onNotice: (message: string) => void;
};

const QR_STATUS_OPTIONS = [
  { label: "全部", value: "all" },
  { label: "等待", value: "pending" },
  { label: "已扫码", value: "scanned" },
  { label: "二次确认", value: "pre_confirmed" },
  { label: "已确认", value: "confirmed" },
  { label: "已拒绝", value: "rejected" },
  { label: "已过期", value: "expired" },
];

const RISK_STATUS_OPTIONS = [
  { label: "已锁定", value: "locked" },
  { label: "全部", value: "all" },
];

const dateTimeFormatter = new Intl.DateTimeFormat(detectPriestessLanguage(), {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
});

export function AdminPage({ onNavigateToLogin, onNotice }: AdminPageProps) {
  const { t } = usePriestessTranslation("admin");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [qrSessions, setQrSessions] = useState<AdminQrSession[]>([]);
  const [riskBuckets, setRiskBuckets] = useState<LoginRiskBucket[]>([]);
  const [passwordResetRequests, setPasswordResetRequests] = useState<AdminPasswordResetRequest[]>([]);
  const [passkeys, setPasskeys] = useState<AdminPasskey[]>([]);
  const [adminLoginError, setAdminLoginError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [qrStatus, setQrStatus] = useState("all");
  const [riskStatus, setRiskStatus] = useState("locked");
  const [dashboardError, setDashboardError] = useState("");
  const [passkeyError, setPasskeyError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isPasskeysLoading, setIsPasskeysLoading] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const adminPasswordInputRef = useRef<HTMLInputElement>(null);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) => {
      return [user.username, user.displayName, user.email, user.userId]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, users]);

  const selectedUser = useMemo(() => {
    return users.find((user) => user.userId === selectedUserId) ?? null;
  }, [selectedUserId, users]);

  const enabledUserCount = useMemo(() => {
    return users.filter((user) => user.enabled !== false).length;
  }, [users]);

  const lockedRiskCount = useMemo(() => {
    return riskBuckets.filter((bucket) => Boolean(bucket.lockedUntil)).length;
  }, [riskBuckets]);

  const activePasskeyCount = useMemo(() => {
    return passkeys.filter((passkey) => !passkey.disabledAt).length;
  }, [passkeys]);

  const backedUpPasskeyCount = useMemo(() => {
    return passkeys.filter((passkey) => passkey.backedUp === true).length;
  }, [passkeys]);

  const loadDashboard = useCallback(async(signal?: AbortSignal) => {
    setIsLoading(true);
    setDashboardError("");

    let nextSession: AdminSession;
    try {
      nextSession = await getAdminSession({ signal });
    } catch (error) {
      if (signal?.aborted) {
        return;
      }
      setSession({ authenticated: false, expiresAt: "", raw: null });
      setUsers([]);
      setQrSessions([]);
      setRiskBuckets([]);
      setPasswordResetRequests([]);
      setPasskeys([]);
      setDashboardError(t("会话：{{message}}", { message: getPriestessApiErrorMessage(error) }));
      setLastLoadedAt(new Date());
      setIsLoading(false);
      return;
    }

    if (signal?.aborted) {
      return;
    }

    setSession(nextSession);
    if (!nextSession.authenticated) {
      setUsers([]);
      setQrSessions([]);
      setRiskBuckets([]);
      setPasswordResetRequests([]);
      setPasskeys([]);
      setDashboardError("");
      setLastLoadedAt(new Date());
      setIsLoading(false);
      return;
    }

    const [usersResult, qrResult, riskResult, resetResult] = await Promise.allSettled([
      listAdminUsers({ signal }),
      listAdminQrSessions({ limit: 30, status: qrStatus }, { signal }),
      listLoginRiskBuckets({ limit: 30, status: riskStatus }, { signal }),
      listPasswordResetRequests({ limit: 30, status: "active" }, { signal }),
    ]);

    if (signal?.aborted) {
      return;
    }

    const errors: string[] = [];

    if (usersResult.status === "fulfilled") {
      setUsers(usersResult.value);
    } else {
      setUsers([]);
      errors.push(t("用户：{{message}}", { message: getPriestessApiErrorMessage(usersResult.reason) }));
    }

    if (qrResult.status === "fulfilled") {
      setQrSessions(qrResult.value);
    } else {
      setQrSessions([]);
      errors.push(t("二维码：{{message}}", { message: getPriestessApiErrorMessage(qrResult.reason) }));
    }

    if (riskResult.status === "fulfilled") {
      setRiskBuckets(riskResult.value);
    } else {
      setRiskBuckets([]);
      errors.push(t("风险：{{message}}", { message: getPriestessApiErrorMessage(riskResult.reason) }));
    }

    if (resetResult.status === "fulfilled") {
      setPasswordResetRequests(resetResult.value);
    } else {
      setPasswordResetRequests([]);
      errors.push(t("重置：{{message}}", { message: getPriestessApiErrorMessage(resetResult.reason) }));
    }

    setDashboardError(errors.join(" / "));
    setLastLoadedAt(new Date());
    setIsLoading(false);
  }, [qrStatus, riskStatus, t]);

  useEffect(() => {
    const abortController = new AbortController();
    void loadDashboard(abortController.signal);
    return () => abortController.abort();
  }, [loadDashboard]);

  useEffect(() => {
    if (users.length === 0) {
      setSelectedUserId("");
      return;
    }

    if (!selectedUserId || !users.some((user) => user.userId === selectedUserId)) {
      setSelectedUserId(users[0].userId);
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUserId) {
      setPasskeys([]);
      setPasskeyError("");
      return undefined;
    }

    const abortController = new AbortController();
    setIsPasskeysLoading(true);
    setPasskeyError("");

    void listAdminUserPasskeys(selectedUserId, { signal: abortController.signal })
      .then((items) => {
        if (!abortController.signal.aborted) {
          setPasskeys(items);
        }
      })
      .catch((error: unknown) => {
        if (!abortController.signal.aborted) {
          setPasskeys([]);
          setPasskeyError(getPriestessApiErrorMessage(error));
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsPasskeysLoading(false);
        }
      });

    return () => abortController.abort();
  }, [selectedUserId]);

  const refreshDashboard = () => {
    void loadDashboard().then(() => onNotice(t("管理数据已刷新")));
  };

  const submitAdminLogin = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 管理密码只在提交瞬间从输入框读取，避免长期保存在 React state 里。
    const passwordInput = adminPasswordInputRef.current;
    const password = passwordInput?.value ?? "";
    if (!password) {
      setAdminLoginError(t("请输入管理员密码"));
      passwordInput?.focus();
      return;
    }

    setIsLoggingIn(true);
    setAdminLoginError("");
    try {
      const nextSession = await loginAdminSession(password);
      setSession(nextSession);
      onNotice(t("管理员已登录"));
      await loadDashboard();
    } catch (error) {
      setAdminLoginError(getPriestessApiErrorMessage(error, t("管理员登录失败")));
      passwordInput?.focus();
    } finally {
      if (passwordInput) {
        passwordInput.value = "";
      }
      setIsLoggingIn(false);
    }
  };

  const logout = async() => {
    setIsLoggingOut(true);
    try {
      await logoutAdminSession();
      setSession({ authenticated: false, expiresAt: "", raw: null });
      setUsers([]);
      setQrSessions([]);
      setRiskBuckets([]);
      setPasswordResetRequests([]);
      setPasskeys([]);
      onNotice(t("已退出登录"));
    } catch (error) {
      onNotice(getPriestessApiErrorMessage(error, t("退出登录失败")));
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <main className="admin-shell">
      <FloatingBackdrop />
      <header className="admin-topbar" aria-label={t("Priestess Manage")}>
        <BrandMark size="sm" />
        <div className="admin-topbar__actions">
          <button className="admin-button admin-button--quiet" onClick={onNavigateToLogin} type="button">
            <LogIn aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{t("登录页")}</span>
          </button>
          {session?.authenticated ? (
            <button className="admin-button admin-button--quiet" disabled={isLoggingOut} onClick={logout} type="button">
              <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{isLoggingOut ? t("退出中") : t("退出")}</span>
            </button>
          ) : null}
        </div>
      </header>

      <section className="admin-page" aria-labelledby="admin-title">
        <div className="admin-header">
          <div>
            <h1 id="admin-title">Priestess Manage</h1>
            <p>{session?.authenticated ? t("管理员会话已启用") : t("等待管理员会话")}</p>
          </div>
          <div className="admin-header__actions">
            <button className="admin-button admin-button--primary" disabled={isLoading} onClick={refreshDashboard} type="button">
              <RefreshCw aria-hidden="true" className={isLoading ? "is-spinning" : ""} size={18} strokeWidth={1.8} />
              <span>{isLoading ? t("刷新中") : t("刷新")}</span>
            </button>
          </div>
        </div>

        <div className="admin-status-strip" aria-label={t("连接状态")}>
          <StatusItem icon={<Server size={17} strokeWidth={1.8} />} label="API" value={getPriestessApiBaseLabel()} />
          <StatusItem
            icon={session?.authenticated ? <CheckCircle2 size={17} strokeWidth={1.8} /> : <LockKeyhole size={17} strokeWidth={1.8} />}
            label={t("会话")}
            tone={session?.authenticated ? "good" : "warn"}
            value={session?.authenticated ? t("已登录") : t("未登录")}
          />
          <StatusItem icon={<Clock3 size={17} strokeWidth={1.8} />} label={t("上次刷新")} value={lastLoadedAt ? dateTimeFormatter.format(lastLoadedAt) : t("未刷新")} />
        </div>

        {dashboardError ? (
          <div className="admin-alert" role="status">
            <AlertTriangle aria-hidden="true" size={18} strokeWidth={1.8} />
            <span>{dashboardError}</span>
          </div>
        ) : null}

        {session?.authenticated ? (
          <>
        <section className="admin-metrics" aria-label={t("管理概览")}>
          <MetricCard icon={<UsersRound size={20} strokeWidth={1.8} />} label={t("本地用户")} value={String(users.length)} detail={t("{{count}} 个启用", { count: enabledUserCount })} />
          <MetricCard icon={<QrCode size={20} strokeWidth={1.8} />} label={t("二维码会话")} value={String(qrSessions.length)} detail={formatStatusSummary(qrSessions)} />
          <MetricCard icon={<ShieldAlert size={20} strokeWidth={1.8} />} label={t("登录风险")} value={String(riskBuckets.length)} detail={t("{{count}} 个锁定", { count: lockedRiskCount })} />
          <MetricCard icon={<KeyRound size={20} strokeWidth={1.8} />} label="Passkey" value={String(passkeys.length)} detail={t("{{count}} 个可用", { count: activePasskeyCount })} />
        </section>

        <div className="admin-grid">
          <section className="admin-panel admin-panel--users" aria-labelledby="admin-users-title">
            <PanelHeader
              icon={<UsersRound size={19} strokeWidth={1.8} />}
              title={t("本地用户")}
              action={(
                <label className="admin-search">
                  <Search aria-hidden="true" size={17} strokeWidth={1.8} />
                  <input
                    aria-label={t("筛选用户")}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t("筛选用户")}
                    type="search"
                    value={query}
                  />
                </label>
              )}
            />

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t("用户")}</th>
                    <th>{t("邮箱")}</th>
                    <th>{t("状态")}</th>
                    <th>{t("更新时间")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.map((user) => (
                    <tr className={user.userId === selectedUserId ? "is-selected" : ""} key={user.userId}>
                      <td>
                        <button className="admin-row-button" onClick={() => setSelectedUserId(user.userId)} type="button">
                          <span className="admin-avatar" aria-hidden="true">
                            <img alt="" src={getPriestessDisplayAvatarUrl(user.avatarUrl)} />
                          </span>
                          <span>
                            <strong>{user.displayName}</strong>
                            <small>{user.username}</small>
                          </span>
                        </button>
                      </td>
                      <td>{user.email || t("未设置")}</td>
                      <td><StatusBadge label={formatEnabled(user.enabled)} tone={user.enabled === false ? "danger" : "good"} /></td>
                      <td>{formatDateTime(user.updatedAt || user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!isLoading && visibleUsers.length === 0 ? (
              <EmptyState icon={<UserRound size={22} strokeWidth={1.8} />} title={t("暂无用户")} />
            ) : null}
          </section>

          <aside className="admin-side">
            <section className="admin-panel" aria-labelledby="admin-passkeys-title">
              <PanelHeader icon={<KeyRound size={19} strokeWidth={1.8} />} title="Passkey" />
              <div className="admin-selected-user">
                <span>{selectedUser?.displayName ?? t("未选择用户")}</span>
                <small>{formatPasskeySummary(passkeys, activePasskeyCount, backedUpPasskeyCount, selectedUser)}</small>
              </div>

              {passkeyError ? (
                <div className="admin-inline-error">{passkeyError}</div>
              ) : null}

              <div className="admin-passkey-list">
                {isPasskeysLoading ? (
                  <div className="admin-passkey-card admin-passkey-card--loading">
                    <span>{t("正在读取 Passkey")}</span>
                  </div>
                ) : null}
                {passkeys.map((passkey) => (
                  <article className="admin-passkey-card" key={passkey.credentialId}>
                    <div className="admin-passkey-card__header">
                      <div>
                        <strong>{passkey.name}</strong>
                        <small>{shortId(passkey.credentialId)}</small>
                      </div>
                      <StatusBadge label={formatPasskeyStatus(passkey)} tone={getPasskeyStatusTone(passkey)} />
                    </div>
                    <dl className="admin-passkey-facts">
                      <div>
                        <dt>{t("设备")}</dt>
                        <dd>{formatPasskeyDevice(passkey.deviceType)}</dd>
                      </div>
                      <div>
                        <dt>{t("备份")}</dt>
                        <dd>{passkey.backedUp === true ? t("已备份") : t("未标记")}</dd>
                      </div>
                      <div>
                        <dt>Transport</dt>
                        <dd>{formatPasskeyTransports(passkey.transports)}</dd>
                      </div>
                      <div>
                        <dt>{t("计数器")}</dt>
                        <dd>{passkey.counter === null ? t("未提供") : String(passkey.counter)}</dd>
                      </div>
                      <div>
                        <dt>{t("创建")}</dt>
                        <dd>{formatDateTime(passkey.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>{t("最近使用")}</dt>
                        <dd>{formatDateTime(passkey.lastUsedAt)}</dd>
                      </div>
                      {passkey.disabledAt ? (
                        <div>
                          <dt>{t("禁用")}</dt>
                          <dd>{formatDateTime(passkey.disabledAt)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </article>
                ))}
              </div>

              {!isPasskeysLoading && passkeys.length === 0 && !passkeyError ? (
                <EmptyState icon={<KeyRound size={22} strokeWidth={1.8} />} title={t("暂无 Passkey")} compact />
              ) : null}
            </section>

            <section className="admin-panel" aria-labelledby="admin-risk-title">
              <PanelHeader
                icon={<ShieldAlert size={19} strokeWidth={1.8} />}
                title={t("登录风险")}
                action={(
                  <select aria-label={t("风险状态")} className="admin-select" onChange={(event) => setRiskStatus(event.target.value)} value={riskStatus}>
                    {RISK_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{t(option.label)}</option>
                    ))}
                  </select>
                )}
              />

              <div className="admin-list">
                {riskBuckets.map((bucket) => (
                  <div className="admin-list-row admin-list-row--risk" key={bucket.bucketKey}>
                    <div>
                      <strong>{bucket.scope}</strong>
                      <small>{describeContext(bucket.context)}</small>
                    </div>
                    <span>{t("{{count}} 次", { count: bucket.failureCount ?? 0 })}</span>
                  </div>
                ))}
              </div>

              {!isLoading && riskBuckets.length === 0 ? (
                <EmptyState icon={<ShieldAlert size={22} strokeWidth={1.8} />} title={t("暂无风险桶")} compact />
              ) : null}
            </section>

            <PasswordResetRequestsPanel requests={passwordResetRequests} />
          </aside>
        </div>

        <section className="admin-panel" aria-labelledby="admin-qr-title">
          <PanelHeader
            icon={<QrCode size={19} strokeWidth={1.8} />}
            title={t("二维码会话")}
            action={(
              <select aria-label={t("二维码状态")} className="admin-select" onChange={(event) => setQrStatus(event.target.value)} value={qrStatus}>
                {QR_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{t(option.label)}</option>
                ))}
              </select>
            )}
          />

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t("会话")}</th>
                  <th>{t("状态")}</th>
                  <th>{t("应用")}</th>
                  <th>{t("安全级别")}</th>
                  <th>{t("过期时间")}</th>
                  <th>{t("上下文")}</th>
                </tr>
              </thead>
              <tbody>
                {qrSessions.map((item) => (
                  <tr key={item.sessionId}>
                    <td>
                      <span className="admin-mono">{shortId(item.sessionId)}</span>
                    </td>
                    <td><StatusBadge label={formatQrStatus(item.status)} tone={getQrStatusTone(item.status)} /></td>
                    <td>{item.appId || t("默认应用")}</td>
                    <td>{item.securityLevel === null ? t("未判定") : `L${item.securityLevel}`}</td>
                    <td>{formatDateTime(item.expiresAt)}</td>
                    <td>{describeContext(item.phoneContext || item.pcContext)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isLoading && qrSessions.length === 0 ? (
            <EmptyState icon={<QrCode size={22} strokeWidth={1.8} />} title={t("暂无二维码会话")} />
          ) : null}
        </section>
          </>
        ) : (
          <section className="admin-panel admin-login-panel" aria-labelledby="admin-login-title">
            <div className="admin-login-panel__content">
              <span className="admin-login-panel__icon" aria-hidden="true">
                <LockKeyhole size={24} strokeWidth={1.8} />
              </span>
              <div>
                <h2 id="admin-login-title">{t("管理员登录")}</h2>
                <p>{t("使用 Phainon 管理密码建立 HttpOnly 管理会话。")}</p>
              </div>
              <form className="admin-login-form" onSubmit={submitAdminLogin}>
                <label className="admin-password-field">
                  <span>{t("管理员密码")}</span>
                  <input
                    autoComplete="current-password"
                    name="admin-password"
                    onChange={(event) => {
                      if (adminLoginError) setAdminLoginError("");
                    }}
                    ref={adminPasswordInputRef}
                    type="password"
                  />
                </label>
                {adminLoginError ? <div className="admin-inline-error">{adminLoginError}</div> : null}
                <button className="admin-button admin-button--primary" disabled={isLoggingIn} type="submit">
                  <LockKeyhole aria-hidden="true" size={17} strokeWidth={1.8} />
                  <span>{isLoggingIn ? t("登录中") : t("登录 Manage")}</span>
                </button>
              </form>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function PanelHeader({ action, icon, title }: { action?: ReactNode; icon: ReactNode; title: string }) {
  return (
    <div className="admin-panel__header">
      <div className="admin-panel__title">
        <span aria-hidden="true">{icon}</span>
        <h2>{title}</h2>
      </div>
      {action ? <div className="admin-panel__action">{action}</div> : null}
    </div>
  );
}

function StatusItem({ icon, label, tone = "neutral", value }: { icon: ReactNode; label: string; tone?: "good" | "neutral" | "warn"; value: string }) {
  return (
    <div className={`admin-status-item admin-status-item--${tone}`}>
      <span className="admin-status-item__icon" aria-hidden="true">{icon}</span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricCard({ detail, icon, label, value }: { detail: string; icon: ReactNode; label: string; value: string }) {
  return (
    <div className="admin-metric">
      <span className="admin-metric__icon" aria-hidden="true">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "danger" | "good" | "neutral" | "warn" }) {
  return <span className={`admin-status-badge admin-status-badge--${tone}`}>{label}</span>;
}

function EmptyState({ compact = false, icon, title }: { compact?: boolean; icon: ReactNode; title: string }) {
  return (
    <div className={`admin-empty ${compact ? "admin-empty--compact" : ""}`}>
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
    </div>
  );
}

function PasswordResetRequestsPanel({ requests }: { requests: AdminPasswordResetRequest[] }) {
  const { t } = usePriestessTranslation("admin");
  return (
    <section className="admin-panel" aria-labelledby="admin-password-reset-title">
      <PanelHeader icon={<LockKeyhole size={19} strokeWidth={1.8} />} title={t("密码重置")} />
      <div className="admin-list">
        {requests.map((request) => (
          <div className="admin-list-row admin-list-row--reset" key={request.requestId}>
            <div>
              <strong>{request.username || request.userId}</strong>
              <small>{request.email || shortId(request.requestId)}</small>
              <small>{formatDateTime(request.createdAt)} · {t("过期 {{date}}", { date: formatDateTime(request.expiresAt) })}</small>
            </div>
            <StatusBadge label={formatPasswordResetStatus(request)} tone={getPasswordResetStatusTone(request)} />
          </div>
        ))}
      </div>
      {requests.length === 0 ? (
        <EmptyState icon={<LockKeyhole size={22} strokeWidth={1.8} />} title={t("暂无重置申请")} compact />
      ) : null}
    </section>
  );
}

function formatPasswordResetStatus(request: AdminPasswordResetRequest) {
  if (request.usedAt || request.status === "used") {
    return translatePriestess("admin:已使用");
  }
  if (request.status === "email_sent") {
    return translatePriestess("admin:已发信");
  }

  return translatePriestess("admin:待处理");
}

function getPasswordResetStatusTone(request: AdminPasswordResetRequest): "danger" | "good" | "neutral" | "warn" {
  if (request.usedAt || request.status === "used") {
    return "good";
  }
  if (request.status === "email_sent") {
    return "neutral";
  }

  return "warn";
}

function formatPasskeySummary(passkeys: AdminPasskey[], activeCount: number, backedUpCount: number, selectedUser: AdminUser | null) {
  if (!selectedUser) {
    return translatePriestess("admin:无用户数据");
  }
  if (passkeys.length === 0) {
    return selectedUser.email || selectedUser.username || translatePriestess("admin:暂无 Passkey");
  }

  return translatePriestess("admin:{{activeCount}} 个可用 · {{backedUpCount}} 个已备份", { activeCount, backedUpCount });
}

function formatPasskeyStatus(passkey: AdminPasskey) {
  if (passkey.disabledAt) {
    return translatePriestess("admin:已禁用");
  }
  if (passkey.backedUp === true) {
    return translatePriestess("admin:可用");
  }

  return translatePriestess("admin:需关注");
}

function getPasskeyStatusTone(passkey: AdminPasskey): "danger" | "good" | "neutral" | "warn" {
  if (passkey.disabledAt) {
    return "danger";
  }
  if (passkey.backedUp === true) {
    return "good";
  }

  return "warn";
}

function formatPasskeyDevice(value: string) {
  if (value === "singleDevice") {
    return translatePriestess("admin:单设备");
  }
  if (value === "multiDevice") {
    return translatePriestess("admin:多设备");
  }

  return value || translatePriestess("admin:平台凭据");
}

function formatPasskeyTransports(values: string[]) {
  if (values.length === 0) {
    return translatePriestess("admin:未提供");
  }

  return values.join(" · ");
}

function formatEnabled(enabled: boolean | null) {
  if (enabled === false) {
    return translatePriestess("admin:停用");
  }

  return translatePriestess("admin:启用");
}

function formatDateTime(value: string) {
  if (!value) {
    return translatePriestess("admin:未提供");
  }

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue) && value.trim() !== ""
    ? new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue)
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date);
}

function formatQrStatus(status: string) {
  const labels: Record<string, string> = {
    confirmed: translatePriestess("admin:已确认"),
    expired: translatePriestess("admin:已过期"),
    pending: translatePriestess("admin:等待"),
    pre_confirmed: translatePriestess("admin:二次确认"),
    rejected: translatePriestess("admin:已拒绝"),
    scanned: translatePriestess("admin:已扫码"),
  };

  return labels[status] ?? status;
}

function getQrStatusTone(status: string): "danger" | "good" | "neutral" | "warn" {
  if (status === "confirmed") {
    return "good";
  }
  if (status === "rejected" || status === "expired") {
    return "danger";
  }
  if (status === "pre_confirmed" || status === "scanned") {
    return "warn";
  }

  return "neutral";
}

function formatStatusSummary(items: AdminQrSession[]) {
  const activeCount = items.filter((item) => ["pending", "scanned", "pre_confirmed"].includes(item.status)).length;
  return translatePriestess("admin:{{count}} 个进行中", { count: activeCount });
}

function shortId(value: string) {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function describeContext(value: unknown) {
  const parsedValue = parseContext(value);
  if (!parsedValue) {
    return translatePriestess("admin:无上下文");
  }

  if (typeof parsedValue === "string") {
    return parsedValue;
  }

  const parts = Object.entries(parsedValue)
    .filter(([, entryValue]) => ["number", "string", "boolean"].includes(typeof entryValue))
    .slice(0, 4)
    .map(([key, entryValue]) => `${key}: ${String(entryValue)}`);

  return parts.length > 0 ? parts.join(" · ") : translatePriestess("admin:无上下文");
}

function parseContext(value: unknown): Record<string, unknown> | string | null {
  if (typeof value === "string") {
    const cleanValue = value.trim();
    if (!cleanValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(cleanValue) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      return cleanValue;
    }

    return cleanValue;
  }

  if (isRecord(value)) {
    return value;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
