type JsonRecord = Record<string, unknown>;

type RequestOptions = {
  body?: unknown;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  searchParams?: URLSearchParams;
  signal?: AbortSignal;
};

export type LocalLoginCredentials = {
  username: string;
  password: string;
};

export type LocalSessionUser = {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  enabled: boolean | null;
};

export type LocalSession = {
  authenticated: boolean;
  expiresAt: string;
  user: LocalSessionUser | null;
  raw: unknown;
};

export type AdminSession = {
  authenticated: boolean;
  expiresAt: string;
  raw: unknown;
};

export type AdminUser = {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  enabled: boolean | null;
  createdAt: string;
  updatedAt: string;
  raw: unknown;
};

export type QrSessionStatus = "pending" | "scanned" | "pre_confirmed" | "confirmed" | "rejected" | "expired" | string;

export type AdminQrSession = {
  sessionId: string;
  appId: string;
  returnTo: string;
  status: QrSessionStatus;
  securityLevel: number | null;
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  pcContext: unknown;
  phoneContext: unknown;
  raw: unknown;
};

export type LoginRiskBucket = {
  bucketKey: string;
  scope: string;
  failureCount: number | null;
  lockedUntil: string;
  lastFailedAt: string;
  lastReason: string;
  context: unknown;
  raw: unknown;
};

export type AdminPasskey = {
  backedUp: boolean | null;
  counter: number | null;
  credentialId: string;
  name: string;
  deviceType: string;
  transports: string[];
  createdAt: string;
  lastUsedAt: string;
  disabledAt: string;
  raw: unknown;
};

export type PasswordResetRequestResult = {
  accepted: boolean;
  delivery: string;
  devResetUrl: string;
  expiresAt: string;
  requestId: string;
  raw: unknown;
};

export type AdminPasswordResetRequest = {
  context: unknown;
  createdAt: string;
  email: string;
  emailSentAt: string;
  expiresAt: string;
  requestId: string;
  status: string;
  updatedAt: string;
  usedAt: string;
  userId: string;
  username: string;
  raw: unknown;
};

export class PriestessApiError extends Error {
  readonly payload: unknown;
  readonly status: number | null;

  constructor(message: string, params: { payload?: unknown; status?: number | null; cause?: unknown } = {}) {
    super(message, { cause: params.cause });
    this.name = "PriestessApiError";
    this.payload = params.payload;
    this.status = params.status ?? null;
    Object.setPrototypeOf(this, PriestessApiError.prototype);
  }
}

export function getPriestessApiBaseUrl() {
  const configuredBase = normalizeBaseUrl(import.meta.env.VITE_PRIESTESS_API_BASE_URL);
  if (configuredBase) {
    return configuredBase;
  }

  return "";
}

export function getPriestessApiBaseLabel() {
  return getPriestessApiBaseUrl() || "当前域名";
}

export function getPriestessApiErrorMessage(error: unknown, fallback = "请求失败") {
  if (error instanceof PriestessApiError && error.message) {
    return error.message;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "请求已取消";
  }

  if (error instanceof TypeError) {
    return "无法连接后端，请检查 API 地址或跨域配置";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function getLocalSession(options: Pick<RequestOptions, "signal"> = {}) {
  try {
    const payload = await requestJson("/auth/local/session", { signal: options.signal });
    return normalizeLocalSession(payload);
  } catch (error) {
    if (error instanceof PriestessApiError && (error.status === 401 || error.status === 403)) {
      return normalizeLocalSession(null);
    }

    throw error;
  }
}

export async function loginLocalSession(credentials: LocalLoginCredentials, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson("/auth/local/session", {
    body: {
      username: credentials.username,
      password: credentials.password,
    },
    method: "POST",
    signal: options.signal,
  });

  return normalizeLocalSession(payload);
}

export async function logoutLocalSession(options: Pick<RequestOptions, "signal"> = {}) {
  await requestJson("/auth/local/session", {
    method: "DELETE",
    signal: options.signal,
  });
}

export async function requestPasswordReset(identity: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson("/auth/local/password-reset/requests", {
    body: { identity },
    method: "POST",
    signal: options.signal,
  });
  return normalizePasswordResetRequestResult(payload);
}

export async function confirmPasswordReset(params: { password: string; requestId: string; token: string }, options: Pick<RequestOptions, "signal"> = {}) {
  await requestJson("/auth/local/password-reset/confirm", {
    body: {
      password: params.password,
      request_id: params.requestId,
      token: params.token,
    },
    method: "POST",
    signal: options.signal,
  });
}

export async function getAdminSession(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson("/admin/session", { signal: options.signal });
  return normalizeAdminSession(payload);
}

export async function loginAdminSession(password: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson("/admin/session", {
    body: { password },
    method: "POST",
    signal: options.signal,
  });
  return normalizeAdminSession(payload);
}

export async function logoutAdminSession(options: Pick<RequestOptions, "signal"> = {}) {
  await requestJson("/admin/session", {
    method: "DELETE",
    signal: options.signal,
  });
}

export async function listAdminUsers(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson("/admin/priestess/users", { signal: options.signal });
  return extractList(payload, ["users", "local_users", "items", "data"]).map(normalizeAdminUser);
}

export async function listAdminQrSessions(params: { status?: string; limit?: number } = {}, options: Pick<RequestOptions, "signal"> = {}) {
  const searchParams = new URLSearchParams();
  if (params.status && params.status !== "all") {
    searchParams.set("status", params.status);
  }
  if (typeof params.limit === "number") {
    searchParams.set("limit", String(params.limit));
  }

  const payload = await requestJson("/admin/priestess/qr-sessions", {
    searchParams,
    signal: options.signal,
  });
  return extractList(payload, ["qr_sessions", "qrSessions", "sessions", "items", "data"]).map(normalizeAdminQrSession);
}

export async function listLoginRiskBuckets(params: { status?: string; limit?: number } = {}, options: Pick<RequestOptions, "signal"> = {}) {
  const searchParams = new URLSearchParams();
  if (params.status && params.status !== "all") {
    searchParams.set("status", params.status);
  }
  if (typeof params.limit === "number") {
    searchParams.set("limit", String(params.limit));
  }

  const payload = await requestJson("/admin/priestess/login-risk", {
    searchParams,
    signal: options.signal,
  });
  return extractList(payload, ["buckets", "login_risk", "loginRisk", "items", "data"]).map(normalizeLoginRiskBucket);
}

export async function listAdminUserPasskeys(userId: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`/admin/priestess/users/${encodeURIComponent(userId)}/passkeys`, {
    signal: options.signal,
  });
  return extractList(payload, ["passkeys", "credentials", "items", "data"]).map(normalizeAdminPasskey);
}

export async function listPasswordResetRequests(params: { limit?: number; status?: string } = {}, options: Pick<RequestOptions, "signal"> = {}) {
  const searchParams = new URLSearchParams();
  if (params.status) {
    searchParams.set("status", params.status);
  }
  if (typeof params.limit === "number") {
    searchParams.set("limit", String(params.limit));
  }

  const payload = await requestJson("/admin/priestess/password-reset-requests", {
    searchParams,
    signal: options.signal,
  });
  return extractList(payload, ["requests", "password_reset_requests", "items", "data"]).map(normalizeAdminPasswordResetRequest);
}

async function requestJson(path: string, options: RequestOptions = {}) {
  const response = await fetch(buildApiUrl(path, options.searchParams), {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method: options.method ?? "GET",
    signal: options.signal,
  });

  const text = await response.text();
  const payload = parseJsonPayload(text, response.headers.get("content-type"));

  if (!response.ok) {
    throw new PriestessApiError(resolveErrorMessage(payload, response.status), {
      payload,
      status: response.status,
    });
  }

  if (payload === NON_JSON_PAYLOAD) {
    throw new PriestessApiError("后端返回了非 JSON 响应，请检查 API 代理或前后端路径", {
      payload: text,
      status: response.status,
    });
  }

  return payload;
}

const NON_JSON_PAYLOAD = Symbol("non-json-payload");

function normalizeBaseUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
}

function buildApiUrl(path: string, searchParams?: URLSearchParams) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const queryString = searchParams?.toString();
  const suffix = queryString ? `${normalizedPath}?${queryString}` : normalizedPath;
  const baseUrl = getPriestessApiBaseUrl();
  ensureExplicitLocalApiBase(baseUrl);

  return baseUrl ? `${baseUrl}${suffix}` : suffix;
}

function ensureExplicitLocalApiBase(baseUrl: string) {
  if (baseUrl || typeof window === "undefined") {
    return;
  }

  const isPriestessLocalDev = window.location.protocol === "http:"
    && window.location.hostname === "127.0.0.1"
    && ["5173", "5174"].includes(window.location.port);

  // 本地联调必须显式跨端口直连 Phainon，避免请求悄悄落到任一 Vite 子项目同源服务。
  if (isPriestessLocalDev) {
    throw new PriestessApiError("本地联调需要配置 VITE_PRIESTESS_API_BASE_URL=http://127.0.0.1:8787", {
      status: null,
    });
  }
}

function parseJsonPayload(text: string, contentType: string | null) {
  const cleanText = text.trim();
  if (!cleanText) {
    return null;
  }

  const looksJson = cleanText.startsWith("{") || cleanText.startsWith("[") || contentType?.includes("application/json");
  if (!looksJson) {
    return NON_JSON_PAYLOAD;
  }

  try {
    return JSON.parse(cleanText) as unknown;
  } catch (error) {
    throw new PriestessApiError("后端 JSON 响应解析失败", {
      payload: cleanText,
      cause: error,
    });
  }
}

function resolveErrorMessage(payload: unknown, status: number) {
  if (payload === NON_JSON_PAYLOAD) {
    return `后端请求失败 (${status})`;
  }

  const apiError = readApiError(payload);
  if (apiError && status >= 500 && ["internal_error", "invalid_config", "missing_config"].includes(apiError.code)) {
    return "后端配置未完成，请检查本地安全配置";
  }
  if (apiError?.code === "invalid_admin_password") {
    return "管理员密码不正确";
  }
  if (apiError?.code === "admin_login_required") {
    return "请先登录管理员会话";
  }
  if (apiError?.code === "password_reset_invalid") {
    return "重置链接无效或已过期";
  }
  if (apiError?.code === "weak_local_password") {
    return "新密码强度不足，至少需要 10 个字符";
  }
  if (status >= 500) {
    return "后端服务暂时不可用，请检查本地安全配置";
  }
  if (apiError?.message) {
    return apiError.message;
  }

  if (isRecord(payload)) {
    const message = readString(payload, ["message", "error", "detail", "reason"]);
    if (message) {
      return message;
    }
  }

  if (status === 401) {
    return "登录已失效或账号密码不正确";
  }
  if (status === 403) {
    return "当前会话没有管理权限";
  }
  if (status === 404) {
    return "后端接口暂未接入";
  }

  return `后端请求失败 (${status})`;
}

function normalizeAdminSession(payload: unknown): AdminSession {
  if (!isRecord(payload)) {
    return {
      authenticated: false,
      expiresAt: "",
      raw: payload,
    };
  }

  return {
    authenticated: readBoolean(payload, ["authenticated", "active", "ok"]) ?? false,
    expiresAt: readString(payload, ["expires_at", "expiresAt"]),
    raw: payload,
  };
}

function normalizeLocalSession(payload: unknown): LocalSession {
  if (!isRecord(payload)) {
    return {
      authenticated: false,
      expiresAt: "",
      raw: payload,
      user: null,
    };
  }

  const userPayload = pickRecord(payload, ["user", "local_user", "localUser", "account"]) ?? payload;
  const user = normalizeLocalSessionUser(userPayload);
  const authenticated = readBoolean(payload, ["authenticated", "active", "ok"]) ?? user !== null;

  return {
    authenticated,
    expiresAt: readString(payload, ["expires_at", "expiresAt"]) || readString(pickRecord(payload, ["session"]), ["expires_at", "expiresAt"]),
    raw: payload,
    user,
  };
}

function normalizeLocalSessionUser(payload: unknown): LocalSessionUser | null {
  if (!isRecord(payload)) {
    return null;
  }

  const userId = readString(payload, ["user_id", "userId", "id", "sub"]);
  const username = readString(payload, ["username", "name", "login"]);
  const email = readString(payload, ["email"]);
  const displayName = readString(payload, ["display_name", "displayName", "nickname", "name"]);

  if (!userId && !username && !email) {
    return null;
  }

  return {
    displayName: displayName || username || email || userId,
    email,
    enabled: readBoolean(payload, ["enabled"]),
    userId: userId || username || email,
    username: username || email || userId,
  };
}

function normalizePasswordResetRequestResult(payload: unknown): PasswordResetRequestResult {
  const record = isRecord(payload) ? payload : {};
  return {
    accepted: readBoolean(record, ["accepted", "ok"]) ?? false,
    delivery: readString(record, ["delivery"]),
    devResetUrl: readString(record, ["dev_reset_url", "devResetUrl"]),
    expiresAt: readString(record, ["expires_at", "expiresAt"]),
    raw: payload,
    requestId: readString(record, ["request_id", "requestId"]),
  };
}

function normalizeAdminUser(payload: unknown, index: number): AdminUser {
  const record = isRecord(payload) ? payload : {};
  const userId = readString(record, ["user_id", "userId", "id", "sub"]) || `user-${index + 1}`;
  const username = readString(record, ["username", "name", "login"]) || userId;
  const email = readString(record, ["email"]);
  const displayName = readString(record, ["display_name", "displayName", "nickname", "name"]) || username;

  return {
    createdAt: readString(record, ["created_at", "createdAt"]),
    displayName,
    email,
    enabled: readBoolean(record, ["enabled"]),
    raw: payload,
    updatedAt: readString(record, ["updated_at", "updatedAt"]),
    userId,
    username,
  };
}

function normalizeAdminQrSession(payload: unknown, index: number): AdminQrSession {
  const record = isRecord(payload) ? payload : {};

  return {
    appId: readString(record, ["app_id", "appId", "client_id", "clientId"]),
    createdAt: readString(record, ["created_at", "createdAt"]),
    expiresAt: readString(record, ["expires_at", "expiresAt"]),
    pcContext: readUnknown(record, ["pc_context", "pcContext", "pc_context_json", "pcContextJson"]),
    phoneContext: readUnknown(record, ["phone_context", "phoneContext", "phone_context_json", "phoneContextJson"]),
    raw: payload,
    returnTo: readString(record, ["return_to", "returnTo", "redirect_uri", "redirectUri"]),
    securityLevel: readNumber(record, ["security_level", "securityLevel"]),
    sessionId: readString(record, ["session_id", "sessionId", "id"]) || `qr-${index + 1}`,
    status: readString(record, ["status"]) || "unknown",
    updatedAt: readString(record, ["updated_at", "updatedAt"]),
  };
}

function normalizeLoginRiskBucket(payload: unknown, index: number): LoginRiskBucket {
  const record = isRecord(payload) ? payload : {};

  return {
    bucketKey: readString(record, ["bucket_key", "bucketKey", "id", "key"]) || `bucket-${index + 1}`,
    context: readUnknown(record, ["context", "context_json", "contextJson", "last_context", "lastContext"]),
    failureCount: readNumber(record, ["failure_count", "failureCount", "count"]),
    lastFailedAt: readString(record, ["last_failed_at", "lastFailedAt"]),
    lastReason: readString(record, ["last_reason", "lastReason", "reason"]),
    lockedUntil: readString(record, ["locked_until", "lockedUntil"]),
    raw: payload,
    scope: readString(record, ["scope"]) || "unknown",
  };
}

function normalizeAdminPasskey(payload: unknown, index: number): AdminPasskey {
  const record = isRecord(payload) ? payload : {};

  return {
    backedUp: readBoolean(record, ["backed_up", "backedUp"]),
    counter: readNumber(record, ["counter", "sign_count", "signCount"]),
    createdAt: readString(record, ["created_at", "createdAt"]),
    credentialId: readString(record, ["credential_id", "credentialId", "id"]) || `passkey-${index + 1}`,
    deviceType: readString(record, ["device_type", "deviceType"]),
    disabledAt: readString(record, ["disabled_at", "disabledAt"]),
    lastUsedAt: readString(record, ["last_used_at", "lastUsedAt"]),
    name: readString(record, ["name", "label"]) || "Passkey",
    raw: payload,
    transports: readStringList(record, ["transports", "transport"]),
  };
}

function normalizeAdminPasswordResetRequest(payload: unknown, index: number): AdminPasswordResetRequest {
  const record = isRecord(payload) ? payload : {};
  return {
    context: readUnknown(record, ["context"]),
    createdAt: readString(record, ["created_at", "createdAt"]),
    email: readString(record, ["email"]),
    emailSentAt: readString(record, ["email_sent_at", "emailSentAt"]),
    expiresAt: readString(record, ["expires_at", "expiresAt"]),
    raw: payload,
    requestId: readString(record, ["request_id", "requestId", "id"]) || `reset-${index + 1}`,
    status: readString(record, ["status"]) || "unknown",
    updatedAt: readString(record, ["updated_at", "updatedAt"]),
    usedAt: readString(record, ["used_at", "usedAt"]),
    userId: readString(record, ["user_id", "userId"]),
    username: readString(record, ["username"]),
  };
}

function extractList(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (isRecord(value)) {
      const nested: unknown[] = extractList(value, keys);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  const data = payload.data;
  if (Array.isArray(data)) {
    return data;
  }
  if (isRecord(data)) {
    return extractList(data, keys);
  }

  return [];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readApiError(payload: unknown) {
  if (!isRecord(payload)) {
    return null;
  }

  const error = pickRecord(payload, ["error"]);
  if (!error) {
    return null;
  }

  return {
    code: readString(error, ["code"]),
    message: readString(error, ["message"]),
  };
}

function pickRecord(record: JsonRecord | null | undefined, keys: string[]) {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }

  return null;
}

function readUnknown(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return null;
}

function readString(record: JsonRecord | null | undefined, keys: string[]) {
  if (!record) {
    return "";
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function readNumber(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readStringList(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
    }
    if (typeof value === "string" && value.trim() !== "") {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
}

function readBoolean(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "enabled", "active"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "disabled", "inactive"].includes(normalized)) {
        return false;
      }
    }
  }

  return null;
}
