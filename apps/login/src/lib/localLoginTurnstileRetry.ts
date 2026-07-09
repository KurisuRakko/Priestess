import { getPriestessApiErrorCode, type LocalLoginCredentials, type LocalSession } from "@priestess/shared";

export type LocalLoginTurnstileChallengeParams = {
  action: string;
  description: string;
  siteKey: string;
  title: string;
};

export type LocalLoginTurnstileRetryOptions = {
  credentials: LocalLoginCredentials;
  login: (credentials: LocalLoginCredentials) => Promise<LocalSession>;
  readSiteKey: () => string;
  requestChallenge: (params: LocalLoginTurnstileChallengeParams) => Promise<string>;
  signal: AbortSignal;
  t: (key: string) => string;
};

export async function loginLocalSessionWithTurnstileRetry({
  credentials,
  login,
  readSiteKey,
  requestChallenge,
  signal,
  t,
}: LocalLoginTurnstileRetryOptions) {
  try {
    return await login(credentials);
  } catch (error) {
    if (signal.aborted || getPriestessApiErrorCode(error) !== "local_login_turnstile_required") {
      throw error;
    }

    const siteKey = readSiteKey();
    if (!siteKey) {
      throw new Error(t("验证码组件未配置，请联系管理员"));
    }

    const token = await requestChallenge({
      action: "local_login",
      description: t("这次登录需要先通过 Cloudflare 验证。"),
      siteKey,
      title: t("请完成人机验证"),
    });
    if (signal.aborted) {
      throw error;
    }

    return login({
      ...credentials,
      turnstileToken: token,
    });
  }
}
