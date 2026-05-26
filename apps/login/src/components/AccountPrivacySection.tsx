import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  getPriestessApiErrorMessage,
  listLocalPrivacyActivityPage,
  translatePriestess,
  usePriestessTranslation,
  type LocalPrivacyActivity,
} from "@priestess/shared";
import { dateTimeFormatter, formatDateTime } from "./accountPageFormat";
import { AccountMotionCard, AccountMotionPresenceItem, AccountMotionSection, AccountSectionView, InfoCard, StatusPill } from "./AccountPagePrimitives";
import "./AccountPrivacy.css";

const ACTIVITY_PAGE_SIZE = 10;

export function AccountPrivacySection() {
  const { t } = usePriestessTranslation("account");
  const [activities, setActivities] = useState<LocalPrivacyActivity[]>([]);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const isFetchingRef = useRef(false);
  const nextOffsetRef = useRef<number | null>(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadActivities = useCallback(async(options: { reset?: boolean; signal?: AbortSignal } = {}) => {
    const reset = options.reset ?? false;
    const requestOffset = reset ? 0 : nextOffsetRef.current;
    if (isFetchingRef.current || (!reset && requestOffset === null)) return;
    isFetchingRef.current = true;
    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError("");
    try {
      // 隐私活动按页读取后端审计日志投影，用户只有继续向下浏览时才请求下一批。
      const page = await listLocalPrivacyActivityPage({ limit: ACTIVITY_PAGE_SIZE, offset: requestOffset ?? 0 }, { signal: options.signal });
      if (options.signal?.aborted) return;
      setActivities((current) => reset ? page.activities : mergeActivities(current, page.activities));
      setHasMore(page.hasMore);
      nextOffsetRef.current = page.nextOffset;
    } catch (requestError) {
      if (options.signal?.aborted) return;
      if (reset) {
        setActivities([]);
        setHasMore(false);
        nextOffsetRef.current = 0;
      }
      setError(getPriestessApiErrorMessage(requestError, t("无法读取隐私活动")));
    } finally {
      isFetchingRef.current = false;
      if (!options.signal?.aborted) {
        setLastLoadedAt(new Date());
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadActivities({ reset: true, signal: controller.signal });
    return () => controller.abort();
  }, [loadActivities]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || isLoading || isLoadingMore) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadActivities();
      }
    }, { rootMargin: "320px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, loadActivities]);

  const latestActivity = activities[0] ?? null;

  return (
    <AccountSectionView icon={<Database size={21} strokeWidth={1.8} />} title={t("隐私活动")} description={t("查看当前账号可见的安全与隐私活动记录。")}>
      <div className="account-card-grid">
        <InfoCard icon={<Activity size={19} strokeWidth={1.8} />} label={t("活动记录")} value={isLoading ? t("读取中") : t("{{count}} 条", { count: activities.length })} />
        <InfoCard icon={<Clock3 size={19} strokeWidth={1.8} />} label={t("最近活动")} value={formatDateTime(latestActivity?.createdAt || "")} />
        <InfoCard icon={<ShieldCheck size={19} strokeWidth={1.8} />} label={t("记录来源")} value={t("后端审计")} />
        <InfoCard icon={<RefreshCw size={19} strokeWidth={1.8} />} label={t("刷新时间")} value={lastLoadedAt ? dateTimeFormatter.format(lastLoadedAt) : t("未刷新")} />
      </div>

      <AccountMotionSection className="account-privacy-panel account-motion-surface" aria-labelledby="account-privacy-title" delay={0.04}>
        <div className="account-privacy-panel__header">
          <div>
            <h3 id="account-privacy-title">{t("最近隐私活动")}</h3>
            <p>{t("这里只显示与你当前本地账号直接相关的 Priestess 审计记录。")}</p>
          </div>
          <div className="account-privacy-panel__actions">
            <StatusPill tone="neutral">{t("只读")}</StatusPill>
            <button className="account-button account-button--quiet" disabled={isLoading || isLoadingMore} onClick={() => void loadActivities({ reset: true })} type="button">
              <RefreshCw aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{t("刷新")}</span>
            </button>
          </div>
        </div>

        <AnimatePresence initial={false} mode="popLayout">
          {error ? (
            <AccountMotionPresenceItem className="account-inline-alert" key="privacy-error" role="status">
              <AlertTriangle aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{error}</span>
            </AccountMotionPresenceItem>
          ) : null}
          {isLoading ? (
            <AccountMotionPresenceItem className="account-inline-loading" key="privacy-loading" role="status">
              <RefreshCw aria-hidden="true" size={17} strokeWidth={1.8} />
              <span>{t("正在读取隐私活动")}</span>
            </AccountMotionPresenceItem>
          ) : null}
          {!isLoading && activities.length === 0 ? (
            <AccountMotionPresenceItem className="account-privacy-empty" key="privacy-empty">
              <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.8} />
              <span>{t("当前没有可显示的隐私活动。")}</span>
            </AccountMotionPresenceItem>
          ) : null}
        </AnimatePresence>

        {!isLoading && activities.length > 0 ? (
          <div className="account-privacy-list">
            <AnimatePresence mode="popLayout">
              {activities.map((activity, index) => (
                <PrivacyActivityCard activity={activity} delay={Math.min(0.05 + index * 0.025, 0.18)} key={buildActivityKey(activity)} />
              ))}
            </AnimatePresence>
            <div className="account-privacy-load-sentinel" ref={sentinelRef} aria-hidden="true" />
            <div className="account-privacy-load-state" role="status">
              {isLoadingMore ? (
                <>
                  <RefreshCw aria-hidden="true" size={16} strokeWidth={1.8} />
                  <span>{t("继续读取下一批活动")}</span>
                </>
              ) : hasMore ? (
                <span>{t("继续向下滑动加载更多")}</span>
              ) : (
                <span>{t("已显示全部可见活动")}</span>
              )}
            </div>
          </div>
        ) : null}
      </AccountMotionSection>
    </AccountSectionView>
  );
}

function mergeActivities(current: LocalPrivacyActivity[], next: LocalPrivacyActivity[]) {
  const seen = new Set(current.map(buildActivityKey));
  const merged = [...current];
  for (const activity of next) {
    const key = buildActivityKey(activity);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(activity);
    }
  }
  return merged;
}

function buildActivityKey(activity: LocalPrivacyActivity) {
  return `${activity.id ?? activity.action}-${activity.createdAt}-${activity.summary}`;
}

function PrivacyActivityCard({ activity, delay }: { activity: LocalPrivacyActivity; delay: number }) {
  const { t } = usePriestessTranslation("account");
  const metadata = Object.entries(activity.metadata).slice(0, 4);
  return (
    <AccountMotionCard className="account-privacy-card account-motion-surface" delay={delay}>
      <div className="account-privacy-card__top">
        <span className="account-privacy-card__icon" aria-hidden="true">
          <Activity size={20} strokeWidth={1.8} />
        </span>
        <div>
          <h4>{activity.label}</h4>
          <p>{activity.summary || activity.action}</p>
        </div>
        <StatusPill tone="neutral">{formatDateTime(activity.createdAt)}</StatusPill>
      </div>
      <dl className="account-privacy-card__facts">
        <div>
          <dt>{t("时间")}</dt>
          <dd>{formatDateTime(activity.createdAt)}</dd>
        </div>
        <div>
          <dt>{t("来源 IP")}</dt>
          <dd>{activity.ipAddress || t("未记录")}</dd>
        </div>
        <div>
          <dt>{t("浏览器")}</dt>
          <dd>{activity.userAgent || t("未记录")}</dd>
        </div>
        <div>
          <dt>{t("动作")}</dt>
          <dd>{activity.action}</dd>
        </div>
      </dl>
      {metadata.length > 0 ? (
        <div className="account-privacy-card__metadata" aria-label={t("活动元数据")}>
          {metadata.map(([key, value]) => (
            <span key={key}>
              <strong>{formatMetadataKey(key)}</strong>
              {formatMetadataValue(value)}
            </span>
          ))}
        </div>
      ) : null}
    </AccountMotionCard>
  );
}

function formatMetadataKey(key: string) {
  const labels: Record<string, string> = {
    app_id: translatePriestess("account:服务"),
    changed_fields: translatePriestess("account:字段"),
    credential_id: translatePriestess("account:凭证"),
    current: translatePriestess("account:当前浏览器"),
    factor_id: translatePriestess("account:二步验证"),
    identity_mask: translatePriestess("account:身份"),
    identity_type: translatePriestess("account:类型"),
    locked_until: translatePriestess("account:锁定到"),
    revoked_sessions: translatePriestess("account:撤销会话"),
    scope: translatePriestess("account:范围"),
    security_level: translatePriestess("account:风险等级"),
    security_reason: translatePriestess("account:原因"),
    session_id: translatePriestess("account:会话"),
    username: translatePriestess("account:用户名"),
  };
  return labels[key] ?? key;
}

function formatMetadataValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.join("、") || translatePriestess("account:无");
  }
  if (typeof value === "boolean") {
    return value ? translatePriestess("account:是") : translatePriestess("account:否");
  }
  if (typeof value === "number" || typeof value === "string") {
    return String(value) || translatePriestess("account:无");
  }
  return translatePriestess("account:已记录");
}
