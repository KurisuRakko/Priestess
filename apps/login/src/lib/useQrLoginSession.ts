import { useCallback, useEffect, useRef, useState } from "react";
import {
  createQrSession,
  getPriestessApiErrorMessage,
  getQrSessionStatus,
  type QrSessionPollStatus,
} from "@priestess/shared";
import type { QrPanelVisualState } from "../components/QrPanel";
import type { AuthRequest } from "./authRequest";
import { QR_AUTO_REFRESH_INTERVAL_MS, QR_REFRESH_SPIN_MIN_MS } from "./loginAppState";

type TranslationFn = (key: string) => string;

type UseQrLoginSessionOptions = {
  active: boolean;
  enabled: boolean;
  request: AuthRequest | null;
  requestKey: string;
  t: TranslationFn;
};

type RetainedQrSession = {
  createdAt: number;
  expiresAt: number;
  requestKey: string;
  sessionId: string;
};

type QrSessionCreation = {
  abortController: AbortController;
  promise: Promise<RetainedQrSession | null>;
  requestKey: string;
};

function resolveQrVisualState(error: string, status: QrSessionPollStatus["status"]): QrPanelVisualState {
  if (error) return "error";
  if (status === "scanned" || status === "pre_confirmed") return "scanned";
  if (status === "confirmed") return "confirmed";
  if (status === "expired" || status === "rejected") return "terminal";
  return "pending";
}

export function useQrLoginSession({
  active,
  enabled,
  request,
  requestKey,
  t,
}: UseQrLoginSessionOptions) {
  const activeRef = useRef(active);
  const createTaskRef = useRef<QrSessionCreation | null>(null);
  const enabledRef = useRef(enabled);
  const lifecycleVersionRef = useRef(0);
  const monitorStopRef = useRef<() => void>(() => undefined);
  const requestKeyRef = useRef(requestKey);
  const requestRef = useRef(request);
  const sessionRef = useRef<RetainedQrSession | null>(null);
  const statusRef = useRef<QrSessionPollStatus["status"]>("pending");
  const tRef = useRef(t);
  const [error, setError] = useState("");
  const [confirmedRedirectUrl, setConfirmedRedirectUrl] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<QrSessionPollStatus["status"]>("pending");

  activeRef.current = active;
  enabledRef.current = enabled;
  requestKeyRef.current = requestKey;
  requestRef.current = request;
  tRef.current = t;

  const updateStatus = useCallback((nextStatus: QrSessionPollStatus["status"]) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const stopMonitoring = useCallback(() => {
    monitorStopRef.current();
    monitorStopRef.current = () => undefined;
  }, []);

  const reset = useCallback(() => {
    lifecycleVersionRef.current += 1;
    stopMonitoring();
    createTaskRef.current?.abortController.abort();
    createTaskRef.current = null;
    sessionRef.current = null;
    setError("");
    setConfirmedRedirectUrl("");
    setQrValue("");
    setRefreshing(false);
    updateStatus("pending");
  }, [stopMonitoring, updateStatus]);

  const ensureSession = useCallback(async(force = false): Promise<RetainedQrSession | null> => {
    const currentRequest = requestRef.current;
    const currentRequestKey = requestKeyRef.current;
    if (!enabledRef.current || !currentRequest || !currentRequestKey) {
      return null;
    }

    const retained = sessionRef.current;
    if (!force && retained?.requestKey === currentRequestKey && retained.expiresAt > Date.now()) {
      return retained;
    }

    const activeCreation = createTaskRef.current;
    if (activeCreation?.requestKey === currentRequestKey) {
      return activeCreation.promise;
    }

    sessionRef.current = null;
    const lifecycleVersion = lifecycleVersionRef.current;
    const abortController = new AbortController();
    setError("");
    setRefreshing(true);
    updateStatus("pending");

    const promise = (async() => {
      // 即使接口立即返回，也让加载环完整转动一圈，避免刷新反馈闪烁。
      const minimumSpin = new Promise<void>((resolve) => window.setTimeout(resolve, QR_REFRESH_SPIN_MIN_MS));
      try {
        const created = await createQrSession(currentRequest, { signal: abortController.signal });
        if (
          abortController.signal.aborted
          || lifecycleVersionRef.current !== lifecycleVersion
          || requestKeyRef.current !== currentRequestKey
        ) {
          return null;
        }
        if (!created.qrUrl || !created.sessionId) {
          throw new Error(tRef.current("后端未返回二维码会话"));
        }

        const createdAt = Date.now();
        const nextSession = {
          createdAt,
          expiresAt: createdAt + Math.max(created.expiresIn, 0) * 1000,
          requestKey: currentRequestKey,
          sessionId: created.sessionId,
        };
        sessionRef.current = nextSession;
        setQrValue(created.qrUrl);
        return nextSession;
      } catch (cause) {
        if (
          abortController.signal.aborted
          || lifecycleVersionRef.current !== lifecycleVersion
          || requestKeyRef.current !== currentRequestKey
        ) {
          return null;
        }
        setQrValue("");
        setError(getPriestessApiErrorMessage(cause, tRef.current("二维码暂时不可用")));
        return null;
      } finally {
        await minimumSpin;
        if (
          !abortController.signal.aborted
          && lifecycleVersionRef.current === lifecycleVersion
          && requestKeyRef.current === currentRequestKey
        ) {
          setRefreshing(false);
        }
        if (createTaskRef.current?.abortController === abortController) {
          createTaskRef.current = null;
        }
      }
    })();

    createTaskRef.current = { abortController, promise, requestKey: currentRequestKey };
    return promise;
  }, [updateStatus]);

  useEffect(() => {
    reset();
    return reset;
  }, [enabled, requestKey, reset]);

  useEffect(() => {
    if (!enabled || !active || !requestRef.current) {
      stopMonitoring();
      return undefined;
    }

    let disposed = false;
    let expiryTimer: number | null = null;
    let pollInFlight = false;
    let pollTimer: number | null = null;
    let autoRefreshTimer: number | null = null;
    let retryTimer: number | null = null;

    const clearTimers = () => {
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (autoRefreshTimer !== null) window.clearInterval(autoRefreshTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      expiryTimer = null;
      pollTimer = null;
      autoRefreshTimer = null;
      retryTimer = null;
    };
    monitorStopRef.current = clearTimers;

    let startSessionMonitoring: (session: RetainedQrSession, reconcile: boolean) => Promise<void>;

    const scheduleCreationRetry = () => {
      if (disposed || !activeRef.current) return;
      retryTimer = window.setTimeout(() => void replaceExpiredSession(), QR_AUTO_REFRESH_INTERVAL_MS);
    };

    const replaceExpiredSession = async() => {
      clearTimers();
      sessionRef.current = null;
      if (disposed || !activeRef.current) return;
      const nextSession = await ensureSession(true);
      if (nextSession && !disposed && activeRef.current) {
        await startSessionMonitoring(nextSession, false);
      } else {
        scheduleCreationRetry();
      }
    };

    const handleStatus = (nextStatus: QrSessionPollStatus) => {
      if (disposed) return;
      setError("");
      updateStatus(nextStatus.status);
      if (nextStatus.status === "pending") return;
      if (nextStatus.status === "scanned" || nextStatus.status === "pre_confirmed") {
        // 手机已接管确认时保留轮询，但停止二维码过期倒计时，避免打断确认。
        if (expiryTimer !== null) window.clearTimeout(expiryTimer);
        expiryTimer = null;
        return;
      }
      if (nextStatus.status === "confirmed") {
        clearTimers();
        // 最终回跳交给 App 的统一完成动画；这里只保留后端确认结果，不提前离开页面。
        setConfirmedRedirectUrl(nextStatus.redirectUrl);
        return;
      }
      clearTimers();
      if (nextStatus.status === "expired") {
        void replaceExpiredSession();
      }
    };

    const pollSession = async(session: RetainedQrSession) => {
      if (pollInFlight || disposed || sessionRef.current?.sessionId !== session.sessionId) return;
      pollInFlight = true;
      try {
        const nextStatus = await getQrSessionStatus(session.sessionId);
        if (!disposed && sessionRef.current?.sessionId === session.sessionId) {
          handleStatus(nextStatus);
        }
      } catch {
        // 短暂网络错误留给下一轮轮询恢复，不把可用二维码切成错误态。
      } finally {
        pollInFlight = false;
      }
    };

    startSessionMonitoring = async(session, reconcile) => {
      clearTimers();
      if (disposed || !activeRef.current || sessionRef.current?.sessionId !== session.sessionId) return;

      if (reconcile) {
        await pollSession(session);
        if (
          disposed
          || !activeRef.current
          || sessionRef.current?.sessionId !== session.sessionId
          || ["confirmed", "expired", "rejected"].includes(statusRef.current)
        ) {
          return;
        }
      }

      const remainingMs = session.expiresAt - Date.now();
      if (remainingMs <= 0) {
        updateStatus("expired");
        await replaceExpiredSession();
        return;
      }
      if (!["scanned", "pre_confirmed"].includes(statusRef.current)) {
        expiryTimer = window.setTimeout(() => {
          updateStatus("expired");
          void replaceExpiredSession();
        }, remainingMs);
      }
      pollTimer = window.setInterval(() => void pollSession(session), 1500);
      autoRefreshTimer = window.setInterval(() => {
        if (!["confirmed", "pre_confirmed", "scanned"].includes(statusRef.current)) {
          void replaceExpiredSession();
        }
      }, QR_AUTO_REFRESH_INTERVAL_MS);
    };

    void (async() => {
      const retainedBeforeResume = sessionRef.current;
      const session = await ensureSession();
      if (!session || disposed || !activeRef.current) {
        scheduleCreationRetry();
        return;
      }
      const shouldReconcile = retainedBeforeResume?.sessionId === session.sessionId
        && Date.now() - session.createdAt > 100;
      await startSessionMonitoring(session, shouldReconcile);
    })();

    return () => {
      disposed = true;
      clearTimers();
      if (monitorStopRef.current === clearTimers) {
        monitorStopRef.current = () => undefined;
      }
    };
  }, [active, enabled, ensureSession, requestKey, stopMonitoring, updateStatus]);

  return {
    confirmedRedirectUrl,
    error,
    qrValue,
    refreshing,
    status,
    stop: reset,
    visualState: resolveQrVisualState(error, status),
  };
}
