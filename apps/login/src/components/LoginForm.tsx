import { FormEvent, RefObject, useState } from "react";
import { ArrowRight, Eye, EyeOff, Github, Lock, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

export type LoginCredentials = {
  password: string;
  username: string;
};

type LoginFormProps = {
  isLoginTransitionOrigin: boolean;
  loginCardRef: RefObject<HTMLElement | null>;
  onForgotPassword: (identity: string) => void;
  onNotice: (message: string) => void;
  onValidSubmit: (credentials: LoginCredentials) => void;
};

type FieldErrors = {
  username?: string;
  password?: string;
};

export function LoginForm({ isLoginTransitionOrigin, loginCardRef, onForgotPassword, onNotice, onValidSubmit }: LoginFormProps) {
  const shouldReduceMotion = useReducedMotion();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const passwordType = showPassword ? "text" : "password";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    const normalizedUsername = username.trim();

    if (!normalizedUsername) nextErrors.username = "请输入账号";
    if (!password) nextErrors.password = "请输入密码";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // 密码只在本次提交中交给 API 调用，不写入父层状态、日志或持久化存储。
    onValidSubmit({ password, username: normalizedUsername });
  };

  return (
    <section
      ref={loginCardRef}
      className={`login-card ${isLoginTransitionOrigin ? "is-login-transition-origin" : ""}`}
      aria-labelledby="login-title"
    >
      <div className="login-card__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <path d="M24 5c5.5 4.5 5.5 10.5 0 16-5.5-5.5-5.5-11.5 0-16Z" />
          <path d="M43 24c-4.5 5.5-10.5 5.5-16 0 5.5-5.5 11.5-5.5 16 0Z" />
          <path d="M24 43c-5.5-4.5-5.5-10.5 0-16 5.5 5.5 5.5 11.5 0 16Z" />
          <path d="M5 24c4.5-5.5 10.5-5.5 16 0-5.5 5.5-11.5 5.5-16 0Z" />
          <circle cx="24" cy="24" r="3.2" />
        </svg>
      </div>

      <div className="login-card__heading">
        <h1 id="login-title">欢迎回来</h1>
        <p>登录 Priestess，继续整理你的记录。</p>
      </div>

      <form className="login-form" noValidate onSubmit={submit}>
        <label className="field-group">
          <span className="field-group__label">账号或邮箱</span>
          <span className={`text-field ${errors.username ? "text-field--error" : ""}`}>
            <UserRound aria-hidden="true" size={20} strokeWidth={1.8} />
            <input
              aria-invalid={Boolean(errors.username)}
              aria-describedby={errors.username ? "username-error" : undefined}
              autoComplete="username"
              onChange={(event) => {
                setUsername(event.target.value);
                if (errors.username) setErrors((current) => ({ ...current, username: undefined }));
              }}
              placeholder="mikael@example.com"
              type="text"
              value={username}
            />
          </span>
          {errors.username && <span className="field-error" id="username-error">{errors.username}</span>}
        </label>

        <label className="field-group">
          <span className="field-group__label">密码</span>
          <span className={`text-field ${errors.password ? "text-field--error" : ""}`}>
            <Lock aria-hidden="true" size={20} strokeWidth={1.8} />
            <input
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? "password-error" : undefined}
              autoComplete="current-password"
              onChange={(event) => {
                setPassword(event.target.value);
                if (errors.password) setErrors((current) => ({ ...current, password: undefined }));
              }}
              placeholder="输入密码"
              type={passwordType}
              value={password}
            />
            <button
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              className="icon-button"
              onClick={() => setShowPassword((current) => !current)}
              type="button"
            >
              {showPassword ? <EyeOff size={19} strokeWidth={1.8} /> : <Eye size={19} strokeWidth={1.8} />}
            </button>
          </span>
          {errors.password && <span className="field-error" id="password-error">{errors.password}</span>}
        </label>

        <div className="form-row">
          <label className="checkbox-line">
            <input
              checked={remember}
              className="checkbox-line__input"
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
            <span>记住我</span>
          </label>
          <button className="text-link" onClick={() => onForgotPassword(username)} type="button">
            忘记密码？
          </button>
        </div>

        <button className="primary-button" type="submit">
          <span>登录</span>
          <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
        </button>
      </form>

      <div className="divider" aria-hidden="true">
        <span />
        <small>或</small>
        <span />
      </div>

      <button className="secondary-button" onClick={() => onNotice("GitHub 登录暂未接入")} type="button">
        <Github aria-hidden="true" size={22} strokeWidth={2} />
        <span>继续使用 GitHub</span>
      </button>

      <p className="signup-line">
        还没有账号？
        <button className="text-link signup-line__button" onClick={() => onNotice("创建账号暂未接入")} type="button">
          创建账号
          <ArrowRight aria-hidden="true" size={15} strokeWidth={1.9} />
        </button>
      </p>
    </section>
  );
}
