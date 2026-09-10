import { detectPriestessLanguage, translatePriestess, type LocalPasskey } from "@priestess/shared";

/** 语言可在运行时切换（PriestessLanguageSwitcher + localStorage），因此每次格式化都重新解析当前语言。 */
function buildDateTimeFormatter() {
  return new Intl.DateTimeFormat(detectPriestessLanguage(), {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export const dateTimeFormatter = {
  format(value: Date | number) {
    return buildDateTimeFormatter().format(value);
  },
};

export function formatDateTime(value: string) {
  if (!value) {
    return translatePriestess("account:未提供");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return buildDateTimeFormatter().format(date);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * 设备与服务列表用的相对时间。
 * 一周以内走 Intl.RelativeTimeFormat（自带中英复数与量词），超过一周直接给绝对时间。
 */
export function formatRelativeTime(value: string, now = Date.now()) {
  if (!value) {
    return translatePriestess("account:未提供");
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const elapsedMs = now - timestamp;
  // 时钟偏差导致的未来时间与一分钟内一样按「刚刚」处理，不单独铺特判。
  if (elapsedMs < MINUTE_MS) {
    return translatePriestess("account:刚刚");
  }
  if (elapsedMs < HOUR_MS) {
    return formatElapsedUnit(elapsedMs / MINUTE_MS, "minute");
  }
  if (elapsedMs < DAY_MS) {
    return formatElapsedUnit(elapsedMs / HOUR_MS, "hour");
  }
  if (elapsedMs < WEEK_MS) {
    return formatElapsedUnit(elapsedMs / DAY_MS, "day");
  }

  return formatDateTime(value);
}

function formatElapsedUnit(amount: number, unit: Intl.RelativeTimeFormatUnit) {
  // numeric: "always" 避免出现「昨天 / yesterday」这类跟阈值不对齐的措辞。
  return new Intl.RelativeTimeFormat(detectPriestessLanguage(), { numeric: "always" })
    .format(-Math.floor(amount), unit);
}

export function shortenCredentialId(value: string) {
  if (value.length <= 24) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export function formatPasskeyStatus(passkey: LocalPasskey) {
  if (passkey.disabledAt) {
    return translatePriestess("account:已禁用");
  }
  if (passkey.backedUp === true) {
    return translatePriestess("account:已备份");
  }

  return translatePriestess("account:可用");
}

export function formatPasskeyDevice(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "platform") {
    return translatePriestess("account:本机认证器");
  }
  if (normalized === "cross-platform") {
    return translatePriestess("account:外部安全密钥");
  }

  return value || translatePriestess("account:未提供");
}

export function formatPasskeyTransports(values: string[]) {
  if (values.length === 0) {
    return translatePriestess("account:后端未返回");
  }

  const labels: Record<string, string> = {
    ble: translatePriestess("account:蓝牙"),
    hybrid: translatePriestess("account:跨设备"),
    internal: translatePriestess("account:本机"),
    nfc: "NFC",
    usb: "USB",
  };

  return values.map((value) => labels[value] ?? value).join(" / ");
}

export function formatPasskeyBackup(value: boolean | null) {
  if (value === true) {
    return translatePriestess("account:已备份");
  }
  if (value === false) {
    return translatePriestess("account:未备份");
  }

  return translatePriestess("account:未返回");
}
