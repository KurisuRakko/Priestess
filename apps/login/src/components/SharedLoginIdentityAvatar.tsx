import { useLayoutEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { getPriestessDisplayAvatarUrl } from "@priestess/shared";
import type { LoginIdentityTransitionPhase } from "./LoginIdentityTransition";
import type { LoginIdentityMotionSource } from "./loginIdentityMotion";
import "./SharedLoginIdentityAvatar.css";

const SHARED_AVATAR_SIZE = 104;
const LOADING_AVATAR_SCALE = 46 / SHARED_AVATAR_SIZE;
const SHARED_AVATAR_EASE = [0.16, 1, 0.3, 1] as const;

type MotionOrigin = {
  scale: number;
  x: number;
  y: number;
};

type SharedLoginIdentityAvatarProps = {
  avatarUrl: string;
  phase: LoginIdentityTransitionPhase;
  source: LoginIdentityMotionSource;
};

export function SharedLoginIdentityAvatar({
  avatarUrl,
  phase,
  source,
}: SharedLoginIdentityAvatarProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const targetRef = useRef<HTMLSpanElement | null>(null);
  const [motionOrigin, setMotionOrigin] = useState<MotionOrigin | null>(null);

  useLayoutEffect(() => {
    const target = targetRef.current;
    if (!target) {
      return;
    }

    const targetRect = target.getBoundingClientRect();
    const sourceRect = source.avatarRect;
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    setMotionOrigin({
      scale: sourceRect.width / SHARED_AVATAR_SIZE,
      x: sourceRect.left + sourceRect.width / 2 - targetCenterX,
      y: sourceRect.top + sourceRect.height / 2 - targetCenterY,
    });
  }, [
    source.avatarRect.height,
    source.avatarRect.left,
    source.avatarRect.top,
    source.avatarRect.width,
  ]);

  const isSuccess = phase === "success";
  const isFailure = phase === "failure";
  const motionMode = shouldReduceMotion
    ? "direct"
    : isFailure
      ? "returning"
      : isSuccess
        ? "expanding"
        : "source-to-ring";

  const animate = shouldReduceMotion
    ? {
        opacity: isSuccess ? 1 : 0,
        scale: isSuccess ? 1 : LOADING_AVATAR_SCALE,
        x: 0,
        y: 0,
      }
    : isFailure && motionOrigin
      ? {
          opacity: 0,
          scale: motionOrigin.scale,
          x: motionOrigin.x,
          y: motionOrigin.y,
        }
      : {
          opacity: 1,
          scale: isSuccess ? 1 : LOADING_AVATAR_SCALE,
          x: 0,
          y: 0,
        };

  return (
    <span
      className="login-identity-transition__shared-avatar-target"
      ref={targetRef}
    >
      {motionOrigin ? (
        <motion.span
          animate={animate}
          className="login-identity-transition__shared-avatar-frame"
          data-login-identity-avatar={isSuccess ? "revealed" : "shared"}
          data-login-identity-motion={motionMode}
          data-login-identity-origin-scale={motionOrigin.scale.toFixed(4)}
          data-login-identity-origin-x={motionOrigin.x.toFixed(2)}
          data-login-identity-origin-y={motionOrigin.y.toFixed(2)}
          data-login-identity-source={source.kind}
          initial={shouldReduceMotion
            ? false
            : {
                opacity: 1,
                scale: motionOrigin.scale,
                x: motionOrigin.x,
                y: motionOrigin.y,
              }}
          transition={shouldReduceMotion
            ? { duration: 0 }
            : isFailure
              ? {
                  duration: 0.44,
                  ease: [0.4, 0, 0.2, 1],
                }
              : isSuccess
                ? {
                    duration: 0.52,
                    ease: SHARED_AVATAR_EASE,
                  }
                : {
                    opacity: { duration: 0.16, ease: "linear" },
                    scale: { duration: 0.62, ease: SHARED_AVATAR_EASE },
                    x: { duration: 0.62, ease: SHARED_AVATAR_EASE },
                    y: { duration: 0.68, ease: [0.22, 1, 0.36, 1] },
                  }}
        >
          <img
            alt=""
            className="login-identity-transition__shared-avatar-image"
            src={getPriestessDisplayAvatarUrl(avatarUrl)}
          />
        </motion.span>
      ) : null}
    </span>
  );
}
