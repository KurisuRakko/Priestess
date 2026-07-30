import { useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useReducedMotion } from "motion/react";
import {
  activateLocalAccountChoice,
  createLocalPasskeyAuthenticationOptions,
  getPriestessApiErrorCode,
  getPriestessApiErrorMessage,
  loginLocalSession,
  removeLocalAccountChoice,
  Toast,
  usePriestessTranslation,
  type LocalLoginCredentials,
  type LocalSession,
  verifyLocalPasskeyAuthentication,
  verifyLocalTotpLogin,
} from "@priestess/shared";
import { getAccountKey, type AccountPickerAction } from "./components/AccountPickerCard";
import { AccountPage } from "./components/AccountPage";
import { LoginExperience } from "./components/LoginExperience";
import { type LoginCredentials } from "./components/LoginForm";
import { startLoginTransitionOverlay, type LoginTransitionOverlayController, type LoginTransitionOverlayParams } from "./components/LoginTransitionOverlay";
import { NotFoundPage } from "./components/NotFoundPage";
import { QrLoginConfirmPage } from "./components/QrLoginConfirmPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { getAuthAccountAuthorizeBlocker, shouldShowAuthAccountPicker } from "./lib/accountAuthorization";
import { completeAccountSelection, getAuthAccountActivationErrorMessage } from "./lib/accountSelection";
import { isAccountEditableInBrowser, resolveAccountManagementActionTarget } from "./lib/accountManagementAction";
import { getAuthRequestKey, readAuthRequest, type AuthRequest } from "./lib/authRequest";
import { loginLocalSessionWithTurnstileRetry } from "./lib/localLoginTurnstileRetry";
import {
  AUTH_MODE_DRAWER_IN_MS,
  AUTH_MODE_TRANSITION_MS,
  clearLocalLoginCooldownUntil,
  getLoginCardOriginRect,
  isLocalPasswordLoginRiskError,
  LOCAL_LOGIN_COOLDOWN_MS,
  LOCAL_LOGIN_FAILURE_LIMIT,
  LOGIN_INTRO_QR_DELAY_MS,
  LOGIN_RESULT_ANIMATION_MS,
  LOGIN_SUCCESS_HOLD_MS,
  readLocalLoginCooldownUntil,
  writeLocalLoginCooldownUntil,
} from "./lib/loginAppState";
import { buildLoginPathWithNext, getCurrentAccountNextPath, readLoginNext } from "./lib/loginNext";
import { resolveLoginLayoutState, type LoginLayoutAuthMode } from "./lib/loginLayoutState";
import { getCurrentRoute, LOGIN_ROUTE_PATH, LEGACY_LOGIN_ROUTE_PATH, matchesRoutePath, type AppRoute } from "./lib/routes";
import { getAuthAccountChoiceErrorMessage, type AuthAccountChoice, useAuthAccountChoices } from "./lib/useAuthAccountChoices";
import { useMobileLoginReveal } from "./lib/useMobileLoginReveal";
import { useQrLoginSession } from "./lib/useQrLoginSession";
import { readTurnstileSiteKey } from "./components/TurnstileWidget";

type AuthMode = LoginLayoutAuthMode;

type TotpChallenge = {
  challengeId: string;
  displayName: string;
  username: string;
};

export function App() {
  const { t } = usePriestessTranslation("login");
  const shouldReduceMotion = useReducedMotion();
  const loginCardRef = useRef<HTMLDivElement | null>(null);
  const loginTransitionOverlayRef = useRef<LoginTransitionOverlayController | null>(null);
  const loginAbortControllerRef = useRef<AbortController | null>(null);
  const authModeLayoutTimeoutRef = useRef<number | null>(null);
  const authModeTransitionTimeoutRef = useRef<number | null>(null);
  const loginSubmitStageTimeoutRef = useRef<number | null>(null);
  const [notice, setNotice] = useState("");
  const [accountActionBusyId, setAccountActionBusyId] = useState("");
  const [accountAuthorizeError, setAccountAuthorizeError] = useState("");
  const [authorizingAccountId, setAuthorizingAccountId] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [directAuthorizeBusy, setDirectAuthorizeBusy] = useState(false);
  const [forgotPasswordIdentity, setForgotPasswordIdentity] = useState("");
  const [isAuthModeTransitioning, setIsAuthModeTransitioning] = useState(false);
  const [isLoginIntroStage, setIsLoginIntroStage] = useState(() => getCurrentRoute() === "login");
  const [isLoginSubmitStage, setIsLoginSubmitStage] = useState(false);
  const [isRegisterDrawerStage, setIsRegisterDrawerStage] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute());
  const [localLoginCooldownUntil, setLocalLoginCooldownUntil] = useState(readLocalLoginCooldownUntil);
  const [localLoginFailureCount, setLocalLoginFailureCount] = useState(0);
  const [removingAccountId, setRemovingAccountId] = useState("");
  const [showLoginFormForAccountPicker, setShowLoginFormForAccountPicker] = useState(false);
  const [totpChallenge, setTotpChallenge] = useState<TotpChallenge | null>(null);
  const authRequest = route === "login" ? readAuthRequest() : null;
  const authRequestKey = getAuthRequestKey(authRequest);
  const hasQrRequest = authRequest !== null;
  const isLocalLoginCooldownActive = route === "login" && authMode === "login" && localLoginCooldownUntil > Date.now();
  const accountChoices = useAuthAccountChoices({
    authRequest,
    enabled: route === "login" && authMode === "login" && !isLocalLoginCooldownActive,
    standalone: !hasQrRequest,
  });
  const mobileLoginReveal = useMobileLoginReveal({
    accountChoicesStatus: accountChoices.status,
    enabled: route === "login",
    hasAuthRequest: hasQrRequest,
    prefersReducedMotion: Boolean(shouldReduceMotion),
  });
  const qrSession = useQrLoginSession({
    enabled: route === "login" && authMode === "login" && !isLocalLoginCooldownActive && !mobileLoginReveal.isMobileViewport,
    request: authRequest,
    requestKey: authRequestKey,
    t,
  });

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 2600);
  };

  const captureLoginCardOriginRect = (): LoginTransitionOverlayParams["originRect"] => (
    getLoginCardOriginRect(loginCardRef.current)
  );

  const navigateTo = (path: string, options: { replace?: boolean } = {}) => {
    if (options.replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    setRoute(getCurrentRoute());
  };

  const openForgotPassword = (identity: string) => {
    setForgotPasswordIdentity(identity.trim());
    switchAuthMode("forgot-password");
  };

  const clearAuthModeTransitionTimeout = () => {
    if (authModeLayoutTimeoutRef.current !== null) {
      window.clearTimeout(authModeLayoutTimeoutRef.current);
      authModeLayoutTimeoutRef.current = null;
    }
    if (authModeTransitionTimeoutRef.current !== null) {
      window.clearTimeout(authModeTransitionTimeoutRef.current);
      authModeTransitionTimeoutRef.current = null;
    }
  };

  const clearLoginSubmitStageTimeout = () => {
    if (loginSubmitStageTimeoutRef.current !== null) {
      window.clearTimeout(loginSubmitStageTimeoutRef.current);
      loginSubmitStageTimeoutRef.current = null;
    }
  };

  const releaseLoginSubmitStage = () => {
    clearLoginSubmitStageTimeout();
    setIsLoginSubmitStage(false);
  };

  const centerLoginCardForOverlay = () => new Promise<void>((resolve) => {
    clearLoginSubmitStageTimeout();
    setIsLoginIntroStage(false);
    // 登录提交复用首屏/注册切换的居中布局：先收起二维码，再启动结果 overlay。
    setIsLoginSubmitStage(true);
    const delay = shouldReduceMotion ? 40 : AUTH_MODE_DRAWER_IN_MS;
    loginSubmitStageTimeoutRef.current = window.setTimeout(() => {
      loginSubmitStageTimeoutRef.current = null;
      window.requestAnimationFrame(() => resolve());
    }, delay);
  });

  const switchAuthMode = (nextMode: AuthMode) => {
    if (authMode === nextMode || isAuthModeTransitioning) {
      return;
    }

    clearAuthModeTransitionTimeout();
    setIsAuthModeTransitioning(true);

    // 桌面二维码可见时严格按“抽屉退场 → 内容换页 → 卡片收拢”的顺序执行。
    // 旧实现会立即替换内容、760ms 后再改变布局，视觉上像卡片被拉扯了两次。
    const isDrawerVisuallyOpen = isQrDrawerOpen && window.matchMedia("(min-width: 821px)").matches;
    const shouldDrawerSlideOutFirst = nextMode !== "login" && authMode === "login" && isDrawerVisuallyOpen && !shouldReduceMotion;
    setIsRegisterDrawerStage(shouldDrawerSlideOutFirst);
    // 回到登录时重放首屏节奏：卡片先居中稳定，intro 阶段结束后才展开二维码抽屉。
    setIsLoginIntroStage(nextMode === "login" && hasQrRequest && !shouldReduceMotion);

    if (shouldDrawerSlideOutFirst) {
      authModeLayoutTimeoutRef.current = window.setTimeout(() => {
        setAuthMode(nextMode);
        setIsRegisterDrawerStage(false);
        authModeLayoutTimeoutRef.current = null;
      }, AUTH_MODE_DRAWER_IN_MS);
    } else {
      setAuthMode(nextMode);
    }

    // 布局动画结束后才解锁按钮，避免双击时 QR 抽屉和卡片状态互相打架。
    const transitionMs = shouldReduceMotion
      ? 120
      : shouldDrawerSlideOutFirst
        ? AUTH_MODE_DRAWER_IN_MS + AUTH_MODE_TRANSITION_MS
        : AUTH_MODE_TRANSITION_MS;
    authModeTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsAuthModeTransitioning(false);
      authModeTransitionTimeoutRef.current = null;
    }, transitionMs);
  };

  const resetLocalLoginFailureState = () => {
    setLocalLoginFailureCount(0);
    setLocalLoginCooldownUntil(0);
    clearLocalLoginCooldownUntil();
  };

  const activateLocalLoginCooldown = () => {
    const cooldownUntil = Date.now() + LOCAL_LOGIN_COOLDOWN_MS;
    // 冷却只保存到当前 API base/origin，不记录账号、密码或其它可识别主体信息。
    writeLocalLoginCooldownUntil(cooldownUntil);
    qrSession.stop();
    clearAuthModeTransitionTimeout();
    releaseLoginSubmitStage();
    setIsAuthModeTransitioning(false);
    setIsLoginIntroStage(false);
    setIsRegisterDrawerStage(false);
    setShowLoginFormForAccountPicker(false);
    setAccountAuthorizeError("");
    setTotpChallenge(null);
    setLocalLoginFailureCount(LOCAL_LOGIN_FAILURE_LIMIT);
    setLocalLoginCooldownUntil(cooldownUntil);
  };

  const finishAuthenticatedLogin = async(params: {
    controller: LoginTransitionOverlayController;
    fallbackUsername: string;
    session: LocalSession;
    signal: AbortSignal;
  }) => {
    if (!params.session.authenticated) {
      throw new Error(t("本地账号登录尚未完成"));
    }

    const displayName = params.session.user?.displayName || params.session.user?.username || params.fallbackUsername;
    const request = readAuthRequest();

    await params.controller.succeed({
      durationMs: LOGIN_RESULT_ANIMATION_MS,
      organizationName: "Priestess",
      postAnimationDelayMs: LOGIN_SUCCESS_HOLD_MS,
      title: request ? t("登录成功，请选择账号继续") : t("登录成功"),
      username: displayName,
    });

    if (params.signal.aborted) {
      return;
    }

    if (request) {
      // 所有应用授权都在成功动画结束后回到账号选择器，避免读取账号或授权请求锁住成功遮罩。
      releaseLoginSubmitStage();
      setShowLoginFormForAccountPicker(false);
      setAccountAuthorizeError("");
      accountChoices.refresh();
      showNotice(t("已添加账号，请选择要继续使用的账号"));
      return;
    }

    showNotice(t("登录成功"));
    navigateTo(readLoginNext(), { replace: true });
  };

  const finishRegisteredSession = async(session: LocalSession, _fallbackIdentity: string) => {
    if (!session.authenticated) {
      throw new Error(t("注册完成但本地会话尚未建立"));
    }

    const request = readAuthRequest();
    if (request) {
      // 注册成功页结束后统一刷新账号列表；唯一账号也必须由用户明确选择后再授权。
      setShowLoginFormForAccountPicker(false);
      setAccountAuthorizeError("");
      accountChoices.refresh();
      switchAuthMode("login");
      showNotice(t("注册成功，请选择要继续使用的账号"));
      return;
    }

    showNotice(t("注册成功"));
    navigateTo(readLoginNext(), { replace: true });
  };

  const chooseAuthAccount = async(account: AuthAccountChoice) => {
    const request = readAuthRequest();
    if (directAuthorizeBusy || removingAccountId) {
      return;
    }
    const blocker = getAuthAccountAuthorizeBlocker(account);
    if (blocker) {
      const message = blocker;
      setAccountAuthorizeError(message);
      showNotice(message);
      return;
    }

    const accountKey = getAccountKey(account);
    setAccountAuthorizeError("");
    setAuthorizingAccountId(accountKey);
    setDirectAuthorizeBusy(true);

    try {
      const result = await completeAccountSelection(account, request, t);
      if (result.kind === "redirect") {
        showNotice(t("正在返回应用"));
        window.location.assign(result.redirectUrl);
        return;
      }

      showNotice(t("正在进入 Priestess 个人中心"));
      navigateTo(readLoginNext(), { replace: true });
    } catch (error) {
      const message = getAuthAccountChoiceErrorMessage(
        error,
        request ? t("授权失败，请重新选择账号") : t("切换账号失败，请重新选择账号"),
      );
      setAccountAuthorizeError(message);
      showNotice(message);
    } finally {
      setAuthorizingAccountId("");
      setDirectAuthorizeBusy(false);
    }
  };

  const removeAuthAccount = async(account: AuthAccountChoice) => {
    if (directAuthorizeBusy || removingAccountId) {
      return;
    }
    if (!account.userId) {
      const message = t("账号缺少用户标识，无法移除");
      setAccountAuthorizeError(message);
      showNotice(message);
      return;
    }

    const accountKey = getAccountKey(account);
    setAccountAuthorizeError("");
    setRemovingAccountId(accountKey);

    try {
      const result = await removeLocalAccountChoice(account.userId);
      showNotice(result.current ? t("当前账号已从此浏览器移除") : t("账号已从此浏览器移除"));
      accountChoices.refresh();
    } catch (error) {
      const message = getAuthAccountChoiceErrorMessage(error, t("登出账号失败，请稍后重试"));
      setAccountAuthorizeError(message);
      showNotice(message);
    } finally {
      setRemovingAccountId("");
    }
  };

  const openAuthAccountAction = async(account: AuthAccountChoice, action: AccountPickerAction) => {
    if (directAuthorizeBusy || removingAccountId || accountActionBusyId) {
      return;
    }
    if (!isAccountEditableInBrowser(account)) {
      const message = t("这个账号已在此浏览器登出，不能修改资料、密码或头像。");
      setAccountAuthorizeError(message);
      showNotice(message);
      return;
    }

    const accountKey = getAccountKey(account);
    setAccountAuthorizeError("");
    setAccountActionBusyId(accountKey);

    try {
      const session = await activateLocalAccountChoice(account.userId, {
        choiceId: account.authorizeChoiceId ?? undefined,
      });
      const target = resolveAccountManagementActionTarget(account, action, session);
      if (target.status !== "ready") {
        const message = t("当前账号状态已变化，请重新选择账号");
        setAccountAuthorizeError(message);
        showNotice(message);
        accountChoices.refresh();
        return;
      }

      // 编辑动作统一交给个人中心处理，避免登录授权页维护另一套资料/密码弹窗状态。
      navigateTo(target.path);
    } catch (error) {
      const message = getAuthAccountActivationErrorMessage(error, t);
      setAccountAuthorizeError(message);
      showNotice(message);
      accountChoices.refresh();
    } finally {
      setAccountActionBusyId("");
    }
  };

  const useAnotherAuthAccount = () => {
    clearAuthModeTransitionTimeout();
    setAccountAuthorizeError("");
    // 授权页先在居中的单卡片中完成账号卡→登录表单的大行程切换，
    // 等内容稳定后再沿用首屏节奏展开二维码，避免两条横向动画同时争抢视线。
    const shouldStageDesktopQr = hasQrRequest
      && !shouldReduceMotion
      && window.matchMedia("(min-width: 821px)").matches;
    setIsLoginIntroStage(shouldStageDesktopQr);
    setShowLoginFormForAccountPicker(true);
    setTotpChallenge(null);
    if (!shouldReduceMotion && window.matchMedia("(min-width: 821px)").matches) {
      setIsAuthModeTransitioning(true);
      authModeTransitionTimeoutRef.current = window.setTimeout(() => {
        setIsAuthModeTransitioning(false);
        authModeTransitionTimeoutRef.current = null;
      }, AUTH_MODE_TRANSITION_MS);
    }
    showNotice(t("请登录另一个 Priestess 账号"));
  };

  const returnToAuthAccountPicker = () => {
    // 返回只恢复账号选择态；应用授权参数和裸域的安全 next 路径都保持不变。
    if (isAuthModeTransitioning) return;
    clearAuthModeTransitionTimeout();
    setAccountAuthorizeError("");
    setTotpChallenge(null);

    const shouldDrawerSlideOutFirst = isQrDrawerOpen
      && !shouldReduceMotion
      && window.matchMedia("(min-width: 821px)").matches;
    if (shouldDrawerSlideOutFirst) {
      setIsAuthModeTransitioning(true);
      setIsRegisterDrawerStage(true);
      authModeLayoutTimeoutRef.current = window.setTimeout(() => {
        setShowLoginFormForAccountPicker(false);
        setIsRegisterDrawerStage(false);
        authModeLayoutTimeoutRef.current = null;
      }, AUTH_MODE_DRAWER_IN_MS);
      authModeTransitionTimeoutRef.current = window.setTimeout(() => {
        setIsAuthModeTransitioning(false);
        authModeTransitionTimeoutRef.current = null;
      }, AUTH_MODE_DRAWER_IN_MS + AUTH_MODE_TRANSITION_MS);
      return;
    }

    setShowLoginFormForAccountPicker(false);
  };

  const buildTotpChallenge = (session: LocalSession, fallbackUsername: string): TotpChallenge => {
    const username = session.user?.username || fallbackUsername;
    return {
      challengeId: session.challengeId,
      displayName: session.user?.displayName || username,
      username,
    };
  };

  const startCenteredLoginOverlay = async(params: Omit<LoginTransitionOverlayParams, "onClose" | "originRect">) => {
    await centerLoginCardForOverlay();
    const originRect = captureLoginCardOriginRect();
    const controller = startLoginTransitionOverlay({
      ...params,
      originRect,
      onClose: () => {
        loginTransitionOverlayRef.current = null;
      },
    });
    loginTransitionOverlayRef.current = controller;
    return controller;
  };

  const startBackendLoginTransition = async(credentials: LoginCredentials) => {
    if (authMode !== "login" || isAuthModeTransitioning || isLoginSubmitStage || isLocalLoginCooldownActive || loginTransitionOverlayRef.current !== null) {
      return;
    }

    const controller = await startCenteredLoginOverlay({
      loadingTitle: t("正在登录..."),
      organizationName: "Priestess",
      username: credentials.username,
      primaryColor: "#c65f72",
    });

    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;

    const finishPasswordLoginSession = async(session: LocalSession) => {
      resetLocalLoginFailureState();
      if (session.mfaRequired && session.challengeId) {
        setTotpChallenge(buildTotpChallenge(session, credentials.username));
        controller.dismiss();
        loginTransitionOverlayRef.current = null;
        releaseLoginSubmitStage();
        showNotice(t("请输入认证器里的 6 位验证码"));
        return;
      }

      await finishAuthenticatedLogin({
        controller,
        fallbackUsername: credentials.username,
        session,
        signal: abortController.signal,
      });
    };
    const runPasswordLogin = (nextCredentials: LocalLoginCredentials) => loginLocalSession(nextCredentials, { signal: abortController.signal });

    try {
      const session = await loginLocalSessionWithTurnstileRetry({
        credentials,
        login: runPasswordLogin,
        readSiteKey: readTurnstileSiteKey,
        requestChallenge: ({ action, description, siteKey, title }) => controller.challenge({
          challengeAction: action,
          challengeDescription: description,
          challengeSiteKey: siteKey,
          challengeTitle: title,
        }),
        signal: abortController.signal,
        t,
      });
      await finishPasswordLoginSession(session);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const errorCode = getPriestessApiErrorCode(error);
      const shouldTrackFailure = isLocalPasswordLoginRiskError(errorCode);
      const nextFailureCount = errorCode === "local_login_temporarily_locked"
        ? LOCAL_LOGIN_FAILURE_LIMIT
        : shouldTrackFailure
          ? Math.min(localLoginFailureCount + 1, LOCAL_LOGIN_FAILURE_LIMIT)
          : localLoginFailureCount;
      const shouldActivateCooldown = shouldTrackFailure && nextFailureCount >= LOCAL_LOGIN_FAILURE_LIMIT;
      const message = getPriestessApiErrorMessage(error, t("登录失败"));
      await controller.fail({
        description: message,
        durationMs: LOGIN_RESULT_ANIMATION_MS,
        postAnimationDelayMs: 0,
      });
      releaseLoginSubmitStage();
      if (shouldTrackFailure) {
        setLocalLoginFailureCount(nextFailureCount);
      }
      if (shouldActivateCooldown) {
        activateLocalLoginCooldown();
        showNotice(t("登录尝试过多，已暂时隐藏登录入口"));
      } else {
        showNotice(message);
      }
    } finally {
      if (loginAbortControllerRef.current === abortController) {
        loginAbortControllerRef.current = null;
      }
    }
  };

  const startPasskeyLogin = async() => {
    if (authMode !== "login" || isAuthModeTransitioning || isLoginSubmitStage || loginTransitionOverlayRef.current !== null) {
      return;
    }

    const controller = await startCenteredLoginOverlay({
      loadingTitle: t("正在验证 Passkey..."),
      organizationName: "Priestess",
      username: "Passkey",
      primaryColor: "#c65f72",
    });

    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;

    try {
      const options = await createLocalPasskeyAuthenticationOptions({ signal: abortController.signal });
      const response = await startAuthentication({
        optionsJSON: options.options as Parameters<typeof startAuthentication>[0]["optionsJSON"],
      });
      const session = await verifyLocalPasskeyAuthentication({
        challengeId: options.challengeId,
        response,
      }, { signal: abortController.signal });
      await finishAuthenticatedLogin({
        controller,
        fallbackUsername: session.user?.username || "Passkey",
        session,
        signal: abortController.signal,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const message = getPriestessApiErrorMessage(error, t("Passkey 登录失败"));
      await controller.fail({
        description: message,
        durationMs: LOGIN_RESULT_ANIMATION_MS,
        postAnimationDelayMs: 0,
      });
      releaseLoginSubmitStage();
      showNotice(message);
    } finally {
      if (loginAbortControllerRef.current === abortController) {
        loginAbortControllerRef.current = null;
      }
    }
  };

  const submitTotpLogin = async(code: string) => {
    const challenge = totpChallenge;
    if (!challenge || isLoginSubmitStage || loginTransitionOverlayRef.current !== null) {
      return;
    }

    const controller = await startCenteredLoginOverlay({
      loadingTitle: t("正在验证..."),
      organizationName: "Priestess",
      username: challenge.displayName || challenge.username,
      primaryColor: "#c65f72",
    });

    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;

    try {
      const session = await verifyLocalTotpLogin({ challengeId: challenge.challengeId, code }, { signal: abortController.signal });
      setTotpChallenge(null);
      await finishAuthenticatedLogin({
        controller,
        fallbackUsername: challenge.username,
        session,
        signal: abortController.signal,
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const message = getPriestessApiErrorMessage(error, t("二步验证失败"));
      await controller.fail({
        description: message,
        durationMs: LOGIN_RESULT_ANIMATION_MS,
        postAnimationDelayMs: 0,
      });
      releaseLoginSubmitStage();
      showNotice(message);
    } finally {
      if (loginAbortControllerRef.current === abortController) {
        loginAbortControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    const syncRoute = () => setRoute(getCurrentRoute());
    window.addEventListener("popstate", syncRoute);

    return () => {
      window.removeEventListener("popstate", syncRoute);
      clearAuthModeTransitionTimeout();
      clearLoginSubmitStageTimeout();
      loginAbortControllerRef.current?.abort();
      loginTransitionOverlayRef.current?.dismiss();
    };
  }, []);

  useEffect(() => {
    if (route !== "login") {
      releaseLoginSubmitStage();
    }

    if (route !== "login" && authMode !== "login") {
      clearAuthModeTransitionTimeout();
      setIsAuthModeTransitioning(false);
      setIsRegisterDrawerStage(false);
      setAuthMode("login");
    }
  }, [authMode, route]);

  useEffect(() => {
    if (localLoginCooldownUntil <= Date.now()) {
      if (localLoginCooldownUntil > 0) {
        resetLocalLoginFailureState();
      }
      return;
    }

    const cooldownTimer = window.setTimeout(() => {
      resetLocalLoginFailureState();
      showNotice(t("登录入口已恢复"));
    }, Math.max(localLoginCooldownUntil - Date.now(), 0));
    return () => window.clearTimeout(cooldownTimer);
  }, [localLoginCooldownUntil, t]);

  useEffect(() => {
    if (route !== "login" || authMode !== "login" || shouldReduceMotion) {
      setIsLoginIntroStage(false);
      return;
    }
    if (!isLoginIntroStage) return;

    // 首屏保留“卡片先到中间”的入场手感：先让登录卡片稳定出现，再放开右侧二维码抽屉。
    const introTimer = window.setTimeout(() => setIsLoginIntroStage(false), LOGIN_INTRO_QR_DELAY_MS);
    return () => window.clearTimeout(introTimer);
  }, [authMode, isLoginIntroStage, route, shouldReduceMotion]);

  useEffect(() => {
    if (route !== "login") return;

    const { hash, pathname, search } = window.location;
    const isLegacyLoginPath = matchesRoutePath(pathname, LEGACY_LOGIN_ROUTE_PATH);
    if (!isLegacyLoginPath && matchesRoutePath(pathname, LOGIN_ROUTE_PATH)) return;

    // 登录页的公开地址统一为 /login，旧 /auth-ui/login 和根路径只作为兼容入口。
    window.history.replaceState(null, "", `${LOGIN_ROUTE_PATH}${search}${hash}`);
  }, [route]);

  useEffect(() => {
    if (route !== "account") return;

    const canonicalPath = getCurrentAccountNextPath();
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (canonicalPath !== currentPath) {
      // 个人中心的规范公开入口是 /manage；旧路径只做无损兼容，避免不同入口产生不同登录回跳。
      window.history.replaceState(null, "", canonicalPath);
    }
  }, [route]);

  useEffect(() => {
    setAccountActionBusyId("");
    setAccountAuthorizeError("");
    setAuthorizingAccountId("");
    setRemovingAccountId("");
    setShowLoginFormForAccountPicker(false);
  }, [authRequestKey, route]);

  useEffect(() => {
    if (route === "qr-login") {
      document.title = t("Priestess 扫码确认");
      return;
    }
    if (route === "account") {
      document.title = t("Priestess 个人中心");
      return;
    }
    if (route === "not-found") {
      document.title = t("Priestess 404");
      return;
    }

    if (authMode === "register") {
      document.title = t("Priestess 注册");
      return;
    }
    if (authMode === "forgot-password") {
      document.title = t("Priestess 找回密码");
      return;
    }

    document.title = route === "reset-password" ? t("Priestess 重置密码") : t("Priestess 登录");
  }, [authMode, route, t]);

  // 入场节奏以页面加载为基准：先让壁纸稳定显示，再弹出表单和右侧二维码抽屉。
  // isLoginIntroStage 是特意保留的首屏状态，会让卡片短暂停在中间，后续维护不要把它当成抖动修掉。
  const isRegisterMode = authMode === "register";
  const isForgotPasswordMode = authMode === "forgot-password";
  const hasTotpChallenge = Boolean(totpChallenge);
  const shouldShowAccountPicker = shouldShowAuthAccountPicker({
    authMode,
    hasAuthRequest: hasQrRequest,
    hasTotpChallenge,
    showLoginFormForAccountPicker,
    standalone: !hasQrRequest,
    status: accountChoices.status,
  });
  // 首屏、提交态、二步验证和账号选择共用居中布局，避免确认阶段重新滑回二维码侧栏。
  const {
    authGridClassName,
    isLoginCenteredStage,
    isLoginSubmitCardStage,
    isQrDrawerOpen,
    isSoloAuthMode,
    shouldUseCenteredWallpaper,
  } = resolveLoginLayoutState({
    authMode,
    hasAuthRequest: hasQrRequest,
    hasTotpChallenge,
    isLoginIntroStage,
    isLoginRoute: route === "login",
    isLoginSubmitStage,
    isRegisterDrawerStage,
    shouldShowAccountPicker,
  });
  const authUiLocked = isAuthModeTransitioning || isLoginSubmitStage || directAuthorizeBusy || Boolean(removingAccountId || accountActionBusyId);
  const accountPickerError = accountAuthorizeError || accountChoices.error;
  const loginExperience = (
    <LoginExperience
      accountChoices={accountChoices}
      accountPickerError={accountPickerError}
      accountPickerMode={hasQrRequest ? "authorization" : "standalone"}
      authGridClassName={authGridClassName}
      authMode={authMode}
      authUiLocked={authUiLocked}
      authorizingAccountId={authorizingAccountId}
      directAuthorizeBusy={directAuthorizeBusy}
      forgotPasswordIdentity={forgotPasswordIdentity}
      hasQrRequest={hasQrRequest}
      isForgotPasswordMode={isForgotPasswordMode}
      isLocalLoginCooldownActive={isLocalLoginCooldownActive}
      isLoginSubmitCardStage={isLoginSubmitCardStage}
      isQrDrawerOpen={isQrDrawerOpen}
      isRegisterMode={isRegisterMode}
      isSoloAuthMode={isSoloAuthMode}
      loginCardRef={loginCardRef}
      mobileLoginReveal={mobileLoginReveal}
      onBackToLogin={() => switchAuthMode("login")}
      onChooseAuthAccount={chooseAuthAccount}
      onCreateAccount={() => switchAuthMode("register")}
      onForgotPassword={openForgotPassword}
      onPasskeyLogin={startPasskeyLogin}
      onOpenAuthAccountAction={openAuthAccountAction}
      onRegisterNotice={showNotice}
      onRemoveAuthAccount={removeAuthAccount}
      onRegistered={finishRegisteredSession}
      onReturnToAuthAccountPicker={returnToAuthAccountPicker}
      onTotpCancel={() => setTotpChallenge(null)}
      onTotpSubmit={submitTotpLogin}
      onUseAnotherAuthAccount={useAnotherAuthAccount}
      onValidLoginSubmit={startBackendLoginTransition}
      qrRefreshing={qrSession.refreshing}
      qrValue={qrSession.qrValue}
      qrVisualState={qrSession.visualState}
      removingAccountId={removingAccountId}
      shouldReduceMotion={shouldReduceMotion}
      shouldShowAccountPicker={shouldShowAccountPicker}
      shouldUseCenteredWallpaper={shouldUseCenteredWallpaper}
      showLoginFormForAccountPicker={showLoginFormForAccountPicker}
      t={t}
      totpChallenge={totpChallenge}
    />
  );

  return (
    <>
      {route === "account" ? (
        <AccountPage
          onNavigateToLogin={() => navigateTo(LOGIN_ROUTE_PATH)}
          onRequireLogin={() => navigateTo(buildLoginPathWithNext(getCurrentAccountNextPath()), { replace: true })}
          onNotice={showNotice}
        />
      ) : route === "qr-login" ? (
        <QrLoginConfirmPage
          onNavigateToLogin={() => navigateTo(LOGIN_ROUTE_PATH)}
          onNotice={showNotice}
        />
      ) : route === "reset-password" ? (
        <ResetPasswordPage
          onNavigateToLogin={() => navigateTo(LOGIN_ROUTE_PATH, { replace: true })}
          onNotice={showNotice}
        />
      ) : route === "not-found" ? (
        <NotFoundPage />
      ) : loginExperience}
      <Toast message={notice} />
    </>
  );
}
