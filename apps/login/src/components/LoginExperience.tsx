import { useCallback, useEffect, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { BrandMark, FloatingBackdrop } from "@priestess/shared";
import { AccountPickerCard, type AccountPickerAction, type AccountPickerMode } from "./AccountPickerCard";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm, type LoginCredentials, type LoginTotpChallenge } from "./LoginForm";
import { QrPanel } from "./QrPanel";
import { RegisterFirstStepForm } from "./RegisterFirstStepForm";
import { type AuthAccountChoice, type useAuthAccountChoices } from "../lib/useAuthAccountChoices";
import { type LoginLayoutAuthMode } from "../lib/loginLayoutState";
import type { MobileLoginRevealState } from "../lib/useMobileLoginReveal";

type AccountChoicesState = ReturnType<typeof useAuthAccountChoices>;
type TranslationFn = (key: string, options?: Record<string, unknown>) => string;
type AccountSwitchPanel = "account-picker" | "login-form";

type MobileAccountSwitchPanelProps = {
  children: ReactNode;
  isMobileViewport: boolean;
  panel: AccountSwitchPanel;
  shouldReduceMotion: boolean | null;
};

function MobileAccountSwitchPanel({
  children,
  isMobileViewport,
  panel,
  shouldReduceMotion,
}: MobileAccountSwitchPanelProps) {
  const isPresent = useIsPresent();
  const shouldAnimate = isMobileViewport && !shouldReduceMotion;
  const offset = panel === "account-picker" ? -22 : 22;

  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="auth-account-switch-panel"
      data-auth-account-motion-origin={panel === "account-picker" ? "left" : "right"}
      data-auth-account-panel={panel}
      exit={shouldAnimate ? { opacity: 0, x: offset } : { opacity: 0 }}
      initial={shouldAnimate ? { opacity: 0, x: offset } : false}
      style={{
        display: "flex",
        flexDirection: "column",
        pointerEvents: isPresent ? "auto" : "none",
        width: "100%",
      }}
      transition={shouldAnimate
        ? { duration: 0.26, ease: [0.2, 0.8, 0.2, 1] }
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
  onChooseAuthAccount: (account: AuthAccountChoice) => void;
  onCreateAccount: () => void;
  onForgotPassword: (identity: string) => void;
  onOpenAuthAccountAction: (account: AuthAccountChoice, action: AccountPickerAction) => Promise<void> | void;
  onPasskeyLogin: () => void;
  onRegisterNotice: (message: string) => void;
  onRemoveAuthAccount: (account: AuthAccountChoice) => Promise<void> | void;
  onRegistered: ComponentProps<typeof RegisterFirstStepForm>["onRegistered"];
  onReturnToAuthAccountPicker: () => void;
  onTotpCancel: () => void;
  onTotpSubmit: (code: string) => void;
  onUseAnotherAuthAccount: () => void;
  onValidLoginSubmit: (credentials: LoginCredentials) => void;
  qrRefreshing: boolean;
  qrValue: string;
  qrVisualState: ComponentProps<typeof QrPanel>["visualState"];
  removingAccountId: string;
  shouldReduceMotion: boolean | null;
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
  const authContentTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.4, ease: drawerEase };
  const loginEnter = shouldReduceMotion
    ? false
    : mobileLoginReveal.isMobileViewport
      ? { opacity: 1, y: "100%", scale: 1, filter: "blur(0px)" }
      : { opacity: 0, x: 360, y: 24, scale: 0.972, filter: "blur(10px)" };

  // 登录/注册/找回密码共用一个高度视口：面板切换或内部内容变化时，
  // 卡片高度用测量值平滑过渡，替代 popLayout 交换内容瞬间的高度跳变。
  const [activePanelElement, setActivePanelElement] = useState<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const assignActivePanel = useCallback((element: HTMLDivElement | null) => {
    // popLayout 的退出面板卸载时会以 null 回调；忽略它，保持观察最新面板。
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
  const qrDrawerVariants = {
    closed: { x: "-96%", opacity: 0, clipPath: "inset(0 100% 0 0)" },
    open: { x: "0%", opacity: 1, clipPath: "inset(0 0% 0 0)" },
  };
  const qrDrawerTransition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.76, ease: drawerEase };
  const dwallBgClassName = [
    "dwall-bg",
    isLocalLoginCooldownActive ? "dwall-bg--lockout" : shouldUseCenteredWallpaper ? "dwall-bg--register" : "",
  ].filter(Boolean).join(" ");
  const isAccountPickerCardMode = shouldShowAccountPicker && !isRegisterMode && !isForgotPasswordMode;

  return (
    <main
      className="app-shell"
      data-mobile-login={mobileLoginReveal.isMobileViewport ? "true" : "false"}
      data-mobile-reveal={mobileLoginReveal.revealed ? "ready" : "waiting"}
      data-mobile-reveal-timeout={mobileLoginReveal.didTimeout ? "true" : "false"}
      data-mobile-data-ready={mobileLoginReveal.dataReady ? "true" : "false"}
    >
      {/* 壁纸层：独立 DOM 元素，通过 CSS transform 在登录/注册间平滑缩放和平移。 */}
      <div className={dwallBgClassName} aria-hidden="true" />
      <FloatingBackdrop />
      {!isLocalLoginCooldownActive && mobileLoginReveal.revealed ? (
        <>
          <header className="topbar" aria-label="Priestess">
            <BrandMark size="sm" />
          </header>

          <motion.section
            aria-label={isRegisterMode ? t("Priestess 注册页") : isForgotPasswordMode ? t("Priestess 找回密码页") : t("Priestess 登录页")}
            className={isSoloAuthMode ? "login-stage login-stage--register" : "login-stage"}
          >
            <motion.div
              className={authGridClassName}
              initial={shouldReduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16 }}
            >
              <motion.div
                className={[
                  "login-card-shell",
                  isAccountPickerCardMode ? "login-card-shell--account-picker" : "",
                ].filter(Boolean).join(" ")}
                initial={loginEnter}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
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
                    isAccountPickerCardMode ? "login-card--account-picker" : "",
                    isLoginSubmitCardStage ? "login-card--submit-stage" : "",
                  ].filter(Boolean).join(" ")}
                  style={{ width: "100%", display: "flex", flexDirection: "column" }}
                >
                  {/* 方向语义：登录页在左、注册/找回在右。前进时旧内容向左让位、新内容从右进入，
                      返回时整体向右回退，两块内容始终朝同一方向流动，避免同侧进出的折返感。 */}
                  <motion.div
                    className="auth-card-viewport"
                    animate={shouldReduceMotion || mobileLoginReveal.isMobileViewport || panelHeight === null
                      ? undefined
                      : { height: panelHeight }}
                    style={mobileLoginReveal.isMobileViewport ? { height: "auto" } : undefined}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.44, ease: drawerEase }}
                  >
                  <AnimatePresence initial={false} mode="popLayout">
                    {isRegisterMode ? (
                      <motion.div
                        key="register"
                        ref={assignActivePanel}
                        className="auth-card-content"
                        style={{ width: "100%", display: "flex", flexDirection: "column" }}
                        initial={shouldReduceMotion ? false : { opacity: 0, x: 24, filter: "blur(4px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, filter: "blur(4px)" }}
                        transition={authContentTransition}
                      >
                        <RegisterFirstStepForm
                          disabled={authUiLocked}
                          onBackToLogin={onBackToLogin}
                          onNotice={onRegisterNotice}
                          onRegistered={onRegistered}
                        />
                      </motion.div>
                    ) : isForgotPasswordMode ? (
                      <motion.div
                        key="forgot-password"
                        ref={assignActivePanel}
                        className="auth-card-content"
                        style={{ width: "100%", display: "flex", flexDirection: "column" }}
                        initial={shouldReduceMotion ? false : { opacity: 0, x: 24, filter: "blur(4px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: 24, filter: "blur(4px)" }}
                        transition={authContentTransition}
                      >
                        <ForgotPasswordForm
                          defaultIdentity={forgotPasswordIdentity}
                          disabled={authUiLocked}
                          onBackToLogin={onBackToLogin}
                          onNotice={onRegisterNotice}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="login"
                        ref={assignActivePanel}
                        className="auth-card-content"
                        style={{ width: "100%", display: "flex", flexDirection: "column" }}
                        initial={shouldReduceMotion ? false : { opacity: 0, x: -24, filter: "blur(4px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -24, filter: "blur(4px)" }}
                        transition={authContentTransition}
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                          <MobileAccountSwitchPanel
                            key={mobileLoginReveal.isMobileViewport
                              ? shouldShowAccountPicker ? "account-picker" : "login-form"
                              : "desktop-login-panel"}
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
                          </MobileAccountSwitchPanel>
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  </motion.div>
                </motion.div>
              </motion.div>

              <div className="qr-drawer-slot" aria-hidden={!isQrDrawerOpen}>
                {/* slot 只负责布局宽度；可视抽屉层由 Motion 驱动，避免 CSS transform 抢同一段动画。 */}
                <motion.div
                  className="qr-drawer-surface"
                  initial={shouldReduceMotion ? false : "closed"}
                  animate={isQrDrawerOpen ? "open" : "closed"}
                  variants={qrDrawerVariants}
                  transition={qrDrawerTransition}
                  style={{ pointerEvents: isQrDrawerOpen ? "auto" : "none" }}
                >
                  <QrPanel
                    contentDelay={qrContentDelay}
                    isRefreshing={qrRefreshing}
                    qrValue={qrValue}
                    visualState={qrVisualState}
                  />
                </motion.div>
              </div>
            </motion.div>
          </motion.section>
        </>
      ) : null}
    </main>
  );
}
