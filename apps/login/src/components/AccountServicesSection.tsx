import { useCallback, useEffect, useState } from "react";
import {
  getPriestessApiErrorMessage,
  listLocalServiceAvailability,
  revokeLocalRakkoService,
  usePriestessTranslation,
  type LocalServiceAvailability,
} from "@priestess/shared";
import { AccountServicesView } from "./AccountServicesView";

/** 危险按钮不能长期停在「确认」态，3 秒不点自动回到初始形态。 */
const CONFIRM_RESET_MS = 3_000;

/** 服务节容器：只负责取数与解除授权，界面全部交给 AccountServicesView。props 必须保持为空。 */
export function AccountServicesSection() {
  const { t } = usePriestessTranslation("account");
  const [confirmingAppId, setConfirmingAppId] = useState("");
  const [error, setError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [revokingAppId, setRevokingAppId] = useState("");
  const [services, setServices] = useState<LocalServiceAvailability[]>([]);

  const loadServices = useCallback(async(signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");
    try {
      const nextServices = await listLocalServiceAvailability({ signal });
      if (signal?.aborted) return;
      setServices(nextServices);
    } catch (requestError) {
      if (signal?.aborted) return;
      setError(getPriestessApiErrorMessage(requestError, t("无法读取服务列表")));
    } finally {
      if (!signal?.aborted) {
        setHasLoaded(true);
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadServices(controller.signal);
    return () => controller.abort();
  }, [loadServices]);

  const isInitialLoading = isLoading && !hasLoaded;
  const isRefreshing = isLoading && hasLoaded;

  useEffect(() => {
    if (!confirmingAppId) return undefined;
    const timer = window.setTimeout(() => setConfirmingAppId(""), CONFIRM_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingAppId]);

  const revokeService = useCallback(async(appId: string) => {
    const target = services.find((service) => service.appId === appId);
    if (!target) return;

    const snapshot = services;
    setConfirmingAppId("");
    setRevokingAppId(appId);
    setError("");
    setNotice("");
    // 先本地把这条置成未登录，卡片立刻收起操作按钮；服务端结果回来后再整体校正。
    setServices((current) => current.map((service) => (
      service.appId === appId ? { ...service, activeSession: false } : service)));

    try {
      await revokeLocalRakkoService(appId);
      setNotice(t("已解除 {{name}} 的授权", { name: target.name }));
      await loadServices();
    } catch (requestError) {
      setServices(snapshot);
      setError(getPriestessApiErrorMessage(requestError, t("解除授权失败")));
    } finally {
      setRevokingAppId("");
    }
  }, [loadServices, services, t]);

  const refresh = useCallback(() => {
    setNotice("");
    void loadServices();
  }, [loadServices]);

  const requestRevoke = useCallback((appId: string) => {
    setConfirmingAppId(appId);
  }, []);

  const cancelRevoke = useCallback(() => {
    setConfirmingAppId("");
  }, []);

  const confirmRevoke = useCallback((appId: string) => {
    void revokeService(appId);
  }, [revokeService]);

  return (
    <AccountServicesView
      confirmingAppId={confirmingAppId}
      error={error}
      isInitialLoading={isInitialLoading}
      isRefreshing={isRefreshing}
      notice={notice}
      onCancelRevoke={cancelRevoke}
      onConfirmRevoke={confirmRevoke}
      onRefresh={refresh}
      onRequestRevoke={requestRevoke}
      revokingAppId={revokingAppId}
      services={services}
    />
  );
}
