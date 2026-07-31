import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./AccountPageDialog.css";

const DIALOG_BACKDROP_EASE = [0.2, 0.8, 0.2, 1] as const;
const DIALOG_PANEL_EASE = [0.22, 1, 0.36, 1] as const;

type AccountDialogShellProps = {
  children?: ReactNode;
  className?: string;
  labelledBy: string;
  onAfterOpen?: () => void;
  open: boolean;
};

export function AccountDialogShell({ children, className, labelledBy, onAfterOpen, open }: AccountDialogShellProps) {
  const shouldReduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLElement | null>(null);
  const hasReportedOpenRef = useRef(false);
  const dialogClassName = ["account-dialog", className].filter(Boolean).join(" ");

  useEffect(() => {
    if (!open) {
      hasReportedOpenRef.current = false;
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog || hasReportedOpenRef.current) return;
      const focusTarget = dialog.querySelector<HTMLElement>(
        'input:not(:disabled):not([type="hidden"]):not([type="file"]), select:not(:disabled), textarea:not(:disabled)',
      ) ?? dialog.querySelector<HTMLElement>(
        'button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? dialog;
      focusTarget.focus({ preventScroll: true });
      hasReportedOpenRef.current = true;
      onAfterOpen?.();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [onAfterOpen, open]);

  // 关闭时由 AnimatePresence 接管卸载时机，保证个人中心弹窗都有完整退场动画。
  const dialog = (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="account-dialog-backdrop"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="presentation"
          transition={{ duration: shouldReduceMotion ? 0.12 : 0.2, ease: DIALOG_BACKDROP_EASE }}
        >
          <motion.section
            aria-labelledby={labelledBy}
            aria-modal="true"
            className={dialogClassName}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 10 }}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 18 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            role="dialog"
            ref={dialogRef}
            tabIndex={-1}
            transition={{
              duration: shouldReduceMotion ? 0.12 : 0.24,
              ease: DIALOG_PANEL_EASE,
              opacity: { duration: shouldReduceMotion ? 0.12 : 0.18, ease: DIALOG_BACKDROP_EASE },
            }}
          >
            {children}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}
