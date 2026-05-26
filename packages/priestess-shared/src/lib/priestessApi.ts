import { PriestessApiError } from "./priestessApiErrors";
import { requestJson, type RequestOptions } from "./priestessApiRequest";
import { translatePriestess } from "./i18n";

export { getPriestessApiErrorCode, getPriestessApiErrorMessage, PriestessApiError } from "./priestessApiErrors";
export { getPriestessApiBaseLabel, getPriestessApiBaseUrl } from "./priestessApiRequest";

type JsonRecord = Record<string, unknown>;

const PRIESTESS_AUTH_BASE = "/auth/priestess";
const PRIESTESS_QR_BASE = `${PRIESTESS_AUTH_BASE}/qr`;

export type LocalLoginCredentials = {
  username: string;
  password: string;
};

export type LocalPasswordManagerPreference = {
  label: string;
  provider: string;
  raw: unknown;
};

export type LocalSessionUser = {
  address: string;
  avatarUrl: string;
  birthday: string;
  userId: string;
  username: string;
  displayName: string;
  email: string;
  phone: string;
  enabled: boolean | null;
  passwordManager: LocalPasswordManagerPreference | null;
};

export type LocalSession = {
  authenticated: boolean;
  challengeId: string;
  expiresAt: string;
  mfaRequired: boolean;
  mfaType: string;
  user: LocalSessionUser | null;
  raw: unknown;
};

export type LocalAccountChoice = {
  avatarUrl: string;
  choiceId: string;
  current: boolean;
  displayName: string;
  email: string;
  expiresAt: string;
  lastUsedAt: string;
  raw: unknown;
  userId: string;
  username: string;
};

export type LocalAccountChoiceApp = {
  appId: string;
  raw: unknown;
  returnToOrigin: string;
};

export type LocalAccountChoicesResult = {
  accounts: LocalAccountChoice[];
  app: LocalAccountChoiceApp;
  raw: unknown;
};

export type LocalAuthorizeResult = {
  expiresAt: number;
  expiresIn: number;
  raw: unknown;
  redirectUrl: string;
};

export type AdminSession = {
  authenticated: boolean;
  expiresAt: string;
  raw: unknown;
};

export type AdminUser = {
  address: string;
  birthday: string;
  userId: string;
  username: string;
  displayName: string;
  email: string;
  phone: string;
  enabled: boolean | null;
  createdAt: string;
  updatedAt: string;
  raw: unknown;
};

export type QrSessionStatus = "pending" | "scanned" | "pre_confirmed" | "confirmed" | "rejected" | "expired" | string;

export type QrSession = {
  expiresAt: number;
  expiresIn: number;
  qrUrl: string;
  raw: unknown;
  sessionId: string;
  statusUrl: string;
};

export type QrSessionPollStatus = {
  appId: string;
  expiresAt: number;
  expiresIn: number;
  loginCode: string;
  raw: unknown;
  redirectUrl: string;
  returnTo: string;
  securityLevel: number | null;
  sessionId: string;
  status: QrSessionStatus;
};

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

export type LocalPasskey = AdminPasskey;

export type PriestessStatus = {
  enabled: boolean | null;
  mode: string;
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

export type RegisterIdentityType = "email" | "phone";

export type RegisterVerificationRequestResult = {
  accepted: boolean;
  cooldownSeconds: number | null;
  devVerificationCode: string;
  delivery: string;
  expiresAt: string;
  raw: unknown;
  requestId: string;
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

export async function getLocalSession(options: Pick<RequestOptions, "signal"> = {}) {
  try {
    const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/session`, { signal: options.signal });
    return normalizeLocalSession(payload);
  } catch (error) {
    if (error instanceof PriestessApiError && (error.status === 401 || error.status === 403)) {
      return normalizeLocalSession(null);
    }

    throw error;
  }
}

export async function listLocalAccountChoices(params: { appId: string; returnTo: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("app_id", params.appId);
  searchParams.set("return_to", params.returnTo);

  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/account-choices`, {
    searchParams,
    signal: options.signal,
  });
  return normalizeLocalAccountChoices(payload);
}

export async function getPriestessStatus(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson("/api/priestess/status", { signal: options.signal });
  return normalizePriestessStatus(payload);
}

export async function loginLocalSession(credentials: LocalLoginCredentials, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/session`, {
    body: {
      username: credentials.username,
      password: credentials.password,
    },
    method: "POST",
    signal: options.signal,
  });

  return normalizeLocalSession(payload);
}

export async function verifyLocalTotpLogin(params: { challengeId: string; code: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/session/totp/verify`, {
    body: {
      challenge_id: params.challengeId,
      code: params.code,
    },
    method: "POST",
    signal: options.signal,
  });

  return normalizeLocalSession(payload);
}

export async function authorizeLocalSession(params: { appId: string; returnTo: string; choiceId?: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/authorize`, {
    body: {
      app_id: params.appId,
      ...(params.choiceId ? { choice_id: params.choiceId } : {}),
      return_to: params.returnTo,
    },
    method: "POST",
    signal: options.signal,
  });

  return normalizeLocalAuthorizeResult(payload);
}

export async function createQrSession(params: { appId: string; returnTo: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_QR_BASE}/sessions`, {
    body: {
      app_id: params.appId,
      return_to: params.returnTo,
    },
    method: "POST",
    signal: options.signal,
  });

  return normalizeQrSession(payload);
}

export async function getQrSessionStatus(sessionId: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_QR_BASE}/sessions/${encodeURIComponent(sessionId)}/status`, {
    signal: options.signal,
  });

  return normalizeQrSessionPollStatus(payload);
}

export async function logoutLocalSession(options: Pick<RequestOptions, "signal"> = {}) {
  await requestJson(`${PRIESTESS_AUTH_BASE}/session`, {
    method: "DELETE",
    signal: options.signal,
  });
}

export async function changeLocalPassword(params: { currentPassword: string; password: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/password`, {
    body: {
      current_password: params.currentPassword,
      password: params.password,
    },
    method: "PATCH",
    signal: options.signal,
  });
  return normalizeLocalSession(payload);
}

export async function listLocalPasskeys(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/passkeys`, { signal: options.signal });
  return extractList(payload, ["passkeys", "credentials", "items", "data"]).map(normalizeAdminPasskey);
}

export async function renameLocalPasskey(credentialId: string, name: string, options: Pick<RequestOptions, "signal"> = {}) {
  // 用户端只能改当前会话所属的 Passkey 名称；所有归属和禁用校验都交给后端执行。
  await requestJson(`${PRIESTESS_AUTH_BASE}/passkeys/${encodeURIComponent(credentialId)}`, {
    body: { name },
    method: "PATCH",
    signal: options.signal,
  });
}

export async function deleteLocalPasskey(credentialId: string, options: Pick<RequestOptions, "signal"> = {}) {
  // 删除语义由 Phainon 后端实现为禁用 credential，前端不做本地伪删除。
  await requestJson(`${PRIESTESS_AUTH_BASE}/passkeys/${encodeURIComponent(credentialId)}`, {
    method: "DELETE",
    signal: options.signal,
  });
}

export async function requestPasswordReset(identity: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/password-reset/requests`, {
    body: { identity },
    method: "POST",
    signal: options.signal,
  });
  return normalizePasswordResetRequestResult(payload);
}

export async function requestRegisterVerification(params: { identity: string; identityType: RegisterIdentityType; turnstileToken: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/register/verification-requests`, {
    body: { identity: params.identity, identity_type: params.identityType, turnstile_token: params.turnstileToken },
    method: "POST",
    signal: options.signal,
  });
  return normalizeRegisterVerificationRequestResult(payload);
}

export async function confirmLocalRegistration(params: {
  displayName: string;
  identity: string;
  identityType: RegisterIdentityType;
  password: string;
  username: string;
  verificationCode: string;
}, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/register/confirm`, {
    body: {
      display_name: params.displayName,
      identity: params.identity,
      identity_type: params.identityType,
      password: params.password,
      username: params.username,
      verification_code: params.verificationCode,
    },
    method: "POST",
    signal: options.signal,
  });
  return normalizeLocalSession(payload);
}

export async function confirmPasswordReset(params: { password: string; requestId: string; token: string }, options: Pick<RequestOptions, "signal"> = {}) {
  await requestJson(`${PRIESTESS_AUTH_BASE}/password-reset/confirm`, {
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
    expiresAt: readDateTimeString(payload, ["expires_at", "expiresAt"]),
    raw: payload,
  };
}

function normalizeLocalSession(payload: unknown): LocalSession {
  if (!isRecord(payload)) {
    return {
      authenticated: false,
      challengeId: "",
      expiresAt: "",
      mfaRequired: false,
      mfaType: "",
      raw: payload,
      user: null,
    };
  }

  const record = pickRecord(payload, ["data"]) ?? payload;
  const userPayload = pickRecord(record, ["user", "local_user", "localUser", "account"]) ?? record;
  const user = normalizeLocalSessionUser(userPayload);
  // 后端必须显式声明会话已认证；TOTP challenge 响应即使带 user 也不能被当成登录完成。
  const authenticated = readBoolean(record, ["authenticated", "active", "ok"]) ?? false;

  return {
    authenticated,
    challengeId: readString(record, ["challenge_id", "challengeId"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]) || readDateTimeString(pickRecord(record, ["session"]), ["expires_at", "expiresAt"]),
    mfaRequired: readBoolean(record, ["mfa_required", "mfaRequired"]) ?? false,
    mfaType: readString(record, ["mfa_type", "mfaType"]),
    raw: payload,
    user,
  };
}

function normalizeLocalAuthorizeResult(payload: unknown): LocalAuthorizeResult {
  const record = isRecord(payload) ? payload : {};
  return {
    expiresAt: readNumber(record, ["expires_at", "expiresAt"]) ?? 0,
    expiresIn: readNumber(record, ["expires_in", "expiresIn"]) ?? 0,
    raw: payload,
    redirectUrl: readString(record, ["redirect_url", "redirectUrl"]),
  };
}

function normalizeLocalAccountChoices(payload: unknown): LocalAccountChoicesResult {
  const root = isRecord(payload) ? payload : {};
  const record = pickRecord(root, ["data"]) ?? root;
  const appPayload = pickRecord(record, ["app", "application", "client"]);
  const appRecord = appPayload ?? record;

  return {
    accounts: extractList(record, ["accounts", "account_choices", "accountChoices", "choices", "items", "data"])
      .map(normalizeLocalAccountChoice)
      .filter((account) => account.userId || account.username || account.email || account.choiceId),
    app: {
      appId: readString(appRecord, ["app_id", "appId", "client_id", "clientId"]),
      raw: appPayload ?? null,
      returnToOrigin: readString(appRecord, ["return_to_origin", "returnToOrigin", "origin"]),
    },
    raw: payload,
  };
}

function normalizeLocalAccountChoice(payload: unknown, index: number): LocalAccountChoice {
  const record = isRecord(payload) ? payload : {};
  const nestedUser = pickRecord(record, ["user", "local_user", "localUser", "account"]);
  const userRecord = nestedUser ?? record;
  const user = normalizeLocalSessionUser(userRecord);
  const userId = readString(userRecord, ["user_id", "userId", "id", "sub"]) || user?.userId || "";
  const username = readString(userRecord, ["username", "name", "login"]) || user?.username || "";
  const email = readString(userRecord, ["email"]) || user?.email || "";
  const displayName = readString(userRecord, ["display_name", "displayName", "nickname", "name"]) || user?.displayName || username || email || userId || translatePriestess("common:账号 {{count}}", { count: index + 1 });

  return {
    avatarUrl: readString(userRecord, ["avatar_url", "avatarUrl", "picture", "avatar"]) || user?.avatarUrl || "",
    choiceId: readString(record, ["choice_id", "choiceId"]),
    current: readBoolean(record, ["current", "is_current", "isCurrent", "active"]) ?? false,
    displayName,
    email,
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]) || readDateTimeString(pickRecord(record, ["session"]), ["expires_at", "expiresAt"]),
    lastUsedAt: readDateTimeString(record, ["last_used_at", "lastUsedAt"]),
    raw: payload,
    userId,
    username,
  };
}

function normalizeQrSession(payload: unknown): QrSession {
  const record = isRecord(payload) ? payload : {};
  return {
    expiresAt: readNumber(record, ["expires_at", "expiresAt"]) ?? 0,
    expiresIn: readNumber(record, ["expires_in", "expiresIn"]) ?? 0,
    qrUrl: readString(record, ["qr_url", "qrUrl"]),
    raw: payload,
    sessionId: readString(record, ["session_id", "sessionId"]),
    statusUrl: readString(record, ["status_url", "statusUrl"]),
  };
}

function normalizeQrSessionPollStatus(payload: unknown): QrSessionPollStatus {
  const record = isRecord(payload) ? payload : {};
  return {
    appId: readString(record, ["app_id", "appId"]),
    expiresAt: readNumber(record, ["expires_at", "expiresAt"]) ?? 0,
    expiresIn: readNumber(record, ["expires_in", "expiresIn"]) ?? 0,
    loginCode: readString(record, ["login_code", "loginCode"]),
    raw: payload,
    redirectUrl: readString(record, ["redirect_url", "redirectUrl"]),
    returnTo: readString(record, ["return_to", "returnTo"]),
    securityLevel: readNumber(record, ["security_level", "securityLevel"]),
    sessionId: readString(record, ["session_id", "sessionId"]),
    status: readString(record, ["status"]) || "unknown",
  };
}

function normalizeLocalSessionUser(payload: unknown): LocalSessionUser | null {
  if (!isRecord(payload)) {
    return null;
  }

  const userId = readString(payload, ["user_id", "userId", "id", "sub"]);
  const username = readString(payload, ["username", "name", "login"]);
  const address = readString(payload, ["address"]);
  const birthday = readString(payload, ["birthday", "birth_date", "birthDate", "date_of_birth", "dateOfBirth"]);
  const email = readString(payload, ["email"]);
  const phone = readString(payload, ["phone", "phone_number", "phoneNumber"]);
  const displayName = readString(payload, ["display_name", "displayName", "nickname", "name"]);
  const avatarUrl = readString(payload, ["avatar_url", "avatarUrl", "picture", "avatar"]);

  if (!userId && !username && !email) {
    return null;
  }

  return {
    address,
    avatarUrl,
    birthday,
    displayName: displayName || username || email || userId,
    email,
    enabled: readBoolean(payload, ["enabled"]),
    passwordManager: normalizeLocalPasswordManagerPreference(readUnknown(payload, ["password_manager", "passwordManager"])),
    phone,
    userId: userId || username || email,
    username: username || email || userId,
  };
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

function normalizePriestessStatus(payload: unknown): PriestessStatus {
  const root = isRecord(payload) ? payload : {};
  const record = pickRecord(root, ["data"]) ?? root;
  return {
    enabled: readBoolean(record, ["enabled"]),
    mode: readString(record, ["mode", "auth_login_mode", "login_mode"]),
    raw: payload,
  };
}

function normalizePasswordResetRequestResult(payload: unknown): PasswordResetRequestResult {
  const record = isRecord(payload) ? payload : {};
  return {
    accepted: readBoolean(record, ["accepted", "ok"]) ?? false,
    delivery: readString(record, ["delivery"]),
    devResetUrl: readString(record, ["dev_reset_url", "devResetUrl"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    raw: payload,
    requestId: readString(record, ["request_id", "requestId"]),
  };
}

function normalizeRegisterVerificationRequestResult(payload: unknown): RegisterVerificationRequestResult {
  const record = isRecord(payload) ? pickRecord(payload, ["data"]) ?? payload : {};
  return {
    accepted: readBoolean(record, ["accepted", "ok"]) ?? false,
    cooldownSeconds: readNumber(record, ["cooldown_seconds", "cooldownSeconds", "retry_after", "retryAfter"]),
    devVerificationCode: readString(record, ["dev_verification_code", "devVerificationCode"]),
    delivery: readString(record, ["delivery", "channel"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    raw: payload,
    requestId: readString(record, ["request_id", "requestId"]),
  };
}

function normalizeAdminUser(payload: unknown, index: number): AdminUser {
  const record = isRecord(payload) ? payload : {};
  const userId = readString(record, ["user_id", "userId", "id", "sub"]) || `user-${index + 1}`;
  const username = readString(record, ["username", "name", "login"]) || userId;
  const address = readString(record, ["address"]);
  const birthday = readString(record, ["birthday", "birth_date", "birthDate", "date_of_birth", "dateOfBirth"]);
  const email = readString(record, ["email"]);
  const phone = readString(record, ["phone", "phone_number", "phoneNumber"]);
  const displayName = readString(record, ["display_name", "displayName", "nickname", "name"]) || username;

  return {
    address,
    birthday,
    createdAt: readDateTimeString(record, ["created_at", "createdAt"]),
    displayName,
    email,
    enabled: readBoolean(record, ["enabled"]),
    phone,
    raw: payload,
    updatedAt: readDateTimeString(record, ["updated_at", "updatedAt"]),
    userId,
    username,
  };
}

function normalizeAdminQrSession(payload: unknown, index: number): AdminQrSession {
  const record = isRecord(payload) ? payload : {};

  return {
    appId: readString(record, ["app_id", "appId", "client_id", "clientId"]),
    createdAt: readDateTimeString(record, ["created_at", "createdAt"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    pcContext: readUnknown(record, ["pc_context", "pcContext", "pc_context_json", "pcContextJson"]),
    phoneContext: readUnknown(record, ["phone_context", "phoneContext", "phone_context_json", "phoneContextJson"]),
    raw: payload,
    returnTo: readString(record, ["return_to", "returnTo", "redirect_uri", "redirectUri"]),
    securityLevel: readNumber(record, ["security_level", "securityLevel"]),
    sessionId: readString(record, ["session_id", "sessionId", "id"]) || `qr-${index + 1}`,
    status: readString(record, ["status"]) || "unknown",
    updatedAt: readDateTimeString(record, ["updated_at", "updatedAt"]),
  };
}

function normalizeLoginRiskBucket(payload: unknown, index: number): LoginRiskBucket {
  const record = isRecord(payload) ? payload : {};

  return {
    bucketKey: readString(record, ["bucket_key", "bucketKey", "id", "key"]) || `bucket-${index + 1}`,
    context: readUnknown(record, ["context", "context_json", "contextJson", "last_context", "lastContext"]),
    failureCount: readNumber(record, ["failure_count", "failureCount", "count"]),
    lastFailedAt: readDateTimeString(record, ["last_failed_at", "lastFailedAt"]),
    lastReason: readString(record, ["last_reason", "lastReason", "reason"]),
    lockedUntil: readDateTimeString(record, ["locked_until", "lockedUntil"]),
    raw: payload,
    scope: readString(record, ["scope"]) || "unknown",
  };
}

function normalizeAdminPasskey(payload: unknown, index: number): AdminPasskey {
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

function normalizeAdminPasswordResetRequest(payload: unknown, index: number): AdminPasswordResetRequest {
  const record = isRecord(payload) ? payload : {};
  return {
    context: readUnknown(record, ["context"]),
    createdAt: readDateTimeString(record, ["created_at", "createdAt"]),
    email: readString(record, ["email"]),
    emailSentAt: readDateTimeString(record, ["email_sent_at", "emailSentAt"]),
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    raw: payload,
    requestId: readString(record, ["request_id", "requestId", "id"]) || `reset-${index + 1}`,
    status: readString(record, ["status"]) || "unknown",
    updatedAt: readDateTimeString(record, ["updated_at", "updatedAt"]),
    usedAt: readDateTimeString(record, ["used_at", "usedAt"]),
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

function readDateTimeString(record: JsonRecord | null | undefined, keys: string[]) {
  if (!record) {
    return "";
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return formatEpochDateTime(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }
      const numeric = Number(trimmed);
      if (/^\d+(\.\d+)?$/.test(trimmed) && Number.isFinite(numeric)) {
        return formatEpochDateTime(numeric);
      }
      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? trimmed : parsed.toISOString();
    }
  }

  return "";
}

function formatEpochDateTime(value: number) {
  const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
  return new Date(milliseconds).toISOString();
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
