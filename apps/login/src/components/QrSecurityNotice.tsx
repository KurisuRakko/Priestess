import { Loader2, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { usePriestessTranslation } from "@priestess/shared";
import "./QrLoginConfirmPage.css";

/**
 * 后端在 confirm 时算出的风险原因（见 docs/phainon-qr-login-design.md）：
 * 同 IP / 本地网 / 同区域判定 Level 1，其余判定 Level 2 并要求二次确认。
 * 前端只负责把原因翻译成人话，不重新判定风险等级。
 */
const QR_SECURITY_REASON_KEYS: Record<string, string> = {
  different_region: "电脑端和手机端位于不同地区，这是一次异地登录尝试。如果不是你本人操作，请立即取消。",
  local_network: "电脑端和手机端处于同一本地网络。",
  same_ip: "电脑端和手机端来自同一个公网 IP。",
  same_region: "电脑端和手机端位于同一区域。",
  unknown_context: "无法确认电脑端和手机端的网络环境。如果不是你本人操作，请立即取消。",
};

/** 后端没有下发可识别原因时的兜底：不替用户下结论，但明确提示可以取消。 */
const QR_SECURITY_REASON_FALLBACK_KEY = "无法确认本次登录的风险情况。如果不是你本人操作，请立即取消。";

/** 后端为空值或读取失败时保留原提示，避免浮层出现空段落。 */
const QR_SECURITY_REASON_EMPTY_KEY = "电脑端和手机端环境存在差异，请核对后再授权登录。";

export function getQrSecurityReasonKey(reason: string) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) return QR_SECURITY_REASON_EMPTY_KEY;
  return QR_SECURITY_REASON_KEYS[normalizedReason] || QR_SECURITY_REASON_FALLBACK_KEY;
}

export function QrSecurityNotice({ reason }: { reason: string }) {
  const { t } = usePriestessTranslation("login");
  return <p>{t(getQrSecurityReasonKey(reason))}</p>;
}

export function QrSecurityOverlay({
  errorMessage,
  isSubmitting,
  onCancel,
  onFinalConfirm,
  origin,
  pcLocation,
  phoneLocation,
  reason,
  warningCountdown,
}: {
  errorMessage: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onFinalConfirm: () => void;
  origin: string;
  pcLocation: string;
  phoneLocation: string;
  reason: string;
  warningCountdown: number;
}) {
  const { t } = usePriestessTranslation("login");
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="qr-mobile-overlay"
      exit={{ opacity: 0, y: 30 }}
      initial={{ opacity: 0, y: 30 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-mobile-overlay-title"
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="qr-mobile-alert-icon" aria-hidden="true">
        <ShieldAlert size={40} strokeWidth={1.5} />
      </div>

      <h2 id="qr-mobile-overlay-title">{t("请确认是你本人操作")}</h2>
      <QrSecurityNotice reason={reason} />
      {origin ? (
        // 二次确认前再次点名授权目标，避免用户在浮层里只看到位置信息。
        <p className="qr-mobile-overlay-origin">{t("授权目标：{{origin}}", { origin })}</p>
      ) : null}

      <div className="qr-mobile-location-card">
        <QrLocationRow label={t("PC 位置")} value={pcLocation} />
        <QrLocationRow label={t("手机位置")} value={phoneLocation} />
      </div>

      {errorMessage ? <strong aria-live="polite" role="status">{errorMessage}</strong> : null}
      <button className="qr-mobile-primary qr-mobile-primary--danger" disabled={warningCountdown > 0 || isSubmitting} onClick={onFinalConfirm} type="button">
        {isSubmitting ? <Loader2 className="qr-mobile-spin" size={22} /> : warningCountdown > 0 ? t("请等待 ({{seconds}}s)", { seconds: warningCountdown }) : t("确认登录")}
      </button>
      <button className="qr-mobile-plain-button" disabled={isSubmitting} onClick={onCancel} type="button">
        {t("取消")}
      </button>
    </motion.div>
  );
}

function QrLocationRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}:</span>
      <strong>{value}</strong>
    </div>
  );
}
