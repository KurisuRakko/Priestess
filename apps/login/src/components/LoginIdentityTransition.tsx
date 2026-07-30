import { getPriestessDisplayAvatarUrl } from "@priestess/shared";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { SharedLoginIdentityAvatar } from "./SharedLoginIdentityAvatar";
import type { LoginIdentityMotionSource } from "./loginIdentityMotion";
import "./LoginIdentityTransitionHandoff.css";

export type LoginIdentityTransitionPhase = "failure" | "handoff" | "loading" | "success";

type LoginIdentityTransitionProps = {
  avatarUrl: string;
  description: string;
  displayName: string;
  exiting: boolean;
  identityMotionSource: LoginIdentityMotionSource | null;
  phase: LoginIdentityTransitionPhase;
  statusText: string;
};

// 状态文案拥有独立 presence 生命周期，保证 loading、success 与 failure 都有完整退场。
function IdentityStatusLine({
  phase,
  shouldReduceMotion,
  statusText,
}: {
  phase: LoginIdentityTransitionPhase;
  shouldReduceMotion: boolean;
  statusText: string;
}) {
  const isPresent = useIsPresent();
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      aria-hidden={isPresent ? undefined : true}
      className="login-identity-transition__status"
      data-login-identity-status-phase={phase}
      data-login-identity-status-presence={isPresent ? "present" : "exiting"}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -7 }}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 7 }}
      transition={shouldReduceMotion
        ? { duration: 0 }
        : isPresent
          ? { duration: 0.26, ease: [0.16, 1, 0.3, 1] }
          : { duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
    >
      {statusText}
    </motion.div>
  );
}

export function LoginIdentityTransition({
  avatarUrl,
  description,
  displayName,
  exiting,
  identityMotionSource,
  phase,
  statusText,
}: LoginIdentityTransitionProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const shouldRevealIdentity = phase === "success";

  return (
    <div
      className={`login-identity-transition is-${phase}`}
      data-login-identity-presence={exiting ? "exiting" : "present"}
      data-login-identity-phase={phase}
    >
      <div className="login-identity-transition__visual" aria-hidden="true">
        <div className="login-identity-transition__ring-shell">
          <div className="login-identity-transition__ring-motion">
            <svg className="login-identity-transition__ring" viewBox="0 0 104 104">
              <circle className="login-identity-transition__ring-track" cx="52" cy="52" r="46" />
              <circle className="login-identity-transition__ring-arc" cx="52" cy="52" r="46" />
            </svg>
          </div>
          <svg className="login-identity-transition__ring-outcome" viewBox="0 0 104 104">
            <path className="login-identity-transition__failure-mark" d="M36 36L68 68M68 36L36 68" />
            <g className="login-identity-transition__handoff-dots">
              <circle cx="40" cy="52" r="3" />
              <circle cx="52" cy="52" r="3" />
              <circle cx="64" cy="52" r="3" />
            </g>
          </svg>
        </div>

        {identityMotionSource ? (
          <SharedLoginIdentityAvatar
            avatarUrl={avatarUrl}
            exiting={exiting}
            phase={phase}
            source={identityMotionSource}
          />
        ) : shouldRevealIdentity ? (
          <img
            alt=""
            className="login-identity-transition__avatar"
            data-login-identity-avatar="revealed"
            src={getPriestessDisplayAvatarUrl(avatarUrl)}
          />
        ) : null}
      </div>

      <AnimatePresence initial={false}>
        {shouldRevealIdentity && displayName ? (
          <motion.div
            animate={exiting ? { opacity: 0, y: -6 } : { opacity: 1, y: 0 }}
            className="login-identity-transition__name"
            data-login-identity-name="revealed"
            exit={{ opacity: 0, y: -6 }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            key="identity-name"
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {displayName}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        className="login-identity-transition__status-slot"
        layout="position"
        transition={shouldReduceMotion ? { duration: 0 } : { layout: { duration: 0.36, ease: [0.16, 1, 0.3, 1] } }}
      >
        <AnimatePresence initial={false} mode="sync">
          <IdentityStatusLine
            key={`${phase}:${statusText}`}
            phase={phase}
            shouldReduceMotion={shouldReduceMotion}
            statusText={statusText}
          />
        </AnimatePresence>
      </motion.div>

      <AnimatePresence initial={false}>
        {(phase === "failure" || phase === "handoff") && description ? (
          <motion.div
            animate={exiting ? { opacity: 0, y: -5 } : { opacity: 1, y: 0 }}
            className="login-identity-transition__description"
            exit={{ opacity: 0, y: -5 }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            key={`${phase}:${description}`}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.26, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          >
            {description}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
