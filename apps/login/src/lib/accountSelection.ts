import {
  activateLocalAccountChoice,
  authorizeLocalSession,
  getPriestessApiErrorCode,
  getPriestessApiErrorMessage,
  type LocalSession,
} from "@priestess/shared";
import { buildAuthAccountAuthorizeParams } from "./accountAuthorization";
import type { AuthRequest } from "./authRequest";
import { getAuthAccountChoiceErrorMessage, type AuthAccountChoice } from "./useAuthAccountChoices";

type TranslationFn = (key: string) => string;

export type AccountSelectionResult =
  | { kind: "manage"; session: LocalSession }
  | { kind: "redirect"; redirectUrl: string };

export async function completeAccountSelection(
  account: AuthAccountChoice,
  authRequest: AuthRequest | null,
  t: TranslationFn,
): Promise<AccountSelectionResult> {
  if (authRequest) {
    const result = await authorizeLocalSession(buildAuthAccountAuthorizeParams(authRequest, account));
    if (!result.redirectUrl) {
      throw new Error(t("后端未返回回跳地址"));
    }
    return { kind: "redirect", redirectUrl: result.redirectUrl };
  }

  const session = await activateLocalAccountChoice(account.userId);
  if (!session.authenticated || !session.user) {
    throw new Error(t("当前账号状态已变化，请重新选择账号"));
  }
  return { kind: "manage", session };
}

export function getAuthAccountActivationErrorMessage(error: unknown, t: TranslationFn) {
  const code = getPriestessApiErrorCode(error);
  // 这些错误都表示浏览器账号容器或短时选择项已经过期，统一回到账号选择刷新流程。
  if (["account_choice_invalid", "account_choice_not_found", "local_browser_required"].includes(code)) {
    return t("当前账号状态已变化，请重新选择账号");
  }
  return getPriestessApiErrorMessage(error, t("当前账号状态已变化，请重新选择账号"));
}

/** 成功时按后端签发的回跳地址离开登录页；失败时由调用方按自己所在的页面退回账号选择卡。 */
export type AuthRedirectAuthorizationOutcome =
  | { ok: true; redirectUrl: string }
  | { message: string; ok: false };

/**
 * 后端拒绝这个账号访问目标应用时会返回英文 message，直接透出对用户没有意义；
 * 按错误码换成明确的中文提示，其它错误仍走通用映射。
 */
export function getAuthorizationFailureMessage(error: unknown, t: TranslationFn) {
  if (getPriestessApiErrorCode(error) === "app_access_denied") {
    return t("该账号无权访问此应用，请换一个账号");
  }
  return getAuthAccountChoiceErrorMessage(error, t("授权失败，请重新选择账号"));
}

/**
 * 刚完成身份验证的当前会话直接向目标应用授权：用户输入账号密码或完成注册这一步本身就是选定账号，
 * 因此不再让用户回到账号选择卡重点一次。
 * 调用方在自己的成功动画开始时并发调用它，用动画停留时间掩盖授权往返延迟，动画结束后再读结果。
 * 授权失败只回退到账号选择卡，不升级成登录失败——登录本身已经成功。
 */
export async function startAuthRedirectAuthorization(
  authRequest: AuthRequest,
  t: TranslationFn,
  signal?: AbortSignal,
): Promise<AuthRedirectAuthorizationOutcome> {
  try {
    // 不传 choice_id：后端按当前会话授权。
    const result = await authorizeLocalSession(
      { appId: authRequest.appId, returnTo: authRequest.returnTo },
      signal ? { signal } : {},
    );
    if (!result.redirectUrl) {
      throw new Error(t("后端未返回回跳地址"));
    }
    return { ok: true, redirectUrl: result.redirectUrl };
  } catch (error) {
    return { message: getAuthorizationFailureMessage(error, t), ok: false };
  }
}
