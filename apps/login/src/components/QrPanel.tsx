import { CheckCircle2, RefreshCw, ScanLine, Smartphone } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { usePriestessTranslation } from "@priestess/shared";

export type QrPanelVisualState = "pending" | "scanned" | "confirmed" | "terminal" | "error";

type QrPanelProps = {
  contentDelay?: number;
  expiresLabel?: string;
  isRefreshing?: boolean;
  qrValue: string;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  statusText?: string;
  visualState?: QrPanelVisualState;
};

export function QrPanel({
  contentDelay = 0,
  expiresLabel = "02:00",
  isRefreshing = false,
  qrValue,
  onRefresh,
  refreshDisabled = false,
  refreshLabel,
  statusText,
  visualState = "pending",
}: QrPanelProps) {
  const { t } = usePriestessTranslation("login");
  const shouldReduceMotion = useReducedMotion();
  const itemEnter = shouldReduceMotion ? false : { opacity: 0, y: 12, filter: "blur(6px)" };
  const itemAnimate = { opacity: 1, y: 0, filter: "blur(0px)" };
  const normalizedQrValue = qrValue.trim();
  const hasQrValue = normalizedQrValue.length > 0;
  const shouldShowQrOverlay = hasQrValue && (visualState === "scanned" || visualState === "confirmed");
  const overlayTitle = visualState === "confirmed" ? t("已确认") : t("扫描成功");
  const overlayDescription = visualState === "confirmed" ? t("正在返回应用") : t("请在手机上确认");
  const resolvedRefreshLabel = refreshLabel ?? t("刷新二维码");
  const resolvedStatusText = statusText ?? t("二维码有效");

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
          <h2 id="qr-title">{t("扫码登录")}</h2>
          <p>{t("等待手机确认")}</p>
        </div>
      </motion.div>

      <motion.div
        className={[
          "qr-frame",
          shouldShowQrOverlay ? "qr-frame--blurred" : "",
          visualState === "terminal" || visualState === "error" ? "qr-frame--inactive" : "",
        ].filter(Boolean).join(" ")}
        initial={shouldReduceMotion ? false : { opacity: 0, y: 16, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: contentDelay + 0.1, type: "spring", stiffness: 220, damping: 24 }}
      >
        {hasQrValue ? (
          <>
            <span className="qr-frame__code" aria-hidden={shouldShowQrOverlay}>
              <QRCodeSVG
                bgColor="#fbfaf7"
                fgColor="#24231f"
                level="M"
                marginSize={1}
                size={178}
                value={normalizedQrValue}
              />
            </span>
            <span className="qr-frame__corners" aria-hidden="true" />
            {shouldShowQrOverlay ? (
              <span className="qr-frame__overlay" aria-live="polite">
                <CheckCircle2 size={30} strokeWidth={1.7} />
                <strong>{overlayTitle}</strong>
                <span>{overlayDescription}</span>
              </span>
            ) : null}
          </>
        ) : (
          <span className="qr-frame__empty" aria-hidden="true">
            <ScanLine size={34} strokeWidth={1.6} />
            <span>{t("暂无二维码")}</span>
          </span>
        )}
      </motion.div>

      <motion.div
        className="qr-panel__status"
        initial={itemEnter}
        animate={itemAnimate}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: contentDelay + 0.22, duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <ScanLine size={18} strokeWidth={1.8} />
        <span>{resolvedStatusText}</span>
        <strong>{expiresLabel}</strong>
      </motion.div>

      <motion.button
        className="ghost-button"
        disabled={refreshDisabled || isRefreshing}
        initial={itemEnter}
        animate={itemAnimate}
        onClick={onRefresh}
        transition={shouldReduceMotion ? { duration: 0 } : { delay: contentDelay + 0.32, duration: 0.38, ease: [0.2, 0.8, 0.2, 1] }}
        type="button"
      >
        <RefreshCw size={17} strokeWidth={1.8} />
        <span>{isRefreshing ? t("生成中") : resolvedRefreshLabel}</span>
      </motion.button>
    </section>
  );
}
