import { authorizeLocalSession, translatePriestess } from "@priestess/shared";
import type { AuthRequest } from "./authRequest";
import { readAuthAccountChoicesForRequest, type AuthAccountChoice, type AuthAccountChoicesStatus } from "./useAuthAccountChoices";

export type AuthAccountAuthorizeParams = {
  appId: string;
  choiceId?: string;
  returnTo: string;
};

export function getAuthAccountAuthorizeBlocker(account: AuthAccountChoice) {
  // 后端账号选择接口返回的账号必须携带短时 choice_id；旧 session fallback 才允许走当前会话授权。
  return account.source === "account-choices" && !account.authorizeChoiceId
    ? translatePriestess("login:账号选择项缺少 choice_id，无法安全授权")
    : "";
}

export function buildAuthAccountAuthorizeParams(authRequest: AuthRequest, account: AuthAccountChoice): AuthAccountAuthorizeParams {
  return {
    appId: authRequest.appId,
    ...(account.authorizeChoiceId ? { choiceId: account.authorizeChoiceId } : {}),
    returnTo: authRequest.returnTo,
  };
}

// 登录/注册刚完成时，如果这个浏览器里只有刚认证的这一个账号，就直接为它完成授权，
// 返回回跳地址；返回空串表示需要回到账号选择界面由用户显式确认。
export async function resolveSingleAccountAuthorizeRedirect(authRequest: AuthRequest, signal: AbortSignal): Promise<string> {
  try {
    const choices = await readAuthAccountChoicesForRequest(authRequest, signal);
    if (choices.error || choices.accounts.length !== 1) {
      return "";
    }

    const account = choices.accounts[0];
    if (!account.authenticated || account.revoked || getAuthAccountAuthorizeBlocker(account)) {
      return "";
    }

    const result = await authorizeLocalSession(buildAuthAccountAuthorizeParams(authRequest, account), { signal });
    return result.redirectUrl || "";
  } catch {
    // 任何失败都退回账号选择流程，让用户手动完成授权，不阻断登录结果。
    return "";
  }
}

export function shouldShowAuthAccountPicker(params: {
  authMode: string;
  hasAuthRequest: boolean;
  hasTotpChallenge: boolean;
  showLoginFormForAuthRequest: boolean;
  status: AuthAccountChoicesStatus;
}) {
  // 空账号直接回到登录表单，避免把尚未登录的用户带进账号选择确认态。
  return params.hasAuthRequest
    && params.authMode === "login"
    && !params.showLoginFormForAuthRequest
    && !params.hasTotpChallenge
    && ["error", "loading", "ready"].includes(params.status);
}
