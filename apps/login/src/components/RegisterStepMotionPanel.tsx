import { type ReactNode } from "react";
import { motion, useIsPresent } from "motion/react";
import { STEP_PANEL_EASE, STEP_PANEL_VARIANTS, type RegisterStep } from "./registerStepConfig";

type RegisterStepMotionPanelProps = {
  children: ReactNode;
  direction: number;
  isMobileViewport: boolean;
  panelRef: (element: HTMLDivElement | null) => void;
  shouldReduceMotion: boolean | null;
  step: RegisterStep;
};

const MOBILE_STEP_PANEL_VARIANTS = {
  center: {
    opacity: 1,
    x: 0,
  },
  enter: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 22 : -22,
  }),
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -22 : 22,
  }),
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

  return (
    <motion.div
      ref={panelRef}
      animate="center"
      className="register-step-panel"
      custom={direction}
      data-register-step-motion-origin={direction > 0 ? "right" : "left"}
      data-register-step-panel={step}
      exit="exit"
      initial={shouldReduceMotion ? false : "enter"}
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
      transition={shouldReduceMotion
        ? { duration: 0 }
        : isMobileViewport
          ? { duration: 0.26, ease: STEP_PANEL_EASE }
          : { duration: 0.28, ease: STEP_PANEL_EASE }}
      variants={isMobileViewport ? MOBILE_STEP_PANEL_VARIANTS : STEP_PANEL_VARIANTS}
    >
      {children}
    </motion.div>
  );
}
