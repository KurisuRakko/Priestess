import { CheckCircle2, ScanLine, Smartphone } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { usePriestessTranslation } from "@priestess/shared";

export type QrPanelVisualState = "pending" | "scanned" | "confirmed" | "terminal" | "error";

export type QrPanelProps = {
  contentDelay?: number;
  isRefreshing?: boolean;
  qrValue: string;
  visualState?: QrPanelVisualState;
};

// 二维码不提供手动刷新：App 侧按固定周期自动重建会话，这里只负责展示当前状态。
export function QrPanel({
  contentDelay = 0,
  isRefreshing = false,
  qrValue,
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
          isRefreshing ? "qr-frame--refreshing" : "",
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
        {isRefreshing ? (
          <span className="qr-frame__loading" role="status" aria-label={t("正在生成二维码")}>
            <span className="qr-frame__spinner" aria-hidden="true" />
          </span>
        ) : null}
      </motion.div>
    </section>
  );
}
