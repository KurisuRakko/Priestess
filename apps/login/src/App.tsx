import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import {
  activateLocalAccountChoice,
  createLocalPasskeyAuthenticationOptions,
  getPriestessApiErrorCode,
  getPriestessApiErrorMessage,
  loginLocalSession,
  listLocalDeviceSessions,
  removeLocalAccountChoice,
  Toast,
  usePriestessTranslation,
  type LocalLoginCredentials,
  type LocalSession,
  verifyLocalPasskeyAuthentication,
  verifyLocalTotpLogin,
} from "@priestess/shared";
import { getAccountKey, type AccountPickerAction } from "./components/AccountPickerCard";
import { AccountRouteStage } from "./components/AccountRouteStage";
import { LoginExperience } from "./components/LoginExperience";
import { QrLoginConfirmPage, ResetPasswordPage, type TotpChallenge } from "./components/lazyRouteModules";
import { type LoginCredentials } from "./components/LoginForm";
import { type LoginTransitionOverlayController } from "./components/LoginTransitionOverlay";
import { NotFoundPage } from "./components/NotFoundPage";
import { useLoginOverlayStage } from "./components/useLoginOverlayStage";
import { useQrLoginCompletion } from "./components/useQrLoginCompletion";
import { getAuthAccountAuthorizeBlocker, shouldShowAuthAccountPicker } from "./lib/accountAuthorization";
import { completeAccountSelection, getAuthAccountActivationErrorMessage } from "./lib/accountSelection";
import type { LoginIdentityMotionSource } from "./components/loginIdentityMotion";
import { isAccountEditableInBrowser, resolveAccountManagementActionTarget } from "./lib/accountManagementAction";
import { getAuthRequestKey, readAuthRequest, type AuthRequest } from "./lib/authRequest";
import { loginLocalSessionWithTurnstileRetry } from "./lib/localLoginTurnstileRetry";
import {
  AUTH_MODE_DRAWER_IN_MS,
  AUTH_MODE_TRANSITION_MS,
  clearLocalLoginCooldownUntil,
  isLocalPasswordLoginRiskError,
  LOCAL_LOGIN_COOLDOWN_MS,
  LOCAL_LOGIN_FAILURE_LIMIT,
  LOGIN_FAILURE_HOLD_MS,
  LOGIN_RESULT_ANIMATION_MS,
  LOGIN_SUCCESS_HOLD_MS,
  LOGIN_SUCCESS_HOLD_REDUCED_MS,
  readLocalLoginCooldownUntil,
  writeLocalLoginCooldownUntil,
} from "./lib/loginAppState";
import { buildLoginPathWithNext, getCurrentAccountNextPath, readLoginNext } from "./lib/loginNext";
import { resolveLoginLayoutState, type LoginLayoutAuthMode } from "./lib/loginLayoutState";
import { getCurrentRoute, LOGIN_ROUTE_PATH, type AppRoute } from "./lib/routes";
import { settleAsync } from "./lib/settleAsync";
import { getAuthAccountChoiceErrorMessage, type AuthAccountChoice, useAuthAccountChoices } from "./lib/useAuthAccountChoices";
import { useMobileLoginReveal } from "./lib/useMobileLoginReveal";
import { useAccountRouteHandoff } from "./lib/useAccountRouteHandoff";
import { useLoginRoutePresentation } from "./lib/useLoginRoutePresentation";
import { useQrLoginSession } from "./lib/useQrLoginSession";
import { readTurnstileSiteKey } from "./components/TurnstileWidget";

type AuthMode = LoginLayoutAuthMode;

const DESKTOP_LOGIN_VIEWPORT_MIN_WIDTH = 821;

function attachDesktopSessionReference(controller: LoginTransitionOverlayController) {
  if (typeof window === "undefined" || window.innerWidth < DESKTOP_LOGIN_VIEWPORT_MIN_WIDTH) {
    return;
  }

  // 会话编号只用于成功卡片的诊断提示；请求异步进行，不阻塞身份揭示、交接或成功停留。
  void listLocalDeviceSessions({ forceRefresh: true })
    .then((sessions) => {
      controller.setSessionReference(sessions.find((session) => session.current)?.sessionId || null);
    })
    .catch(() => {
      // 设备接口不可用时仍保留稳定的成功卡片布局，不把辅助信息升级成登录错误。
      controller.setSessionReference(null);
    });
}

export function App() {
  const { t } = usePriestessTranslation("login");
  const shouldReduceMotion = useReducedMotion();
  const loginCardRef = useRef<HTMLDivElement | null>(null);
  const loginTransitionOverlayRef = useRef<LoginTransitionOverlayController | null>(null);
  // 同步重入锁：React state 在同一 tick 内两次调用读到旧值，overlay ref 又要等异步挂载才赋值，
  // 两者之间存在的真空会让快速双击起两个 overlay，锁本身不受闭包状态影响。
  const loginSubmitInFlightRef = useRef(false);
  const loginAbortControllerRef = useRef<AbortController | null>(null);
  const authModeLayoutTimeoutRef = useRef<number | null>(null);
  const authModeTransitionTimeoutRef = useRef<number | null>(null);
  const [notice, setNotice] = useState("");
  const [accountActionBusyId, setAccountActionBusyId] = useState("");
  const [accountAuthorizeError, setAccountAuthorizeError] = useState("");
  const [authorizingAccountId, setAuthorizingAccountId] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [directAuthorizeBusy, setDirectAuthorizeBusy] = useState(false);
  const [forgotPasswordIdentity, setForgotPasswordIdentity] = useState("");
  const [isAuthModeTransitioning, setIsAuthModeTransitioning] = useState(false);
  const [isLoginIntroStage, setIsLoginIntroStage] = useState(() => getCurrentRoute() === "login");
  const [isRegisterDrawerStage, setIsRegisterDrawerStage] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute());
  const [localLoginCooldownUntil, setLocalLoginCooldownUntil] = useState(readLocalLoginCooldownUntil);
  const [localLoginFailureCount, setLocalLoginFailureCount] = useState(0);
  const [removingAccountId, setRemovingAccountId] = useState("");
  const [showLoginFormForAccountPicker, setShowLoginFormForAccountPicker] = useState(false);
  const [totpChallenge, setTotpChallenge] = useState<TotpChallenge | null>(null);
  const {
    cancelSubmitStageWait: cancelLoginSubmitStageWait,
    isAccountSelectionStage,
    isSubmitContentHidden,
    isSubmitStage: isLoginSubmitStage,
    releaseSubmitStage: releaseLoginSubmitStage,
    revealSubmitContent: revealLoginSubmitContent,
    startAccountSelectionOverlay,
    startCenteredOverlay: startCenteredLoginOverlay,
  } = useLoginOverlayStage({
    loginCardRef,
    loginTransitionOverlayRef,
    setLoginIntroStage: setIsLoginIntroStage,
  });
  const authRequest = route === "login" ? readAuthRequest() : null;
  const authRequestKey = getAuthRequestKey(authRequest);
  const hasQrRequest = authRequest !== null;
  const isLocalLoginCooldownActive = route === "login" && authMode === "login" && localLoginCooldownUntil > Date.now();
  const accountChoices = useAuthAccountChoices({
    active: route === "login" && authMode === "login",
    authRequest,
    enabled: route === "login" && !isLocalLoginCooldownActive,
    standalone: !hasQrRequest,
  });
  const mobileLoginReveal = useMobileLoginReveal({
    accountChoicesStatus: accountChoices.status,
    enabled: route === "login",
    hasAuthRequest: hasQrRequest,
    prefersReducedMotion: Boolean(shouldReduceMotion),
  });
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
  const isAccountChoiceInitialDataReady = ["empty", "error", "ready"].includes(accountChoices.status);
  const shouldPrepareQr = route === "login"
    && authMode === "login"
    && hasQrRequest
    && isAccountChoiceInitialDataReady
    && !hasTotpChallenge
    && !isLocalLoginCooldownActive
    && !isLoginSubmitStage
    && !mobileLoginReveal.isMobileViewport
    && !shouldShowAccountPicker;
  const qrSession = useQrLoginSession({
    active: shouldPrepareQr,
    enabled: route === "login" && hasQrRequest && !isLocalLoginCooldownActive && !mobileLoginReveal.isMobileViewport,
    request: authRequest,
    requestKey: authRequestKey,
    t,
  });
  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 2600);
  }, []);
  const navigateTo = useCallback((path: string, options: { replace?: boolean } = {}) => {
    if (options.replace) {
      window.history.replaceState(null, "", path);
    } else {
      window.history.pushState(null, "", path);
    }
    setRoute(getCurrentRoute());
  }, []);
  const accountRouteHandoff = useAccountRouteHandoff({
    commitDestination: (path) => navigateTo(path, { replace: true }),
    loadErrorMessage: t("个人中心加载失败，请重试。"),
    prefersReducedMotion: Boolean(shouldReduceMotion),
    timeoutErrorMessage: t("个人中心准备超时，请重试。"),
  });
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

  const resetLocalLoginFailureState = useCallback(() => {
    setLocalLoginFailureCount(0);
    setLocalLoginCooldownUntil(0);
    clearLocalLoginCooldownUntil();
  }, []);
  const completeLoginIntro = useCallback(() => setIsLoginIntroStage(false), []);
  useLoginRoutePresentation({
    authMode,
    isLoginIntroStage,
    localLoginCooldownUntil,
    onCooldownExpired: resetLocalLoginFailureState,
    onLoginIntroComplete: completeLoginIntro,
    onNotice: showNotice,
    route,
    shouldReduceMotion: Boolean(shouldReduceMotion),
    t,
  });

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
    let destinationPrepared = false;
    let destinationCommitted = false;
    const standaloneHandoff = request
      ? null
      : accountRouteHandoff.beginForSession(params.session, readLoginNext());
    attachDesktopSessionReference(params.controller);
    const prepareDestination = async() => {
      if (destinationPrepared || params.signal.aborted) return;
      destinationPrepared = true;
      if (request) {
        // 身份揭示完成后立刻在遮罩后刷新账号列表，把 1.6 秒确认停留用于准备下一屏。
        setShowLoginFormForAccountPicker(false);
        setAccountAuthorizeError("");
        accountChoices.refresh();
        return;
      }
      destinationCommitted = await standaloneHandoff?.complete() ?? false;
      if (destinationCommitted) {
        showNotice(t("登录成功"));
      }
      return destinationCommitted;
    };

    await params.controller.succeed({
      avatarUrl: params.session.user?.avatarUrl || "",
      continuationAfterHold: !request,
      // 不再在 continuation 时切换文案：hold 缩到 400ms 后，新文案淡入 260ms 就跟着整块内容淡出，
      // 从未达到不透明就开始消失只剩抖动；空串会让文案回落成 titleText，保持同一句标题。
      continuationTitle: "",
      durationMs: LOGIN_RESULT_ANIMATION_MS,
      onVisualComplete: prepareDestination,
      postAnimationDelayMs: shouldReduceMotion ? LOGIN_SUCCESS_HOLD_REDUCED_MS : LOGIN_SUCCESS_HOLD_MS,
      title: t("已成功登录"),
      username: displayName,
    });

    if (params.signal.aborted) {
      return;
    }
    prepareDestination();

    if (request) {
      releaseLoginSubmitStage();
      showNotice(t("已添加账号，请选择要继续使用的账号"));
    } else if (!destinationCommitted) {
      releaseLoginSubmitStage();
    }
  };

  const finishRegisteredSession = async(session: LocalSession, fallbackIdentity: string) => {
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

    const handoff = accountRouteHandoff.beginForSession(session, readLoginNext());
    const controller = await startCenteredLoginOverlay({
      identityReveal: true,
      loadingTitle: t("正在准备你的账号…"),
      primaryColor: "#c65f72",
    });
    attachDesktopSessionReference(controller);
    let destinationCommitted = false;
    await controller.succeed({
      avatarUrl: session.user?.avatarUrl || "",
      continuationAfterHold: true,
      // 与密码登录一致：hold 缩到 400ms 后，新文案淡入 260ms 就跟着整块内容淡出，
      // 从未达到不透明就开始消失只会抖动；留空回落成 titleText，保持同一句标题。
      continuationTitle: "",
      durationMs: LOGIN_RESULT_ANIMATION_MS,
      onVisualComplete: async() => {
        destinationCommitted = await handoff?.complete() ?? false;
        // 交接已提交目标路由并由账号页接管退场，回传 true 让 overlay 跳过空转的 fadeOut。
        return destinationCommitted;
      },
      postAnimationDelayMs: shouldReduceMotion ? LOGIN_SUCCESS_HOLD_REDUCED_MS : LOGIN_SUCCESS_HOLD_MS,
      title: t("已成功登录"),
      username: session.user?.displayName || session.user?.username || fallbackIdentity,
    });
    if (destinationCommitted) {
      showNotice(t("注册成功"));
    } else {
      releaseLoginSubmitStage();
    }
  };

  const runLoginFailureTransition = async(controller: LoginTransitionOverlayController, message: string) => {
    await controller.fail({
      // 结果层与登录卡片共用同一块矩形且没有自己的背景，停留期间表单必须继续让位；
      // continuationAfterHold 把 onVisualComplete 推迟到停留结束、退场开始的同一帧，
      // 与停留期并行提前释放正是本缺陷的根因。
      continuationAfterHold: true,
      description: message,
      durationMs: LOGIN_RESULT_ANIMATION_MS,
      // 只解除内容隐藏：提交态类名仍在，表单沿 180ms 过渡淡回，与结果层退场交叉。
      onVisualComplete: revealLoginSubmitContent,
      postAnimationDelayMs: LOGIN_FAILURE_HOLD_MS,
    });
    // fail() 在结果层卸载后才落地，此刻才解除居中布局与交互锁。
    releaseLoginSubmitStage();
  };

  const chooseAuthAccount = async(
    account: AuthAccountChoice,
    identitySource: LoginIdentityMotionSource | null,
  ) => {
    const request = readAuthRequest();
    if (directAuthorizeBusy || removingAccountId || loginTransitionOverlayRef.current !== null) {
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

    const controllerPromise = startAccountSelectionOverlay({
      avatarUrl: account.avatarUrl,
      identityMotionSource: identitySource,
      identityReveal: true,
      loadingTitle: request ? t("正在确认授权…") : t("正在准备你的账号…"),
      primaryColor: "#c65f72",
    });
    const selectionResultPromise = settleAsync(completeAccountSelection(account, request, t));

    try {
      const controller = await controllerPromise;
      const selectionResult = await selectionResultPromise;
      if (!selectionResult.ok) {
        throw selectionResult.error;
      }
      const result = selectionResult.value;
      const sessionUser = result.kind === "manage" ? result.session.user : null;
      const displayName = sessionUser?.displayName
        || sessionUser?.username
        || account.displayName
        || account.username
        || account.email;
      let destinationPrepared = false;
      let destinationCommitted = false;
      const standaloneHandoff = result.kind === "manage"
        ? accountRouteHandoff.beginForSession(result.session, readLoginNext())
        : null;
      if (result.kind === "manage") {
        attachDesktopSessionReference(controller);
      }
      const prepareDestination = async() => {
        if (destinationPrepared || result.kind !== "manage") return;
        destinationPrepared = true;
        destinationCommitted = await standaloneHandoff?.complete() ?? false;
        if (destinationCommitted) {
          showNotice(t("正在进入 Priestess 个人中心"));
        }
        // 仅 manage 分支回传提交结果；redirect 分支没有交接，保持 undefined 让 overlay 正常淡出。
        return destinationCommitted;
      };

      await controller.succeed({
        avatarUrl: sessionUser?.avatarUrl || account.avatarUrl,
        continuationAfterHold: result.kind === "manage",
        // redirect 分支没有持有阶段；manage 分支的持有期也只够揭示姓名，
        // 中途切文案只会闪一下，统一留空回落成标题。
        continuationTitle: "",
        durationMs: LOGIN_RESULT_ANIMATION_MS,
        onVisualComplete: prepareDestination,
        postAnimationDelayMs: shouldReduceMotion ? LOGIN_SUCCESS_HOLD_REDUCED_MS : LOGIN_SUCCESS_HOLD_MS,
        title: t("已成功登录"),
        username: displayName,
      });

      if (result.kind === "redirect") {
        showNotice(t("正在返回应用"));
        window.location.assign(result.redirectUrl);
        return;
      }
      prepareDestination();
      if (!destinationCommitted) {
        releaseLoginSubmitStage();
      }
    } catch (error) {
      const message = getAuthAccountChoiceErrorMessage(
        error,
        request ? t("授权失败，请重新选择账号") : t("切换账号失败，请重新选择账号"),
      );
      setAccountAuthorizeError(message);
      const controller = await controllerPromise;
      // 失败态开始时先恢复账号卡布局；忙碌行仍隐藏源头像，直到共享头像回收完成。
      releaseLoginSubmitStage();
      await controller.fail({
        description: message,
        durationMs: LOGIN_RESULT_ANIMATION_MS,
        onVisualComplete: releaseLoginSubmitStage,
        postAnimationDelayMs: LOGIN_FAILURE_HOLD_MS,
      });
      releaseLoginSubmitStage();
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

  const openAuthAccountAction = async(
    account: AuthAccountChoice,
    action: AccountPickerAction,
    identitySource: LoginIdentityMotionSource | null,
  ) => {
    if (directAuthorizeBusy || removingAccountId || accountActionBusyId || loginTransitionOverlayRef.current !== null) {
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
    const controllerPromise = startCenteredLoginOverlay({
      avatarUrl: account.avatarUrl,
      identityMotionSource: identitySource,
      identityReveal: true,
      loadingTitle: t("正在准备你的账号…"),
      primaryColor: "#c65f72",
    });
    const activationPromise = settleAsync(activateLocalAccountChoice(account.userId, {
      choiceId: account.authorizeChoiceId ?? undefined,
    }));

    try {
      const controller = await controllerPromise;
      const activation = await activationPromise;
      if (!activation.ok) throw activation.error;
      const session = activation.value;
      const target = resolveAccountManagementActionTarget(account, action, session);
      if (target.status !== "ready") {
        throw new Error(t("当前账号状态已变化，请重新选择账号"));
      }

      const handoff = accountRouteHandoff.beginForSession(session, target.path);
      let destinationCommitted = false;
      attachDesktopSessionReference(controller);
      await controller.succeed({
        avatarUrl: session.user?.avatarUrl || account.avatarUrl,
        continuationAfterHold: true,
        // 账号资料/密码/头像动作的持有期同样只剩 400ms，切文案只会抖动，留空回落成标题。
        continuationTitle: "",
        durationMs: LOGIN_RESULT_ANIMATION_MS,
        onVisualComplete: async() => {
          destinationCommitted = await handoff?.complete() ?? false;
          // 目标页已接管退场，回传 true 让 overlay 跳过空转的 fadeOut。
          return destinationCommitted;
        },
        postAnimationDelayMs: shouldReduceMotion ? LOGIN_SUCCESS_HOLD_REDUCED_MS : LOGIN_SUCCESS_HOLD_MS,
        title: t("已成功登录"),
        username: session.user?.displayName || session.user?.username || account.displayName || account.username,
      });
      if (!destinationCommitted) {
        releaseLoginSubmitStage();
      }
    } catch (error) {
      const message = error instanceof Error && error.message === t("当前账号状态已变化，请重新选择账号")
        ? error.message
        : getAuthAccountActivationErrorMessage(error, t);
      setAccountAuthorizeError(message);
      const controller = await controllerPromise;
      await runLoginFailureTransition(controller, message);
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

  const startBackendLoginTransition = async(credentials: LoginCredentials) => {
    if (loginSubmitInFlightRef.current) {
      return;
    }
    if (authMode !== "login" || isAuthModeTransitioning || isLoginSubmitStage || isLocalLoginCooldownActive || loginTransitionOverlayRef.current !== null) {
      return;
    }
    loginSubmitInFlightRef.current = true;

    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;
    const controllerPromise = startCenteredLoginOverlay({
      identityReveal: true,
      loadingTitle: t("正在尝试为你登录…"),
      primaryColor: "#c65f72",
    });
    const runPasswordLogin = (nextCredentials: LocalLoginCredentials) => loginLocalSession(nextCredentials, { signal: abortController.signal });
    // 网络请求与卡片归位同时开始；若后端要求 Turnstile，再等待状态层准备好后切换挑战。
    const loginResultPromise = settleAsync(loginLocalSessionWithTurnstileRetry({
      credentials,
      login: runPasswordLogin,
      readSiteKey: readTurnstileSiteKey,
      requestChallenge: async({ action, description, siteKey, title }) => (
        (await controllerPromise).challenge({
          challengeAction: action,
          challengeDescription: description,
          challengeSiteKey: siteKey,
          challengeTitle: title,
        })
      ),
      signal: abortController.signal,
      t,
    }));
    // 结果层挂载失败会绕过下方 finally，必须在此释放重入锁，否则登录入口会永久失效。
    const controller = await controllerPromise.catch((error: unknown) => {
      loginSubmitInFlightRef.current = false;
      throw error;
    });

    const finishPasswordLoginSession = async(session: LocalSession) => {
      resetLocalLoginFailureState();
      if (session.mfaRequired && session.challengeId) {
        const nextChallenge = buildTotpChallenge(session, credentials.username);
        let handoffPrepared = false;
        const prepareTotpHandoff = () => {
          if (handoffPrepared) return;
          handoffPrepared = true;
          setTotpChallenge(nextChallenge);
          releaseLoginSubmitStage();
          showNotice(t("请输入认证器里的 6 位验证码"));
        };
        await controller.handoff({
          description: t("请输入认证器里的 6 位验证码"),
          durationMs: 900,
          onVisualComplete: prepareTotpHandoff,
          postAnimationDelayMs: 220,
          title: t("还需要一步"),
        });
        prepareTotpHandoff();
        return;
      }

      await finishAuthenticatedLogin({
        controller,
        fallbackUsername: credentials.username,
        session,
        signal: abortController.signal,
      });
    };
    try {
      const loginResult = await loginResultPromise;
      if (!loginResult.ok) {
        throw loginResult.error;
      }
      await finishPasswordLoginSession(loginResult.value);
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
      await runLoginFailureTransition(controller, message);
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
      loginSubmitInFlightRef.current = false;
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
      identityReveal: true,
      loadingTitle: t("正在尝试为你登录…"),
      primaryColor: "#c65f72",
    });

    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;

    try {
      // Passkey 只在用户主动使用时加载，普通密码登录无需解析 WebAuthn 客户端。
      const { startAuthentication } = await import("@simplewebauthn/browser");
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
      await runLoginFailureTransition(controller, message);
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

    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;
    const controllerPromise = startCenteredLoginOverlay({
      identityReveal: true,
      loadingTitle: t("正在尝试为你登录…"),
      primaryColor: "#c65f72",
    });
    // TOTP 校验同样与卡片归位并行，状态层仍负责保证用户能看清验证与成功两个阶段。
    const verificationResultPromise = settleAsync(
      verifyLocalTotpLogin({ challengeId: challenge.challengeId, code }, { signal: abortController.signal }),
    );
    const controller = await controllerPromise;

    try {
      const verificationResult = await verificationResultPromise;
      if (!verificationResult.ok) {
        throw verificationResult.error;
      }
      const session = verificationResult.value;
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
      await runLoginFailureTransition(controller, message);
      showNotice(message);
    } finally {
      if (loginAbortControllerRef.current === abortController) {
        loginAbortControllerRef.current = null;
      }
    }
  };

  useQrLoginCompletion({
    active: route === "login",
    confirmedRedirectUrl: qrSession.confirmedRedirectUrl,
    startOverlay: startCenteredLoginOverlay,
    t,
  });

  useEffect(() => {
    const syncRoute = () => {
      const nextRoute = getCurrentRoute();
      if (nextRoute !== "account") {
        accountRouteHandoff.reset();
      }
      setRoute(nextRoute);
    };
    window.addEventListener("popstate", syncRoute);

    return () => {
      window.removeEventListener("popstate", syncRoute);
      clearAuthModeTransitionTimeout();
      cancelLoginSubmitStageWait();
      loginAbortControllerRef.current?.abort();
      loginTransitionOverlayRef.current?.dismiss();
    };
  }, [accountRouteHandoff.reset]);

  useEffect(() => {
    if (route !== "login") {
      // 离开登录路由会取消挂起的提交态等待，被 await 的 Promise 不再落地、finally 也不会执行，
      // 重入锁必须在这里一并释放，否则返回登录页后入口永久失效。
      loginSubmitInFlightRef.current = false;
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
    setAccountActionBusyId("");
    setAccountAuthorizeError("");
    setAuthorizingAccountId("");
    setRemovingAccountId("");
    setShowLoginFormForAccountPicker(false);
  }, [authRequestKey, route]);

  // 入场节奏以页面加载为基准：先让壁纸稳定显示，再弹出表单和右侧二维码抽屉。
  // isLoginIntroStage 是特意保留的首屏状态，会让卡片短暂停在中间，后续维护不要把它当成抖动修掉。
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
      isAccountSelectionStage={isAccountSelectionStage}
      isLocalLoginCooldownActive={isLocalLoginCooldownActive}
      isLoginSubmitCardStage={isLoginSubmitCardStage}
      isQrDrawerOpen={isQrDrawerOpen}
      isRegisterMode={isRegisterMode}
      isSoloAuthMode={isSoloAuthMode}
      isSubmitContentHidden={isSubmitContentHidden}
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
      shouldPrepareQr={shouldPrepareQr}
      shouldShowAccountPicker={shouldShowAccountPicker}
      shouldUseCenteredWallpaper={shouldUseCenteredWallpaper}
      showLoginFormForAccountPicker={showLoginFormForAccountPicker}
      t={t}
      totpChallenge={totpChallenge}
    />
  );

  return (
    <>
      {route === "login" ? (
        <div aria-hidden={accountRouteHandoff.state ? true : undefined} className="account-route-source-stage" data-account-route-source="login"
          inert={accountRouteHandoff.state ? true : undefined}>
          {loginExperience}
        </div>
      ) : null}

      {route !== "login" && route !== "account" ? (
        <Suspense fallback={(
          <main className="route-loading" aria-busy="true">
            <span className="route-loading__indicator" role="status">{t("正在加载...")}</span>
          </main>
        )}>
          {route === "qr-login" ? (
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
          ) : null}
        </Suspense>
      ) : null}

      <AccountRouteStage
        handoffState={accountRouteHandoff.state}
        onCancel={accountRouteHandoff.cancel}
        onNavigateToLogin={() => {
          accountRouteHandoff.reset();
          navigateTo(LOGIN_ROUTE_PATH);
        }}
        onNotice={showNotice}
        onRequireLogin={() => {
          accountRouteHandoff.reset();
          navigateTo(buildLoginPathWithNext(getCurrentAccountNextPath()), { replace: true });
        }}
        onRetry={accountRouteHandoff.retry}
        onTargetReady={accountRouteHandoff.notifyTargetReady}
        routeIsAccount={route === "account"}
      />
      <Toast message={notice} />
    </>
  );
}
