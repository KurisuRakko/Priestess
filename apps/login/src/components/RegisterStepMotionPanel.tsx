import { type ReactNode } from "react";
import { motion, useIsPresent } from "motion/react";
import { MOBILE_STEP_SHARED_AXIS_VARIANTS } from "./mobileSharedAxisMotion";
import { STEP_PANEL_EASE, STEP_PANEL_VARIANTS, type RegisterStep } from "./registerStepConfig";

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
  const mobileMotionMode = isMobileViewport ? (shouldAnimateMobile ? "fade-through" : "direct") : undefined;

  return (
    <motion.div
      ref={panelRef}
      animate={shouldReduceMotion ? { opacity: 1, x: 0 } : "center"}
      className="register-step-panel"
      custom={direction}
      data-register-step-motion-origin={direction > 0 ? "right" : "left"}
      data-register-step-panel={step}
      data-mobile-motion={mobileMotionMode}
      exit={shouldReduceMotion
        ? { opacity: 0 }
        : "exit"}
      initial={shouldReduceMotion ? false : "enter"}
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
      transition={shouldReduceMotion
        ? { duration: 0 }
        : shouldAnimateMobile
          ? undefined
          : { duration: 0.28, ease: STEP_PANEL_EASE }}
      variants={shouldReduceMotion
        ? undefined
        : isMobileViewport
          ? MOBILE_STEP_SHARED_AXIS_VARIANTS
          : STEP_PANEL_VARIANTS}
    >
      {children}
    </motion.div>
  );
}
