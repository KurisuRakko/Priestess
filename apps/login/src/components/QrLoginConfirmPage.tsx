import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Loader2, Moon, ShieldAlert, Sun, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  confirmQrPhoneSession,
  finalConfirmQrPhoneSession,
  getLocalSession,
  getPriestessDisplayAvatarUrl,
  getPriestessApiErrorMessage,
  getQrPhoneSession,
  translatePriestess,
  usePriestessTranslation,
  type LocalSession,
  type QrPhoneContext,
  type QrPhoneSession,
  type QrPhoneSessionResult,
} from "@priestess/shared";
import prtsBlack from "../assets/qr-mobile/prtsblack.png";
import prtsWhite from "../assets/qr-mobile/prtswhite.png";
import "./QrLoginConfirmPage.css";

type QrLoginConfirmPageProps = {
  onNavigateToLogin: () => void;
  onNotice: (message: string) => void;
};

type PageStatus = "agreed" | "error" | "loading" | "pending" | "rejected";
type ErrorKind = "backend" | "login-required" | "missing-session";
type OverlayMode = "warning" | null;
type SubmittingAction = "agreed" | "final" | "rejected" | null;

export function QrLoginConfirmPage({ onNavigateToLogin, onNotice }: QrLoginConfirmPageProps) {
  const { t } = usePriestessTranslation("login");
  const sessionId = useMemo(() => readQrSessionId(), []);
  const [errorKind, setErrorKind] = useState<ErrorKind>("backend");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<SubmittingAction>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>(null);
  const [qrResult, setQrResult] = useState<QrPhoneSessionResult | null>(null);
  const [session, setSession] = useState<LocalSession | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [warningCountdown, setWarningCountdown] = useState(0);

  const qrSession = qrResult?.session ?? null;
  const currentUser = session?.user ?? qrResult?.user ?? null;
  const applicationName = qrSession?.appName || qrSession?.appId || "Priestess";
  const applicationLogo = readApplicationLogo(qrResult) || (isDark ? prtsBlack : prtsWhite);
  const avatarUrl = getPriestessDisplayAvatarUrl(currentUser?.avatarUrl);
  const accountLabel = currentUser?.displayName || currentUser?.username || t("Priestess 账号");
  const pcLocation = formatContextLocation(qrSession?.pcContext ?? null);
  const phoneLocation = formatContextLocation(qrSession?.phoneContext ?? null);
  const pcIpAddress = qrSession?.pcContext?.ipAddress || "";
  const canConfirmSession = qrResult?.canConfirm ?? true;
  const canFinalConfirmSession = qrResult?.canFinalConfirm ?? qrSession?.status === "pre_confirmed";
  const canRejectSession = qrResult?.canReject ?? true;
  const mainConfirmLabel = canFinalConfirmSession ? t("确认登录") : t("授权登录");

  const showError = useCallback((message: string, kind: ErrorKind = "backend") => {
    setErrorKind(kind);
    setErrorMessage(message);
    setOverlayMode(null);
    setStatus("error");
  }, []);

  const openWarningOverlay = useCallback(() => {
    setOverlayMode("warning");
    setWarningCountdown(3);
  }, []);

  const settleQrResult = useCallback((result: QrPhoneSessionResult, options: { allowPendingOverlay?: boolean } = {}) => {
    setQrResult(result);
    const nextSession = result.session;

    if (!nextSession) {
      showError(t("无法读取扫码会话，请回到电脑端重新生成二维码。"));
      return;
    }
    if (nextSession.status === "confirmed") {
      setOverlayMode(null);
      setStatus("agreed");
      return;
    }
    if (nextSession.status === "rejected") {
      setOverlayMode(null);
      setStatus("rejected");
      return;
    }
    if (nextSession.status === "expired") {
      showError(t("二维码已过期，请回到电脑端重新生成二维码。"));
      return;
    }

    setStatus("pending");
    if (!options.allowPendingOverlay) {
      return;
    }
    if (result.requiresConfirmation || result.canFinalConfirm || nextSession.status === "pre_confirmed") {
      openWarningOverlay();
    }
  }, [openWarningOverlay, showError, t]);

  const loadQrSession = useCallback(async(signal?: AbortSignal) => {
    setStatus("loading");
    setErrorMessage("");
    setOverlayMode(null);

    if (!sessionId) {
      showError(t("二维码缺少 sessionId，请从电脑端重新扫码。"), "missing-session");
      return;
    }

    try {
      const localSession = await getLocalSession({ signal });
      if (signal?.aborted) return;
      setSession(localSession);

      if (!localSession.authenticated || !localSession.user) {
        showError(t("请先登录 Priestess 账号。"), "login-required");
        return;
      }

      const result = await getQrPhoneSession(sessionId, { signal });
      if (signal?.aborted) return;
      settleQrResult(result, { allowPendingOverlay: true });
    } catch (error) {
      if (!signal?.aborted) {
        showError(getPriestessApiErrorMessage(error, t("无法读取扫码会话")));
      }
    }
  }, [sessionId, settleQrResult, showError, t]);

  useEffect(() => {
    const abortController = new AbortController();
    void loadQrSession(abortController.signal);
    return () => abortController.abort();
  }, [loadQrSession]);

  useEffect(() => {
    if (overlayMode !== "warning" || warningCountdown <= 0) return;
    const timer = window.setTimeout(() => setWarningCountdown((current) => Math.max(current - 1, 0)), 1000);
    return () => window.clearTimeout(timer);
  }, [overlayMode, warningCountdown]);

  const confirmLogin = async() => {
    if (!sessionId || isSubmitting) return;
    if (canFinalConfirmSession) {
      openWarningOverlay();
      return;
    }
    setIsSubmitting("agreed");
    setErrorMessage("");

    try {
      const result = await confirmQrPhoneSession(sessionId, "confirm");
      setQrResult(result);
      if (result.requiresConfirmation || result.session?.status === "pre_confirmed") {
        openWarningOverlay();
        onNotice(t("请核对设备和位置后完成二次确认"));
        return;
      }
      settleQrResult(result, { allowPendingOverlay: true });
      if (result.session?.status === "confirmed") {
        onNotice(t("已授权本次扫码登录"));
      } else if (result.session?.status === "rejected") {
        onNotice(t("本次扫码登录已被取消"));
      }
    } catch (error) {
      showError(getPriestessApiErrorMessage(error, t("授权失败")));
    } finally {
      setIsSubmitting(null);
    }
  };

  const rejectLogin = async() => {
    if (!sessionId || isSubmitting) return;
    setIsSubmitting("rejected");
    setErrorMessage("");

    try {
      const result = await confirmQrPhoneSession(sessionId, "reject");
      settleQrResult(result);
      if (result.session?.status === "rejected") {
        onNotice(t("已取消本次扫码登录"));
      }
    } catch (error) {
      showError(getPriestessApiErrorMessage(error, t("取消失败")));
    } finally {
      setIsSubmitting(null);
    }
  };

  const finalConfirmLogin = async() => {
    if (!sessionId || isSubmitting || warningCountdown > 0) return;
    setIsSubmitting("final");
    setErrorMessage("");

    try {
      const result = await finalConfirmQrPhoneSession(sessionId);
      settleQrResult(result, { allowPendingOverlay: true });
      if (result.session?.status === "confirmed") {
        onNotice(t("已授权本次扫码登录"));
      }
    } catch (error) {
      showError(getPriestessApiErrorMessage(error, t("最终确认失败")));
    } finally {
      setIsSubmitting(null);
    }
  };

  const closeOverlay = () => {
    setOverlayMode(null);
    setErrorMessage("");
  };

  return (
    <main className={isDark ? "qr-mobile-shell qr-mobile-shell--dark" : "qr-mobile-shell"}>
      <section className="qr-mobile-phone" aria-busy={status === "loading" || isSubmitting !== null} aria-label={t("Priestess 扫码登录确认")}>
        <button
          aria-label={isDark ? t("切换到亮色模式") : t("切换到深色模式")}
          className="qr-mobile-theme-toggle"
          onClick={() => setIsDark((current) => !current)}
          type="button"
        >
          {isDark ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
        </button>

        <SecurityOverlay
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          mode={overlayMode}
          onCancel={closeOverlay}
          onFinalConfirm={finalConfirmLogin}
          pcLocation={pcLocation}
          phoneLocation={phoneLocation}
          warningCountdown={warningCountdown}
        />

        <AnimatePresence initial={false} mode="wait">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            aria-hidden={overlayMode ? true : undefined}
            className="qr-mobile-content"
            exit={{ opacity: 0, y: -12 }}
            initial={{ opacity: 0, y: 15 }}
            inert={overlayMode ? true : undefined}
            key={status}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {status === "loading" ? (
              <LoadingView />
            ) : status === "error" ? (
              <ErrorView
                errorKind={errorKind}
                message={errorMessage}
                onNavigateToLogin={onNavigateToLogin}
                onRetry={() => void loadQrSession()}
              />
            ) : status === "pending" && qrSession ? (
              <PendingView
                accountLabel={accountLabel}
                applicationLogo={applicationLogo}
                applicationName={applicationName}
                avatarUrl={avatarUrl}
                canConfirm={canConfirmSession || canFinalConfirmSession}
                canReject={canRejectSession}
                isSubmitting={isSubmitting}
                mainConfirmLabel={mainConfirmLabel}
                onConfirm={confirmLogin}
                onReject={rejectLogin}
                pcContext={qrSession.pcContext}
                pcIpAddress={pcIpAddress}
                pcLocation={pcLocation}
              />
            ) : status === "agreed" ? (
              <ResultView
                icon={<CheckCircle2 size={80} strokeWidth={1.5} />}
                tone="success"
                title={t("已授权登录")}
                description={t("请回到电脑端继续使用。")}
              />
            ) : (
              <ResultView
                icon={<XCircle size={80} strokeWidth={1.5} />}
                tone="danger"
                title={t("已取消登录")}
                description={t("本次扫码登录请求已经取消。")}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <BottomActions
          errorKind={errorKind}
          canConfirm={canConfirmSession || canFinalConfirmSession}
          canReject={canRejectSession}
          isSubmitting={isSubmitting}
          isOverlayOpen={overlayMode !== null}
          mainConfirmLabel={mainConfirmLabel}
          onClose={() => window.close()}
          onConfirm={confirmLogin}
          onNavigateToLogin={onNavigateToLogin}
          onReject={rejectLogin}
          onRetry={() => void loadQrSession()}
          status={status}
        />
      </section>
    </main>
  );
}

function SecurityOverlay({
  errorMessage,
  isSubmitting,
  mode,
  onCancel,
  onFinalConfirm,
  pcLocation,
  phoneLocation,
  warningCountdown,
}: {
  errorMessage: string;
  isSubmitting: SubmittingAction;
  mode: OverlayMode;
  onCancel: () => void;
  onFinalConfirm: () => void;
  pcLocation: string;
  phoneLocation: string;
  warningCountdown: number;
}) {
  const { t } = usePriestessTranslation("login");
  return (
    <AnimatePresence>
      {mode ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="qr-mobile-overlay"
          exit={{ opacity: 0, y: 30 }}
          initial={{ opacity: 0, y: 30 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-mobile-overlay-title"
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="qr-mobile-alert-icon" aria-hidden="true">
            <ShieldAlert size={40} strokeWidth={1.5} />
          </div>

          <h2 id="qr-mobile-overlay-title">{t("请确认是你本人操作")}</h2>
          <p>{t("电脑端和手机端环境存在差异，请核对后再授权登录。")}</p>

          <div className="qr-mobile-location-card">
            <QrLocationRow label={t("PC 位置")} value={pcLocation} />
            <QrLocationRow label={t("手机位置")} value={phoneLocation} />
          </div>

          {errorMessage ? <strong aria-live="polite" role="status">{errorMessage}</strong> : null}
          <button className="qr-mobile-primary qr-mobile-primary--danger" disabled={warningCountdown > 0 || isSubmitting !== null} onClick={onFinalConfirm} type="button">
            {isSubmitting === "final" ? <Loader2 className="qr-mobile-spin" size={22} /> : warningCountdown > 0 ? t("请等待 ({{seconds}}s)", { seconds: warningCountdown }) : t("确认登录")}
          </button>
          <button className="qr-mobile-plain-button" disabled={isSubmitting !== null} onClick={onCancel} type="button">
            {t("取消")}
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function LoadingView() {
  const { t } = usePriestessTranslation("login");
  return (
    <div className="qr-mobile-center" role="status">
      <Loader2 className="qr-mobile-spin qr-mobile-loading-icon" size={48} strokeWidth={2} />
      <p>{t("正在加载扫码会话...")}</p>
    </div>
  );
}

function ErrorView({
  errorKind,
  message,
  onNavigateToLogin,
  onRetry,
}: {
  errorKind: ErrorKind;
  message: string;
  onNavigateToLogin: () => void;
  onRetry: () => void;
}) {
  const { t } = usePriestessTranslation("login");
  const isLoginRequired = errorKind === "login-required";
  return (
    <div className="qr-mobile-center qr-mobile-center--error">
      <motion.div
        animate={{ scale: 1 }}
        initial={{ scale: 0 }}
        transition={{ bounce: 0.4, duration: 0.6, type: "spring" }}
      >
        <AlertCircle className="qr-mobile-result-danger" size={80} strokeWidth={1.5} />
      </motion.div>
      <h1>{isLoginRequired ? t("请先登录 Priestess 账号") : t("扫码登录不可用")}</h1>
      <p>{message || t("请稍后重试，或回到登录页重新扫码。")}</p>
      <div className="qr-mobile-error-actions">
        {isLoginRequired ? null : (
          <button className="qr-mobile-secondary" onClick={onRetry} type="button">
            {t("重试")}
          </button>
        )}
        <button className="qr-mobile-secondary" onClick={onNavigateToLogin} type="button">
          {t("返回登录页")}
        </button>
      </div>
    </div>
  );
}

function PendingView({
  accountLabel,
  applicationLogo,
  applicationName,
  avatarUrl,
  canConfirm,
  canReject,
  isSubmitting,
  mainConfirmLabel,
  onConfirm,
  onReject,
  pcContext,
  pcIpAddress,
  pcLocation,
}: {
  accountLabel: string;
  applicationLogo: string;
  applicationName: string;
  avatarUrl: string;
  canConfirm: boolean;
  canReject: boolean;
  isSubmitting: SubmittingAction;
  mainConfirmLabel: string;
  onConfirm: () => void;
  onReject: () => void;
  pcContext: QrPhoneContext | null;
  pcIpAddress: string;
  pcLocation: string;
}) {
  const { t } = usePriestessTranslation("login");
  return (
    <div className="qr-mobile-pending">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="qr-mobile-heading"
        initial={{ opacity: 0, y: -20 }}
        transition={{ delay: 0.1, duration: 0.5, ease: "easeOut" }}
      >
        <img alt={applicationName} className="qr-mobile-logo" src={applicationLogo} />
        <h1>{t("{{applicationName}} 登录确认", { applicationName })}</h1>
        <p>{t("请确认是否授权电脑端登录你的 Priestess 账号。")}</p>
      </motion.div>

      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="qr-mobile-device-wrap"
        initial={{ opacity: 0, scale: 0.95 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <div className="qr-mobile-device-card">
          <img alt={t("当前账号头像")} className="qr-mobile-avatar" src={avatarUrl} />
          <div>
            <strong>{t("PC 设备")}</strong>
            {pcIpAddress ? <span className="qr-mobile-mono">IP: {pcIpAddress}</span> : null}
            <span>{pcLocation}</span>
            {pcContext?.userAgent ? <small>{summarizeUserAgent(pcContext.userAgent)}</small> : null}
            <em>{accountLabel}</em>
          </div>
        </div>
      </motion.div>

      <div className="qr-mobile-inline-actions" aria-hidden="true">
        <button className="qr-mobile-primary" disabled={isSubmitting !== null || !canConfirm} onClick={onConfirm} tabIndex={-1} type="button">
          {isSubmitting === "agreed" ? <Loader2 className="qr-mobile-spin" size={22} /> : mainConfirmLabel}
        </button>
        <button className="qr-mobile-secondary" disabled={isSubmitting !== null || !canReject} onClick={onReject} tabIndex={-1} type="button">
          {isSubmitting === "rejected" ? <Loader2 className="qr-mobile-spin" size={20} /> : t("取消")}
        </button>
      </div>
    </div>
  );
}

function ResultView({ description, icon, title, tone }: { description: string; icon: ReactNode; title: string; tone: "danger" | "success" }) {
  return (
    <div className="qr-mobile-center qr-mobile-center--result">
      <motion.div
        animate={{ rotate: 0, scale: 1 }}
        className={tone === "success" ? "qr-mobile-result-success" : "qr-mobile-result-danger"}
        initial={{ rotate: tone === "danger" ? -90 : 0, scale: 0 }}
        transition={{ bounce: 0.48, duration: 0.6, type: "spring" }}
      >
        {icon}
      </motion.div>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}

function BottomActions({
  canConfirm,
  canReject,
  errorKind,
  isOverlayOpen,
  isSubmitting,
  mainConfirmLabel,
  onClose,
  onConfirm,
  onNavigateToLogin,
  onReject,
  onRetry,
  status,
}: {
  canConfirm: boolean;
  canReject: boolean;
  errorKind: ErrorKind;
  isOverlayOpen: boolean;
  isSubmitting: SubmittingAction;
  mainConfirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  onNavigateToLogin: () => void;
  onReject: () => void;
  onRetry: () => void;
  status: PageStatus;
}) {
  const { t } = usePriestessTranslation("login");
  const isActionBlocked = isOverlayOpen || isSubmitting !== null;
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      aria-hidden={isOverlayOpen ? true : undefined}
      className="qr-mobile-bottom"
      initial={{ opacity: 0, y: 20 }}
      inert={isOverlayOpen ? true : undefined}
      transition={{ delay: 0.3, duration: 0.5 }}
    >
      <AnimatePresence mode="wait">
        {status === "pending" ? (
          <motion.div animate={{ opacity: 1, y: 0 }} className="qr-mobile-action-stack" exit={{ opacity: 0, y: -10 }} initial={{ opacity: 0, y: 10 }} key="pending">
            <motion.button
              className="qr-mobile-primary"
              disabled={isActionBlocked || !canConfirm}
              onClick={onConfirm}
              type="button"
              whileHover={isActionBlocked ? {} : { scale: 1.02 }}
              whileTap={isActionBlocked ? {} : { scale: 0.98 }}
            >
              {isSubmitting === "agreed" ? <Loader2 className="qr-mobile-spin" size={22} /> : mainConfirmLabel}
            </motion.button>
            <motion.button
              className="qr-mobile-secondary"
              disabled={isActionBlocked || !canReject}
              onClick={onReject}
              type="button"
              whileHover={isActionBlocked ? {} : { scale: 1.02 }}
              whileTap={isActionBlocked ? {} : { scale: 0.98 }}
            >
              {isSubmitting === "rejected" ? <Loader2 className="qr-mobile-spin" size={20} /> : t("取消")}
            </motion.button>
          </motion.div>
        ) : status === "agreed" || status === "rejected" ? (
          <motion.button animate={{ opacity: 1, y: 0 }} className="qr-mobile-secondary qr-mobile-secondary--large" exit={{ opacity: 0, y: -10 }} initial={{ opacity: 0, y: 10 }} key="resolved" onClick={onClose} type="button">
            {t("关闭")}
          </motion.button>
        ) : status === "error" ? (
          <motion.div animate={{ opacity: 1, y: 0 }} className="qr-mobile-action-stack" exit={{ opacity: 0, y: -10 }} initial={{ opacity: 0, y: 10 }} key="error">
            {errorKind === "login-required" ? (
              <button className="qr-mobile-primary" onClick={onNavigateToLogin} type="button">
                {t("返回登录页")}
              </button>
            ) : (
              <>
                <button className="qr-mobile-secondary qr-mobile-secondary--large" onClick={onRetry} type="button">
                  {t("重试")}
                </button>
                <button className="qr-mobile-plain-button" onClick={onNavigateToLogin} type="button">
                  {t("返回登录页")}
                </button>
              </>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function QrLocationRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}:</span>
      <strong>{value}</strong>
    </div>
  );
}

function readQrSessionId() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return (params.get("sessionId") || params.get("id") || "").trim();
}

function formatContextLocation(context: QrPhoneContext | null) {
  if (!context) return translatePriestess("login:未知位置");
  const parts = [context.country, context.colo].filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : translatePriestess("login:未知位置");
}

function summarizeUserAgent(userAgent: string) {
  const browser = readBrowserName(userAgent);
  const os = readOperatingSystemName(userAgent);
  return os ? `${os} / ${browser}` : browser;
}

function readBrowserName(userAgent: string) {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/CriOS\//.test(userAgent)) return "Chrome iOS";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/FxiOS\//.test(userAgent)) return "Firefox iOS";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent)) return "Safari";
  return translatePriestess("login:浏览器");
}

function readOperatingSystemName(userAgent: string) {
  if (/Windows NT/.test(userAgent)) return "Windows";
  if (/Mac OS X/.test(userAgent) && !/Mobile/.test(userAgent)) return "macOS";
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Android/.test(userAgent)) return "Android";
  if (/Linux/.test(userAgent)) return "Linux";
  return "";
}

function readApplicationLogo(result: QrPhoneSessionResult | null) {
  return readStringFromUnknown(result?.session?.raw, [
    ["application_logo"],
    ["applicationLogo"],
    ["logo"],
    ["logo_url"],
    ["logoUrl"],
    ["app", "logo"],
    ["app", "logo_url"],
    ["app", "logoUrl"],
  ]) || readStringFromUnknown(result?.raw, [
    ["application_logo"],
    ["applicationLogo"],
    ["logo"],
    ["logo_url"],
    ["logoUrl"],
    ["app", "logo"],
    ["app", "logo_url"],
    ["app", "logoUrl"],
  ]);
}

function readStringFromUnknown(payload: unknown, paths: string[][]) {
  for (const path of paths) {
    let current: unknown = payload;
    for (const key of path) {
      current = isRecord(current) ? current[key] : undefined;
    }
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
