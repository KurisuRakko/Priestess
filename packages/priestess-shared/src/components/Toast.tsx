import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type ToastProps = {
  message: string;
};

export function Toast({ message }: ToastProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="toast"
          exit={{ opacity: 0, y: shouldReduceMotion ? 0 : 10 }}
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
          role="status"
          transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
