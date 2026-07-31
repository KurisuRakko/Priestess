import { requestJson, type RequestOptions } from "./priestessApiRequest";
import type { LocalPasskey, LocalPasswordManagerPreference, LocalSession, LocalSessionUser, PriestessUserRole, QrSessionStatus } from "./priestessApi";
import { translatePriestess } from "./i18n";

type JsonRecord = Record<string, unknown>;

const PRIESTESS_AUTH_BASE = "/auth/priestess";
const PRIESTESS_QR_BASE = `${PRIESTESS_AUTH_BASE}/qr`;

export type LocalProfileAvatarUploadResult = {
  avatarUrl: string;
  file: unknown;
  raw: unknown;
  user: LocalSessionUser | null;
};

export type QrPhoneContext = {
  colo: string;
  country: string;
  ipAddress: string;
  raw: unknown;
  userAgent: string;
};

export type QrPhoneSession = {
  appId: string;
  appName: string;
  createdAt: number;
  expiresAt: number;
  expiresIn: number;
  pcContext: QrPhoneContext | null;
  phoneContext: QrPhoneContext | null;
  raw: unknown;
  returnTo: string;
  returnToOrigin: string;
  securityLevel: number | null;
  securityReason: string;
  sessionId: string;
  status: QrSessionStatus;
  updatedAt: number;
};

export type QrPhoneSessionResult = {
  canConfirm: boolean;
  canFinalConfirm: boolean;
  canReject: boolean;
  challengeId: string;
  expiresAt: number;
  mfaType: string;
  raw: unknown;
  requiresConfirmation: boolean;
  requiresTotp: boolean;
  securityLevel: number | null;
  securityReason: string;
  serverTime: number;
  session: QrPhoneSession | null;
  user: LocalSessionUser | null;
};

export type PasskeyOptionsResult = {
  challengeId: string;
  expiresAt: string;
  options: unknown;
  raw: unknown;
};

export type LocalTotpFactor = {
  confirmedAt: string;
  createdAt: string;
  disabledAt: string;
  enabled: boolean | null;
  factorId: string;
  lastUsedAt: string;
  raw: unknown;
};

export type LocalTotpSetup = {
  challengeId: string;
  expiresAt: string;
  otpauthUrl: string;
  raw: unknown;
  secret: string;
};

export type LocalDeviceSession = {
  browser: string;
  createdAt: string;
  current: boolean;
  device: string;
  expiresAt: string;
  ipAddress: string;
  lastUsedAt: string;
  os: string;
  raw: unknown;
  revokedAt: string;
  sessionId: string;
  userAgentSummary: string;
};

type LocalDeviceSessionsRequestOptions = Pick<RequestOptions, "signal"> & {
  /** 手动刷新设备页时跳过短暂缓存，避免显示刚撤销的旧会话。 */
  forceRefresh?: boolean;
};

export type LocalRakkoServiceSession = {
  appId: string;
  createdAt: string;
  enabled: boolean | null;
  expiresAt: string;
  lastAuthorizedAt: string;
  lastUsedAt: string;
  name: string;
  raw: unknown;
  sessionCount: number;
};

export type LocalPrivacyActivity = {
  action: string;
  createdAt: string;
  id: number | null;
  ipAddress: string;
  label: string;
  metadata: Record<string, unknown>;
  raw: unknown;
  summary: string;
  userAgent: string;
};

export type LocalPrivacyActivityPage = {
  activities: LocalPrivacyActivity[];
  hasMore: boolean;
  nextOffset: number | null;
  offset: number;
  pageSize: number;
  total: number;
};

export async function updateLocalProfile(params: {
  address?: string | null;
  avatarUrl?: string | null;
  birthday?: string | null;
  displayName?: string;
  email?: string;
  passwordManager?: { label?: string; provider: string } | null;
  phone?: string | null;
  preferredLanguages?: string[] | null;
}, options: Pick<RequestOptions, "signal"> = {}) {
  const body: JsonRecord = {};
  if (params.address !== undefined) body.address = params.address;
  if (params.avatarUrl !== undefined) body.avatar_url = params.avatarUrl;
  if (params.birthday !== undefined) body.birthday = params.birthday;
  if (params.displayName !== undefined) body.display_name = params.displayName;
  if (params.email !== undefined) body.email = params.email;
  if (params.passwordManager !== undefined) body.password_manager = params.passwordManager;
  if (params.phone !== undefined) body.phone = params.phone;
  if (params.preferredLanguages !== undefined) body.preferred_languages = params.preferredLanguages;

  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/profile`, {
    body,
    method: "PATCH",
    signal: options.signal,
  });
  return normalizeLocalSessionUser(pickRecord(payload, ["user"]) ?? payload);
}

export async function uploadLocalProfileAvatar(file: File, options: Pick<RequestOptions, "signal"> = {}) {
  const form = new FormData();
  form.append("file", file);
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/profile/avatar`, {
    body: form,
    method: "POST",
    signal: options.signal,
  });
  return normalizeLocalProfileAvatarUploadResult(payload);
}

const LOCAL_DEVICE_SESSIONS_CACHE_TTL_MS = 5_000;
let localDeviceSessionsCache: { loadedAt: number; sessions: LocalDeviceSession[] } | null = null;
let localDeviceSessionsInFlight: Promise<LocalDeviceSession[]> | null = null;

export async function listLocalDeviceSessions(options: LocalDeviceSessionsRequestOptions = {}) {
  const now = Date.now();
  if (!options.forceRefresh && localDeviceSessionsCache && now - localDeviceSessionsCache.loadedAt < LOCAL_DEVICE_SESSIONS_CACHE_TTL_MS) {
    return localDeviceSessionsCache.sessions;
  }
  if (localDeviceSessionsInFlight) {
    return localDeviceSessionsInFlight;
  }

  const request = requestJson(`${PRIESTESS_AUTH_BASE}/devices/sessions`, { signal: options.signal })
    .then((payload) => {
      const record = isRecord(payload) ? payload : {};
      const sessions = readUnknown(record, ["sessions"]);
      const normalized = Array.isArray(sessions) ? sessions.map(normalizeLocalDeviceSession) : [];
      localDeviceSessionsCache = { loadedAt: Date.now(), sessions: normalized };
      return normalized;
    })
    .finally(() => {
      if (localDeviceSessionsInFlight === request) {
        localDeviceSessionsInFlight = null;
      }
    });
  localDeviceSessionsInFlight = request;
  return request;
}

export async function revokeLocalDeviceSession(sessionId: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/devices/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    signal: options.signal,
  });
  const record = isRecord(payload) ? payload : {};
  localDeviceSessionsCache = null;
  return {
    authenticated: readBoolean(record, ["authenticated"]) ?? true,
    current: readBoolean(record, ["current"]) ?? false,
    raw: payload,
    revoked: readBoolean(record, ["revoked"]) ?? false,
    session: normalizeLocalDeviceSession(pickRecord(record, ["session"])),
  };
}

export async function listLocalRakkoServices(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/services/sessions`, { signal: options.signal });
  const record = isRecord(payload) ? payload : {};
  const services = readUnknown(record, ["services"]);
  if (!Array.isArray(services)) return [];
  return services.map(normalizeLocalRakkoServiceSession);
}

export async function listLocalPrivacyActivityPage(params: { limit?: number; offset?: number } = {}, options: Pick<RequestOptions, "signal"> = {}): Promise<LocalPrivacyActivityPage> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) {
    searchParams.set("limit", String(params.limit));
  }
  if (params.offset !== undefined) {
    searchParams.set("offset", String(params.offset));
  }
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/privacy/activities`, {
    searchParams,
    signal: options.signal,
  });
  const record = isRecord(payload) ? payload : {};
  const activities = readUnknown(record, ["activities"]);
  const normalizedActivities = Array.isArray(activities) ? activities.map(normalizeLocalPrivacyActivity) : [];
  return {
    activities: normalizedActivities,
    hasMore: readBoolean(record, ["has_more", "hasMore"]) ?? false,
    nextOffset: readNumber(record, ["next_offset", "nextOffset"]),
    offset: readNumber(record, ["offset"]) ?? params.offset ?? 0,
    pageSize: readNumber(record, ["page_size", "pageSize"]) ?? params.limit ?? normalizedActivities.length,
    total: readNumber(record, ["total"]) ?? normalizedActivities.length,
  };
}

export async function listLocalPrivacyActivities(params: { limit?: number; offset?: number } = {}, options: Pick<RequestOptions, "signal"> = {}) {
  return (await listLocalPrivacyActivityPage(params, options)).activities;
}

export async function getQrPhoneSession(sessionId: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_QR_BASE}/sessions/${encodeURIComponent(sessionId)}`, { signal: options.signal });
  return normalizeQrPhoneSessionResult(payload);
}

export async function confirmQrPhoneSession(sessionId: string, action: "confirm" | "reject", options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_QR_BASE}/sessions/${encodeURIComponent(sessionId)}/confirm`, {
    body: { action },
    method: "POST",
    signal: options.signal,
  });
  return normalizeQrPhoneSessionResult(payload);
}

export async function finalConfirmQrPhoneSession(sessionId: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_QR_BASE}/sessions/${encodeURIComponent(sessionId)}/confirm-final`, {
    body: {},
    method: "POST",
    signal: options.signal,
  });
  return normalizeQrPhoneSessionResult(payload);
}

export async function createLocalPasskeyRegistrationOptions(params: { name?: string } = {}, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/passkeys/registration/options`, {
    body: { name: params.name },
    method: "POST",
    signal: options.signal,
  });
  return normalizePasskeyOptionsResult(payload);
}

export async function verifyLocalPasskeyRegistration(params: { challengeId: string; name?: string; response: unknown }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/passkeys/registration/verify`, {
    body: { challenge_id: params.challengeId, name: params.name, response: params.response },
    method: "POST",
    signal: options.signal,
  });
  return normalizeLocalPasskey(pickRecord(payload, ["passkey", "credential"]) ?? payload, 0);
}

export async function createLocalPasskeyAuthenticationOptions(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/passkeys/authentication/options`, { method: "POST", signal: options.signal });
  return normalizePasskeyOptionsResult(payload);
}

export async function verifyLocalPasskeyAuthentication(params: { challengeId: string; response: unknown }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/passkeys/authentication/verify`, {
    body: { challenge_id: params.challengeId, response: params.response },
    method: "POST",
    signal: options.signal,
  });
  return normalizeLocalSession(payload);
}

export async function getLocalTotp(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/totp`, { signal: options.signal });
  const factor = pickRecord(payload, ["totp", "factor"]);
  return factor ? normalizeLocalTotpFactor(factor) : null;
}

export async function createLocalTotpSetup(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/totp/setup`, { method: "POST", signal: options.signal });
  return normalizeLocalTotpSetup(payload);
}

export async function confirmLocalTotpSetup(params: { challengeId: string; code: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/totp/confirm`, {
    body: { challenge_id: params.challengeId, code: params.code },
    method: "POST",
    signal: options.signal,
  });
  return normalizeLocalTotpFactor(pickRecord(payload, ["totp", "factor"]) ?? payload);
}

export async function disableLocalTotp(code: string, options: Pick<RequestOptions, "signal"> = {}) {
  await requestJson(`${PRIESTESS_AUTH_BASE}/totp`, {
    body: { code },
    method: "DELETE",
    signal: options.signal,
  });
}

function normalizeLocalProfileAvatarUploadResult(payload: unknown): LocalProfileAvatarUploadResult {
  const record = isRecord(payload) ? payload : {};
  return {
    avatarUrl: readString(record, ["avatar_url", "avatarUrl", "public_url", "publicUrl"]),
    file: readUnknown(record, ["file"]),
    raw: payload,
    user: normalizeLocalSessionUser(pickRecord(record, ["user"])),
  };
}

function normalizeQrPhoneSessionResult(payload: unknown): QrPhoneSessionResult {
  const record = isRecord(payload) ? payload : {};
  const sessionPayload = pickRecord(record, ["session"]);
  const session = sessionPayload ? normalizeQrPhoneSession(sessionPayload) : null;
  return {
    canConfirm: readBoolean(record, ["can_confirm", "canConfirm"]) ?? Boolean(session && (session.status === "pending" || session.status === "scanned")),
    canFinalConfirm: readBoolean(record, ["can_final_confirm", "canFinalConfirm"]) ?? Boolean(session?.status === "pre_confirmed"),
    canReject: readBoolean(record, ["can_reject", "canReject"]) ?? Boolean(session && (session.status === "pending" || session.status === "scanned" || session.status === "pre_confirmed")),
    challengeId: readString(record, ["challenge_id", "challengeId"]),
    expiresAt: readNumber(record, ["expires_at", "expiresAt"]) ?? 0,
    mfaType: readString(record, ["mfa_type", "mfaType"]),
    raw: payload,
    requiresConfirmation: readBoolean(record, ["requires_confirmation", "requiresConfirmation"]) ?? false,
    requiresTotp: readBoolean(record, ["requires_totp", "requiresTotp"]) ?? false,
    securityLevel: readNumber(record, ["security_level", "securityLevel"]),
    securityReason: readString(record, ["security_reason", "securityReason"]),
    serverTime: readNumber(record, ["server_time", "serverTime"]) ?? 0,
    session,
    user: normalizeLocalSessionUser(pickRecord(record, ["user"])),
  };
}

function normalizeQrPhoneSession(payload: unknown): QrPhoneSession {
  const record = isRecord(payload) ? payload : {};
  const app = pickRecord(record, ["app"]) ?? {};
  return {
    appId: readString(app, ["app_id", "appId", "id"]) || readString(record, ["app_id", "appId"]),
    appName: readString(app, ["name"]) || readString(record, ["app_name", "appName"]),
    createdAt: readNumber(record, ["created_at", "createdAt"]) ?? 0,
    expiresAt: readNumber(record, ["expires_at", "expiresAt"]) ?? 0,
    expiresIn: readNumber(record, ["expires_in", "expiresIn"]) ?? 0,
    pcContext: normalizeQrPhoneContext(readUnknown(record, ["pc_context", "pcContext"])),
    phoneContext: normalizeQrPhoneContext(readUnknown(record, ["phone_context", "phoneContext"])),
    raw: payload,
    returnTo: readString(record, ["return_to", "returnTo"]),
    returnToOrigin: readString(record, ["return_to_origin", "returnToOrigin"]),
    securityLevel: readNumber(record, ["security_level", "securityLevel"]),
    securityReason: readString(record, ["security_reason", "securityReason"]),
    sessionId: readString(record, ["session_id", "sessionId", "id"]),
    status: readString(record, ["status"]) || "unknown",
    updatedAt: readNumber(record, ["updated_at", "updatedAt"]) ?? 0,
  };
}

function normalizeQrPhoneContext(payload: unknown): QrPhoneContext | null {
  if (!isRecord(payload)) return null;
  return {
    colo: readString(payload, ["colo"]),
    country: readString(payload, ["country"]),
    ipAddress: readString(payload, ["ip_address", "ipAddress", "ip"]),
    raw: payload,
    userAgent: readString(payload, ["user_agent", "userAgent"]),
  };
}

function normalizePasskeyOptionsResult(payload: unknown): PasskeyOptionsResult {
  const record = isRecord(payload) ? payload : {};
  return {
    challengeId: readString(record, ["challenge_id", "challengeId"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    options: readUnknown(record, ["options"]),
    raw: payload,
  };
}

function normalizeLocalTotpSetup(payload: unknown): LocalTotpSetup {
  const record = isRecord(payload) ? payload : {};
  return {
    challengeId: readString(record, ["challenge_id", "challengeId"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    otpauthUrl: readString(record, ["otpauth_url", "otpauthUrl"]),
    raw: payload,
    secret: readString(record, ["secret"]),
  };
}

function normalizeLocalTotpFactor(payload: unknown): LocalTotpFactor {
  const record = isRecord(payload) ? payload : {};
  return {
    confirmedAt: readDateTimeString(record, ["confirmed_at", "confirmedAt"]),
    createdAt: readDateTimeString(record, ["created_at", "createdAt"]),
    disabledAt: readDateTimeString(record, ["disabled_at", "disabledAt"]),
    enabled: readBoolean(record, ["enabled"]),
    factorId: readString(record, ["factor_id", "factorId", "id"]),
    lastUsedAt: readDateTimeString(record, ["last_used_at", "lastUsedAt"]),
    raw: payload,
  };
}

function normalizeLocalDeviceSession(payload: unknown): LocalDeviceSession {
  const record = isRecord(payload) ? payload : {};
  const browser = readString(record, ["browser"]) || translatePriestess("common:未知浏览器");
  const os = readString(record, ["os"]) || translatePriestess("common:未知系统");
  return {
    browser,
    createdAt: readDateTimeString(record, ["created_at", "createdAt"]),
    current: readBoolean(record, ["current"]) ?? false,
    device: readString(record, ["device"]) || translatePriestess("common:浏览器"),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    ipAddress: readString(record, ["ip_address", "ipAddress"]) || translatePriestess("common:未知 IP"),
    lastUsedAt: readDateTimeString(record, ["last_used_at", "lastUsedAt"]),
    os,
    raw: payload,
    revokedAt: readDateTimeString(record, ["revoked_at", "revokedAt"]),
    sessionId: readString(record, ["session_id", "sessionId", "id"]),
    userAgentSummary: readString(record, ["user_agent_summary", "userAgentSummary"]) || `${browser} / ${os}`,
  };
}

function normalizeLocalRakkoServiceSession(payload: unknown): LocalRakkoServiceSession {
  const record = isRecord(payload) ? payload : {};
  const app = pickRecord(record, ["app"]) ?? {};
  const appId = readString(record, ["app_id", "appId"]) || readString(app, ["app_id", "appId", "id"]);
  return {
    appId,
    createdAt: readDateTimeString(record, ["created_at", "createdAt"]),
    enabled: readBoolean(record, ["enabled"]) ?? readBoolean(app, ["enabled"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    lastAuthorizedAt: readDateTimeString(record, ["last_authorized_at", "lastAuthorizedAt"]),
    lastUsedAt: readDateTimeString(record, ["last_used_at", "lastUsedAt"]),
    name: readString(record, ["name"]) || readString(app, ["name"]) || appId || translatePriestess("common:Rakko 服务"),
    raw: payload,
    sessionCount: readNumber(record, ["session_count", "sessionCount"]) ?? 0,
  };
}

function normalizeLocalPrivacyActivity(payload: unknown): LocalPrivacyActivity {
  const record = isRecord(payload) ? payload : {};
  const metadata = readUnknown(record, ["metadata"]);
  return {
    action: readString(record, ["action"]),
    createdAt: readDateTimeString(record, ["created_at", "createdAt"]),
    id: readNumber(record, ["id"]),
    ipAddress: readString(record, ["ip_address", "ipAddress"]),
    label: readString(record, ["label"]) || translatePriestess("common:账户活动"),
    metadata: isRecord(metadata) ? metadata : {},
    raw: payload,
    summary: readString(record, ["summary"]),
    userAgent: readString(record, ["user_agent", "userAgent"]),
  };
}

function normalizeLocalSession(payload: unknown): LocalSession {
  const record = isRecord(payload) ? pickRecord(payload, ["data"]) ?? payload : {};
  const userPayload = pickRecord(record, ["user", "local_user", "localUser", "account"]) ?? record;
  const user = normalizeLocalSessionUser(userPayload);
  return {
    // 只有后端明确返回 authenticated/active/ok=true 才算完成登录，避免二步验证响应被误归一化成会话。
    authenticated: readBoolean(record, ["authenticated", "active", "ok"]) ?? false,
    challengeId: readString(record, ["challenge_id", "challengeId"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]) || readDateTimeString(pickRecord(record, ["session"]), ["expires_at", "expiresAt"]),
    mfaRequired: readBoolean(record, ["mfa_required", "mfaRequired"]) ?? false,
    mfaType: readString(record, ["mfa_type", "mfaType"]),
    raw: payload,
    user,
  };
}

function normalizeLocalSessionUser(payload: unknown): LocalSessionUser | null {
  if (!isRecord(payload)) return null;
  const userId = readString(payload, ["user_id", "userId", "id", "sub"]);
  const username = readString(payload, ["username", "name", "login"]);
  const address = readString(payload, ["address"]);
  const birthday = readString(payload, ["birthday", "birth_date", "birthDate", "date_of_birth", "dateOfBirth"]);
  const email = readString(payload, ["email"]);
  const phone = readString(payload, ["phone", "phone_number", "phoneNumber"]);
  const displayName = readString(payload, ["display_name", "displayName", "nickname", "name"]);
  if (!userId && !username && !email) return null;
  return {
    address,
    avatarUrl: readString(payload, ["avatar_url", "avatarUrl", "picture", "avatar"]),
    birthday,
    displayName: displayName || username || email || userId,
    email,
    enabled: readBoolean(payload, ["enabled"]),
    passwordManager: normalizeLocalPasswordManagerPreference(readUnknown(payload, ["password_manager", "passwordManager"])),
    phone,
    preferredLanguages: readStringList(payload, ["preferred_languages", "preferredLanguages"]),
    role: normalizePriestessUserRole(readString(payload, ["role", "user_role", "userRole"])),
    userId: userId || username || email,
    username: username || email || userId,
  };
}

function normalizePriestessUserRole(value: string): PriestessUserRole {
  return value === "admin" ? "admin" : "user";
}

function normalizeLocalPasswordManagerPreference(payload: unknown): LocalPasswordManagerPreference | null {
  if (!isRecord(payload)) {
    return null;
  }

  const provider = readString(payload, ["provider", "type"]);
  const label = readString(payload, ["label", "name"]);
  if (!provider && !label) {
    return null;
  }

  return {
    label: label || provider,
    provider: provider || label,
    raw: payload,
  };
}

function normalizeLocalPasskey(payload: unknown, index: number): LocalPasskey {
  const record = isRecord(payload) ? payload : {};
  return {
    backedUp: readBoolean(record, ["backed_up", "backedUp"]),
    counter: readNumber(record, ["counter", "sign_count", "signCount"]),
    createdAt: readDateTimeString(record, ["created_at", "createdAt"]),
    credentialId: readString(record, ["credential_id", "credentialId", "id"]) || `passkey-${index + 1}`,
    deviceType: readString(record, ["device_type", "deviceType"]),
    disabledAt: readDateTimeString(record, ["disabled_at", "disabledAt"]),
    lastUsedAt: readDateTimeString(record, ["last_used_at", "lastUsedAt"]),
    name: readString(record, ["name", "label"]) || "Passkey",
    raw: payload,
    transports: readStringList(record, ["transports", "transport"]),
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickRecord(record: unknown, keys: string[]) {
  if (!isRecord(record)) return null;
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) return value;
  }
  return null;
}

function readUnknown(record: unknown, keys: string[]) {
  if (!isRecord(record)) return null;
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
  }
  return null;
}

function readString(record: unknown, keys: string[]) {
  if (!isRecord(record)) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
  }
  return "";
}

function readNumber(record: unknown, keys: string[]) {
  if (!isRecord(record)) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readBoolean(record: unknown, keys: string[]) {
  if (!isRecord(record)) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (value === 1 || value === "1" || value === "true") return true;
    if (value === 0 || value === "0" || value === "false") return false;
  }
  return null;
}

function readDateTimeString(record: unknown, keys: string[]) {
  if (!isRecord(record)) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
    if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  }
  return "";
}

function readStringList(record: unknown, keys: string[]) {
  const value = readUnknown(record, keys);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string" && value.trim()) return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}
