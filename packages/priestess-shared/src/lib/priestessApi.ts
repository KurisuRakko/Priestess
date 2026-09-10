import { PriestessApiError } from "./priestessApiErrors";
import { requestJson, type RequestOptions } from "./priestessApiRequest";
import { translatePriestess } from "./i18n";
import type {
  LocalAccountChoice,
  LocalAccountChoicesResult,
  LocalAccountChoiceRemovalResult,
  LocalBrowserAccountsResult,
  LocalAuthorizeResult,
  LocalLoginCredentials,
  LocalPasskey,
  LocalPasswordManagerPreference,
  LocalSession,
  LocalSessionUser,
  PasswordResetLinkVisitResult,
  PasswordResetRequestResult,
  PriestessStatus,
  PriestessUserRole,
  QrSession,
  QrSessionPollStatus,
  RegisterIdentityType,
  RegisterInviteCheckResult,
  RegisterVerificationCheckResult,
  RegisterVerificationRequestResult,
} from "./priestessApiTypes";

export { getPriestessApiErrorCode, getPriestessApiErrorMessage, PriestessApiError } from "./priestessApiErrors";
export { getPriestessApiBaseLabel, getPriestessApiBaseUrl } from "./priestessApiRequest";
export type * from "./priestessApiTypes";

type JsonRecord = Record<string, unknown>;

const PRIESTESS_AUTH_BASE = "/auth/priestess";
const PRIESTESS_QR_BASE = `${PRIESTESS_AUTH_BASE}/qr`;

export async function getLocalSession(options: Pick<RequestOptions, "signal"> = {}) {
  try {
    const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/session`, { signal: options.signal });
    return normalizeLocalSession(payload);
  } catch (error) {
    if (error instanceof PriestessApiError && (error.status === 401 || error.status === 403)) {
      // 401/403 的响应体可能带 signed_out_reason（被设备上限顶下线），归一化后强制回未认证态，
      // 避免错误载荷里的残留字段被当成有效会话。
      return { ...normalizeLocalSession(error.payload), authenticated: false, user: null };
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

export async function listLocalBrowserAccounts(options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/browser-accounts`, {
    signal: options.signal,
  });
  return normalizeLocalBrowserAccounts(payload);
}

export async function removeLocalAccountChoice(userId: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/account-choices/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    signal: options.signal,
  });
  return normalizeLocalAccountChoiceRemoval(payload);
}

export async function activateLocalAccountChoice(userId: string, params: { choiceId?: string } = {}, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/account-choices/${encodeURIComponent(userId)}/activate`, {
    body: params.choiceId ? { choice_id: params.choiceId } : {},
    method: "POST",
    signal: options.signal,
  });
  return normalizeLocalSession(payload);
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
      ...(credentials.turnstileToken ? { turnstile_token: credentials.turnstileToken } : {}),
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
  return extractList(payload, ["passkeys", "credentials", "items", "data"]).map(normalizeLocalPasskey);
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

export async function requestPasswordReset(identity: string, turnstileToken: string, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/password-reset/requests`, {
    body: { identity, turnstile_token: turnstileToken },
    method: "POST",
    signal: options.signal,
  });
  return normalizePasswordResetRequestResult(payload);
}

export async function visitPasswordResetLink(params: { requestId: string; token: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/password-reset/links/visits`, {
    body: { request_id: params.requestId, token: params.token },
    method: "POST",
    signal: options.signal,
  });
  return normalizePasswordResetLinkVisitResult(payload);
}

export async function requestRegisterVerification(params: {
  identity: string;
  identityType: RegisterIdentityType;
  inviteChallenge: string;
  inviteCode: string;
}, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/register/verification-requests`, {
    body: {
      identity: params.identity,
      identity_type: params.identityType,
      invite_challenge: params.inviteChallenge,
      invite_code: params.inviteCode,
    },
    method: "POST",
    signal: options.signal,
  });
  return normalizeRegisterVerificationRequestResult(payload);
}

export async function checkRegisterInvite(params: { identity: string; identityType: RegisterIdentityType; inviteCode: string; turnstileToken: string }, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/register/invite-check`, {
    body: {
      identity: params.identity,
      identity_type: params.identityType,
      invite_code: params.inviteCode,
      turnstile_token: params.turnstileToken,
    },
    method: "POST",
    signal: options.signal,
  });
  return normalizeRegisterInviteCheckResult(payload);
}

export async function checkRegisterVerification(params: {
  identity: string;
  identityType: RegisterIdentityType;
  inviteChallenge: string;
  inviteCode: string;
  verificationCode: string;
  verificationRequestId: string;
}, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/register/verification-check`, {
    body: {
      identity: params.identity,
      identity_type: params.identityType,
      invite_challenge: params.inviteChallenge,
      invite_code: params.inviteCode,
      verification_code: params.verificationCode,
      verification_request_id: params.verificationRequestId,
    },
    method: "POST",
    signal: options.signal,
  });
  return normalizeRegisterVerificationCheckResult(payload);
}

export async function confirmLocalRegistration(params: {
  displayName: string;
  identity: string;
  identityType: RegisterIdentityType;
  inviteChallenge: string;
  inviteCode: string;
  password: string;
  verificationChallenge: string;
  username: string;
}, options: Pick<RequestOptions, "signal"> = {}) {
  const payload = await requestJson(`${PRIESTESS_AUTH_BASE}/register/confirm`, {
    body: {
      display_name: params.displayName,
      identity: params.identity,
      identity_type: params.identityType,
      invite_challenge: params.inviteChallenge,
      invite_code: params.inviteCode,
      password: params.password,
      verification_challenge: params.verificationChallenge,
      username: params.username,
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

function normalizeLocalSession(payload: unknown): LocalSession {
  if (!isRecord(payload)) {
    return {
      authenticated: false,
      challengeId: "",
      expiresAt: "",
      mfaRequired: false,
      mfaType: "",
      raw: payload,
      signedOutReason: "",
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
    signedOutReason: readString(record, ["signed_out_reason", "signedOutReason"]),
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

function normalizeLocalBrowserAccounts(payload: unknown): LocalBrowserAccountsResult {
  const normalized = normalizeLocalAccountChoices(payload);
  return {
    accounts: normalized.accounts,
    raw: payload,
  };
}

function normalizeLocalAccountChoice(payload: unknown, index: number): LocalAccountChoice {
  const record = isRecord(payload) ? payload : {};
  const sessionRecord = pickRecord(record, ["session"]) ?? {};
  const nestedUser = pickRecord(record, ["user", "local_user", "localUser", "account"]);
  const userRecord = nestedUser ?? record;
  const user = normalizeLocalSessionUser(userRecord);
  const userId = readString(userRecord, ["user_id", "userId", "id", "sub"]) || user?.userId || "";
  const username = readString(userRecord, ["username", "name", "login"]) || user?.username || "";
  const email = readString(userRecord, ["email"]) || user?.email || "";
  const displayName = readString(userRecord, ["display_name", "displayName", "nickname", "name"]) || user?.displayName || username || email || userId || translatePriestess("common:账号 {{count}}", { count: index + 1 });
  // 兼容 Phainon 迁移期里不同命名的会话状态字段，前端只关心这个浏览器还能不能安全编辑该账号。
  const revoked = readBoolean(record, ["revoked", "is_revoked", "isRevoked", "signed_out", "signedOut", "logged_out", "loggedOut", "force_logged_out", "forceLoggedOut"])
    ?? readBoolean(sessionRecord, ["revoked", "is_revoked", "isRevoked", "signed_out", "signedOut", "logged_out", "loggedOut", "force_logged_out", "forceLoggedOut"])
    ?? false;
  const authenticated = readBoolean(record, ["authenticated", "is_authenticated", "isAuthenticated", "signed_in", "signedIn", "logged_in", "loggedIn", "valid", "active"])
    ?? readBoolean(sessionRecord, ["authenticated", "is_authenticated", "isAuthenticated", "signed_in", "signedIn", "logged_in", "loggedIn", "valid", "active"])
    ?? !revoked;

  return {
    authenticated: authenticated && !revoked,
    avatarUrl: readString(userRecord, ["avatar_url", "avatarUrl", "picture", "avatar"]) || user?.avatarUrl || "",
    choiceId: readString(record, ["choice_id", "choiceId"]),
    current: readBoolean(record, ["current", "is_current", "isCurrent", "current_session", "currentSession"]) ?? readBoolean(sessionRecord, ["current", "is_current", "isCurrent"]) ?? false,
    displayName,
    email,
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]) || readDateTimeString(sessionRecord, ["expires_at", "expiresAt"]),
    lastUsedAt: readDateTimeString(record, ["last_used_at", "lastUsedAt"]) || readDateTimeString(sessionRecord, ["last_used_at", "lastUsedAt"]),
    raw: payload,
    revoked,
    userId,
    username,
  };
}

function normalizeLocalAccountChoiceRemoval(payload: unknown): LocalAccountChoiceRemovalResult {
  const record = isRecord(payload) ? payload : {};
  return {
    authenticated: readBoolean(record, ["authenticated"]) ?? true,
    current: readBoolean(record, ["current"]) ?? false,
    raw: payload,
    removed: readBoolean(record, ["removed"]) ?? false,
    revoked: readBoolean(record, ["revoked"]) ?? false,
    userId: readString(record, ["user_id", "userId"]),
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
    preferredLanguages: readStringList(payload, ["preferred_languages", "preferredLanguages"]),
    role: normalizePriestessUserRole(readString(payload, ["role", "user_role", "userRole"])),
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

function normalizePasswordResetLinkVisitResult(payload: unknown): PasswordResetLinkVisitResult {
  const record = isRecord(payload) ? payload : {};
  return {
    expiresAt: readDateTimeString(record, ["expires_at", "expiresAt"]),
    raw: payload,
    remainingVisits: readNumber(record, ["remaining_visits", "remainingVisits"]),
    valid: readBoolean(record, ["valid", "ok"]) ?? false,
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

function normalizeRegisterInviteCheckResult(payload: unknown): RegisterInviteCheckResult {
  const record = isRecord(payload) ? pickRecord(payload, ["data"]) ?? payload : {};
  return {
    accepted: readBoolean(record, ["accepted", "ok"]) ?? false,
    expiresAt: readNumber(record, ["expires_at", "expiresAt"]) ?? 0,
    inviteChallenge: readString(record, ["invite_challenge", "inviteChallenge"]),
    raw: payload,
  };
}

function normalizeRegisterVerificationCheckResult(payload: unknown): RegisterVerificationCheckResult {
  const record = isRecord(payload) ? pickRecord(payload, ["data"]) ?? payload : {};
  return {
    accepted: readBoolean(record, ["accepted", "ok"]) ?? false,
    expiresAt: readNumber(record, ["expires_at", "expiresAt"]) ?? 0,
    raw: payload,
    verificationChallenge: readString(record, ["verification_challenge", "verificationChallenge"]),
  };
}

function normalizePriestessUserRole(value: string): PriestessUserRole {
  return value === "admin" ? "admin" : "user";
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
