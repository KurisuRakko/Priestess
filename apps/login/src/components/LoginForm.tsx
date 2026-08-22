import { FormEvent, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Lock, ShieldCheck, UserRound } from "lucide-react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { usePriestessTranslation, toHalfWidth } from "@priestess/shared";

export type LoginCredentials = {
  password: string;
  username: string;
};

export type LoginTotpChallenge = {
  displayName: string;
  username: string;
};

type LoginFormProps = {
  disabled?: boolean;
  isAuthorizing: boolean;
  onBackToAccountPicker?: () => void;
  onCancelTotp: () => void;
  onCreateAccount: () => void;
  onForgotPassword: (identity: string) => void;
  onPasskeyLogin: () => void;
  onTotpSubmit: (code: string) => void;
  onValidSubmit: (credentials: LoginCredentials) => void;
  showBackToAccountPicker?: boolean;
  showCreateAccount: boolean;
  totpChallenge: LoginTotpChallenge | null;
};

type FieldErrors = {
  password?: string;
  totpCode?: string;
  username?: string;
};

// 密码与 TOTP 使用同一画布，旧面板完成退场后再交给新面板，避免内容互相遮挡。
function LoginFormModePanel({
  children,
  isTotpMode,
  shouldReduceMotion,
}: {
  children: ReactNode;
  isTotpMode: boolean;
  shouldReduceMotion: boolean;
}) {
  const isPresent = useIsPresent();
  const direction = isTotpMode ? 1 : -1;

  return (
    <motion.div
      animate={shouldReduceMotion
        ? { opacity: 1, x: 0 }
        : {
            opacity: 1,
            transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
            x: 0,
          }}
      className="login-form-mode-panel"
      data-login-form-panel={isTotpMode ? "totp" : "password"}
      data-login-form-presence={isPresent ? "present" : "exiting"}
      aria-hidden={isPresent ? undefined : true}
      exit={shouldReduceMotion
        ? { opacity: 0 }
        : {
            opacity: 0,
            transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] },
            x: direction * 64,
          }}
      initial={shouldReduceMotion ? false : { opacity: 0, x: direction * 96 }}
      inert={isPresent ? undefined : true}
      style={{ pointerEvents: isPresent ? "auto" : "none" }}
    >
      {children}
    </motion.div>
  );
}

export function LoginForm({
  disabled = false,
  isAuthorizing,
  onBackToAccountPicker,
  onCancelTotp,
  onCreateAccount,
  onForgotPassword,
  onPasskeyLogin,
  onTotpSubmit,
  onValidSubmit,
  showBackToAccountPicker = false,
  showCreateAccount,
  totpChallenge,
}: LoginFormProps) {
  const { i18n, t } = usePriestessTranslation("login");
  const shouldReduceMotion = useReducedMotion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const passwordType = showPassword ? "text" : "password";
  const isTotpMode = Boolean(totpChallenge);
  const isFormLocked = disabled || isAuthorizing;
  const termsLinkSeparator = i18n.language.toLowerCase().startsWith("en") ? t("协议链接分隔符") : "";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked) {
      return;
    }

    const nextErrors: FieldErrors = {};
    const normalizedUsername = username.trim();

    if (!normalizedUsername) nextErrors.username = t("请输入账号");
    if (!password) nextErrors.password = t("请输入密码");

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // 密码只在本次提交中交给 API 调用，不写入父层状态、日志或持久化存储。
    onValidSubmit({ password, username: normalizedUsername });
  };

  const submitTotp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked) {
      return;
    }

    const normalizedCode = totpCode.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(normalizedCode)) {
      setErrors((current) => ({ ...current, totpCode: t("请输入 6 位动态验证码") }));
      return;
    }

    // TOTP challenge 由后端签发并校验，前端只负责收集本次验证码。
    onTotpSubmit(normalizedCode);
  };

  const resetTotp = () => {
    if (isFormLocked) {
      return;
    }

    setTotpCode("");
    setErrors((current) => ({ ...current, totpCode: undefined }));
    onCancelTotp();
  };

  const startPasskeyLogin = () => {
    if (isFormLocked) {
      return;
    }

    onPasskeyLogin();
  };

  return (
    <>
      {showBackToAccountPicker && !isTotpMode ? (
        <button
          aria-label={t("返回账号选择")}
          className="login-card__back-button"
          disabled={isFormLocked}
          onClick={onBackToAccountPicker}
          title={t("返回账号选择")}
          type="button"
        >
          <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.9} />
        </button>
      ) : null}

      <div className="login-card__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <path d="M24 5c5.5 4.5 5.5 10.5 0 16-5.5-5.5-5.5-11.5 0-16Z" />
          <path d="M43 24c-4.5 5.5-10.5 5.5-16 0 5.5-5.5 11.5-5.5 16 0Z" />
          <path d="M24 43c-5.5-4.5-5.5-10.5 0-16 5.5 5.5 5.5 11.5 0 16Z" />
          <path d="M5 24c4.5-5.5 10.5-5.5 16 0-5.5 5.5-11.5 5.5-16 0Z" />
          <circle cx="24" cy="24" r="3.2" />
        </svg>
      </div>

      <div className="login-form-mode-stack">
        <AnimatePresence initial={false} mode="wait">
          <LoginFormModePanel
            isTotpMode={isTotpMode}
            key={isTotpMode ? "totp" : "password"}
            shouldReduceMotion={Boolean(shouldReduceMotion)}
          >
          <div className="login-card__heading">
            <h1 id="login-title">{isTotpMode ? t("二步验证") : t("欢迎回来")}</h1>
            <p>
              {isTotpMode
                ? t("为 {{account}} 输入认证器里的验证码。", { account: totpChallenge?.displayName || totpChallenge?.username || t("当前账号") })
                : t("登录 Priestess，继续你未完成的记录。")}
            </p>
          </div>

          {isTotpMode ? (
            <form className="login-form" noValidate onSubmit={submitTotp}>
              <label className="field-group">
                <span className="field-group__label">{t("动态验证码")}</span>
                <span className={`text-field text-field--totp ${errors.totpCode ? "text-field--error" : ""}`}>
                  <ShieldCheck aria-hidden="true" size={20} strokeWidth={1.8} />
                  <input
                    aria-invalid={Boolean(errors.totpCode)}
                    aria-describedby={errors.totpCode ? "totp-error" : undefined}
                    autoComplete="one-time-code"
                    disabled={isFormLocked}
                    inputMode="numeric"
                    onChange={(event) => {
                      setTotpCode(event.target.value);
                      if (errors.totpCode) setErrors((current) => ({ ...current, totpCode: undefined }));
                    }}
                    placeholder="123456"
                    type="text"
                    value={totpCode}
                  />
                </span>
                {errors.totpCode && <span className="field-error" id="totp-error">{errors.totpCode}</span>}
              </label>

              <button className="primary-button" disabled={isFormLocked} type="submit">
                <span>{isAuthorizing ? t("正在返回应用") : t("验证并继续")}</span>
                <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
              </button>

              <button className="secondary-button" disabled={isFormLocked} onClick={resetTotp} type="button">
                <ArrowLeft aria-hidden="true" size={19} strokeWidth={1.8} />
                <span>{t("返回密码登录")}</span>
              </button>
            </form>
          ) : (
            <form className="login-form" noValidate onSubmit={submit}>
              <label className="field-group">
                <span className="field-group__label">{t("账号或邮箱")}</span>
                <span className={`text-field ${errors.username ? "text-field--error" : ""}`}>
                  <UserRound aria-hidden="true" size={20} strokeWidth={1.8} />
                  <input
                    aria-invalid={Boolean(errors.username)}
                    aria-describedby={errors.username ? "username-error" : undefined}
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect="off"
                    disabled={isFormLocked}
                    onChange={(event) => {
                      // IME 全角输入先转半角，再统一小写，与后端登录用户名小写化保持一致。
                      setUsername(toHalfWidth(event.target.value).toLowerCase());
                      if (errors.username) setErrors((current) => ({ ...current, username: undefined }));
                    }}
                    placeholder="mikael@example.com"
                    spellCheck={false}
                    type="text"
                    value={username}
                  />
                </span>
                {errors.username && <span className="field-error" id="username-error">{errors.username}</span>}
              </label>

              <label className="field-group">
                <span className="field-group__label">{t("密码")}</span>
                <span className={`text-field ${errors.password ? "text-field--error" : ""}`}>
                  <Lock aria-hidden="true" size={20} strokeWidth={1.8} />
                  <input
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "password-error" : undefined}
                    autoCapitalize="none"
                    autoComplete="current-password"
                    autoCorrect="off"
                    disabled={isFormLocked}
                    lang="en"
                    onChange={(event) => {
                      // IME 全角误输入兜底为半角，避免与已保存的密码不一致。
                      setPassword(toHalfWidth(event.target.value));
                      if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
                    }}
                    placeholder={t("输入密码")}
                    spellCheck={false}
                    type={passwordType}
                    value={password}
                  />
                  <button
                    aria-label={showPassword ? t("隐藏密码") : t("显示密码")}
                    className="icon-button"
                    disabled={isFormLocked}
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    {showPassword ? <EyeOff size={19} strokeWidth={1.8} /> : <Eye size={19} strokeWidth={1.8} />}
                  </button>
                </span>
                {errors.password && <span className="field-error" id="password-error">{errors.password}</span>}
              </label>

              <div className="form-row">
                <label className={`checkbox-line ${isFormLocked ? "checkbox-line--disabled" : ""}`}>
                  <input
                    checked={remember}
                    className="checkbox-line__input"
                    disabled={isFormLocked}
                    onChange={(event) => setRemember(event.target.checked)}
                    type="checkbox"
                  />
                  <motion.span
                    aria-hidden="true"
                    className="checkbox-line__box"
                    animate={remember ? {
                      backgroundColor: "#c65f72",
                      borderColor: "rgba(198, 95, 114, 0.9)",
                      boxShadow: "0 6px 14px rgba(198, 95, 114, 0.22)",
                      scale: shouldReduceMotion ? 1 : [1, 0.84, 1.1, 1],
                    } : {
                      backgroundColor: "rgba(255, 255, 255, 0.36)",
                      borderColor: "rgba(36, 35, 31, 0.22)",
                      boxShadow: "0 0 0 rgba(198, 95, 114, 0)",
                      scale: 1,
                    }}
                    initial={false}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    <svg className="checkbox-line__check" viewBox="0 0 16 16">
                      <motion.path
                        animate={{
                          opacity: remember ? 1 : 0,
                          pathLength: remember ? 1 : 0,
                        }}
                        d="M4 8.3 6.8 11 12.4 5"
                        fill="none"
                        initial={false}
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.1"
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                      />
                    </svg>
                  </motion.span>
                  <span>{t("记住我")}</span>
                </label>
                <button className="text-link" disabled={isFormLocked} onClick={() => onForgotPassword(username)} type="button">
                  {t("忘记密码？")}
                </button>
              </div>

              <button className="primary-button" disabled={isFormLocked} type="submit">
                <span>{isAuthorizing ? t("正在返回应用") : t("登录")}</span>
                <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
              </button>

              <button className="secondary-button" disabled={isFormLocked} onClick={startPasskeyLogin} type="button">
                <KeyRound aria-hidden="true" size={19} strokeWidth={1.8} />
                <span>{t("使用 Passkey 登录")}</span>
              </button>

              {showCreateAccount ? (
                <p className="signup-line">
                  {t("还没有账号？")}
                  <button
                    className="text-link signup-line__button"
                    disabled={isFormLocked}
                    onClick={onCreateAccount}
                    type="button"
                  >
                    <span>{t("创建账号")}</span>
                    <ArrowRight aria-hidden="true" size={15} strokeWidth={1.9} />
                  </button>
                </p>
              ) : null}

              <p className="terms-disclaimer">
                {t("登录即表示你同意")}
                <a aria-label={t("打开 KurisuRakko 用户协议")} href="https://rakko.cn/terms" rel="noreferrer" target="_blank">{t("《KurisuRakko 用户协议》")}</a>
                {termsLinkSeparator}
                <a aria-label={t("打开隐私政策")} href="https://rakko.cn/privacy" rel="noreferrer" target="_blank">{t("《隐私政策》")}</a>
                {t("及相关服务规则。")}
              </p>
            </form>
          )}
          </LoginFormModePanel>
        </AnimatePresence>
      </div>
    </>
  );
}
