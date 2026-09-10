import { useId, type ReactNode } from "react";
import { motion, useIsPresent, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { Info, RefreshCw, TriangleAlert } from "lucide-react";
import { DURATION_BASE, DURATION_SLOW, EASE_LAYOUT, EASE_OUT } from "../lib/motionTokens";
import "./AccountPagePrimitives.css";

type AccountMotionProps = {
  delay?: number;
  interactive?: boolean;
};

function buildCardMotion(shouldReduceMotion: boolean, delay = 0) {
  if (shouldReduceMotion) return {};
  return {
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 6, scale: 0.996 },
    initial: { opacity: 0, y: 10, scale: 0.992 },
    transition: {
      delay,
      duration: DURATION_SLOW,
      ease: EASE_OUT,
      layout: { duration: DURATION_BASE, ease: EASE_LAYOUT },
      opacity: { duration: DURATION_BASE, ease: EASE_OUT },
    },
  };
}

function buildHoverMotion(shouldReduceMotion: boolean, interactive?: boolean) {
  if (shouldReduceMotion || !interactive) return undefined;
  return { y: -3, scale: 1.004 };
}

export function AccountMotionSection({
  children,
  className,
  delay,
  interactive,
  ...props
}: HTMLMotionProps<"section"> & AccountMotionProps) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.section
      className={className}
      layout={!shouldReduceMotion}
      whileHover={buildHoverMotion(Boolean(shouldReduceMotion), interactive)}
      {...buildCardMotion(Boolean(shouldReduceMotion), delay)}
      {...props}
    >
      {children}
    </motion.section>
  );
}

export function AccountMotionCard({
  children,
  className,
  delay,
  interactive = false,
  ...props
}: HTMLMotionProps<"article"> & AccountMotionProps) {
  const shouldReduceMotion = useReducedMotion();
  const isPresent = useIsPresent();
  return (
    <motion.article
      className={className}
      layout={!shouldReduceMotion}
      whileHover={buildHoverMotion(Boolean(shouldReduceMotion), interactive)}
      {...buildCardMotion(Boolean(shouldReduceMotion), delay)}
      {...props}
      aria-hidden={isPresent ? props["aria-hidden"] : true}
      data-account-motion-presence={isPresent ? "present" : "exiting"}
      inert={isPresent ? props.inert : true}
    >
      {children}
    </motion.article>
  );
}

export function AccountMotionPresenceItem({
  children,
  className,
  delay,
  ...props
}: HTMLMotionProps<"div"> & AccountMotionProps) {
  const shouldReduceMotion = useReducedMotion();
  const isPresent = useIsPresent();
  return (
    <motion.div
      className={className}
      layout={!shouldReduceMotion}
      {...buildCardMotion(Boolean(shouldReduceMotion), delay)}
      {...props}
      aria-hidden={isPresent ? props["aria-hidden"] : true}
      data-account-motion-presence={isPresent ? "present" : "exiting"}
      inert={isPresent ? props.inert : true}
    >
      {children}
    </motion.div>
  );
}

export function AccountSectionView({ children, description, icon, title }: {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}) {
  // id 不能由翻译后的标题拼出，否则切语言时 aria-labelledby 会指向不存在的节点。
  const headingId = useId();
  return (
    <section className="account-section" aria-labelledby={headingId}>
      <div className="account-section__header">
        <span aria-hidden="true">{icon}</span>
        <div>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function InfoCard({ icon, label, tone = "neutral", value }: {
  icon: ReactNode;
  label: string;
  tone?: "danger" | "good" | "neutral";
  value: string;
}) {
  return (
    <article className={`account-info-card account-info-card--${tone}`}>
      <span className="account-info-card__icon" aria-hidden="true">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

export function StatusPill({ children, tone }: { children: ReactNode; tone: "good" | "neutral" | "warn" }) {
  return <span className={`account-status-pill account-status-pill--${tone}`}>{children}</span>;
}

export function AccountSkeletonList({ label, rows = 3, variant }: {
  /** 屏幕阅读器读的加载说明，由调用方给，保证 i18n key 落在调用方文件里 */
  label: string;
  rows?: number;
  variant: "activity" | "device" | "service";
}) {
  return (
    <AccountMotionPresenceItem
      aria-busy="true"
      aria-label={label}
      className={`account-skeleton-list account-skeleton-list--${variant}`}
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <span className="account-skeleton-row" key={index}>
          <span className="account-skeleton account-skeleton__icon" />
          <span className="account-skeleton-lines">
            <span className="account-skeleton account-skeleton__title" />
            <span className="account-skeleton account-skeleton__meta" />
          </span>
        </span>
      ))}
    </AccountMotionPresenceItem>
  );
}

export function AccountInlineAlert({ action, children, tone = "error" }: {
  action?: ReactNode;
  children: ReactNode;
  tone?: "error" | "info";
}) {
  return (
    <AccountMotionPresenceItem className={`account-inline-alert account-inline-alert--${tone}`} role="status">
      <span className="account-inline-alert__icon" aria-hidden="true">
        {tone === "info"
          ? <Info size={17} strokeWidth={1.8} />
          : <TriangleAlert size={17} strokeWidth={1.8} />}
      </span>
      <span className="account-inline-alert__body">{children}</span>
      {action ? <span className="account-inline-alert__action">{action}</span> : null}
    </AccountMotionPresenceItem>
  );
}

export function AccountEmptyState({ description, icon, title }: {
  description?: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <AccountMotionPresenceItem className="account-empty-state">
      <span className="account-empty-state__icon" aria-hidden="true">{icon}</span>
      <span className="account-empty-state__body">
        <span className="account-empty-state__title">{title}</span>
        {description ? <span className="account-empty-state__description">{description}</span> : null}
      </span>
    </AccountMotionPresenceItem>
  );
}

/** 放进 section 头部刷新按钮内部，替换裸 RefreshCw；按钮本身负责 aria-busy 与可访问名。 */
export function AccountRefreshIndicator({ active }: { active: boolean }) {
  return (
    <span aria-hidden="true" className="account-refresh-indicator" data-active={active ? "true" : "false"}>
      <RefreshCw className={active ? "is-spinning" : undefined} size={17} strokeWidth={1.8} />
    </span>
  );
}
