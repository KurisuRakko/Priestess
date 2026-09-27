import { translatePriestess, type PriestessAuthorizationSecurity } from "@priestess/shared";

export type AuthRequest = {
  appId: string;
  returnTo: string;
  security?: PriestessAuthorizationSecurity;
};

export function readAuthRequest(location: Pick<Location, "search"> | null = getBrowserLocation()): AuthRequest | null {
  if (!location) {
    return null;
  }

  const params = new URLSearchParams(location.search);
  const appId = params.get("app_id")?.trim() ?? "";
  const returnTo = params.get("return_to")?.trim() ?? "";
  if (!appId || !returnTo) {
    return null;
  }

  const security = readAuthorizationSecurity(params);
  return security ? { appId, returnTo, security } : { appId, returnTo };
}

/** 读取规则对齐 Phainon web/src/features/oidc/nativeSecurity.ts：三个参数都缺失才判定为无 security，
 * 否则缺的那个补空串、不 trim、不修正，完整性和格式校验统一交给后端。 */
function readAuthorizationSecurity(params: URLSearchParams): PriestessAuthorizationSecurity | undefined {
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  if (!state && !codeChallenge && !codeChallengeMethod) {
    return undefined;
  }

  return {
    codeChallenge: codeChallenge ?? "",
    codeChallengeMethod: codeChallengeMethod ?? "",
    state: state ?? "",
  };
}

export function getAuthRequestKey(authRequest: AuthRequest | null) {
  if (!authRequest) {
    return "";
  }

  const { security } = authRequest;
  const securitySuffix = security ? `\n${security.state}\n${security.codeChallenge}\n${security.codeChallengeMethod}` : "";
  return `${authRequest.appId}\n${authRequest.returnTo}${securitySuffix}`;
}

export function getAuthRequestReturnToOrigin(returnTo: string) {
  try {
    const url = new URL(returnTo);
    // 前端只展示可被用户识别的 Web origin；其它 scheme 仍交给后端做正式 allowlist 校验。
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

export function getAuthRequestAppLabel(authRequest: AuthRequest) {
  return authRequest.appId || getAuthRequestReturnToOrigin(authRequest.returnTo) || translatePriestess("common:当前应用");
}

function getBrowserLocation() {
  return typeof window === "undefined" ? null : window.location;
}
