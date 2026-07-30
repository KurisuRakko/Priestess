import {
  activateLocalAccountChoice,
  authorizeLocalSession,
  getPriestessApiErrorCode,
  getPriestessApiErrorMessage,
  type LocalSession,
} from "@priestess/shared";
import { buildAuthAccountAuthorizeParams } from "./accountAuthorization";
import type { AuthRequest } from "./authRequest";
import type { AuthAccountChoice } from "./useAuthAccountChoices";

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
