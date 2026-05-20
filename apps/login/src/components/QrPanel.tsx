import { RefreshCw, ScanLine, Smartphone } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";

type QrPanelProps = {
  contentDelay?: number;
  qrValue: string;
  onRefresh: () => void;
};

export function QrPanel({ contentDelay = 0, qrValue, onRefresh }: QrPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const itemEnter = shouldReduceMotion ? false : { opacity: 0, y: 12, filter: "blur(6px)" };
  const itemAnimate = { opacity: 1, y: 0, filter: "blur(0px)" };

  return (
    <section className="qr-panel" aria-labelledby="qr-title">
      <motion.div
        className="qr-panel__header"
        initial={itemEnter}
        animate={itemAnimate}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: contentDelay, duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <span className="qr-panel__icon" aria-hidden="true">
          <Smartphone size={22} strokeWidth={1.7} />
        </span>
        <div>
          <h2 id="qr-title">扫码登录</h2>
          <p>等待手机确认</p>
        </div>
      </motion.div>

      <motion.div
        className="qr-frame"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16, scale: 0.94, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: contentDelay + 0.1, type: "spring", stiffness: 220, damping: 24 }}
      >
        <QRCodeSVG
          bgColor="#fbfaf7"
          fgColor="#24231f"
          level="M"
          marginSize={1}
          size={178}
          value={qrValue}
        />
        <span className="qr-frame__corners" aria-hidden="true" />
      </motion.div>

      <motion.div
        className="qr-panel__status"
        initial={itemEnter}
        animate={itemAnimate}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: contentDelay + 0.22, duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <ScanLine size={18} strokeWidth={1.8} />
        <span>二维码有效</span>
        <strong>02:00</strong>
      </motion.div>

      <motion.button
        className="ghost-button"
        initial={itemEnter}
        animate={itemAnimate}
        onClick={onRefresh}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: contentDelay + 0.32, duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
        type="button"
      >
        <RefreshCw size={17} strokeWidth={1.8} />
        <span>刷新二维码</span>
      </motion.button>
    </section>
  );
}
