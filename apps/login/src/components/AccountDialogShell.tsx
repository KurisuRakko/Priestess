import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DURATION_BASE, DURATION_FAST, EASE_LAYOUT, EASE_OUT } from "../lib/motionTokens";
import "./AccountPageDialog.css";

type AccountDialogShellProps = {
  children?: ReactNode;
  className?: string;
  labelledBy: string;
  onAfterOpen?: () => void;
  /** 传了才启用「按 Esc 关闭」与「点遮罩关闭」；不传则沿用旧行为（只能靠弹窗内按钮关闭）。 */
  onDismiss?: () => void;
  open: boolean;
  /** 卡片自身的入场方式。"lift"（默认）= 现有的缩放 + 上移；"fade" = 只淡入淡出，留给内部有共享元素飞行的弹窗，避免祖先 transform 干扰 layout projection。 */
  surfaceMotion?: "lift" | "fade";
};

export function AccountDialogShell({ children, className, labelledBy, onAfterOpen, onDismiss, open, surfaceMotion = "lift" }: AccountDialogShellProps) {
  const shouldReduceMotion = useReducedMotion();
  const useFlatSurface = shouldReduceMotion || surfaceMotion === "fade";
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

  useEffect(() => {
    if (!open || !onDismiss) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss, open]);

  // 关闭时由 AnimatePresence 接管卸载时机，保证个人中心弹窗都有完整退场动画。
  const dialog = (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="account-dialog-backdrop"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onDismiss ? (event) => { if (event.target === event.currentTarget) onDismiss(); } : undefined}
          role="presentation"
          transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
        >
          <motion.section
            aria-labelledby={labelledBy}
            aria-modal="true"
            className={dialogClassName}
            exit={useFlatSurface ? { opacity: 0 } : { opacity: 0, scale: 0.985, y: 10 }}
            initial={useFlatSurface ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 18 }}
            animate={useFlatSurface ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            role="dialog"
            ref={dialogRef}
            tabIndex={-1}
            transition={{
              duration: useFlatSurface ? DURATION_FAST : DURATION_BASE,
              ease: EASE_LAYOUT,
              opacity: { duration: DURATION_FAST, ease: EASE_OUT },
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
