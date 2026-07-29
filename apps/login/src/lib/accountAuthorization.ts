import { translatePriestess } from "@priestess/shared";
import type { AuthRequest } from "./authRequest";
import type { AuthAccountChoice, AuthAccountChoicesStatus } from "./useAuthAccountChoices";

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

export function shouldShowAuthAccountPicker(params: {
  authMode: string;
  hasAuthRequest: boolean;
  hasTotpChallenge: boolean;
  standalone: boolean;
  showLoginFormForAccountPicker: boolean;
  status: AuthAccountChoicesStatus;
}) {
  // 空账号直接回到登录表单，避免把尚未登录的用户带进账号选择确认态。
  return (params.hasAuthRequest || params.standalone)
    && params.authMode === "login"
    && !params.showLoginFormForAccountPicker
    && !params.hasTotpChallenge
    && ["error", "loading", "ready"].includes(params.status);
}
