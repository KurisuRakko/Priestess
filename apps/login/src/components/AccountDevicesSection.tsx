import { useCallback, useEffect, useState } from "react";
import {
  getLocalDeviceSessionOverview,
  getPriestessApiErrorMessage,
  revokeLocalDeviceSession,
  revokeOtherLocalDeviceSessions,
  usePriestessTranslation,
  type LocalDeviceSession,
} from "@priestess/shared";
import { AccountDevicesView } from "./AccountDevicesView";

type AccountDevicesSectionProps = {
  onNotice: (message: string) => void;
  onRequireLogin: () => void;
};

/** 危险按钮不能长期停在「确认」态，3 秒不点自动回到初始形态。 */
const CONFIRM_RESET_MS = 3_000;

export function AccountDevicesSection({ onNotice, onRequireLogin }: AccountDevicesSectionProps) {
  const { t } = usePriestessTranslation("account");
  const [confirmingSessionId, setConfirmingSessionId] = useState("");
  const [deviceCount, setDeviceCount] = useState(0);
  const [deviceLimit, setDeviceLimit] = useState(0);
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isConfirmingRevokeOthers, setIsConfirmingRevokeOthers] = useState(false);
  const [isCurrentDeviceDialogOpen, setIsCurrentDeviceDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevokingOthers, setIsRevokingOthers] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState("");
  const [sessions, setSessions] = useState<LocalDeviceSession[]>([]);

  const loadSessions = useCallback(async(signal?: AbortSignal, forceRefresh = false) => {
    setIsLoading(true);
    setError("");
    try {
      const overview = await getLocalDeviceSessionOverview({ forceRefresh, signal });
      if (signal?.aborted) return;
      setSessions(overview.sessions);
      setDeviceCount(overview.deviceCount);
      setDeviceLimit(overview.deviceLimit);
    } catch (requestError) {
      if (signal?.aborted) return;
      setError(getPriestessApiErrorMessage(requestError, t("无法读取已登录设备")));
    } finally {
      if (!signal?.aborted) {
        setHasLoaded(true);
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSessions(controller.signal);
    return () => controller.abort();
  }, [loadSessions]);

  // 首次加载与后台刷新的唯一分界：只有还没拿到过数据时才铺骨架，刷新期间列表必须留在 DOM 上。
  const isInitialLoading = isLoading && !hasLoaded;
  const isRefreshing = isLoading && hasLoaded;

  useEffect(() => {
    if (!confirmingSessionId && !isConfirmingRevokeOthers) return undefined;
    const timer = window.setTimeout(() => {
      setConfirmingSessionId("");
      setIsConfirmingRevokeOthers(false);
    }, CONFIRM_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingSessionId, isConfirmingRevokeOthers]);

  // 只操作后端确认的 session_id，前端不自行推断登录态或授权范围。
  const revokeSession = useCallback(async(sessionId: string) => {
    const target = sessions.find((session) => session.sessionId === sessionId);
    if (!target) return;

    const snapshot = sessions;
    setConfirmingSessionId("");
    setRevokingSessionId(sessionId);
    setError("");
    // 先本地移除，AnimatePresence 才有机会播退场动画；服务端结果回来后再校正。
    setSessions((current) => current.filter((session) => session.sessionId !== sessionId));

    try {
      const result = await revokeLocalDeviceSession(sessionId);
      if (result.current || result.authenticated === false) {
        onNotice(t("已退出此设备"));
        onRequireLogin();
        return;
      }
      onNotice(t("已退出选中的设备"));
      await loadSessions(undefined, true);
    } catch (requestError) {
      setSessions(snapshot);
      setError(getPriestessApiErrorMessage(requestError, t("退出设备失败")));
    } finally {
      setRevokingSessionId("");
      setIsCurrentDeviceDialogOpen(false);
    }
  }, [loadSessions, onNotice, onRequireLogin, sessions, t]);

  const revokeOthers = useCallback(async() => {
    setIsConfirmingRevokeOthers(false);
    setIsRevokingOthers(true);
    setError("");
    const snapshot = sessions;
    setSessions((current) => current.filter((session) => session.current));
    try {
      const result = await revokeOtherLocalDeviceSessions();
      onNotice(t("已退出 {{count}} 台设备", { count: result.revoked }));
      await loadSessions(undefined, true);
    } catch (requestError) {
      setSessions(snapshot);
      setError(getPriestessApiErrorMessage(requestError, t("退出其他设备失败")));
    } finally {
      setIsRevokingOthers(false);
    }
  }, [loadSessions, onNotice, sessions, t]);

  return (
    <AccountDevicesView
      confirmingSessionId={confirmingSessionId}
      deviceCount={deviceCount}
      deviceLimit={deviceLimit}
      error={error}
      isConfirmingRevokeOthers={isConfirmingRevokeOthers}
      isCurrentDeviceDialogOpen={isCurrentDeviceDialogOpen}
      isInitialLoading={isInitialLoading}
      isRefreshing={isRefreshing}
      isRevokingOthers={isRevokingOthers}
      onCancelRevoke={() => setConfirmingSessionId("")}
      onCancelRevokeOthers={() => setIsConfirmingRevokeOthers(false)}
      onCloseCurrentDeviceDialog={() => setIsCurrentDeviceDialogOpen(false)}
      onConfirmRevoke={(sessionId) => void revokeSession(sessionId)}
      onConfirmRevokeOthers={() => void revokeOthers()}
      onOpenCurrentDeviceDialog={() => setIsCurrentDeviceDialogOpen(true)}
      onRefresh={() => void loadSessions(undefined, true)}
      onRequestRevoke={setConfirmingSessionId}
      onRequestRevokeOthers={() => setIsConfirmingRevokeOthers(true)}
      revokingSessionId={revokingSessionId}
      sessions={sessions}
    />
  );
}
