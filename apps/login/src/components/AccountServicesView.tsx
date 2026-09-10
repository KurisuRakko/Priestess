import { useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { AppWindow, LockKeyhole, ShieldCheck, Unplug, WalletCards } from "lucide-react";
import { usePriestessTranslation, type LocalServiceAvailability } from "@priestess/shared";
import { formatRelativeTime } from "./accountPageFormat";
import {
  AccountEmptyState,
  AccountInlineAlert,
  AccountMotionCard,
  AccountMotionSection,
  AccountRefreshIndicator,
  AccountSectionView,
  AccountSkeletonList,
  StatusPill,
} from "./AccountPagePrimitives";
import "./AccountServices.css";

/**
 * 可用组在前、未开放组在后；后端顺序不作为唯一依据。
 * 可用组内已登录的排在未登录之前——那些条目才有「解除授权」入口，用户来这一页多半是为了处理它们。
 */
export function groupServicesByAccess(services: LocalServiceAvailability[]) {
  return {
    available: sortAvailableServices(services.filter((service) => service.access === "available")),
    unavailable: sortServicesByName(services.filter((service) => service.access !== "available")),
  };
}

/** 先按有无活跃会话分段，段内按服务名升序。 */
function sortAvailableServices(services: LocalServiceAvailability[]) {
  return services.slice().sort((left, right) => {
    if (left.activeSession !== right.activeSession) {
      return left.activeSession ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

function sortServicesByName(services: LocalServiceAvailability[]) {
  return services.slice().sort((left, right) => left.name.localeCompare(right.name));
}

export type AccountServicesViewProps = {
  /** 正在做内联二次确认解除授权的 app_id；空串表示没有 */
  confirmingAppId: string;
  error: string;
  /** 首次加载（还没有任何数据）；只有它为 true 才显示骨架 */
  isInitialLoading: boolean;
  /** 已有数据的后台刷新；列表必须保持挂载 */
  isRefreshing: boolean;
  /** 操作成功后的一句提示，走 tone="info" 的内联条；空串表示不显示 */
  notice: string;
  onCancelRevoke: () => void;
  onConfirmRevoke: (appId: string) => void;
  onRefresh: () => void;
  onRequestRevoke: (appId: string) => void;
  /** 正在提交解除授权的 app_id；空串表示没有 */
  revokingAppId: string;
  /** 未分组未排序的原始列表，视图内部调 groupServicesByAccess */
  services: LocalServiceAvailability[];
};

export function AccountServicesView({
  confirmingAppId,
  error,
  isInitialLoading,
  isRefreshing,
  notice,
  onCancelRevoke,
  onConfirmRevoke,
  onRefresh,
  onRequestRevoke,
  revokingAppId,
  services,
}: AccountServicesViewProps) {
  const { t } = usePriestessTranslation("account");
  const { available, unavailable } = useMemo(() => groupServicesByAccess(services), [services]);

  return (
    <AccountSectionView
      description={t("查看哪些 Rakko 服务对你开放，以及你已经登录了哪些。")}
      icon={<WalletCards size={21} strokeWidth={1.8} />}
      title={t("服务")}
    >
      <AccountMotionSection className="account-service-panel" delay={0.04}>
        <div className="account-service-panel__header">
          <div className="account-service-panel__heading">
            <h3>{t("服务")}</h3>
            <span className="account-service-panel__count">
              {t("可用 {{available}} / 共 {{total}}", { available: available.length, total: services.length })}
            </span>
          </div>
          <button
            aria-busy={isRefreshing}
            className="account-button account-button--quiet"
            disabled={isInitialLoading || isRefreshing}
            onClick={onRefresh}
            type="button"
          >
            <AccountRefreshIndicator active={isRefreshing} />
            <span>{t("刷新")}</span>
          </button>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {error ? (
            <AccountInlineAlert
              action={<button className="account-button account-button--quiet" onClick={onRefresh} type="button">{t("重试")}</button>}
              key="service-error"
            >
              {error}
            </AccountInlineAlert>
          ) : null}
          {!error && notice ? (
            <AccountInlineAlert key="service-notice" tone="info">{notice}</AccountInlineAlert>
          ) : null}
          {isInitialLoading ? (
            <AccountSkeletonList key="service-skeleton" label={t("正在读取服务")} rows={4} variant="service" />
          ) : null}
        </AnimatePresence>

        {!isInitialLoading ? (
          <div className="account-service-groups">
            <section className="account-service-group account-service-group--available">
              <h4 className="account-service-group__title">{t("可用")}</h4>
              {available.length > 0 ? (
                <div className="account-service-list">
                  <AnimatePresence mode="popLayout">
                    {available.map((service, index) => (
                      <ServiceCard
                        confirming={confirmingAppId === service.appId}
                        delay={Math.min(0.05 + index * 0.025, 0.18)}
                        key={service.appId}
                        onCancel={onCancelRevoke}
                        onConfirm={() => onConfirmRevoke(service.appId)}
                        onRequest={() => onRequestRevoke(service.appId)}
                        revoking={revokingAppId === service.appId}
                        service={service}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              ) : (
                <AccountEmptyState icon={<ShieldCheck size={18} strokeWidth={1.8} />} title={t("当前没有向你开放的服务")} />
              )}
            </section>

            {unavailable.length > 0 ? (
              <section className="account-service-group account-service-group--unavailable">
                <h4 className="account-service-group__title">{t("暂未开放")}</h4>
                <div className="account-service-list">
                  <AnimatePresence mode="popLayout">
                    {unavailable.map((service, index) => (
                      <ServiceCard
                        confirming={false}
                        delay={Math.min(0.05 + index * 0.025, 0.18)}
                        key={service.appId}
                        onCancel={onCancelRevoke}
                        onConfirm={() => {}}
                        onRequest={() => {}}
                        revoking={false}
                        service={service}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </AccountMotionSection>
    </AccountSectionView>
  );
}

function ServiceCard({ confirming, delay, onCancel, onConfirm, onRequest, revoking, service }: {
  confirming: boolean;
  delay: number;
  onCancel: () => void;
  onConfirm: () => void;
  onRequest: () => void;
  revoking: boolean;
  service: LocalServiceAvailability;
}) {
  const { t } = usePriestessTranslation("account");
  const isAvailable = service.access === "available";
  const className = `account-service-card${isAvailable ? "" : " account-service-card--unavailable"}`;

  return (
    <AccountMotionCard className={className} delay={delay}>
      <div className="account-service-card__top">
        <span className="account-service-card__icon" aria-hidden="true">
          {isAvailable ? <AppWindow size={20} strokeWidth={1.8} /> : <LockKeyhole size={20} strokeWidth={1.8} />}
        </span>
        <div className="account-service-card__identity">
          <h5>{service.name}</h5>
          {isAvailable ? (
            <p className="account-service-card__status">
              {service.activeSession
                ? t("已登录 · {{relative}}使用", { relative: formatRelativeTime(service.lastUsedAt || service.lastAuthorizedAt) })
                : t("未登录")}
            </p>
          ) : null}
        </div>
        {isAvailable ? null : <StatusPill tone="neutral">{t("未开放")}</StatusPill>}
      </div>

      {isAvailable && service.activeSession ? (
        <div className="account-service-card__actions">
          {revoking ? (
            <button className="account-button account-button--danger" disabled type="button">
              <Unplug aria-hidden="true" size={17} strokeWidth={1.8} /><span>{t("正在解除")}</span>
            </button>
          ) : confirming ? (
            <span className="account-service-card__confirm">
              <button className="account-button account-button--danger" onClick={onConfirm} type="button">{t("确认解除")}</button>
              <button className="account-button account-button--quiet" onClick={onCancel} type="button">{t("取消")}</button>
            </span>
          ) : (
            <button className="account-button account-button--quiet" onClick={onRequest} type="button">
              <Unplug aria-hidden="true" size={17} strokeWidth={1.8} /><span>{t("解除授权")}</span>
            </button>
          )}
        </div>
      ) : null}
    </AccountMotionCard>
  );
}
