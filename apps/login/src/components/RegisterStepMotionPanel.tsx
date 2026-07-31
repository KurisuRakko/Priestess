import { type ReactNode } from "react";
import { motion, useIsPresent } from "motion/react";
import {
  DESKTOP_STEP_SHARED_AXIS_VARIANTS,
  MOBILE_STEP_SHARED_AXIS_VARIANTS,
} from "./authSharedAxisMotion";
import { type RegisterStep } from "./registerStepConfig";

type RegisterStepMotionPanelProps = {
  children: ReactNode;
  direction: number;
  isMobileViewport: boolean;
  panelRef: (element: HTMLDivElement | null) => void;
  shouldReduceMotion: boolean | null;
  step: RegisterStep;
};

export function RegisterStepMotionPanel({
  children,
  direction,
  isMobileViewport,
  panelRef,
  shouldReduceMotion,
  step,
}: RegisterStepMotionPanelProps) {
  const isPresent = useIsPresent();
  const shouldAnimateMobile = isMobileViewport && !shouldReduceMotion;
  const shouldAnimateDesktop = !isMobileViewport && !shouldReduceMotion;
  const mobileMotionMode = isMobileViewport ? (shouldAnimateMobile ? "fade-through" : "direct") : undefined;
  const desktopMotionMode = !isMobileViewport ? (shouldAnimateDesktop ? "shared-axis" : "direct") : undefined;

  return (
    <motion.div
      ref={panelRef}
      animate={shouldReduceMotion ? { opacity: 1, x: 0 } : "center"}
      aria-hidden={isPresent ? undefined : true}
      className="register-step-panel"
      custom={direction}
      data-register-step-motion-origin={direction > 0 ? "right" : "left"}
      data-register-step-panel={step}
      data-register-step-presence={isPresent ? "present" : "exiting"}
      data-desktop-motion={desktopMotionMode}
      data-mobile-motion={mobileMotionMode}
      exit={shouldReduceMotion
        ? { opacity: 0 }
        : "exit"}
      initial={shouldReduceMotion ? false : "enter"}
      inert={isPresent ? undefined : true}
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
      transition={shouldReduceMotion
        ? { duration: 0 }
        : undefined}
      variants={shouldReduceMotion
        ? undefined
        : isMobileViewport
          ? MOBILE_STEP_SHARED_AXIS_VARIANTS
          : DESKTOP_STEP_SHARED_AXIS_VARIANTS}
    >
      {children}
    </motion.div>
  );
}
