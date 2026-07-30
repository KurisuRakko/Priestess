import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { BrandMark, FloatingBackdrop } from "@priestess/shared";
import { AccountPickerCard, type AccountPickerAction, type AccountPickerMode } from "./AccountPickerCard";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm, type LoginCredentials, type LoginTotpChallenge } from "./LoginForm";
import {
  DESKTOP_HEIGHT_TRANSITION,
  DESKTOP_SHARED_AXIS_EXIT_DURATION_MS,
  getDesktopSharedAxisEnter,
  getDesktopSharedAxisExit,
  getDesktopSharedAxisInitial,
  getMobileSharedAxisEnter,
  getMobileSharedAxisExit,
  getMobileSharedAxisInitial,
} from "./authSharedAxisMotion";
import type { QrPanelProps } from "./QrPanel";
import type { RegisterFirstStepFormProps } from "./RegisterFirstStepForm";
import { type AuthAccountChoice, type useAuthAccountChoices } from "../lib/useAuthAccountChoices";
import { type LoginLayoutAuthMode } from "../lib/loginLayoutState";
import type { MobileLoginRevealState } from "../lib/useMobileLoginReveal";
import type { LoginIdentityMotionSource } from "./loginIdentityMotion";

type AccountChoicesState = ReturnType<typeof useAuthAccountChoices>;
type TranslationFn = (key: string, options?: Record<string, unknown>) => string;
type AccountSwitchPanel = "account-picker" | "login-form";
type AuthModePanel = "forgot-password" | "login" | "register";
const DESKTOP_LOGIN_REVEAL_TIMEOUT_MS = 5_000;
let registerFormModulePromise: Promise<typeof import("./RegisterFirstStepForm")> | null = null;
let qrPanelModulePromise: Promise<typeof import("./QrPanel")> | null = null;

function loadRegisterFormModule() {
  registerFormModulePromise ??= import("./RegisterFirstStepForm");
  return registerFormModulePromise;
}

function preloadRegisterFormModule() {
  // 登录卡片稳定后再交给空闲调度，避免鼠标路过按钮就触发大模块下载。
  void loadRegisterFormModule();
}

const RegisterFirstStepForm = lazy(async() => {
  const module = await loadRegisterFormModule();
  return { default: module.RegisterFirstStepForm };
});

function loadQrPanelModule() {
  qrPanelModulePromise ??= import("./QrPanel");
  return qrPanelModulePromise;
}

const QrPanel = lazy(async() => {
  const module = await loadQrPanelModule();
  return { default: module.QrPanel };
});

type AccountSwitchMotionPanelProps = {
  children: ReactNode;
  isMobileViewport: boolean;
  panel: AccountSwitchPanel;
  shouldReduceMotion: boolean | null;
};

function AccountSwitchMotionPanel({
  children,
  isMobileViewport,
  panel,
  shouldReduceMotion,
}: AccountSwitchMotionPanelProps) {
  const isPresent = useIsPresent();
  const shouldAnimateMobile = isMobileViewport && !shouldReduceMotion;
  const shouldAnimateDesktop = !isMobileViewport && !shouldReduceMotion;
  const direction = panel === "account-picker" ? -1 : 1;
  const mobileMotionMode = isMobileViewport ? (shouldAnimateMobile ? "fade-through" : "direct") : undefined;
  const desktopMotionMode = !isMobileViewport ? (shouldAnimateDesktop ? "shared-axis" : "direct") : undefined;

  return (
    <motion.div
      animate={shouldAnimateMobile
        ? getMobileSharedAxisEnter()
        : shouldAnimateDesktop
          ? getDesktopSharedAxisEnter()
          : { opacity: 1, x: 0 }}
      className="auth-account-switch-panel"
      data-auth-account-motion-origin={panel === "account-picker" ? "left" : "right"}
      data-auth-account-panel={panel}
      data-desktop-motion={desktopMotionMode}
      data-mobile-motion={mobileMotionMode}
      exit={shouldAnimateMobile
        ? getMobileSharedAxisExit(direction)
        : shouldAnimateDesktop
          ? getDesktopSharedAxisExit(direction)
          : { opacity: 0 }}
      initial={shouldAnimateMobile
        ? getMobileSharedAxisInitial(direction)
        : shouldAnimateDesktop
          ? getDesktopSharedAxisInitial(direction)
          : false}
      style={{
        display: "flex",
        flexDirection: "column",
        pointerEvents: isPresent ? "auto" : "none",
        width: "100%",
      }}
      transition={shouldAnimateMobile || shouldAnimateDesktop ? undefined : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}

type AuthModeMotionPanelProps = {
  children: ReactNode;
  isMobileViewport: boolean;
  panel: AuthModePanel;
  panelRef: (element: HTMLDivElement | null) => void;
  shouldReduceMotion: boolean | null;
};

function AuthModeMotionPanel({
  children,
  isMobileViewport,
  panel,
  panelRef,
  shouldReduceMotion,
}: AuthModeMotionPanelProps) {
  const isPresent = useIsPresent();
  const direction = panel === "login" ? -1 : 1;
  const shouldAnimateMobile = isMobileViewport && !shouldReduceMotion;
  const shouldAnimateDesktop = !isMobileViewport && !shouldReduceMotion;
  const mobileMotionMode = isMobileViewport ? (shouldAnimateMobile ? "fade-through" : "direct") : undefined;
  const desktopMotionMode = !isMobileViewport ? (shouldAnimateDesktop ? "shared-axis" : "direct") : undefined;

  return (
    <motion.div
      animate={shouldAnimateMobile
        ? getMobileSharedAxisEnter()
        : shouldAnimateDesktop
          ? getDesktopSharedAxisEnter()
          : { opacity: 1, x: 0 }}
      className="auth-card-content"
      data-auth-mode-motion-origin={panel === "login" ? "left" : "right"}
      data-auth-mode-panel={panel}
      data-desktop-motion={desktopMotionMode}
      data-mobile-motion={mobileMotionMode}
      exit={shouldReduceMotion
        ? { opacity: 0 }
        : shouldAnimateMobile
          ? getMobileSharedAxisExit(direction)
          : getDesktopSharedAxisExit(direction)}
      initial={shouldReduceMotion
        ? false
        : shouldAnimateMobile
          ? getMobileSharedAxisInitial(direction)
          : getDesktopSharedAxisInitial(direction)}
      ref={panelRef}
      style={{
        display: "flex",
        flexDirection: "column",
        pointerEvents: isPresent ? "auto" : "none",
        width: "100%",
      }}
      transition={shouldReduceMotion
        ? { duration: 0 }
        : shouldAnimateMobile || shouldAnimateDesktop
          ? undefined
          : { duration: 0 }}
    >
      {children}
    </motion.div>
  );
}

type LoginExperienceProps = {
  accountChoices: AccountChoicesState;
  accountPickerError: string;
  accountPickerMode: AccountPickerMode;
  authGridClassName: string;
  authMode: LoginLayoutAuthMode;
  authUiLocked: boolean;
  authorizingAccountId: string;
  directAuthorizeBusy: boolean;
  forgotPasswordIdentity: string;
  hasQrRequest: boolean;
  isForgotPasswordMode: boolean;
  isLocalLoginCooldownActive: boolean;
  isLoginSubmitCardStage: boolean;
  isQrDrawerOpen: boolean;
  isRegisterMode: boolean;
  isSoloAuthMode: boolean;
  loginCardRef: RefObject<HTMLDivElement | null>;
  mobileLoginReveal: MobileLoginRevealState;
  onBackToLogin: () => void;
  onChooseAuthAccount: (account: AuthAccountChoice, identitySource: LoginIdentityMotionSource | null) => void;
  onCreateAccount: () => void;
  onForgotPassword: (identity: string) => void;
  onOpenAuthAccountAction: (account: AuthAccountChoice, action: AccountPickerAction) => Promise<void> | void;
  onPasskeyLogin: () => void;
  onRegisterNotice: (message: string) => void;
  onRemoveAuthAccount: (account: AuthAccountChoice) => Promise<void> | void;
  onRegistered: RegisterFirstStepFormProps["onRegistered"];
  onReturnToAuthAccountPicker: () => void;
  onTotpCancel: () => void;
  onTotpSubmit: (code: string) => void;
  onUseAnotherAuthAccount: () => void;
  onValidLoginSubmit: (credentials: LoginCredentials) => void;
  qrRefreshing: boolean;
  qrValue: string;
  qrVisualState: QrPanelProps["visualState"];
  removingAccountId: string;
  shouldReduceMotion: boolean | null;
  shouldPrepareQr: boolean;
  shouldShowAccountPicker: boolean;
  shouldUseCenteredWallpaper: boolean;
  showLoginFormForAccountPicker: boolean;
  t: TranslationFn;
  totpChallenge: LoginTotpChallenge | null;
};

export function LoginExperience({
  accountChoices,
  accountPickerError,
  accountPickerMode,
  authGridClassName,
  authMode,
  authUiLocked,
  authorizingAccountId,
  directAuthorizeBusy,
  forgotPasswordIdentity,
  hasQrRequest,
  isForgotPasswordMode,
  isLocalLoginCooldownActive,
  isLoginSubmitCardStage,
  isQrDrawerOpen,
  isRegisterMode,
  isSoloAuthMode,
  loginCardRef,
  mobileLoginReveal,
  onBackToLogin,
  onChooseAuthAccount,
  onCreateAccount,
  onForgotPassword,
  onOpenAuthAccountAction,
  onPasskeyLogin,
  onRegisterNotice,
  onRemoveAuthAccount,
  onRegistered,
  onReturnToAuthAccountPicker,
  onTotpCancel,
  onTotpSubmit,
  onUseAnotherAuthAccount,
  onValidLoginSubmit,
  qrRefreshing,
  qrValue,
  qrVisualState,
  removingAccountId,
  shouldReduceMotion,
  shouldPrepareQr,
  shouldShowAccountPicker,
  shouldUseCenteredWallpaper,
  showLoginFormForAccountPicker,
  t,
  totpChallenge,
}: LoginExperienceProps) {
  const loginDelay = 0.5;
  const loginDuration = 0.72;
  const drawerDelay = loginDelay + loginDuration + 0.06;
  const qrContentDelay = drawerDelay + 0.34;
  const drawerEase = [0.2, 0.8, 0.2, 1] as const;
  const isAccountPickerCardMode = shouldShowAccountPicker && !isRegisterMode && !isForgotPasswordMode;
  const [desktopRevealTimedOut, setDesktopRevealTimedOut] = useState(false);
  const [desktopRevealed, setDesktopRevealed] = useState(mobileLoginReveal.isMobileViewport);
  const [hasPreparedQrPanel, setHasPreparedQrPanel] = useState(shouldPrepareQr);
  const [loginCardEntryComplete, setLoginCardEntryComplete] = useState(Boolean(shouldReduceMotion));
  const [renderedAuthGridClassName, setRenderedAuthGridClassName] = useState(authGridClassName);
  const [renderedAccountPickerCardMode, setRenderedAccountPickerCardMode] = useState(isAccountPickerCardMode);
  const previousAuthModeRef = useRef(authMode);
  const previousAccountPickerCardModeRef = useRef(isAccountPickerCardMode);
  const desktopAccountDataReady = ["empty", "error", "ready"].includes(accountChoices.status);
  const desktopQrDataReady = !shouldPrepareQr
    || Boolean(qrValue)
    || qrVisualState === "error";
  const desktopDataReady = desktopAccountDataReady && desktopQrDataReady;
  const loginStageRevealed = mobileLoginReveal.isMobileViewport
    ? mobileLoginReveal.revealed
    : desktopRevealed;

  useEffect(() => {
    if (mobileLoginReveal.isMobileViewport || desktopRevealed) return undefined;
    if (desktopDataReady || desktopRevealTimedOut) {
      let secondFrame = 0;
      // 桌面端也等账号列表和可见二维码进入终态，再留一帧给壁纸完成绘制。
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => setDesktopRevealed(true));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame) window.cancelAnimationFrame(secondFrame);
      };
    }
    const timeout = window.setTimeout(() => setDesktopRevealTimedOut(true), DESKTOP_LOGIN_REVEAL_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [desktopDataReady, desktopRevealTimedOut, desktopRevealed, mobileLoginReveal.isMobileViewport]);

  useEffect(() => {
    if (shouldReduceMotion) setLoginCardEntryComplete(true);
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (shouldPrepareQr) {
      setHasPreparedQrPanel(true);
      // 确认需要账号密码登录后，二维码组件与会话请求并行准备。
      void loadQrPanelModule();
    }
  }, [shouldPrepareQr]);

  useEffect(() => {
    if (
      !loginStageRevealed
      || !loginCardEntryComplete
      || authMode !== "login"
      || shouldShowAccountPicker
      || totpChallenge
      || isLocalLoginCooldownActive
    ) {
      return undefined;
    }

    const idleWindow = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    };
    if (idleWindow.requestIdleCallback) {
      const idleHandle = idleWindow.requestIdleCallback(preloadRegisterFormModule, { timeout: 1_500 });
      return () => idleWindow.cancelIdleCallback?.(idleHandle);
    }

    const fallbackTimer = window.setTimeout(preloadRegisterFormModule, 600);
    return () => window.clearTimeout(fallbackTimer);
  }, [
    authMode,
    isLocalLoginCooldownActive,
    loginCardEntryComplete,
    loginStageRevealed,
    shouldShowAccountPicker,
    totpChallenge,
  ]);

  useEffect(() => {
    const authModeChanged = previousAuthModeRef.current !== authMode;
    previousAuthModeRef.current = authMode;
    if (!authModeChanged || mobileLoginReveal.isMobileViewport || shouldReduceMotion) {
      setRenderedAuthGridClassName(authGridClassName);
      return undefined;
    }

    // 旧面板仍在退场时维持原卡片宽度，避免文本先因收窄而换行、再被新面板替换。
    const layoutTimer = window.setTimeout(
      () => setRenderedAuthGridClassName(authGridClassName),
      DESKTOP_SHARED_AXIS_EXIT_DURATION_MS,
    );
    return () => window.clearTimeout(layoutTimer);
  }, [authGridClassName, authMode, mobileLoginReveal.isMobileViewport, shouldReduceMotion]);

  useEffect(() => {
    const accountPickerModeChanged = previousAccountPickerCardModeRef.current !== isAccountPickerCardMode;
    previousAccountPickerCardModeRef.current = isAccountPickerCardMode;
    if (!accountPickerModeChanged || mobileLoginReveal.isMobileViewport || shouldReduceMotion) {
      setRenderedAccountPickerCardMode(isAccountPickerCardMode);
      return undefined;
    }

    // 卡片宽度与内边距等旧内容退场后再切换，避免表单在离场途中重新换行并顶起高度。
    const cardModeTimer = window.setTimeout(
      () => setRenderedAccountPickerCardMode(isAccountPickerCardMode),
      DESKTOP_SHARED_AXIS_EXIT_DURATION_MS,
    );
    return () => window.clearTimeout(cardModeTimer);
  }, [isAccountPickerCardMode, mobileLoginReveal.isMobileViewport, shouldReduceMotion]);

  const loginEnter = shouldReduceMotion
    ? false
    : mobileLoginReveal.isMobileViewport
      ? { opacity: 1, y: "100%", scale: 1 }
      : { opacity: 0, x: 360, y: 24, scale: 0.972 };
  const activeMobilePanel = isRegisterMode
    ? "register"
    : isForgotPasswordMode
      ? "forgot-password"
      : shouldShowAccountPicker
        ? "account-picker"
        : "login";

  // 登录/注册/找回密码共用一个高度视口：面板切换或内部内容变化时，
  // 只由这里按测量值驱动卡片高度，内部注册步骤不再重复套高度动画。
  const [activePanelElement, setActivePanelElement] = useState<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const assignActivePanel = useCallback((element: HTMLDivElement | null) => {
    // AnimatePresence 的退出面板卸载时会以 null 回调；忽略它，保持观察最新面板。
    if (element) setActivePanelElement(element);
  }, []);

  useEffect(() => {
    if (shouldReduceMotion || mobileLoginReveal.isMobileViewport) {
      // 手机卡片自身负责整页滚动，不能保留桌面测量出的固定内容高度。
      setPanelHeight(null);
      return undefined;
    }
    if (!activePanelElement) return undefined;
    const updateHeight = () => {
      const nextHeight = Math.ceil(activePanelElement.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setPanelHeight(nextHeight);
      }
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(activePanelElement);
    return () => observer.disconnect();
  }, [activePanelElement, mobileLoginReveal.isMobileViewport, shouldReduceMotion]);

  useEffect(() => {
    if (!mobileLoginReveal.isMobileViewport) return;
    // 手机端切页前统一回到卡片顶部，让新面板从稳定的内容原点进入。
    loginCardRef.current?.scrollTo({ behavior: "auto", top: 0 });
  }, [activeMobilePanel, loginCardRef, mobileLoginReveal.isMobileViewport]);
  const qrDrawerVariants = {
    closed: { x: "-100%", opacity: 0 },
    open: { x: "0%", opacity: 1 },
  };
  const qrDrawerTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.76, ease: [0.16, 1, 0.3, 1] as const };
  const dwallBgClassName = [
    "dwall-bg",
    isLocalLoginCooldownActive ? "dwall-bg--lockout" : shouldUseCenteredWallpaper ? "dwall-bg--register" : "",
  ].filter(Boolean).join(" ");
  return (
    <main
      className="app-shell"
      data-mobile-login={mobileLoginReveal.isMobileViewport ? "true" : "false"}
      data-mobile-reveal={mobileLoginReveal.revealed ? "ready" : "waiting"}
      data-mobile-reveal-timeout={mobileLoginReveal.didTimeout ? "true" : "false"}
      data-mobile-data-ready={mobileLoginReveal.dataReady ? "true" : "false"}
      data-desktop-reveal={!mobileLoginReveal.isMobileViewport ? desktopRevealed ? "ready" : "waiting" : undefined}
      data-desktop-reveal-timeout={!mobileLoginReveal.isMobileViewport ? desktopRevealTimedOut ? "true" : "false" : undefined}
    >
      {/* 壁纸层：独立 DOM 元素，通过 CSS transform 在登录/注册间平滑缩放和平移。 */}
      <div className={dwallBgClassName} aria-hidden="true" />
      <FloatingBackdrop />
      {!isLocalLoginCooldownActive && loginStageRevealed ? (
        <>
          <header className="topbar" aria-label="Priestess">
            <BrandMark size="sm" />
          </header>

          <motion.section
            aria-label={isRegisterMode ? t("Priestess 注册页") : isForgotPasswordMode ? t("Priestess 找回密码页") : t("Priestess 登录页")}
            className={isSoloAuthMode ? "login-stage login-stage--register" : "login-stage"}
          >
            <motion.div
              className={renderedAuthGridClassName}
              data-desktop-layout-motion={!mobileLoginReveal.isMobileViewport
                ? shouldReduceMotion ? "direct" : "coordinated"
                : undefined}
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16 }}
            >
              <motion.div
                className={[
                  "login-card-shell",
                  renderedAccountPickerCardMode ? "login-card-shell--account-picker" : "",
                ].filter(Boolean).join(" ")}
                data-desktop-entry-travel={!mobileLoginReveal.isMobileViewport && !shouldReduceMotion ? "large" : undefined}
                data-login-card-entry={loginCardEntryComplete ? "ready" : "entering"}
                initial={loginEnter}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                onAnimationComplete={() => setLoginCardEntryComplete(true)}
                style={{ pointerEvents: loginCardEntryComplete ? "auto" : "none" }}
                transition={shouldReduceMotion
                  ? { duration: 0 }
                  : mobileLoginReveal.shouldAnimateReveal && mobileLoginReveal.isMobileViewport
                    ? { delay: 0, duration: 0.52, ease: drawerEase }
                    : { delay: loginDelay, duration: loginDuration, ease: [0.16, 1, 0.3, 1] }}
              >
                <motion.div
                  ref={loginCardRef}
                  className={[
                    "login-card",
                    renderedAccountPickerCardMode ? "login-card--account-picker" : "",
                    isLoginSubmitCardStage ? "login-card--submit-stage" : "",
                  ].filter(Boolean).join(" ")}
                  style={{ width: "100%", display: "flex", flexDirection: "column" }}
                >
                  {/* 方向语义：登录页在左、注册/找回在右。桌面端先让旧内容完整离场，
                      再从相反方向大幅引入新内容；手机端继续沿用短行程 fade-through。 */}
                  <motion.div
                    className="auth-card-viewport"
                    data-desktop-height-motion={!mobileLoginReveal.isMobileViewport && !shouldReduceMotion ? "tween" : undefined}
                    animate={shouldReduceMotion || mobileLoginReveal.isMobileViewport || panelHeight === null
                      ? undefined
                      : { height: panelHeight }}
                    style={mobileLoginReveal.isMobileViewport ? { height: "auto" } : undefined}
                    transition={shouldReduceMotion ? { duration: 0 } : DESKTOP_HEIGHT_TRANSITION}
                  >
                  <AnimatePresence
                    initial={false}
                    mode="wait"
                  >
                    {isRegisterMode ? (
                      <AuthModeMotionPanel
                        key="register"
                        isMobileViewport={mobileLoginReveal.isMobileViewport}
                        panel="register"
                        panelRef={assignActivePanel}
                        shouldReduceMotion={shouldReduceMotion}
                      >
                        <Suspense fallback={(
                          <div className="register-form-loading" aria-busy="true" role="status">
                            {t("正在加载注册表单...")}
                          </div>
                        )}>
                          <RegisterFirstStepForm
                            disabled={authUiLocked}
                            isMobileViewport={mobileLoginReveal.isMobileViewport}
                            onBackToLogin={onBackToLogin}
                            onNotice={onRegisterNotice}
                            onRegistered={onRegistered}
                          />
                        </Suspense>
                      </AuthModeMotionPanel>
                    ) : isForgotPasswordMode ? (
                      <AuthModeMotionPanel
                        key="forgot-password"
                        isMobileViewport={mobileLoginReveal.isMobileViewport}
                        panel="forgot-password"
                        panelRef={assignActivePanel}
                        shouldReduceMotion={shouldReduceMotion}
                      >
                        <ForgotPasswordForm
                          defaultIdentity={forgotPasswordIdentity}
                          disabled={authUiLocked}
                          onBackToLogin={onBackToLogin}
                          onNotice={onRegisterNotice}
                        />
                      </AuthModeMotionPanel>
                    ) : (
                      <AuthModeMotionPanel
                        key="login"
                        isMobileViewport={mobileLoginReveal.isMobileViewport}
                        panel="login"
                        panelRef={assignActivePanel}
                        shouldReduceMotion={shouldReduceMotion}
                      >
                        <AnimatePresence
                          initial={false}
                          mode="wait"
                        >
                          <AccountSwitchMotionPanel
                            key={shouldShowAccountPicker ? "account-picker" : "login-form"}
                            isMobileViewport={mobileLoginReveal.isMobileViewport}
                            panel={shouldShowAccountPicker ? "account-picker" : "login-form"}
                            shouldReduceMotion={shouldReduceMotion}
                          >
                            {shouldShowAccountPicker ? (
                              <AccountPickerCard
                                accounts={accountChoices.accounts}
                                app={accountChoices.app}
                                busyAccountId={authorizingAccountId}
                                disabled={authUiLocked}
                                error={accountPickerError}
                                mode={accountPickerMode}
                                removingAccountId={removingAccountId}
                                onOpenAccountAction={onOpenAuthAccountAction}
                                onRemoveAccount={onRemoveAuthAccount}
                                onRetry={accountChoices.refresh}
                                onSelectAccount={onChooseAuthAccount}
                                onUseAnotherAccount={onUseAnotherAuthAccount}
                                status={accountChoices.status}
                              />
                            ) : (
                              <LoginForm
                                disabled={authUiLocked}
                                isAuthorizing={directAuthorizeBusy}
                                onCreateAccount={onCreateAccount}
                                onForgotPassword={onForgotPassword}
                                onPasskeyLogin={onPasskeyLogin}
                                onBackToAccountPicker={onReturnToAuthAccountPicker}
                                onCancelTotp={onTotpCancel}
                                onTotpSubmit={onTotpSubmit}
                                onValidSubmit={onValidLoginSubmit}
                                showBackToAccountPicker={showLoginFormForAccountPicker && !totpChallenge}
                                showCreateAccount={!totpChallenge}
                                totpChallenge={totpChallenge}
                              />
                            )}
                          </AccountSwitchMotionPanel>
                        </AnimatePresence>
                      </AuthModeMotionPanel>
                    )}
                  </AnimatePresence>
                  </motion.div>
                </motion.div>
              </motion.div>

              <div className="qr-drawer-slot" aria-hidden={!isQrDrawerOpen}>
                {/* slot 只负责布局宽度；可视抽屉层由 Motion 驱动，避免 CSS transform 抢同一段动画。 */}
                <motion.div
                  className="qr-drawer-surface"
                  data-desktop-qr-motion={!mobileLoginReveal.isMobileViewport
                    ? shouldReduceMotion ? "direct" : "smooth"
                    : undefined}
                  data-desktop-qr-travel={!mobileLoginReveal.isMobileViewport && !shouldReduceMotion ? "large" : undefined}
                  initial={shouldReduceMotion ? false : "closed"}
                  animate={isQrDrawerOpen ? "open" : "closed"}
                  variants={qrDrawerVariants}
                  transition={qrDrawerTransition}
                  style={{ pointerEvents: isQrDrawerOpen ? "auto" : "none" }}
                >
                  {!mobileLoginReveal.isMobileViewport && hasQrRequest && (shouldPrepareQr || hasPreparedQrPanel) ? (
                    <Suspense fallback={(
                      <div className="qr-panel-loading" aria-busy="true" role="status">
                        {t("正在准备二维码...")}
                      </div>
                    )}>
                      <QrPanel
                        contentDelay={qrContentDelay}
                        isRefreshing={qrRefreshing}
                        qrValue={qrValue}
                        visualState={qrVisualState}
                      />
                    </Suspense>
                  ) : null}
                </motion.div>
              </div>
            </motion.div>
          </motion.section>
        </>
      ) : null}
    </main>
  );
}
