import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { usePriestessTranslation } from "@priestess/shared";

const CARD_MOTION_EASE = [0.2, 0.8, 0.2, 1] as const;
const CARD_LAYOUT_EASE = [0.22, 1, 0.36, 1] as const;

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
      duration: 0.34,
      ease: CARD_MOTION_EASE,
      layout: { duration: 0.3, ease: CARD_LAYOUT_EASE },
      opacity: { duration: 0.22, ease: CARD_MOTION_EASE },
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
  interactive = true,
  ...props
}: HTMLMotionProps<"article"> & AccountMotionProps) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.article
      className={className}
      layout={!shouldReduceMotion}
      whileHover={buildHoverMotion(Boolean(shouldReduceMotion), interactive)}
      {...buildCardMotion(Boolean(shouldReduceMotion), delay)}
      {...props}
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
  return (
    <motion.div
      className={className}
      layout={!shouldReduceMotion}
      {...buildCardMotion(Boolean(shouldReduceMotion), delay)}
      {...props}
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
  return (
    <section className="account-section" aria-labelledby={`account-section-${title}`}>
      <div className="account-section__header">
        <span aria-hidden="true">{icon}</span>
        <div>
          <h2 id={`account-section-${title}`}>{title}</h2>
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

export function PendingList({ items }: { items: string[] }) {
  const { t } = usePriestessTranslation("account");
  return (
    <div className="account-pending-list" aria-label={t("待接入事项")}>
      {items.map((item) => (
        <div className="account-pending-row" key={item}>
          <span aria-hidden="true" />
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}

export function StatusPill({ children, tone }: { children: ReactNode; tone: "good" | "neutral" | "warn" }) {
  return <span className={`account-status-pill account-status-pill--${tone}`}>{children}</span>;
}
