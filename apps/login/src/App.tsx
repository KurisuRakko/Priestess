import { useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useReducedMotion } from "motion/react";
import {
  authorizeLocalSession,
  createLocalPasskeyAuthenticationOptions,
  createQrSession,
  getLocalSession,
  getQrSessionStatus,
  getPriestessApiErrorCode,
  getPriestessApiErrorMessage,
  loginLocalSession,
  Toast,
  usePriestessTranslation,
  type LocalSession,
  type QrSession,
  type QrSessionPollStatus,
  verifyLocalPasskeyAuthentication,
  verifyLocalTotpLogin,
} from "@priestess/shared";
import { getAccountKey } from "./components/AccountPickerCard";
import { AccountPage } from "./components/AccountPage";
import { LoginExperience } from "./components/LoginExperience";
import { type LoginCredentials } from "./components/LoginForm";
import { startLoginTransitionOverlay, type LoginTransitionOverlayController, type LoginTransitionOverlayParams } from "./components/LoginTransitionOverlay";
import { NotFoundPage } from "./components/NotFoundPage";
import { QrLoginConfirmPage } from "./components/QrLoginConfirmPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { buildAuthAccountAuthorizeParams, getAuthAccountAuthorizeBlocker, shouldShowAuthAccountPicker } from "./lib/accountAuthorization";
import { getAuthRequestKey, readAuthRequest, type AuthRequest } from "./lib/authRequest";
import {
  AUTH_MODE_DRAWER_IN_MS,
  AUTH_MODE_TRANSITION_MS,
  clearLocalLoginCooldownUntil,
  formatQrExpiresLabel,
  getQrStatusText,
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

type AuthMode = LoginLayoutAuthMode;

type TotpChallenge = {
  challengeId: string;
  displayName: string;
  username: string;
};

type QrRefreshOptions = {
  signal?: AbortSignal;
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
  const qrActiveSessionIdRef = useRef("");
  const qrCountdownRef = useRef<number | null>(null);
  const qrPollInFlightRef = useRef(false);
  const qrPollRef = useRef<number | null>(null);
  const qrRefreshIdRef = useRef(0);
  const [notice, setNotice] = useState("");
  const [accountAuthorizeError, setAccountAuthorizeError] = useState("");
  const [authorizingAccountId, setAuthorizingAccountId] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [directAuthorizeBusy, setDirectAuthorizeBusy] = useState(false);
  const [forgotPasswordIdentity, setForgotPasswordIdentity] = useState("");
  const [isAuthModeTransitioning, setIsAuthModeTransitioning] = useState(false);
  const [isLoginIntroStage, setIsLoginIntroStage] = useState(() => getCurrentRoute() === "login");
  const [isLoginSubmitStage, setIsLoginSubmitStage] = useState(false);
  const [isRegisterDrawerStage, setIsRegisterDrawerStage] = useState(false);
  const [qrError, setQrError] = useState("");
  const [qrExpiresIn, setQrExpiresIn] = useState(0);
  const [qrRefreshing, setQrRefreshing] = useState(false);
  const [qrSession, setQrSession] = useState<QrSession | null>(null);
  const [qrStatus, setQrStatus] = useState<QrSessionPollStatus["status"]>("pending");
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute());
  const [localLoginCooldownUntil, setLocalLoginCooldownUntil] = useState(readLocalLoginCooldownUntil);
  const [localLoginFailureCount, setLocalLoginFailureCount] = useState(0);
  const [showLoginFormForAuthRequest, setShowLoginFormForAuthRequest] = useState(false);
  const [totpChallenge, setTotpChallenge] = useState<TotpChallenge | null>(null);
  const authRequest = route === "login" ? readAuthRequest() : null;
  const authRequestKey = getAuthRequestKey(authRequest);
  const hasQrRequest = authRequest !== null;
  const isLocalLoginCooldownActive = route === "login" && authMode === "login" && localLoginCooldownUntil > Date.now();
  const accountChoices = useAuthAccountChoices({
    authRequest,
    enabled: route === "login" && authMode === "login" && hasQrRequest && !isLocalLoginCooldownActive,
  });
  const qrValue = qrSession?.qrUrl ?? "";

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 2600);
  };

  const captureLoginCardOriginRect = (): LoginTransitionOverlayParams["originRect"] => {
    const node = loginCardRef.current;
    if (!node || typeof window === "undefined") {
      return null;
    }

    const rect = node.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return null;
    }

    const computedStyle = window.getComputedStyle(node);
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      borderRadius: computedStyle.borderTopLeftRadius || "0px",
    };
  };

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
    setIsLoginIntroStage(false);
    setAuthMode(nextMode);
    const shouldDrawerSlideIn = nextMode !== "login" && authMode === "login" && !shouldReduceMotion;
    setIsRegisterDrawerStage(shouldDrawerSlideIn);

    if (shouldDrawerSlideIn) {
      authModeLayoutTimeoutRef.current = window.setTimeout(() => {
        setIsRegisterDrawerStage(false);
        authModeLayoutTimeoutRef.current = null;
      }, AUTH_MODE_DRAWER_IN_MS);
    }

    // 布局动画结束后才解锁按钮，避免双击时 QR 抽屉和卡片状态互相打架。
    const transitionMs = shouldReduceMotion ? 120 : AUTH_MODE_DRAWER_IN_MS + AUTH_MODE_TRANSITION_MS;
    authModeTransitionTimeoutRef.current = window.setTimeout(() => {
      setIsAuthModeTransitioning(false);
      authModeTransitionTimeoutRef.current = null;
    }, transitionMs);
  };

  const clearQrTimers = () => {
    qrActiveSessionIdRef.current = "";
    if (qrPollRef.current !== null) {
      window.clearInterval(qrPollRef.current);
      qrPollRef.current = null;
    }
    stopQrCountdown();
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
    clearQrTimers();
    clearAuthModeTransitionTimeout();
    releaseLoginSubmitStage();
    setIsAuthModeTransitioning(false);
    setIsLoginIntroStage(false);
    setIsRegisterDrawerStage(false);
    setShowLoginFormForAuthRequest(false);
    setAccountAuthorizeError("");
    setTotpChallenge(null);
    setLocalLoginFailureCount(LOCAL_LOGIN_FAILURE_LIMIT);
    setLocalLoginCooldownUntil(cooldownUntil);
  };

  const stopQrCountdown = () => {
    if (qrCountdownRef.current !== null) {
      window.clearInterval(qrCountdownRef.current);
      qrCountdownRef.current = null;
    }
  };

  const startQrCountdown = (initialSeconds: number) => {
    stopQrCountdown();
    setQrExpiresIn(initialSeconds);
    qrCountdownRef.current = window.setInterval(() => {
      setQrExpiresIn((current) => {
        const next = Math.max(current - 1, 0);
        if (next === 0) {
          clearQrTimers();
          setQrStatus((currentStatus) => currentStatus === "confirmed" ? currentStatus : "expired");
        }
        return next;
      });
    }, 1000);
  };

  const handleQrStatus = (status: QrSessionPollStatus) => {
    setQrError("");
    setQrStatus(status.status);
    if (status.status === "pending") {
      setQrExpiresIn(status.expiresIn);
      return;
    }
    if (status.status === "scanned" || status.status === "pre_confirmed") {
      // 手机端已经接管确认流程，PC 端继续轮询结果，但不再把二维码表现成可继续扫描的倒计时态。
      stopQrCountdown();
      return;
    }
    if (status.status === "confirmed") {
      clearQrTimers();
      if (status.redirectUrl) {
        window.setTimeout(() => window.location.assign(status.redirectUrl), 650);
      }
      return;
    }
    if (status.status === "rejected" || status.status === "expired") {
      stopQrCountdown();
      clearQrTimers();
    }
  };

  const startQrPolling = (sessionId: string) => {
    qrActiveSessionIdRef.current = sessionId;
    qrPollRef.current = window.setInterval(() => {
      if (qrPollInFlightRef.current || qrActiveSessionIdRef.current !== sessionId) {
        return;
      }
      qrPollInFlightRef.current = true;
      void getQrSessionStatus(sessionId)
        .then((status) => {
          if (qrActiveSessionIdRef.current === sessionId) {
            handleQrStatus(status);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          qrPollInFlightRef.current = false;
        });
    }, 1500);
  };

  const refreshQrSession = async(request: AuthRequest | null = readAuthRequest(), options: QrRefreshOptions = {}) => {
    const refreshId = qrRefreshIdRef.current + 1;
    qrRefreshIdRef.current = refreshId;
    clearQrTimers();
    if (options.signal?.aborted) {
      return false;
    }
    setQrError("");
    setQrRefreshing(true);
    setQrStatus("pending");

    if (!request) {
      setQrSession(null);
      setQrExpiresIn(0);
      setQrRefreshing(false);
      return false;
    }

    try {
      const created = await createQrSession(request, { signal: options.signal });
      if (options.signal?.aborted || qrRefreshIdRef.current !== refreshId) {
        return false;
      }
      if (!created.qrUrl || !created.sessionId) {
        throw new Error(t("后端未返回二维码会话"));
      }
      setQrSession(created);
      setQrExpiresIn(created.expiresIn);
      startQrCountdown(created.expiresIn);
      startQrPolling(created.sessionId);
      return true;
    } catch (error) {
      if (options.signal?.aborted || qrRefreshIdRef.current !== refreshId) {
        return false;
      }
      // 二维码来自后端会话；失败时宁可展示空态，也不要生成可被误扫的本地假 scheme。
      setQrSession(null);
      setQrExpiresIn(0);
      setQrError(getPriestessApiErrorMessage(error, t("二维码暂时不可用")));
      return false;
    } finally {
      if (!options.signal?.aborted && qrRefreshIdRef.current === refreshId) {
        setQrRefreshing(false);
      }
    }
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

    if (request) {
      // 应用授权入口必须让用户显式选择账号；登录成功只刷新候选列表，不再自动回跳。
      releaseLoginSubmitStage();
      setShowLoginFormForAuthRequest(false);
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

    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;
    try {
      if (readAuthRequest()) {
        setShowLoginFormForAuthRequest(false);
        setAccountAuthorizeError("");
        accountChoices.refresh();
        showNotice(t("注册成功，请选择要继续使用的账号"));
        return;
      }

      showNotice(t("注册成功"));
      navigateTo(readLoginNext(), { replace: true });
    } finally {
      if (loginAbortControllerRef.current === abortController) {
        loginAbortControllerRef.current = null;
      }
    }
  };

  const chooseAuthAccount = async(account: AuthAccountChoice) => {
    const request = readAuthRequest();
    if (!request || directAuthorizeBusy) {
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
      const result = await authorizeLocalSession(buildAuthAccountAuthorizeParams(request, account));
      if (!result.redirectUrl) {
        throw new Error(t("后端未返回回跳地址"));
      }

      showNotice(t("正在返回应用"));
      window.location.assign(result.redirectUrl);
    } catch (error) {
      const message = getAuthAccountChoiceErrorMessage(error, t("授权失败，请重新选择账号"));
      setAccountAuthorizeError(message);
      showNotice(message);
    } finally {
      setAuthorizingAccountId("");
      setDirectAuthorizeBusy(false);
    }
  };

  const useAnotherAuthAccount = () => {
    setAccountAuthorizeError("");
    setShowLoginFormForAuthRequest(true);
    setTotpChallenge(null);
    showNotice(t("请登录另一个 Priestess 账号"));
  };

  const returnToAuthAccountPicker = () => {
    // 授权入口添加账号时，返回只恢复账号选择态，不改动当前 app_id/return_to 请求。
    setAccountAuthorizeError("");
    setShowLoginFormForAuthRequest(false);
    setTotpChallenge(null);
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

    try {
      const session = await loginLocalSession(credentials, { signal: abortController.signal });
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
      clearQrTimers();
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
    if (route !== "login" || hasQrRequest || authMode !== "login" || isLocalLoginCooldownActive) {
      return;
    }

    const abortController = new AbortController();
    void getLocalSession({ signal: abortController.signal })
      .then((session) => {
        if (!abortController.signal.aborted && session.authenticated && session.user) {
          navigateTo(readLoginNext(), { replace: true });
        }
      })
      .catch(() => undefined);
    return () => abortController.abort();
  }, [authMode, hasQrRequest, isLocalLoginCooldownActive, route]);

  useEffect(() => {
    if (route !== "login" || authMode !== "login" || isLocalLoginCooldownActive) {
      clearQrTimers();
      return;
    }

    const abortController = new AbortController();
    void refreshQrSession(readAuthRequest(), { signal: abortController.signal });
    return () => {
      abortController.abort();
      clearQrTimers();
    };
  }, [authMode, authRequestKey, isLocalLoginCooldownActive, route]);

  useEffect(() => {
    setAccountAuthorizeError("");
    setAuthorizingAccountId("");
    setShowLoginFormForAuthRequest(false);
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
    showLoginFormForAuthRequest,
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
  const authUiLocked = isAuthModeTransitioning || isLoginSubmitStage || directAuthorizeBusy;
  const qrStatusText = hasQrRequest ? getQrStatusText(qrStatus, qrError, t) : t("等待应用发起登录");
  const qrRefreshLabel = hasQrRequest ? t("刷新二维码") : t("等待应用");
  const qrVisualState = qrError
    ? "error"
    : qrStatus === "scanned" || qrStatus === "pre_confirmed"
      ? "scanned"
      : qrStatus === "confirmed"
        ? "confirmed"
        : qrStatus === "expired" || qrStatus === "rejected"
          ? "terminal"
          : "pending";
  const qrExpiresLabel = qrVisualState === "pending"
    ? qrSession ? formatQrExpiresLabel(qrExpiresIn) : "--:--"
    : qrVisualState === "scanned"
      ? t("待确认")
      : qrVisualState === "confirmed"
        ? t("已确认")
        : qrStatus === "rejected"
          ? t("已拒绝")
          : qrStatus === "expired"
          ? t("已过期")
            : t("异常");
  const accountPickerError = accountAuthorizeError || accountChoices.error;
  const refreshQrFromPanel = () => {
    if (isAuthModeTransitioning || authMode !== "login" || !hasQrRequest) {
      return;
    }
    void refreshQrSession(readAuthRequest()).then((refreshed) => showNotice(refreshed ? t("二维码已刷新") : t("二维码暂时不可用")));
  };

  const loginExperience = (
    <LoginExperience
      accountChoices={accountChoices}
      accountPickerError={accountPickerError}
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
      onBackToLogin={() => switchAuthMode("login")}
      onChooseAuthAccount={chooseAuthAccount}
      onCreateAccount={() => switchAuthMode("register")}
      onForgotPassword={openForgotPassword}
      onPasskeyLogin={startPasskeyLogin}
      onQrRefresh={refreshQrFromPanel}
      onRegisterNotice={showNotice}
      onRegistered={finishRegisteredSession}
      onReturnToAuthAccountPicker={returnToAuthAccountPicker}
      onTotpCancel={() => setTotpChallenge(null)}
      onTotpSubmit={submitTotpLogin}
      onUseAnotherAuthAccount={useAnotherAuthAccount}
      onValidLoginSubmit={startBackendLoginTransition}
      qrExpiresLabel={qrExpiresLabel}
      qrRefreshDisabled={isAuthModeTransitioning || !hasQrRequest}
      qrRefreshLabel={qrRefreshLabel}
      qrRefreshing={qrRefreshing}
      qrStatusText={qrStatusText}
      qrValue={qrValue}
      qrVisualState={qrVisualState}
      shouldReduceMotion={shouldReduceMotion}
      shouldShowAccountPicker={shouldShowAccountPicker}
      shouldUseCenteredWallpaper={shouldUseCenteredWallpaper}
      showLoginFormForAuthRequest={showLoginFormForAuthRequest}
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
