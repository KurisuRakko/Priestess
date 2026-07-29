import {
  activateLocalAccountChoice,
  authorizeLocalSession,
} from "@priestess/shared";
import { buildAuthAccountAuthorizeParams } from "./accountAuthorization";
import type { AuthRequest } from "./authRequest";
import type { AuthAccountChoice } from "./useAuthAccountChoices";

type TranslationFn = (key: string) => string;

export type AccountSelectionResult =
  | { kind: "manage" }
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
  return { kind: "manage" };
}
