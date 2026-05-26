import { type CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, AtSign, CheckCircle2, KeyRound, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { pinyin } from "pinyin-pro";
import {
  confirmLocalRegistration,
  getPriestessApiErrorCode,
  getPriestessApiErrorMessage,
  requestRegisterVerification,
  translatePriestess,
  usePriestessTranslation,
  type LocalSession,
  type RegisterIdentityType,
} from "@priestess/shared";
import {
  DEFAULT_REGISTER_PHONE_REGION_ID,
  getRegisterPhoneRegion,
  normalizeEmailIdentity,
  normalizePhoneIdentity,
  normalizePhoneLocalInput,
  REGISTER_PHONE_REGIONS,
} from "./registerIdentityOptions";
import { getStepCopy, REGISTER_STEP_LABELS, REGISTER_STEPS, type RegisterStep, STEP_PANEL_EASE, STEP_PANEL_VARIANTS } from "./registerStepConfig";
import "./RegisterFirstStepForm.css";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SCRIPT_TIMEOUT_MS = 8000;
const TURNSTILE_WIDGET_RENDER_TIMEOUT_MS = 10000;
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const SUCCESS_REDIRECT_DELAY_MS = 700;
const CJK_CHARACTER_PATTERN = /[\u3400-\u9FFF]/u;
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;
const USERNAME_MAX_LENGTH = 32;
const RESERVED_USERNAMES = new Set(["admin", "api", "assets", "auth", "help", "login", "me", "priestess", "register", "root", "settings", "static", "support", "system"]);
type RegisterFirstStepFormProps = {
  disabled: boolean;
  onBackToLogin: () => void;
  onNotice: (message: string) => void;
  onRegistered: (session: LocalSession, fallbackIdentity: string) => Promise<void>;
};

type FieldErrors = {
  code?: string;
  displayName?: string;
  identity?: string;
  password?: string;
  passwordConfirm?: string;
  terms?: string;
  turnstile?: string;
  username?: string;
};

type TurnstileRenderOptions = {
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  sitekey: string;
  theme?: "light";
};

declare global {
  interface Window {
    __PRIESTESS_CONFIG__?: {
      turnstileSiteKey?: string;
    };
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

function readTurnstileSiteKey() {
  const configuredSiteKey = import.meta.env.VITE_PRIESTESS_TURNSTILE_SITE_KEY?.trim()
    || window.__PRIESTESS_CONFIG__?.turnstileSiteKey?.trim()
    || "";

  // 本地开发可使用 Cloudflare 官方测试 site key；生产必须显式配置真实 key，避免测试凭证进入线上注册链路。
  if (!configuredSiteKey && import.meta.env.DEV) return TURNSTILE_TEST_SITE_KEY;
  return configuredSiteKey;
}

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error(translatePriestess("login:当前环境无法加载验证码")));
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (error) {
        turnstileScriptPromise = null;
        reject(error);
        return;
      }
      resolve();
    };
    timer = window.setTimeout(() => finish(new Error(translatePriestess("login:验证码组件加载超时"))), TURNSTILE_SCRIPT_TIMEOUT_MS);
    const bindScriptEvents = (script: HTMLScriptElement) => {
      script.addEventListener("load", () => finish(), { once: true });
      script.addEventListener("error", () => finish(new Error(translatePriestess("login:验证码组件加载失败"))), { once: true });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    if (existingScript) {
      bindScriptEvents(existingScript);
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = TURNSTILE_SCRIPT_SRC;
    bindScriptEvents(script);
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

function normalizeUsernameInput(rawValue: string) {
  return rawValue.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, USERNAME_MAX_LENGTH);
}

function normalizeGeneratedUsername(rawValue: string) {
  const normalizedValue = normalizeUsernameInput(rawValue);
  if (!normalizedValue) return "";
  const safePrefixValue = /^[A-Za-z]/.test(normalizedValue) ? normalizedValue : `u${normalizedValue}`;
  if (!RESERVED_USERNAMES.has(safePrefixValue.toLowerCase())) return safePrefixValue.slice(0, USERNAME_MAX_LENGTH);
  return `${safePrefixValue}User`.slice(0, USERNAME_MAX_LENGTH);
}

function createUsernameFromDisplayName(displayName: string) {
  const candidate = Array.from(displayName.trim()).map((character) => {
    if (/^[A-Za-z0-9_]$/.test(character)) return character;
    if (CJK_CHARACTER_PATTERN.test(character)) return pinyin(character, { toneType: "none", type: "string" }).replace(/[^A-Za-z0-9]/g, "");
    return normalizeUsernameInput(character);
  }).join("");
  return normalizeGeneratedUsername(candidate);
}

function validateUsername(value: string) {
  const normalizedValue = normalizeUsernameInput(value);
  if (!normalizedValue) return { error: translatePriestess("login:用户名不能为空"), value: normalizedValue };
  if (!USERNAME_PATTERN.test(normalizedValue)) {
    return { error: translatePriestess("login:用户名需为 3-32 位，并以字母开头；仅可包含字母、数字和下划线"), value: normalizedValue };
  }
  if (RESERVED_USERNAMES.has(normalizedValue.toLowerCase())) return { error: translatePriestess("login:这个用户名不能使用，请换一个"), value: normalizedValue };
  return { error: "", value: normalizedValue };
}

function isStrongPassword(value: string) {
  return value.length >= 12;
}

function getIdentityKey(identityType: RegisterIdentityType, value: string) {
  return `${identityType}:${value}`;
}

function formatCooldownLabel(seconds: number) {
  return translatePriestess("login:{{seconds}} 秒后可重新发送", { seconds: Math.max(0, seconds) });
}

function getDeliveryLabel(delivery: string) {
  if (delivery === "email") return translatePriestess("login:邮箱");
  if (delivery === "sms") return translatePriestess("login:手机");
  return delivery;
}

function TurnstileWidget({
  disabled,
  onError,
  onExpire,
  onToken,
  resetSignal,
  siteKey,
}: {
  disabled: boolean;
  onError: () => void;
  onExpire: () => void;
  onToken: (token: string) => void;
  resetSignal: number;
  siteKey: string;
}) {
  const { t } = usePriestessTranslation("login");
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const widgetIdRef = useRef("");
  const widgetStatusTimerRef = useRef<number | null>(null);
  const tokenResolvedRef = useRef(false);
  const callbacksRef = useRef({ onError, onExpire, onToken });
  callbacksRef.current = { onError, onExpire, onToken };

  useEffect(() => {
    if (!siteKey || disabled) return;

    let active = true;
    void loadTurnstileScript()
      .then(() => {
        if (!active || !containerRef.current) return;
        if (!window.turnstile) {
          // Turnstile 脚本偶尔会被浏览器策略或自动化环境中断；这里显式报错，避免留下空白验证框。
          callbacksRef.current.onError();
          return;
        }

        containerRef.current.innerHTML = "";
        tokenResolvedRef.current = false;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          callback: (token) => {
            tokenResolvedRef.current = true;
            callbacksRef.current.onToken(token);
          },
          "expired-callback": () => callbacksRef.current.onExpire(),
          "error-callback": () => {
            tokenResolvedRef.current = true;
            callbacksRef.current.onError();
          },
        });
        widgetStatusTimerRef.current = window.setTimeout(() => {
          if (!active || tokenResolvedRef.current || containerRef.current?.querySelector("iframe")) return;
          // 某些环境会让 Turnstile 脚本记录错误但不回调，显式兜底能让用户看到可操作的失败状态。
          callbacksRef.current.onError();
        }, TURNSTILE_WIDGET_RENDER_TIMEOUT_MS);
      })
      .catch(() => callbacksRef.current.onError());

    return () => {
      active = false;
      if (widgetStatusTimerRef.current !== null) {
        window.clearTimeout(widgetStatusTimerRef.current);
        widgetStatusTimerRef.current = null;
      }
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = "";
    };
  }, [disabled, resetSignal, siteKey]);

  return (
    <span className="text-field" style={{ justifyContent: "center", minHeight: 84, padding: "10px 12px" }}>
      {siteKey ? (
        <span ref={containerRef} style={{ minHeight: 64, width: "100%" }} />
      ) : (
        <span style={{ color: "var(--color-muted)", fontSize: 14 }}>{t("验证码组件未配置，请联系管理员。")}</span>
      )}
    </span>
  );
}

export function RegisterFirstStepForm({
  disabled,
  onBackToLogin,
  onNotice,
  onRegistered,
}: RegisterFirstStepFormProps) {
  const { i18n, t } = usePriestessTranslation("login");
  const shouldReduceStepMotion = useReducedMotion();
  const successTimerRef = useRef<number | null>(null);
  const verificationAbortRef = useRef<AbortController | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const [step, setStep] = useState<RegisterStep>("identity");
  const [stepDirection, setStepDirection] = useState(1);
  const [emailIdentity, setEmailIdentity] = useState("");
  const [identityMode, setIdentityMode] = useState<RegisterIdentityType>("email");
  const [identityType, setIdentityType] = useState<RegisterIdentityType>("email");
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("");
  const [phoneRegionId, setPhoneRegionId] = useState(DEFAULT_REGISTER_PHONE_REGION_ID);
  const [committedIdentity, setCommittedIdentity] = useState("");
  const [committedIdentityKey, setCommittedIdentityKey] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [lastVerificationIdentityKey, setLastVerificationIdentityKey] = useState("");
  const [verificationCooldown, setVerificationCooldown] = useState(0);
  const [verificationSent, setVerificationSent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);

  const selectedPhoneRegion = useMemo(() => getRegisterPhoneRegion(phoneRegionId), [phoneRegionId]);
  const normalizedIdentity = useMemo(() => {
    if (identityMode === "phone") return normalizePhoneIdentity(phoneRegionId, phoneLocalNumber);
    return normalizeEmailIdentity(emailIdentity);
  }, [emailIdentity, identityMode, phoneLocalNumber, phoneRegionId]);
  const turnstileSiteKey = useMemo(() => readTurnstileSiteKey(), []);
  const copy = getStepCopy(step, step === "identity" ? identityMode : identityType);
  const stepIndex = REGISTER_STEPS.findIndex((item) => item === step);
  const progressFill = stepIndex <= 0 ? 0 : stepIndex / (REGISTER_STEPS.length - 1);
  const progressStyle = { "--register-progress-fill": `${progressFill * 100}%` } as CSSProperties;
  const isFormLocked = disabled || verificationBusy || submitBusy || step === "success";
  const isTurnstileConfigured = Boolean(turnstileSiteKey);
  const canSendVerification = Boolean(isTurnstileConfigured && turnstileToken && verificationCooldown === 0 && !isFormLocked);
  const verificationButtonLabel = verificationBusy ? t("正在发送") : !isTurnstileConfigured ? t("等待验证码配置") : verificationSent ? t("重新发送验证码") : t("发送验证码");
  const termsLinkSeparator = i18n.language.toLowerCase().startsWith("en") ? t("协议链接分隔符") : "";

  useEffect(() => {
    if (verificationCooldown <= 0) return undefined;

    const timer = window.setInterval(() => {
      setVerificationCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [verificationCooldown]);

  useEffect(() => {
    if (step !== "verification" || isTurnstileConfigured) return;

    // 生产环境缺少站点 key 时保持在明确的配置缺失状态，避免用户误以为只是按钮偶发不可点。
    setTurnstileToken("");
    setErrors((current) => current.turnstile ? current : { ...current, turnstile: t("验证码组件未配置，请联系管理员") });
  }, [isTurnstileConfigured, step]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
      verificationAbortRef.current?.abort();
      submitAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (shouldReduceStepMotion) {
      setPanelHeight(null);
      return undefined;
    }

    if (!panelElement) return undefined;

    const updateHeight = () => {
      const nextHeight = Math.ceil(panelElement.scrollHeight || panelElement.getBoundingClientRect().height);
      if (nextHeight > 0) {
        setPanelHeight(nextHeight);
      }
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(panelElement);
    return () => observer.disconnect();
  }, [errors.code, errors.displayName, errors.identity, errors.password, errors.passwordConfirm, errors.terms, errors.turnstile, errors.username, identityMode, panelElement, shouldReduceStepMotion, step, verificationCooldown, verificationSent]);

  const clearError = (key: keyof FieldErrors) => {
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const moveToStep = (nextStep: RegisterStep, direction: 1 | -1) => {
    setStepDirection(direction);
    setStep(nextStep);
  };

  const resetVerificationState = () => {
    setVerificationCode("");
    setVerificationCooldown(0);
    setVerificationSent(false);
    setLastVerificationIdentityKey("");
    setTurnstileToken("");
    setTurnstileResetSignal((current) => current + 1);
  };

  const resetCredentialState = () => {
    setPassword("");
    setPasswordConfirm("");
    setDisplayName("");
    setUsername("");
    setUsernameTouched(false);
    resetVerificationState();
  };

  const switchIdentityMode = () => {
    if (isFormLocked) return;
    setIdentityMode((current) => current === "email" ? "phone" : "email");
    setCommittedIdentity("");
    setCommittedIdentityKey("");
    resetCredentialState();
    setErrors((current) => ({ ...current, identity: undefined, turnstile: undefined }));
  };

  const submitIdentity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked) return;

    const nextIdentity = normalizedIdentity;
    const nextErrors: FieldErrors = {};
    if (!nextIdentity) nextErrors.identity = identityMode === "phone" ? t("请输入有效手机号") : t("请输入有效邮箱");
    if (!acceptedTerms) nextErrors.terms = t("请先同意用户协议、隐私政策及相关服务规则");
    if (!nextIdentity || !acceptedTerms) {
      setErrors((current) => ({ ...current, ...nextErrors }));
      return;
    }

    const nextIdentityKey = getIdentityKey(nextIdentity.type, nextIdentity.value);
    if (committedIdentityKey && committedIdentityKey !== nextIdentityKey) {
      // 账号标识变化后，旧密码、旧验证码和昵称都不能继续沿用到新的注册主体。
      resetCredentialState();
    }

    setCommittedIdentityKey(nextIdentityKey);
    setCommittedIdentity(nextIdentity.value);
    setIdentityType(nextIdentity.type);
    setErrors({});
    moveToStep("password", 1);
  };

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked) return;

    const nextErrors: FieldErrors = {};
    if (!isStrongPassword(password)) nextErrors.password = t("密码至少需要 12 个字符");
    if (password !== passwordConfirm) nextErrors.passwordConfirm = t("两次输入的密码不一致");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    moveToStep("verification", 1);
  };

  const sendVerification = async() => {
    if (isFormLocked) return;
    if (verificationCooldown > 0) {
      setErrors((current) => ({ ...current, turnstile: formatCooldownLabel(verificationCooldown) }));
      return;
    }
    if (!turnstileSiteKey) {
      setErrors((current) => ({ ...current, turnstile: t("验证码组件未配置，请联系管理员") }));
      return;
    }
    if (!turnstileToken) {
      setErrors((current) => ({ ...current, turnstile: t("请先完成人机验证") }));
      return;
    }

    setVerificationBusy(true);
    setErrors((current) => ({ ...current, turnstile: undefined }));
    const abortController = new AbortController();
    verificationAbortRef.current?.abort();
    verificationAbortRef.current = abortController;
    try {
      const result = await requestRegisterVerification({
        identity: committedIdentity,
        identityType,
        turnstileToken,
      }, { signal: abortController.signal });
      setVerificationSent(true);
      setVerificationCode(result.devVerificationCode);
      setLastVerificationIdentityKey(committedIdentityKey);
      setVerificationCooldown(Math.max(0, result.cooldownSeconds ?? 0));
      setTurnstileToken("");
      setTurnstileResetSignal((current) => current + 1);
      onNotice(result.devVerificationCode ? t("本地开发验证码已填入") : result.delivery ? t("验证码已发送到{{delivery}}", { delivery: getDeliveryLabel(result.delivery) }) : t("验证码已发送"));
    } catch (error) {
      if (abortController.signal.aborted) return;
      setErrors((current) => ({
        ...current,
        turnstile: getPriestessApiErrorMessage(error, t("验证码发送失败")),
      }));
      setTurnstileToken("");
      setTurnstileResetSignal((current) => current + 1);
    } finally {
      if (verificationAbortRef.current === abortController) {
        verificationAbortRef.current = null;
        setVerificationBusy(false);
      }
    }
  };

  const submitVerification = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked) return;

    const normalizedCode = verificationCode.replace(/\s+/g, "");
    if (lastVerificationIdentityKey && committedIdentityKey !== lastVerificationIdentityKey) {
      resetVerificationState();
      setErrors((current) => ({ ...current, turnstile: t("账号信息已变化，请重新发送验证码") }));
      return;
    }
    if (!/^\d{6}$/.test(normalizedCode)) {
      setErrors((current) => ({ ...current, code: t("请输入 6 位数字验证码") }));
      return;
    }

    setVerificationCode(normalizedCode);
    setErrors((current) => ({ ...current, code: undefined }));
    moveToStep("profile", 1);
  };

  const submitProfile = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked) return;

    const normalizedDisplayName = displayName.trim();
    const usernameCandidate = usernameTouched ? username : username || createUsernameFromDisplayName(normalizedDisplayName);
    const usernameValidation = validateUsername(usernameCandidate);
    const nextErrors: FieldErrors = {};
    if (normalizedDisplayName.length === 0 || normalizedDisplayName.length > 80) {
      nextErrors.displayName = normalizedDisplayName ? t("昵称最多 80 个字符") : t("昵称不能为空");
    }
    if (usernameValidation.error) {
      nextErrors.username = usernameValidation.error;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors((current) => ({ ...current, ...nextErrors }));
      return;
    }

    setUsername(usernameValidation.value);
    setSubmitBusy(true);
    setErrors((current) => ({ ...current, displayName: undefined, username: undefined }));
    const abortController = new AbortController();
    submitAbortRef.current?.abort();
    submitAbortRef.current = abortController;
    try {
      const session = await confirmLocalRegistration({
        displayName: normalizedDisplayName,
        identity: committedIdentity,
        identityType,
        password,
        username: usernameValidation.value,
        verificationCode,
      }, { signal: abortController.signal });
      moveToStep("success", 1);
      onNotice(t("注册成功"));
      successTimerRef.current = window.setTimeout(() => {
        void onRegistered(session, committedIdentity).catch((error) => {
          setSubmitBusy(false);
          moveToStep("profile", -1);
          setErrors((current) => ({
            ...current,
            displayName: getPriestessApiErrorMessage(error, t("注册完成后跳转失败")),
          }));
        });
      }, SUCCESS_REDIRECT_DELAY_MS);
    } catch (error) {
      if (abortController.signal.aborted) return;
      setSubmitBusy(false);
      const errorCode = getPriestessApiErrorCode(error);
      const message = getPriestessApiErrorMessage(error, t("注册失败"));

      // 后端最终确认会重新校验跨步骤状态；错误回到对应步骤，避免用户在昵称页处理验证码或密码问题。
      if (["registration_verification_invalid", "invalid_registration_code"].includes(errorCode)) {
        moveToStep("verification", -1);
        setErrors({ code: message });
        return;
      }
      if (["weak_local_password", "invalid_password"].includes(errorCode)) {
        moveToStep("password", -1);
        setErrors({ password: message });
        return;
      }
      if (["local_user_exists", "invalid_registration_identity", "invalid_registration_identity_type"].includes(errorCode)) {
        resetCredentialState();
        moveToStep("identity", -1);
        setErrors({ identity: message });
        return;
      }
      if (["invalid_register_username", "invalid_username", "register_username_exists", "register_username_reserved", "reserved_username", "username_taken"].includes(errorCode)) {
        setErrors({ username: message });
        return;
      }
      setErrors({ displayName: message });
    } finally {
      if (submitAbortRef.current === abortController) {
        submitAbortRef.current = null;
      }
    }
  };

  const goBack = () => {
    if (isFormLocked) return;
    if (step === "identity") {
      onBackToLogin();
      return;
    }
    if (step === "password") moveToStep("identity", -1);
    if (step === "verification") moveToStep("password", -1);
    if (step === "profile") moveToStep("verification", -1);
  };

  return (
    <>
      <div className="login-card__mark" aria-hidden="true">
        <svg viewBox="0 0 48 48">
          <path d="M24 5c5.5 4.5 5.5 10.5 0 16-5.5-5.5-5.5-11.5 0-16Z" />
          <path d="M43 24c-4.5 5.5-10.5 5.5-16 0 5.5-5.5 11.5-5.5 16 0Z" />
          <path d="M24 43c-5.5-4.5-5.5-10.5 0-16 5.5 5.5 5.5 11.5 0 16Z" />
          <path d="M5 24c4.5-5.5 10.5-5.5 16 0-5.5 5.5-11.5 5.5-16 0Z" />
          <circle cx="24" cy="24" r="3.2" />
        </svg>
      </div>

      <motion.div
        animate={shouldReduceStepMotion || panelHeight === null ? undefined : { height: panelHeight }}
        className="register-step-viewport"
        transition={shouldReduceStepMotion ? { duration: 0 } : { duration: 0.34, ease: STEP_PANEL_EASE }}
      >
        <AnimatePresence custom={stepDirection} initial={false} mode="wait">
          <motion.div
            ref={setPanelElement}
            animate="center"
            className="register-step-panel"
            custom={stepDirection}
            exit="exit"
            initial={shouldReduceStepMotion ? false : "enter"}
            key={step}
            transition={shouldReduceStepMotion ? { duration: 0 } : { duration: 0.28, ease: STEP_PANEL_EASE }}
            variants={STEP_PANEL_VARIANTS}
          >
          <div className="login-card__heading">
            <h1 id="register-title">{t(copy.title)}</h1>
            <p>{t(copy.description)}</p>
          </div>

          {step !== "success" ? (
            <ol className="register-progress" style={progressStyle} aria-label={t("注册进度")}>
              {REGISTER_STEPS.map((item, index) => {
                const state = index < stepIndex ? "done" : index === stepIndex ? "current" : "pending";
                return (
                  <li className={`register-progress__item register-progress__item--${state}`} key={item} aria-current={state === "current" ? "step" : undefined}>
                    <span className="register-progress__dot">{index + 1}</span>
                    <span className="register-progress__label">{t(REGISTER_STEP_LABELS[item])}</span>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {step === "identity" ? (
            <form className="login-form" noValidate onSubmit={submitIdentity}>
          <label className="field-group">
            <span className="field-group__label">{identityMode === "phone" ? t("手机号") : t("邮箱")}</span>
            {identityMode === "phone" ? (
              <span className={`text-field register-phone-field ${errors.identity ? "text-field--error" : ""}`}>
                <Phone aria-hidden="true" size={20} strokeWidth={1.8} />
                <select
                  aria-label={t("手机号区号")}
                  disabled={isFormLocked}
                  onChange={(event) => {
                    const nextRegion = getRegisterPhoneRegion(event.target.value);
                    setPhoneRegionId(nextRegion.id);
                    setPhoneLocalNumber((current) => normalizePhoneLocalInput(current, nextRegion));
                    if (errors.identity) clearError("identity");
                  }}
                  value={phoneRegionId}
                >
                  {REGISTER_PHONE_REGIONS.map((region) => (
                    <option key={region.id} value={region.id}>{t(region.label)} {region.callingCode}</option>
                  ))}
                </select>
                <input
                  aria-invalid={Boolean(errors.identity)}
                  aria-describedby={errors.identity ? "register-identity-error" : undefined}
                  autoComplete="tel-national"
                  disabled={isFormLocked}
                  inputMode="tel"
                  onChange={(event) => {
                    setPhoneLocalNumber(normalizePhoneLocalInput(event.target.value, selectedPhoneRegion));
                    if (errors.identity) clearError("identity");
                  }}
                  placeholder={selectedPhoneRegion.example}
                  type="tel"
                  value={phoneLocalNumber}
                />
              </span>
            ) : (
              <span className={`text-field ${errors.identity ? "text-field--error" : ""}`}>
                <Mail aria-hidden="true" size={20} strokeWidth={1.8} />
                <input
                  aria-invalid={Boolean(errors.identity)}
                  aria-describedby={errors.identity ? "register-identity-error" : undefined}
                  autoComplete="email"
                  disabled={isFormLocked}
                  inputMode="email"
                  onChange={(event) => {
                    setEmailIdentity(event.target.value);
                    if (errors.identity) clearError("identity");
                  }}
                  placeholder="mikael@example.com"
                  type="email"
                  value={emailIdentity}
                />
              </span>
            )}
            {errors.identity && <span className="field-error" id="register-identity-error">{errors.identity}</span>}
          </label>

          <div className="register-identity-switch">
            <button className="register-identity-toggle" disabled={isFormLocked} onClick={switchIdentityMode} type="button">
              {identityMode === "phone" ? <Mail aria-hidden="true" size={15} strokeWidth={1.9} /> : <Phone aria-hidden="true" size={15} strokeWidth={1.9} />}
              <span>{identityMode === "phone" ? t("使用邮箱注册") : t("使用手机号注册")}</span>
            </button>
          </div>

          <div className={`register-terms-consent ${isFormLocked ? "register-terms-consent--disabled" : ""}`}>
            <input
              aria-describedby={errors.terms ? "register-terms-error" : undefined}
              aria-invalid={Boolean(errors.terms)}
              aria-label={t("同意用户协议和隐私政策")}
              checked={acceptedTerms}
              className="checkbox-line__input"
              disabled={isFormLocked}
              id="register-terms-consent"
              onChange={(event) => {
                setAcceptedTerms(event.target.checked);
                if (errors.terms) clearError("terms");
              }}
              type="checkbox"
            />
            <label className="register-terms-consent__control" htmlFor="register-terms-consent">
              <motion.span
                aria-hidden="true"
                className="checkbox-line__box"
                animate={acceptedTerms ? {
                  backgroundColor: "#c65f72",
                  borderColor: "rgba(198, 95, 114, 0.9)",
                  boxShadow: "0 6px 14px rgba(198, 95, 114, 0.22)",
                  scale: shouldReduceStepMotion ? 1 : [1, 0.84, 1.1, 1],
                } : {
                backgroundColor: "rgba(255, 255, 255, 0.36)",
                borderColor: errors.terms ? "rgba(190, 59, 78, 0.52)" : "rgba(36, 35, 31, 0.22)",
                boxShadow: errors.terms ? "0 0 0 3px rgba(190, 59, 78, 0.08)" : "0 0 0 rgba(198, 95, 114, 0)",
                scale: 1,
              }}
                initial={false}
                transition={shouldReduceStepMotion ? { duration: 0 } : { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <svg className="checkbox-line__check" viewBox="0 0 16 16">
                  <motion.path
                    animate={{
                      opacity: acceptedTerms ? 1 : 0,
                      pathLength: acceptedTerms ? 1 : 0,
                    }}
                    d="M4 8.3 6.8 11 12.4 5"
                    fill="none"
                    initial={false}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.1"
                    transition={shouldReduceStepMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                  />
                </svg>
              </motion.span>
            </label>
            <span className="register-terms-consent__text">
              {t("我已阅读并同意")}
              <a aria-label={t("打开 KurisuRakko 用户协议")} href="https://rakko.cn/terms" rel="noreferrer" target="_blank">{t("《KurisuRakko 用户协议》")}</a>
              {termsLinkSeparator}
              <a aria-label={t("打开隐私政策")} href="https://rakko.cn/privacy" rel="noreferrer" target="_blank">{t("《隐私政策》")}</a>
              {t("及相关服务规则。")}
            </span>
            {errors.terms ? <span className="field-error register-terms-consent__error" id="register-terms-error">{errors.terms}</span> : null}
          </div>

          <button className="primary-button" disabled={isFormLocked} type="submit">
            <span>{t("继续")}</span>
            <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
          </button>
            </form>
          ) : null}

          {step === "password" ? (
            <form className="login-form" noValidate onSubmit={submitPassword}>
          <label className="field-group">
            <span className="field-group__label">{t("密码")}</span>
            <span className={`text-field ${errors.password ? "text-field--error" : ""}`}>
              <KeyRound aria-hidden="true" size={20} strokeWidth={1.8} />
              <input
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? "register-password-error" : undefined}
                autoComplete="new-password"
                disabled={isFormLocked}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (errors.password) clearError("password");
                }}
                placeholder={t("设置密码")}
                type="password"
                value={password}
              />
            </span>
            {errors.password && <span className="field-error" id="register-password-error">{errors.password}</span>}
          </label>

          <label className="field-group">
            <span className="field-group__label">{t("确认密码")}</span>
            <span className={`text-field ${errors.passwordConfirm ? "text-field--error" : ""}`}>
              <KeyRound aria-hidden="true" size={20} strokeWidth={1.8} />
              <input
                aria-invalid={Boolean(errors.passwordConfirm)}
                aria-describedby={errors.passwordConfirm ? "register-password-confirm-error" : undefined}
                autoComplete="new-password"
                disabled={isFormLocked}
                onChange={(event) => {
                  setPasswordConfirm(event.target.value);
                  if (errors.passwordConfirm) clearError("passwordConfirm");
                }}
                placeholder={t("再输入一次")}
                type="password"
                value={passwordConfirm}
              />
            </span>
            {errors.passwordConfirm && <span className="field-error" id="register-password-confirm-error">{errors.passwordConfirm}</span>}
          </label>

          <button className="primary-button" disabled={isFormLocked} type="submit">
            <span>{t("继续")}</span>
            <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
          </button>
            </form>
          ) : null}

          {step === "verification" ? (
            <form className="login-form" noValidate onSubmit={submitVerification}>
          <label className="field-group">
            <span className="field-group__label">{t("Cloudflare 验证")}</span>
            <TurnstileWidget
              disabled={disabled || verificationBusy || submitBusy || !isTurnstileConfigured}
              onError={() => setErrors((current) => ({ ...current, turnstile: t("验证码组件加载失败，请重试") }))}
              onExpire={() => {
                setTurnstileToken("");
                setErrors((current) => ({ ...current, turnstile: t("人机验证已过期，请重新完成") }));
              }}
              onToken={(token) => {
                setTurnstileToken(token);
                setErrors((current) => ({ ...current, turnstile: undefined }));
              }}
              resetSignal={turnstileResetSignal}
              siteKey={turnstileSiteKey}
            />
            {errors.turnstile && <span className="field-error">{errors.turnstile}</span>}
          </label>

          <button className={verificationSent ? "secondary-button" : "primary-button"} disabled={!canSendVerification} onClick={sendVerification} type="button">
            <span>{verificationButtonLabel}</span>
            <ShieldCheck aria-hidden="true" size={19} strokeWidth={1.8} />
          </button>
          {verificationCooldown > 0 ? <span className="register-inline-note">{formatCooldownLabel(verificationCooldown)}</span> : null}

          {verificationSent ? (
            <>
              <label className="field-group">
                <span className="field-group__label">{identityType === "phone" ? t("手机验证码") : t("邮箱验证码")}</span>
                <span className={`text-field ${errors.code ? "text-field--error" : ""}`}>
                  <ShieldCheck aria-hidden="true" size={20} strokeWidth={1.8} />
                  <input
                    aria-invalid={Boolean(errors.code)}
                    aria-describedby={errors.code ? "register-code-error" : undefined}
                    autoComplete="one-time-code"
                    disabled={isFormLocked}
                    inputMode="numeric"
                    onChange={(event) => {
                      setVerificationCode(event.target.value);
                      if (errors.code) clearError("code");
                    }}
                    placeholder="123456"
                    type="text"
                    value={verificationCode}
                  />
                </span>
                {errors.code && <span className="field-error" id="register-code-error">{errors.code}</span>}
              </label>

              <button className="primary-button" disabled={isFormLocked} type="submit">
                <span>{t("确认验证码")}</span>
                <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
              </button>
            </>
          ) : null}
            </form>
          ) : null}

          {step === "profile" ? (
            <form className="login-form" noValidate onSubmit={submitProfile}>
          <label className="field-group">
            <span className="field-group__label">{t("昵称")}</span>
            <span className={`text-field ${errors.displayName ? "text-field--error" : ""}`}>
              <UserRound aria-hidden="true" size={20} strokeWidth={1.8} />
              <input
                aria-invalid={Boolean(errors.displayName)}
                aria-describedby={errors.displayName ? "register-display-name-error" : undefined}
                autoComplete="nickname"
                disabled={isFormLocked}
                onChange={(event) => {
                  const nextDisplayName = event.target.value;
                  setDisplayName(nextDisplayName);
                  // 用户未手动改用户名时，昵称变化会继续驱动用户名候选值。
                  if (!usernameTouched) setUsername(createUsernameFromDisplayName(nextDisplayName));
                  if (errors.displayName) clearError("displayName");
                  if (!usernameTouched && errors.username) clearError("username");
                }}
                placeholder={t("百夜米迦尔")}
                type="text"
                value={displayName}
              />
            </span>
            {errors.displayName && <span className="field-error" id="register-display-name-error">{errors.displayName}</span>}
          </label>

          <label className="field-group">
            <span className="field-group__label">{t("用户名")}</span>
            <span className={`text-field ${errors.username ? "text-field--error" : ""}`}>
              <AtSign aria-hidden="true" size={20} strokeWidth={1.8} />
              <input
                aria-invalid={Boolean(errors.username)}
                aria-describedby={errors.username ? "register-username-error" : undefined}
                autoComplete="username"
                disabled={isFormLocked}
                onChange={(event) => {
                  setUsernameTouched(true);
                  setUsername(normalizeUsernameInput(event.target.value));
                  if (errors.username) clearError("username");
                }}
                placeholder="KurisuRakko"
                type="text"
                value={username}
              />
            </span>
            {errors.username && <span className="field-error" id="register-username-error">{errors.username}</span>}
          </label>

          <button className="primary-button" disabled={isFormLocked} type="submit">
            <span>{submitBusy ? t("正在创建") : t("创建账号")}</span>
            <ArrowRight aria-hidden="true" size={21} strokeWidth={1.8} />
          </button>
            </form>
          ) : null}

          {step === "success" ? (
            <div className="login-form" aria-live="polite">
          <p className="signup-line" style={{ justifyContent: "flex-start", marginTop: 0 }}>
            <CheckCircle2 aria-hidden="true" size={19} strokeWidth={1.8} />
            {t("正在进入 Priestess")}
          </p>
            </div>
          ) : null}

          {step !== "success" ? (
            <p className="signup-line">
          {step === "identity" ? t("已有账号？") : t("需要修改？")}
          <button className="text-link signup-line__button" disabled={isFormLocked} onClick={goBack} type="button">
            <ArrowLeft aria-hidden="true" size={15} strokeWidth={1.9} />
            <span>{step === "identity" ? t("返回登录") : t("上一步")}</span>
          </button>
            </p>
          ) : null}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </>
  );
}
