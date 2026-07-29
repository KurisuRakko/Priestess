import { translatePriestess } from "./i18n";

type JsonRecord = Record<string, unknown>;

export const ACCOUNT_SERVICE_UNAVAILABLE_MESSAGE = translatePriestess("errors:accountServiceUnavailable");
export const NON_JSON_PAYLOAD = Symbol("non-json-payload");

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

export function getPriestessApiErrorMessage(error: unknown, fallback?: string) {
  const resolvedFallback = fallback ?? translatePriestess("errors:requestFailed");

  return redactSensitiveAuthText(resolvePriestessApiErrorMessage(error, resolvedFallback));
}

function resolvePriestessApiErrorMessage(error: unknown, resolvedFallback: string) {
  if (error instanceof PriestessApiError && error.message) {
    return error.message;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return translatePriestess("errors:cancelled");
  }

  if (error instanceof TypeError) {
    return translatePriestess("errors:accountServiceUnavailable");
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return resolvedFallback;
}

export function getPriestessApiErrorCode(error: unknown) {
  return error instanceof PriestessApiError ? readApiError(error.payload)?.code ?? "" : "";
}

export function redactSensitiveAuthText(value: string) {
  // 错误消息可能来自后端或浏览器异常；展示前统一隐藏凭证、cookie、会话和一次性授权码。
  return value.replace(
    /(^|[?#&\s,;])((?:access_token|choice_id|client_secret|cookie|id_token|invite_code|login_code|otp_code|password|private_key|refresh_token|secret|session|session_id|token|totp_code|verification_challenge|verification_code)\s*[=:]\s*)[^\s&#&,;]+/gi,
    `$1$2${translatePriestess("common:[已隐藏]")}`,
  );
}

export function resolveErrorMessage(payload: unknown, status: number) {
  if (payload === NON_JSON_PAYLOAD) {
    return translatePriestess("errors:apiRequestFailed", { status });
  }

  const apiError = readApiError(payload);
  if (apiError && status >= 500 && ["internal_error", "invalid_config", "missing_config"].includes(apiError.code)) {
    return translatePriestess("errors:accountServiceUnavailable");
  }
  if (apiError?.code === "invalid_admin_password") return translatePriestess("errors:adminPasswordInvalid");
  if (apiError?.code === "admin_login_required") return translatePriestess("errors:adminLoginRequired");
  if (apiError?.code === "admin_turnstile_required") return translatePriestess("errors:turnstileRequired");
  if (apiError?.code === "admin_turnstile_not_configured") return translatePriestess("errors:registrationTurnstileMissing");
  if (apiError?.code === "admin_turnstile_failed") return translatePriestess("errors:turnstileFailed");
  if (apiError?.code === "password_reset_invalid") return translatePriestess("errors:passwordResetInvalid");
  if (apiError?.code === "password_reset_turnstile_not_configured") return translatePriestess("errors:registrationTurnstileMissing");
  if (apiError?.code === "password_reset_turnstile_failed") return translatePriestess("errors:turnstileFailed");
  if (apiError?.code === "local_login_temporarily_locked") return translatePriestess("errors:localLoginTemporarilyLocked");
  if (apiError?.code === "local_login_turnstile_required") return translatePriestess("errors:turnstileRequired");
  if (apiError?.code === "local_login_turnstile_not_configured") return translatePriestess("errors:registrationTurnstileMissing");
  if (apiError?.code === "local_login_turnstile_failed") return translatePriestess("errors:turnstileFailed");
  if (apiError?.code === "weak_local_password") return translatePriestess("errors:weakPassword");
  if (["local_user_exists", "register_identity_exists"].includes(apiError?.code ?? "")) return translatePriestess("errors:localUserExists");
  if (["registration_invite_invalid", "registration_invite_required"].includes(apiError?.code ?? "")) return translatePriestess("errors:registrationInviteInvalid");
  if (apiError?.code === "registration_invite_not_configured") return translatePriestess("errors:registrationInviteMissing");
  if (["registration_verification_invalid", "register_verification_invalid", "invalid_register_code", "invalid_registration_code"].includes(apiError?.code ?? "")) return translatePriestess("errors:registrationCodeInvalid");
  if (["registration_invite_challenge_required", "registration_invite_challenge_invalid"].includes(apiError?.code ?? "")) return translatePriestess("errors:registrationInviteChallengeInvalid");
  if (["registration_verification_challenge_required", "registration_verification_challenge_invalid"].includes(apiError?.code ?? "")) return translatePriestess("errors:registrationCodeInvalid");
  if (["registration_turnstile_failed", "turnstile_invalid", "turnstile_required"].includes(apiError?.code ?? "")) return translatePriestess("errors:turnstileFailed");
  if (apiError?.code === "registration_turnstile_not_configured") return translatePriestess("errors:registrationTurnstileMissing");
  if (["registration_email_not_configured", "registration_sms_not_configured", "sms_provider_not_configured", "sms_signature_required", "sms_webhook_not_configured"].includes(apiError?.code ?? "")) return translatePriestess("errors:registrationChannelMissing");
  if (["registration_email_failed", "sms_webhook_failed"].includes(apiError?.code ?? "")) return translatePriestess("errors:registrationChannelFailed");
  if (["auth_origin_not_allowed", "auth_origin_required", "origin_not_allowed"].includes(apiError?.code ?? "")) return translatePriestess("errors:originNotAllowed");
  if (apiError?.code === "invalid_email") return translatePriestess("errors:invalidEmail");
  if (apiError?.code === "invalid_login_identifier") return translatePriestess("errors:invalidLoginIdentifier");
  if (["invalid_registration_identity", "invalid_registration_identity_type"].includes(apiError?.code ?? "")) return translatePriestess("errors:invalidIdentity");
  if (["invalid_register_username", "invalid_username"].includes(apiError?.code ?? "")) return translatePriestess("errors:invalidUsername");
  if (["register_username_reserved", "reserved_username"].includes(apiError?.code ?? "")) return translatePriestess("errors:usernameReserved");
  if (["register_username_exists", "username_taken"].includes(apiError?.code ?? "")) return translatePriestess("errors:usernameExists");
  if (apiError?.code === "invalid_display_name") return translatePriestess("errors:invalidDisplayName");
  if (apiError?.code === "invalid_passkey_name") return translatePriestess("errors:invalidPasskeyName");
  if (apiError?.code === "invalid_password_manager") return translatePriestess("errors:invalidPasswordManager");
  if (apiError?.code === "invalid_password_manager_label") return translatePriestess("errors:invalidPasswordManagerLabel");
  if (apiError?.code === "invalid_current_password") return translatePriestess("errors:invalidCurrentPassword");
  if (apiError?.code === "totp_code_invalid" || apiError?.code === "invalid_totp_code") return translatePriestess("errors:invalidTotpCode");
  if (apiError?.code === "totp_challenge_invalid") return translatePriestess("errors:totpChallengeInvalid");
  if (apiError?.code === "return_url_not_allowed") return translatePriestess("errors:returnUrlNotAllowed");
  if (status >= 500) return translatePriestess("errors:accountServiceUnavailable");
  if (apiError?.message) return apiError.message;

  if (isRecord(payload)) {
    const message = readString(payload, ["message", "error", "detail", "reason"]);
    if (message) {
      return message;
    }
  }

  if (status === 401) return translatePriestess("errors:sessionInvalid");
  if (status === 403) return translatePriestess("errors:forbidden");
  if (status === 404) return translatePriestess("errors:notFound");

  return translatePriestess("errors:apiRequestFailed", { status });
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
