import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getLocalSession,
  getPriestessApiErrorCode,
  getPriestessApiErrorMessage,
  listLocalAccountChoices,
  PriestessApiError,
  redactSensitiveAuthText,
  translatePriestess,
  type LocalAccountChoice,
  type LocalAccountChoiceApp,
  type LocalSession,
} from "@priestess/shared";
import { getAuthRequestKey, getAuthRequestReturnToOrigin, type AuthRequest } from "./authRequest";

export { redactSensitiveAuthText };

export type AuthAccountChoice = LocalAccountChoice & {
  authorizeChoiceId: string | null;
  source: "account-choices" | "current-session";
};

export type AuthAccountChoicesStatus = "empty" | "error" | "idle" | "loading" | "ready";

export type AuthAccountChoicesState = {
  accounts: AuthAccountChoice[];
  app: LocalAccountChoiceApp | null;
  error: string;
  refresh: () => void;
  status: AuthAccountChoicesStatus;
};

type UseAuthAccountChoicesParams = {
  authRequest: AuthRequest | null;
  enabled: boolean;
};

export function useAuthAccountChoices({ authRequest, enabled }: UseAuthAccountChoicesParams): AuthAccountChoicesState {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [state, setState] = useState<Omit<AuthAccountChoicesState, "refresh">>({
    accounts: [],
    app: null,
    error: "",
    status: "idle",
  });
  const authRequestKey = getAuthRequestKey(authRequest);

  const refresh = useCallback(() => {
    setRefreshVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    const request = authRequest;
    if (!enabled || !request) {
      setState({
        accounts: [],
        app: null,
        error: "",
        status: "idle",
      });
      return;
    }

    const abortController = new AbortController();
    setState((current) => ({
      accounts: current.accounts,
      app: current.app ?? buildFallbackApp(request),
      error: "",
      status: "loading",
    }));

    void (async() => {
      try {
        const choices = await readAuthAccountChoicesForRequest(request, abortController.signal);
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          accounts: choices.accounts,
          app: choices.app,
          error: choices.error,
          status: choices.error ? "error" : choices.accounts.length > 0 ? "ready" : "empty",
        });
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setState({
          accounts: [],
          app: buildFallbackApp(request),
          error: getAuthAccountChoiceErrorMessage(error, translatePriestess("login:账号选择暂时不可用")),
          status: "error",
        });
      }
    })();

    return () => abortController.abort();
  }, [authRequestKey, enabled, refreshVersion]);

  return useMemo(() => ({
    ...state,
    refresh,
  }), [refresh, state]);
}

export function getAuthAccountChoiceErrorMessage(error: unknown, fallback = translatePriestess("login:账号选择暂时不可用")) {
  return redactSensitiveAuthText(getPriestessApiErrorMessage(error, fallback));
}

export async function readAuthAccountChoicesForRequest(authRequest: AuthRequest, signal: AbortSignal) {
  try {
    const result = await listLocalAccountChoices(authRequest, { signal });
    const accounts = result.accounts.map((account) => ({
      ...account,
      authorizeChoiceId: account.choiceId || null,
      source: "account-choices" as const,
    }));
    // 多账号授权必须由后端下发短时 choice_id；前端不能用 user_id 或本地缓存伪造可授权账号。
    const missingChoiceId = accounts.some((account) => !account.authorizeChoiceId);

    return {
      accounts,
      app: mergeFallbackApp(authRequest, result.app),
      error: missingChoiceId ? translatePriestess("login:账号选择接口缺少 choice_id，请联系管理员检查后端契约") : "",
    };
  } catch (error) {
    if (signal.aborted || !shouldFallbackToCurrentSession(error)) {
      throw error;
    }
  }

  // 兼容旧后端时只展示当前已认证会话，避免在前端保存影子账号列表造成授权语义漂移。
  const session = await getLocalSession({ signal });
  return {
    accounts: session.authenticated && session.user ? [accountFromCurrentSession(session)] : [],
    app: buildFallbackApp(authRequest),
    error: "",
  };
}

function shouldFallbackToCurrentSession(error: unknown) {
  if (!(error instanceof PriestessApiError)) {
    return false;
  }

  const code = getPriestessApiErrorCode(error);
  return [401, 404, 405, 501].includes(error.status ?? 0)
    || ["not_found", "route_not_found", "unsupported_endpoint"].includes(code);
}

function accountFromCurrentSession(session: LocalSession): AuthAccountChoice {
  const user = session.user;
  const username = user?.username ?? "";
  const email = user?.email ?? "";

  return {
    authenticated: true,
    avatarUrl: user?.avatarUrl ?? "",
    authorizeChoiceId: null,
    choiceId: "",
    current: true,
    displayName: user?.displayName || username || email || translatePriestess("login:当前账号"),
    email,
    expiresAt: session.expiresAt,
    lastUsedAt: "",
    raw: session.raw,
    revoked: false,
    source: "current-session",
    userId: user?.userId || username || email,
    username,
  };
}

function buildFallbackApp(authRequest: AuthRequest): LocalAccountChoiceApp {
  return {
    appId: authRequest.appId,
    raw: null,
    returnToOrigin: getAuthRequestReturnToOrigin(authRequest.returnTo),
  };
}

function mergeFallbackApp(authRequest: AuthRequest, app: LocalAccountChoiceApp): LocalAccountChoiceApp {
  const fallback = buildFallbackApp(authRequest);
  return {
    appId: app.appId || fallback.appId,
    raw: app.raw,
    returnToOrigin: app.returnToOrigin || fallback.returnToOrigin,
  };
}
