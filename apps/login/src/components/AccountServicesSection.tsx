import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  AlertTriangle,
  AppWindow,
  Clock3,
  Layers3,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import {
  getPriestessApiErrorMessage,
  listLocalRakkoServices,
  usePriestessTranslation,
  type LocalRakkoServiceSession,
} from "@priestess/shared";
import { dateTimeFormatter, formatDateTime } from "./accountPageFormat";
import { AccountMotionCard, AccountMotionPresenceItem, AccountMotionSection, AccountSectionView, InfoCard, StatusPill } from "./AccountPagePrimitives";
import "./AccountServices.css";

export function AccountServicesSection() {
  const { t } = usePriestessTranslation("account");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [services, setServices] = useState<LocalRakkoServiceSession[]>([]);

  const loadServices = useCallback(async(signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");
    try {
      const nextServices = await listLocalRakkoServices({ signal });
      if (signal?.aborted) return;
      setServices(nextServices);
    } catch (requestError) {
      if (signal?.aborted) return;
      setError(getPriestessApiErrorMessage(requestError, t("无法读取已登录服务")));
    } finally {
      if (!signal?.aborted) {
        setLastLoadedAt(new Date());
        setIsLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadServices(controller.signal);
    return () => controller.abort();
  }, [loadServices]);

  const sessionCount = useMemo(() => services.reduce((total, service) => total + service.sessionCount, 0), [services]);
  const latestService = services[0] ?? null;

  return (
    <AccountSectionView icon={<WalletCards size={21} strokeWidth={1.8} />} title={t("服务")} description={t("查看当前账号仍保持登录的 Rakko 服务。")}>
      <div className="account-card-grid">
        <InfoCard icon={<AppWindow size={19} strokeWidth={1.8} />} label={t("已登录服务")} value={isLoading ? t("读取中") : t("{{count}} 个", { count: services.length })} />
        <InfoCard icon={<Layers3 size={19} strokeWidth={1.8} />} label={t("活跃会话")} value={isLoading ? t("读取中") : t("{{count}} 个", { count: sessionCount })} />
        <InfoCard icon={<Clock3 size={19} strokeWidth={1.8} />} label={t("最近使用")} value={formatDateTime(latestService?.lastUsedAt || "")} />
        <InfoCard icon={<RefreshCw size={19} strokeWidth={1.8} />} label={t("刷新时间")} value={lastLoadedAt ? dateTimeFormatter.format(lastLoadedAt) : t("未刷新")} />
      </div>

      <AccountMotionSection className="account-service-session-panel account-motion-surface" aria-labelledby="account-service-session-title" delay={0.04}>
        <div className="account-service-session-panel__header">
          <div>
            <h3 id="account-service-session-title">{t("已登录 Rakko 服务")}</h3>
            <p>{t("这里只展示后端确认仍有有效 OIDC refresh session 的服务。")}</p>
          </div>
          <button className="account-button account-button--quiet" disabled={isLoading} onClick={() => void loadServices()} type="button">
            <RefreshCw aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{t("刷新")}</span>
          </button>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {error ? (
            <AccountMotionPresenceItem className="account-inline-alert" key="service-error" role="status">
              <AlertTriangle aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{error}</span>
            </AccountMotionPresenceItem>
          ) : null}
          {isLoading ? (
            <AccountMotionPresenceItem className="account-inline-loading" key="service-loading" role="status">
              <RefreshCw aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{t("正在读取已登录 Rakko 服务")}</span>
            </AccountMotionPresenceItem>
          ) : null}
          {!isLoading && services.length === 0 ? (
            <AccountMotionPresenceItem className="account-service-session-empty" key="service-empty">
              <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{t("当前没有通过 Priestess 保持登录的 Rakko 服务。")}</span>
            </AccountMotionPresenceItem>
          ) : null}
        </AnimatePresence>

        {!isLoading && services.length > 0 ? (
          <div className="account-service-session-list">
            <AnimatePresence mode="popLayout">
              {services.map((service, index) => (
                <ServiceSessionCard delay={Math.min(0.05 + index * 0.025, 0.18)} key={service.appId} service={service} />
              ))}
            </AnimatePresence>
          </div>
        ) : null}
      </AccountMotionSection>
    </AccountSectionView>
  );
}

function ServiceSessionCard({ delay, service }: {
  delay: number;
  service: LocalRakkoServiceSession;
}) {
  const { t } = usePriestessTranslation("account");
  return (
    <AccountMotionCard className="account-service-session-card account-motion-surface" delay={delay}>
      <div className="account-service-session-card__top">
        <span className="account-service-session-card__icon" aria-hidden="true">
          <AppWindow size={20} strokeWidth={1.8} />
        </span>
        <div>
          <h4>{service.name}</h4>
          <p>{service.appId}</p>
        </div>
        <StatusPill tone={service.enabled === false ? "warn" : "good"}>{service.enabled === false ? t("服务已停用") : t("正在登录")}</StatusPill>
      </div>
      <dl className="account-service-session-card__facts">
        <div>
          <dt>{t("活跃会话")}</dt>
          <dd>{t("{{count}} 个", { count: service.sessionCount })}</dd>
        </div>
        <div>
          <dt>{t("最近授权")}</dt>
          <dd>{formatDateTime(service.lastAuthorizedAt || service.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("最近使用")}</dt>
          <dd>{formatDateTime(service.lastUsedAt)}</dd>
        </div>
        <div>
          <dt>{t("最长有效到")}</dt>
          <dd>{formatDateTime(service.expiresAt)}</dd>
        </div>
      </dl>
    </AccountMotionCard>
  );
}
