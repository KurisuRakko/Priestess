import { detectPriestessLanguage, translatePriestess, type LocalPasskey } from "@priestess/shared";

export const dateTimeFormatter = new Intl.DateTimeFormat(detectPriestessLanguage(), {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function formatDateTime(value: string) {
  if (!value) {
    return translatePriestess("account:未提供");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date);
}

export function formatSessionRemaining(value: string) {
  if (!value) {
    return translatePriestess("account:未提供过期时间");
  }

  const expiresAt = new Date(value).getTime();
  if (Number.isNaN(expiresAt)) {
    return translatePriestess("account:过期时间格式异常");
  }

  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) {
    return translatePriestess("account:会话已过期");
  }

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  if (remainingMs >= dayMs) {
    return translatePriestess("account:约 {{count}} 天后过期", { count: Math.ceil(remainingMs / dayMs) });
  }
  if (remainingMs >= hourMs) {
    return translatePriestess("account:约 {{count}} 小时后过期", { count: Math.ceil(remainingMs / hourMs) });
  }

  return translatePriestess("account:约 {{count}} 分钟后过期", { count: Math.max(1, Math.ceil(remainingMs / minuteMs)) });
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

export function getInitial(value: string) {
  const cleanValue = value.trim();
  if (!cleanValue) {
    return "P";
  }

  return cleanValue.slice(0, 1).toUpperCase();
}
