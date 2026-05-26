import { translatePriestess } from "@priestess/shared";

export type AuthRequest = {
  appId: string;
  returnTo: string;
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

  return { appId, returnTo };
}

export function getAuthRequestKey(authRequest: AuthRequest | null) {
  return authRequest ? `${authRequest.appId}\n${authRequest.returnTo}` : "";
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
