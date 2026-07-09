import {
  detectPriestessLanguage,
  translatePriestess,
  type AdminPasskey,
  type AdminQrSession,
  type AdminUser,
  type PriestessUserRole,
} from "@priestess/shared";

const dateTimeFormatter = new Intl.DateTimeFormat(detectPriestessLanguage(), {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
});

export function formatPasskeySummary(passkeys: AdminPasskey[], activeCount: number, backedUpCount: number, selectedUser: AdminUser | null) {
  if (!selectedUser) {
    return translatePriestess("admin:无用户数据");
  }
  if (passkeys.length === 0) {
    return selectedUser.email || selectedUser.username || translatePriestess("admin:暂无 Passkey");
  }

  return translatePriestess("admin:{{activeCount}} 个可用 · {{backedUpCount}} 个已备份", { activeCount, backedUpCount });
}

export function formatPasskeyStatus(passkey: AdminPasskey) {
  if (passkey.disabledAt) {
    return translatePriestess("admin:已禁用");
  }
  if (passkey.backedUp === true) {
    return translatePriestess("admin:可用");
  }

  return translatePriestess("admin:需关注");
}

export function getPasskeyStatusTone(passkey: AdminPasskey): "danger" | "good" | "neutral" | "warn" {
  if (passkey.disabledAt) {
    return "danger";
  }
  if (passkey.backedUp === true) {
    return "good";
  }

  return "warn";
}

export function formatPasskeyDevice(value: string) {
  if (value === "singleDevice") {
    return translatePriestess("admin:单设备");
  }
  if (value === "multiDevice") {
    return translatePriestess("admin:多设备");
  }

  return value || translatePriestess("admin:平台凭据");
}

export function formatPasskeyTransports(values: string[]) {
  if (values.length === 0) {
    return translatePriestess("admin:未提供");
  }

  return values.join(" · ");
}

export function getNextUserRole(role: PriestessUserRole): PriestessUserRole {
  return role === "admin" ? "user" : "admin";
}

export function compareUserGroupPriority(left: AdminUser, right: AdminUser) {
  return readUserGroupPriority(left.role) - readUserGroupPriority(right.role);
}

function readUserGroupPriority(role: PriestessUserRole) {
  return role === "admin" ? 0 : 1;
}

export function formatUserRole(role: PriestessUserRole) {
  return role === "admin" ? translatePriestess("admin:管理员") : translatePriestess("admin:普通用户");
}

export function formatRoleAction(role: PriestessUserRole) {
  return role === "admin" ? translatePriestess("admin:设为普通用户") : translatePriestess("admin:设为管理员");
}

export function formatEnabled(enabled: boolean | null) {
  if (enabled === false) {
    return translatePriestess("admin:停用");
  }

  return translatePriestess("admin:启用");
}

export function formatDateTime(value: string) {
  if (!value) {
    return translatePriestess("admin:未提供");
  }

  const numericValue = Number(value);
  const date = Number.isFinite(numericValue) && value.trim() !== ""
    ? new Date(numericValue < 1_000_000_000_000 ? numericValue * 1000 : numericValue)
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return dateTimeFormatter.format(date);
}

export function formatQrStatus(status: string) {
  const labels: Record<string, string> = {
    confirmed: translatePriestess("admin:已确认"),
    expired: translatePriestess("admin:已过期"),
    pending: translatePriestess("admin:等待"),
    pre_confirmed: translatePriestess("admin:二次确认"),
    rejected: translatePriestess("admin:已拒绝"),
    scanned: translatePriestess("admin:已扫码"),
  };

  return labels[status] ?? status;
}

export function getQrStatusTone(status: string): "danger" | "good" | "neutral" | "warn" {
  if (status === "confirmed") {
    return "good";
  }
  if (status === "rejected" || status === "expired") {
    return "danger";
  }
  if (status === "pre_confirmed" || status === "scanned") {
    return "warn";
  }

  return "neutral";
}

export function formatStatusSummary(items: AdminQrSession[]) {
  const activeCount = items.filter((item) => ["pending", "scanned", "pre_confirmed"].includes(item.status)).length;
  return translatePriestess("admin:{{count}} 个进行中", { count: activeCount });
}

export function shortId(value: string) {
  if (value.length <= 12) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function describeContext(value: unknown) {
  const parsedValue = parseContext(value);
  if (!parsedValue) {
    return translatePriestess("admin:无上下文");
  }

  if (typeof parsedValue === "string") {
    return parsedValue;
  }

  const parts = Object.entries(parsedValue)
    .filter(([, entryValue]) => ["number", "string", "boolean"].includes(typeof entryValue))
    .slice(0, 4)
    .map(([key, entryValue]) => `${key}: ${String(entryValue)}`);

  return parts.length > 0 ? parts.join(" · ") : translatePriestess("admin:无上下文");
}

function parseContext(value: unknown): Record<string, unknown> | string | null {
  if (typeof value === "string") {
    const cleanValue = value.trim();
    if (!cleanValue) {
      return null;
    }

    try {
      const parsed = JSON.parse(cleanValue) as unknown;
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      return cleanValue;
    }

    return cleanValue;
  }

  if (isRecord(value)) {
    return value;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
