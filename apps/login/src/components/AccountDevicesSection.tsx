import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  Clock3,
  Laptop,
  LogOut,
  MapPin,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  getPriestessApiErrorMessage,
  listLocalDeviceSessions,
  revokeLocalDeviceSession,
  usePriestessTranslation,
  type LocalDeviceSession,
} from "@priestess/shared";
import { dateTimeFormatter, formatDateTime } from "./accountPageFormat";
import { AccountMotionCard, AccountMotionPresenceItem, AccountMotionSection, AccountSectionView, InfoCard, StatusPill } from "./AccountPagePrimitives";
import "./AccountDevices.css";

type AccountDevicesSectionProps = {
  onNotice: (message: string) => void;
  onRequireLogin: () => void;
};

export function AccountDevicesSection({ onNotice, onRequireLogin }: AccountDevicesSectionProps) {
  const { t } = usePriestessTranslation("account");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState("");
  const [sessions, setSessions] = useState<LocalDeviceSession[]>([]);

  const loadSessions = useCallback(async(signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");
    try {
      const nextSessions = await listLocalDeviceSessions({ signal });
      if (signal?.aborted) return;
      setSessions(nextSessions);
    } catch (requestError) {
      if (signal?.aborted) return;
      setError(getPriestessApiErrorMessage(requestError, t("无法读取已登录浏览器")));
    } finally {
      if (!signal?.aborted) {
        setLastLoadedAt(new Date());
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(controller.signal);
    return () => controller.abort();
  }, [loadSessions]);

  const currentSession = useMemo(() => sessions.find((session) => session.current) ?? null, [sessions]);
  const lastUsedAt = currentSession?.lastUsedAt || currentSession?.createdAt || "";

  // 设备栏只操作后端确认的 session_id，前端不自行推断登录态或授权范围。
  const revokeSession = useCallback(async(session: LocalDeviceSession) => {
    setRevokingSessionId(session.sessionId);
    setError("");
    try {
      const result = await revokeLocalDeviceSession(session.sessionId);
      onNotice(session.current ? t("当前浏览器已注销") : t("已注销选中的浏览器"));
      if (result.current || result.authenticated === false) {
        onRequireLogin();
        return;
      }
      await loadSessions();
    } catch (requestError) {
      setError(getPriestessApiErrorMessage(requestError, t("注销浏览器失败")));
    } finally {
      setRevokingSessionId("");
    }
  }, [loadSessions, onNotice, onRequireLogin, t]);

  return (
    <AccountSectionView icon={<Laptop size={21} strokeWidth={1.8} />} title={t("设备")} description={t("查看当前账号仍有效的浏览器会话。")}>
      <div className="account-card-grid">
        <InfoCard icon={<MonitorSmartphone size={19} strokeWidth={1.8} />} label={t("已登录浏览器")} value={isLoading ? t("读取中") : t("{{count}} 个", { count: sessions.length })} />
        <InfoCard icon={<MapPin size={19} strokeWidth={1.8} />} label={t("当前 IP")} value={currentSession?.ipAddress || t("未返回")} />
        <InfoCard icon={<Clock3 size={19} strokeWidth={1.8} />} label={t("最近使用")} value={formatDateTime(lastUsedAt)} />
        <InfoCard icon={<RefreshCw size={19} strokeWidth={1.8} />} label={t("刷新时间")} value={lastLoadedAt ? dateTimeFormatter.format(lastLoadedAt) : t("未刷新")} />
      </div>

      <AccountMotionSection className="account-device-panel account-motion-surface" aria-labelledby="account-device-list-title" delay={0.04}>
        <div className="account-device-panel__header">
          <div>
            <h3 id="account-device-list-title">{t("已登录浏览器")}</h3>
            <p>{t("每条记录来自后端确认的 HttpOnly 会话。")}</p>
          </div>
          <button className="account-button account-button--quiet" disabled={isLoading} onClick={() => void loadSessions()} type="button">
            <RefreshCw aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{t("刷新")}</span>
          </button>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {error ? (
            <AccountMotionPresenceItem className="account-inline-alert" key="device-error" role="status">
              <AlertTriangle aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{error}</span>
            </AccountMotionPresenceItem>
          ) : null}
          {isLoading ? (
            <AccountMotionPresenceItem className="account-inline-loading" key="device-loading" role="status">
              <RefreshCw aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{t("正在读取已登录浏览器")}</span>
            </AccountMotionPresenceItem>
          ) : null}
          {!isLoading && sessions.length === 0 ? (
            <AccountMotionPresenceItem className="account-device-empty" key="device-empty">
              <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{t("当前没有可显示的登录浏览器。")}</span>
            </AccountMotionPresenceItem>
          ) : null}
        </AnimatePresence>

        {!isLoading && sessions.length > 0 ? (
          <div className="account-device-list">
            <AnimatePresence mode="popLayout">
              {sessions.map((session, index) => (
                <DeviceSessionCard
                  isRevoking={revokingSessionId === session.sessionId}
                  key={session.sessionId}
                  onRevoke={() => void revokeSession(session)}
                  session={session}
                  delay={Math.min(0.05 + index * 0.025, 0.18)}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : null}
      </AccountMotionSection>
    </AccountSectionView>
  );
}

function DeviceSessionCard({ delay, isRevoking, onRevoke, session }: {
  delay: number;
  isRevoking: boolean;
  onRevoke: () => void;
  session: LocalDeviceSession;
}) {
  const { t } = usePriestessTranslation("account");
  const title = session.userAgentSummary || `${session.browser} / ${session.os}`;
  const subtitle = `${session.device} · ${session.ipAddress}`;
  return (
    <AccountMotionCard className={`account-device-card account-motion-surface${isRevoking ? " account-device-card--busy" : ""}`} delay={delay}>
      <div className="account-device-card__top">
        <span className="account-device-card__icon" aria-hidden="true">
          <Laptop size={20} strokeWidth={1.8} />
        </span>
        <div>
          <h4>{title}</h4>
          <p>{subtitle}</p>
        </div>
        <StatusPill tone={session.current ? "good" : "neutral"}>{session.current ? t("当前浏览器") : t("已登录")}</StatusPill>
      </div>
      <dl className="account-device-card__facts">
        <div>
          <dt>{t("浏览器")}</dt>
          <dd>{session.browser}</dd>
        </div>
        <div>
          <dt>{t("系统")}</dt>
          <dd>{session.os}</dd>
        </div>
        <div>
          <dt>{t("IP 地址")}</dt>
          <dd>{session.ipAddress}</dd>
        </div>
        <div>
          <dt>{t("创建时间")}</dt>
          <dd>{formatDateTime(session.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("最近使用")}</dt>
          <dd>{formatDateTime(session.lastUsedAt || session.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("过期时间")}</dt>
          <dd>{formatDateTime(session.expiresAt)}</dd>
        </div>
      </dl>
      <div className="account-device-card__actions">
        <button className="account-button account-button--danger" disabled={isRevoking || !session.sessionId} onClick={onRevoke} type="button">
          <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
          <span>{isRevoking ? t("正在注销") : session.current ? t("注销当前浏览器") : t("注销此浏览器")}</span>
        </button>
      </div>
    </AccountMotionCard>
  );
}
