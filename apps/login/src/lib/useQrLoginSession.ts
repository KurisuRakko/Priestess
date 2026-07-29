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
  enabled: boolean;
  request: AuthRequest | null;
  requestKey: string;
  t: TranslationFn;
};

function resolveQrVisualState(error: string, status: QrSessionPollStatus["status"]): QrPanelVisualState {
  if (error) return "error";
  if (status === "scanned" || status === "pre_confirmed") return "scanned";
  if (status === "confirmed") return "confirmed";
  if (status === "expired" || status === "rejected") return "terminal";
  return "pending";
}

export function useQrLoginSession({
  enabled,
  request,
  requestKey,
  t,
}: UseQrLoginSessionOptions) {
  const stopRef = useRef<() => void>(() => undefined);
  const [error, setError] = useState("");
  const [qrValue, setQrValue] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<QrSessionPollStatus["status"]>("pending");

  const stop = useCallback(() => {
    stopRef.current();
  }, []);

  useEffect(() => {
    let activeSessionId = "";
    let countdownTimer: number | null = null;
    let disposed = false;
    let pollInFlight = false;
    let pollTimer: number | null = null;
    let refreshAbortController: AbortController | null = null;
    let refreshId = 0;
    let statusSnapshot: QrSessionPollStatus["status"] = "pending";

    const updateStatus = (nextStatus: QrSessionPollStatus["status"]) => {
      statusSnapshot = nextStatus;
      setStatus(nextStatus);
    };

    const stopCountdown = () => {
      if (countdownTimer !== null) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
      }
    };

    const stopSessionTimers = () => {
      activeSessionId = "";
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      stopCountdown();
    };

    const stopAll = () => {
      refreshId += 1;
      refreshAbortController?.abort();
      refreshAbortController = null;
      stopSessionTimers();
    };
    stopRef.current = stopAll;

    if (!enabled || !request) {
      stopAll();
      setError("");
      setQrValue("");
      setRefreshing(false);
      updateStatus("pending");
      return () => {
        disposed = true;
        stopAll();
        stopRef.current = () => undefined;
      };
    }

    let refreshSession: () => Promise<boolean>;

    const refreshExpiredSession = () => {
      if (!disposed) {
        window.setTimeout(() => {
          if (!disposed) void refreshSession();
        }, 0);
      }
    };

    const handleStatus = (nextStatus: QrSessionPollStatus) => {
      setError("");
      updateStatus(nextStatus.status);
      if (nextStatus.status === "pending") return;
      if (nextStatus.status === "scanned" || nextStatus.status === "pre_confirmed") {
        // 手机已接管确认时保留轮询，但停止二维码过期倒计时，避免打断确认。
        stopCountdown();
        return;
      }
      if (nextStatus.status === "confirmed") {
        stopSessionTimers();
        if (nextStatus.redirectUrl) {
          window.setTimeout(() => window.location.assign(nextStatus.redirectUrl), 650);
        }
        return;
      }
      stopSessionTimers();
      if (nextStatus.status === "expired") refreshExpiredSession();
    };

    const startPolling = (sessionId: string) => {
      activeSessionId = sessionId;
      pollTimer = window.setInterval(() => {
        if (pollInFlight || activeSessionId !== sessionId) return;
        pollInFlight = true;
        void getQrSessionStatus(sessionId)
          .then((nextStatus) => {
            if (activeSessionId === sessionId) handleStatus(nextStatus);
          })
          .catch(() => undefined)
          .finally(() => {
            pollInFlight = false;
          });
      }, 1500);
    };

    const startCountdown = (initialSeconds: number) => {
      let remainingSeconds = initialSeconds;
      stopCountdown();
      countdownTimer = window.setInterval(() => {
        remainingSeconds = Math.max(remainingSeconds - 1, 0);
        if (remainingSeconds === 0) {
          stopSessionTimers();
          if (statusSnapshot !== "confirmed") {
            updateStatus("expired");
            refreshExpiredSession();
          }
        }
      }, 1000);
    };

    refreshSession = async () => {
      const currentRefreshId = refreshId + 1;
      refreshId = currentRefreshId;
      refreshAbortController?.abort();
      const abortController = new AbortController();
      refreshAbortController = abortController;
      stopSessionTimers();
      setError("");
      setRefreshing(true);
      updateStatus("pending");

      // 即使接口立即返回，也让加载环完整转动一圈，避免刷新反馈闪烁。
      const minimumSpin = new Promise<void>((resolve) => window.setTimeout(resolve, QR_REFRESH_SPIN_MIN_MS));
      try {
        const created = await createQrSession(request, { signal: abortController.signal });
        if (disposed || abortController.signal.aborted || refreshId !== currentRefreshId) return false;
        if (!created.qrUrl || !created.sessionId) {
          throw new Error(t("后端未返回二维码会话"));
        }
        setQrValue(created.qrUrl);
        startCountdown(created.expiresIn);
        startPolling(created.sessionId);
        return true;
      } catch (cause) {
        if (disposed || abortController.signal.aborted || refreshId !== currentRefreshId) return false;
        setQrValue("");
        setError(getPriestessApiErrorMessage(cause, t("二维码暂时不可用")));
        return false;
      } finally {
        await minimumSpin;
        if (!disposed && !abortController.signal.aborted && refreshId === currentRefreshId) {
          setRefreshing(false);
        }
        if (refreshAbortController === abortController) refreshAbortController = null;
      }
    };

    void refreshSession();
    const autoRefreshTimer = window.setInterval(() => {
      if (!["confirmed", "pre_confirmed", "scanned"].includes(statusSnapshot)) {
        void refreshSession();
      }
    }, QR_AUTO_REFRESH_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(autoRefreshTimer);
      stopAll();
      stopRef.current = () => undefined;
    };
    // requestKey 是请求参数的稳定标识；避免每次渲染生成的新对象重建二维码会话。
  }, [enabled, requestKey, t]);

  return {
    error,
    qrValue,
    refreshing,
    status,
    stop,
    visualState: resolveQrVisualState(error, status),
  };
}
