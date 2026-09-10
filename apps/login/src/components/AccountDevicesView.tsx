import { useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { Laptop, LogOut, ShieldCheck, X } from "lucide-react";
import { usePriestessTranslation, type LocalDeviceSession } from "@priestess/shared";
import { formatDateTime, formatRelativeTime } from "./accountPageFormat";
import { AccountDialogShell } from "./AccountDialogShell";
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
import "./AccountDevices.css";

/** 当前设备永远置顶，其余按最近使用时间降序；已撤销的会话不展示。 */
export function sortDeviceSessions(sessions: LocalDeviceSession[]): LocalDeviceSession[] {
  return sessions
    .filter((session) => !session.revokedAt)
    .slice()
    .sort((left, right) => {
      if (left.current !== right.current) return left.current ? -1 : 1;
      return readDeviceActivityTime(right) - readDeviceActivityTime(left);
    });
}

function readDeviceActivityTime(session: LocalDeviceSession) {
  const timestamp = Date.parse(session.lastUsedAt || session.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export type AccountDevicesViewProps = {
  /** 正在做内联二次确认的非当前设备 session_id；空串表示没有 */
  confirmingSessionId: string;
  deviceCount: number;
  /** 0 表示后端没给上限，界面隐藏整个容量区块 */
  deviceLimit: number;
  error: string;
  /** 「退出其他所有设备」处于内联二次确认态 */
  isConfirmingRevokeOthers: boolean;
  /** 当前设备的退出确认弹窗是否打开 */
  isCurrentDeviceDialogOpen: boolean;
  /** 首次加载（还没有任何数据）；只有它为 true 才显示骨架 */
  isInitialLoading: boolean;
  /** 已有数据的后台刷新；列表必须保持挂载 */
  isRefreshing: boolean;
  isRevokingOthers: boolean;
  onCancelRevoke: () => void;
  onCancelRevokeOthers: () => void;
  onCloseCurrentDeviceDialog: () => void;
  onConfirmRevoke: (sessionId: string) => void;
  onConfirmRevokeOthers: () => void;
  onOpenCurrentDeviceDialog: () => void;
  onRefresh: () => void;
  onRequestRevoke: (sessionId: string) => void;
  onRequestRevokeOthers: () => void;
  /** 正在提交撤销的 session_id；空串表示没有 */
  revokingSessionId: string;
  /** 未排序未过滤的原始列表，视图内部调 sortDeviceSessions */
  sessions: LocalDeviceSession[];
};

export function AccountDevicesView({
  confirmingSessionId,
  deviceCount,
  deviceLimit,
  error,
  isConfirmingRevokeOthers,
  isCurrentDeviceDialogOpen,
  isInitialLoading,
  isRefreshing,
  isRevokingOthers,
  onCancelRevoke,
  onCancelRevokeOthers,
  onCloseCurrentDeviceDialog,
  onConfirmRevoke,
  onConfirmRevokeOthers,
  onOpenCurrentDeviceDialog,
  onRefresh,
  onRequestRevoke,
  onRequestRevokeOthers,
  revokingSessionId,
  sessions,
}: AccountDevicesViewProps) {
  const { t } = usePriestessTranslation("account");
  const visibleSessions = useMemo(() => sortDeviceSessions(sessions), [sessions]);
  const currentSession = visibleSessions.find((session) => session.current) ?? null;
  const otherDeviceCount = visibleSessions.length - (currentSession ? 1 : 0);

  return (
    <AccountSectionView
      description={t("查看并管理当前账号仍然登录的设备。")}
      icon={<Laptop size={21} strokeWidth={1.8} />}
      title={t("设备")}
    >
      <AccountMotionSection className="account-device-panel" delay={0.04}>
        <div className="account-device-panel__header">
          <div className="account-device-panel__heading">
            <h3>{t("已登录设备")}</h3>
            {deviceLimit > 0 ? (
              <div
                aria-label={t("设备容量")}
                className={`account-device-capacity${deviceCount >= deviceLimit ? " is-full" : ""}`}
              >
                <span className="account-device-capacity__text">
                  {t("{{count}} / {{limit}}", { count: deviceCount, limit: deviceLimit })}
                </span>
                <span aria-hidden="true" className="account-device-capacity__dots">
                  {Array.from({ length: deviceLimit }, (_, index) => (
                    <span
                      className={`account-device-capacity__dot${index < deviceCount ? " is-used" : ""}`}
                      key={index}
                    />
                  ))}
                </span>
              </div>
            ) : null}
          </div>

          <div className="account-device-panel__actions">
            {otherDeviceCount > 0 ? (
              isRevokingOthers ? (
                <button className="account-button account-button--danger" disabled type="button">
                  <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
                  <span>{t("正在退出")}</span>
                </button>
              ) : isConfirmingRevokeOthers ? (
                <span className="account-device-panel__confirm">
                  <button className="account-button account-button--danger" onClick={onConfirmRevokeOthers} type="button">
                    {t("确认退出")}
                  </button>
                  <button className="account-button account-button--quiet" onClick={onCancelRevokeOthers} type="button">
                    {t("取消")}
                  </button>
                </span>
              ) : (
                <button className="account-button account-button--quiet" onClick={onRequestRevokeOthers} type="button">
                  <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
                  <span>{t("退出其他所有设备")}</span>
                </button>
              )
            ) : null}

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
        </div>

        {deviceLimit > 0 ? (
          <p className="account-device-panel__hint">
            {t("超过 {{limit}} 台时，最久未使用的设备会被自动退出登录", { limit: deviceLimit })}
          </p>
        ) : null}

        <AnimatePresence initial={false} mode="popLayout">
          {error ? (
            <AccountInlineAlert
              action={(
                <button className="account-button account-button--quiet" onClick={onRefresh} type="button">
                  {t("重试")}
                </button>
              )}
              key="device-error"
            >
              {error}
            </AccountInlineAlert>
          ) : null}
          {isInitialLoading ? (
            <AccountSkeletonList key="device-skeleton" label={t("正在读取已登录设备")} rows={3} variant="device" />
          ) : null}
          {!isInitialLoading && !error && visibleSessions.length === 0 ? (
            <AccountEmptyState
              icon={<ShieldCheck size={18} strokeWidth={1.8} />}
              key="device-empty"
              title={t("当前没有可显示的登录设备。")}
            />
          ) : null}
        </AnimatePresence>

        {/* 列表挂载只看数据，绝不跟刷新态走：刷新期间整表留在 DOM，撤销才有 exit 动画可播。 */}
        {visibleSessions.length > 0 ? (
          <div className="account-device-list">
            <AnimatePresence mode="popLayout">
              {visibleSessions.map((session, index) => (
                <DeviceCard
                  confirming={confirmingSessionId === session.sessionId}
                  delay={Math.min(0.05 + index * 0.025, 0.18)}
                  key={session.sessionId}
                  onCancel={onCancelRevoke}
                  onConfirm={() => onConfirmRevoke(session.sessionId)}
                  onOpenDialog={onOpenCurrentDeviceDialog}
                  onRequest={() => onRequestRevoke(session.sessionId)}
                  revoking={revokingSessionId === session.sessionId}
                  session={session}
                />
              ))}
            </AnimatePresence>
          </div>
        ) : null}
      </AccountMotionSection>

      {currentSession ? (
        <CurrentDeviceDialog
          onClose={onCloseCurrentDeviceDialog}
          onConfirm={() => onConfirmRevoke(currentSession.sessionId)}
          open={isCurrentDeviceDialogOpen}
          revoking={revokingSessionId === currentSession.sessionId}
        />
      ) : null}
    </AccountSectionView>
  );
}

function DeviceCard({ confirming, delay, onCancel, onConfirm, onOpenDialog, onRequest, revoking, session }: {
  confirming: boolean;
  delay: number;
  onCancel: () => void;
  onConfirm: () => void;
  onOpenDialog: () => void;
  onRequest: () => void;
  revoking: boolean;
  session: LocalDeviceSession;
}) {
  const { t } = usePriestessTranslation("account");
  const className = [
    "account-device-card",
    session.current ? "account-device-card--current" : "",
    revoking ? "account-device-card--busy" : "",
  ].filter(Boolean).join(" ");

  return (
    <AccountMotionCard className={className} delay={delay}>
      <div className="account-device-card__top">
        <span aria-hidden="true" className="account-device-card__icon">
          <Laptop size={20} strokeWidth={1.8} />
        </span>
        <div className="account-device-card__identity">
          <h4>{`${session.browser} · ${session.os}`}</h4>
          <p className="account-device-card__primary">
            {`${t("{{relative}}使用", { relative: formatRelativeTime(session.lastUsedAt || session.createdAt) })} · ${session.ipAddress}`}
          </p>
          <p className="account-device-card__secondary">
            {t("{{datetime}} 登录", { datetime: formatDateTime(session.createdAt) })}
          </p>
        </div>
        {session.current ? <StatusPill tone="good">{t("此设备")}</StatusPill> : null}
      </div>

      <div className="account-device-card__actions">
        {session.current ? (
          <button className="account-button account-button--quiet" disabled={revoking} onClick={onOpenDialog} type="button">
            <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{revoking ? t("正在退出") : t("退出此设备")}</span>
          </button>
        ) : revoking ? (
          <button className="account-button account-button--danger" disabled type="button">
            <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{t("正在退出")}</span>
          </button>
        ) : confirming ? (
          <span className="account-device-card__confirm">
            <button className="account-button account-button--danger" onClick={onConfirm} type="button">
              {t("确认退出")}
            </button>
            <button className="account-button account-button--quiet" onClick={onCancel} type="button">
              {t("取消")}
            </button>
          </span>
        ) : (
          <button className="account-button account-button--quiet" disabled={!session.sessionId} onClick={onRequest} type="button">
            <LogOut aria-hidden="true" size={17} strokeWidth={1.8} />
            <span>{t("退出登录")}</span>
          </button>
        )}
      </div>
    </AccountMotionCard>
  );
}

function CurrentDeviceDialog({ onClose, onConfirm, open, revoking }: {
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  revoking: boolean;
}) {
  const { t } = usePriestessTranslation("account");
  return (
    <AccountDialogShell labelledBy="account-device-revoke-title" open={open}>
      <button aria-label={t("关闭退出确认弹窗")} className="account-dialog__close" disabled={revoking} onClick={onClose} type="button">
        <X aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
      <span aria-hidden="true" className="account-dialog__icon">
        <LogOut size={22} strokeWidth={1.8} />
      </span>
      <div>
        <p>{t("设备")}</p>
        <h3 id="account-device-revoke-title">{t("退出此设备")}</h3>
        <span>{t("退出此设备后需要重新登录 Priestess。")}</span>
      </div>
      <div className="account-dialog__actions">
        <button className="account-button account-button--quiet" disabled={revoking} onClick={onClose} type="button">
          {t("取消")}
        </button>
        <button className="account-button account-button--danger" disabled={revoking} onClick={onConfirm} type="button">
          {revoking ? t("正在退出") : t("确认退出")}
        </button>
      </div>
    </AccountDialogShell>
  );
}
