import { type ComponentProps, type RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BrandMark, FloatingBackdrop } from "@priestess/shared";
import { AccountPickerCard } from "./AccountPickerCard";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { LoginForm, type LoginCredentials, type LoginTotpChallenge } from "./LoginForm";
import { QrPanel } from "./QrPanel";
import { RegisterFirstStepForm } from "./RegisterFirstStepForm";
import { type AuthAccountChoice, type useAuthAccountChoices } from "../lib/useAuthAccountChoices";
import { type LoginLayoutAuthMode } from "../lib/loginLayoutState";

type AccountChoicesState = ReturnType<typeof useAuthAccountChoices>;
type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

type LoginExperienceProps = {
  accountChoices: AccountChoicesState;
  accountPickerError: string;
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
  onBackToLogin: () => void;
  onChooseAuthAccount: (account: AuthAccountChoice) => void;
  onCreateAccount: () => void;
  onForgotPassword: (identity: string) => void;
  onPasskeyLogin: () => void;
  onQrRefresh: () => void;
  onRegisterNotice: (message: string) => void;
  onRegistered: ComponentProps<typeof RegisterFirstStepForm>["onRegistered"];
  onReturnToAuthAccountPicker: () => void;
  onTotpCancel: () => void;
  onTotpSubmit: (code: string) => void;
  onUseAnotherAuthAccount: () => void;
  onValidLoginSubmit: (credentials: LoginCredentials) => void;
  qrExpiresLabel: string;
  qrRefreshDisabled: boolean;
  qrRefreshLabel: string;
  qrRefreshing: boolean;
  qrStatusText: string;
  qrValue: string;
  qrVisualState: ComponentProps<typeof QrPanel>["visualState"];
  shouldReduceMotion: boolean | null;
  shouldShowAccountPicker: boolean;
  shouldUseCenteredWallpaper: boolean;
  showLoginFormForAuthRequest: boolean;
  t: TranslationFn;
  totpChallenge: LoginTotpChallenge | null;
};

export function LoginExperience({
  accountChoices,
  accountPickerError,
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
  onBackToLogin,
  onChooseAuthAccount,
  onCreateAccount,
  onForgotPassword,
  onPasskeyLogin,
  onQrRefresh,
  onRegisterNotice,
  onRegistered,
  onReturnToAuthAccountPicker,
  onTotpCancel,
  onTotpSubmit,
  onUseAnotherAuthAccount,
  onValidLoginSubmit,
  qrExpiresLabel,
  qrRefreshDisabled,
  qrRefreshLabel,
  qrRefreshing,
  qrStatusText,
  qrValue,
  qrVisualState,
  shouldReduceMotion,
  shouldShowAccountPicker,
  shouldUseCenteredWallpaper,
  showLoginFormForAuthRequest,
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
    : { duration: 0.36, ease: drawerEase };
  const loginEnter = shouldReduceMotion ? false : { opacity: 0, x: 360, y: 24, scale: 0.972, filter: "blur(10px)" };
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

  return (
    <main className="app-shell">
      {/* 壁纸层：独立 DOM 元素，通过 CSS transform 在登录/注册间平滑缩放和平移。 */}
      <div className={dwallBgClassName} aria-hidden="true" />
      <FloatingBackdrop />
      {!isLocalLoginCooldownActive ? (
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
                className="login-card-shell"
                initial={loginEnter}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={shouldReduceMotion
                  ? { duration: 0 }
                  : { delay: loginDelay, duration: loginDuration, ease: [0.16, 1, 0.3, 1] }}
              >
                <motion.div
                  ref={loginCardRef}
                  className={[
                    "login-card",
                    isLoginSubmitCardStage ? "login-card--submit-stage" : "",
                  ].filter(Boolean).join(" ")}
                  style={{ width: "100%", display: "flex", flexDirection: "column" }}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {isRegisterMode ? (
                      <motion.div
                        key="register"
                        className="auth-card-content"
                        style={{ width: "100%", display: "flex", flexDirection: "column" }}
                        initial={shouldReduceMotion ? false : { opacity: 0, x: -24, filter: "blur(4px)" }}
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
                        className="auth-card-content"
                        style={{ width: "100%", display: "flex", flexDirection: "column" }}
                        initial={shouldReduceMotion ? false : { opacity: 0, x: -24, filter: "blur(4px)" }}
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
                        className="auth-card-content"
                        style={{ width: "100%", display: "flex", flexDirection: "column" }}
                        initial={shouldReduceMotion ? false : { opacity: 0, x: 24, filter: "blur(4px)" }}
                        animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -24, filter: "blur(4px)" }}
                        transition={authContentTransition}
                      >
                        {shouldShowAccountPicker ? (
                          <AccountPickerCard
                            accounts={accountChoices.accounts}
                            app={accountChoices.app}
                            busyAccountId={authorizingAccountId}
                            disabled={authUiLocked}
                            error={accountPickerError}
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
                            showBackToAccountPicker={hasQrRequest && showLoginFormForAuthRequest && !totpChallenge}
                            showCreateAccount={!totpChallenge}
                            totpChallenge={totpChallenge}
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                    expiresLabel={qrExpiresLabel}
                    isRefreshing={qrRefreshing}
                    qrValue={qrValue}
                    visualState={qrVisualState}
                    onRefresh={onQrRefresh}
                    refreshDisabled={qrRefreshDisabled}
                    refreshLabel={qrRefreshLabel}
                    statusText={qrStatusText}
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
