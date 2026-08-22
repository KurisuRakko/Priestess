import { type CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, AtSign, CheckCircle2, Mail, Phone, UserRound } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { pinyin } from "pinyin-pro";
import {
  checkRegisterInvite,
  checkRegisterVerification,
  confirmLocalRegistration,
  getPriestessApiErrorCode,
  getPriestessApiErrorMessage,
  requestRegisterVerification,
  toHalfWidth,
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
import {
  getProgressStepLabel,
  getRegisterProgressStep,
  getStepCopy,
  REGISTER_PROGRESS_STEPS,
  type RegisterStep,
} from "./registerStepConfig";
import { RegisterPasswordStep } from "./RegisterPasswordStep";
import { RegisterStepMotionPanel } from "./RegisterStepMotionPanel";
import { RegisterInvitationStep, RegisterVerificationStep } from "./RegisterVerificationSteps";
import { readTurnstileSiteKey } from "./TurnstileWidget";
import "./RegisterFirstStepForm.css";

const SUCCESS_REDIRECT_DELAY_MS = 700;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;
const CJK_CHARACTER_PATTERN = /[\u3400-\u9FFF]/u;
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,31}$/;
const USERNAME_MAX_LENGTH = 32;
const RESERVED_USERNAMES = new Set(["admin", "api", "assets", "auth", "help", "login", "me", "priestess", "register", "root", "settings", "static", "support", "system"]);
export type RegisterFirstStepFormProps = {
  disabled: boolean;
  isMobileViewport: boolean;
  onBackToLogin: () => void;
  onNotice: (message: string) => void;
  onRegistered: (session: LocalSession, fallbackIdentity: string) => Promise<void>;
};

type FieldErrors = {
  displayName?: string;
  identity?: string;
  inviteCode?: string;
  password?: string;
  passwordConfirm?: string;
  terms?: string;
  turnstile?: string;
  verificationCode?: string;
  username?: string;
};

// 用户名统一小写，与后端注册存库的小写化保持一致，避免用户看到与提交不一致。
export function normalizeUsernameInput(rawValue: string) {
  return rawValue.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_]/g, "").slice(0, USERNAME_MAX_LENGTH).toLowerCase();
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

function isRegistrationVerificationActive(challenge: string, expiresAt: number, identityKey: string, committedIdentityKey: string) {
  return Boolean(challenge && expiresAt > Math.floor(Date.now() / 1000) && identityKey === committedIdentityKey);
}

export function RegisterFirstStepForm({
  disabled,
  isMobileViewport,
  onBackToLogin,
  onNotice,
  onRegistered,
}: RegisterFirstStepFormProps) {
  const { i18n, t } = usePriestessTranslation("login");
  const shouldReduceStepMotion = useReducedMotion();
  const successTimerRef = useRef<number | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const verificationAbortRef = useRef<AbortController | null>(null);
  const [step, setStep] = useState<RegisterStep>("identity");
  const [stepDirection, setStepDirection] = useState(1);
  const [emailIdentity, setEmailIdentity] = useState("");
  const [identityMode, setIdentityMode] = useState<RegisterIdentityType>("email");
  const [identityType, setIdentityType] = useState<RegisterIdentityType>("email");
  const [phoneLocalNumber, setPhoneLocalNumber] = useState("");
  const [phoneRegionId, setPhoneRegionId] = useState(DEFAULT_REGISTER_PHONE_REGION_ID);
  const [committedIdentity, setCommittedIdentity] = useState("");
  const [committedIdentityKey, setCommittedIdentityKey] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteChallenge, setInviteChallenge] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationChallenge, setVerificationChallenge] = useState("");
  const [verificationChallengeExpiresAt, setVerificationChallengeExpiresAt] = useState(0);
  const [verificationIdentityKey, setVerificationIdentityKey] = useState("");
  const [verificationRequestId, setVerificationRequestId] = useState("");
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [turnstileResetSignal, setTurnstileResetSignal] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
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
  const progressStep = getRegisterProgressStep(step);
  const progressStepIndex = REGISTER_PROGRESS_STEPS.indexOf(progressStep);
  const progressFill = progressStepIndex <= 0 ? 0 : progressStepIndex / (REGISTER_PROGRESS_STEPS.length - 1);
  const progressStyle = { "--register-progress-fill": `${progressFill * 100}%` } as CSSProperties;
  const isFormLocked = disabled || submitBusy || verificationBusy || step === "success";
  const isVerificationReady = Boolean(verificationRequestId && verificationIdentityKey === committedIdentityKey);
  const isVerificationConfirmed = isRegistrationVerificationActive(
    verificationChallenge,
    verificationChallengeExpiresAt,
    verificationIdentityKey,
    committedIdentityKey,
  );
  const canCheckInvite = Boolean(inviteCode.trim() && turnstileSiteKey && turnstileToken && !isFormLocked);
  const termsLinkSeparator = i18n.language.toLowerCase().startsWith("en") ? t("协议链接分隔符") : "";

  useEffect(() => {
    if (step !== "invitation" || inviteChallenge || turnstileSiteKey) return;
    setErrors((current) => current.turnstile
      ? current
      : { ...current, turnstile: t("验证码组件未配置，请联系管理员") });
  }, [inviteChallenge, step, t, turnstileSiteKey]);

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResendCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldownSeconds]);

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
    if (isMobileViewport) {
      setPanelHeight(null);
      return undefined;
    }
    if (!panelElement) return undefined;

    const updateHeight = () => {
      const nextHeight = Math.ceil(panelElement.scrollHeight || panelElement.getBoundingClientRect().height);
      if (nextHeight > 0) setPanelHeight(nextHeight);
    };
    updateHeight();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(panelElement);
    return () => observer.disconnect();
  }, [isMobileViewport, panelElement]);

  const clearError = (key: keyof FieldErrors) => {
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const moveToStep = (nextStep: RegisterStep, direction: 1 | -1) => {
    if (isMobileViewport) {
      // 每个注册步骤都从同一内容原点开始，避免上一页滚动位置把新表单推到屏幕外。
      panelElement?.closest(".login-card")?.scrollTo({ behavior: "auto", top: 0 });
    }
    setStepDirection(direction);
    setStep(nextStep);
  };

  const resetVerificationState = () => {
    setVerificationCode("");
    setVerificationChallenge("");
    setVerificationChallengeExpiresAt(0);
    setVerificationIdentityKey("");
    setVerificationRequestId("");
    setResendCooldownSeconds(0);
  };

  const resetInviteState = () => {
    setInviteCode("");
    setInviteChallenge("");
    setTurnstileToken("");
    setTurnstileResetSignal((current) => current + 1);
    resetVerificationState();
  };

  const resetCredentialState = () => {
    setPassword("");
    setPasswordConfirm("");
    setDisplayName("");
    setUsername("");
    setUsernameTouched(false);
    resetInviteState();
  };

  const switchIdentityMode = () => {
    if (isFormLocked) return;
    setIdentityMode((current) => current === "email" ? "phone" : "email");
    setCommittedIdentity("");
    setCommittedIdentityKey("");
    resetCredentialState();
    setErrors((current) => ({ ...current, identity: undefined, inviteCode: undefined, turnstile: undefined, verificationCode: undefined }));
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
      // 账号标识变化后，旧密码、旧邀请码和昵称都不能继续沿用到新的注册主体。
      resetCredentialState();
    }

    setCommittedIdentityKey(nextIdentityKey);
    setCommittedIdentity(nextIdentity.value);
    setIdentityType(nextIdentity.type);
    setErrors({});
    moveToStep("invitation", 1);
  };

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked) return;

    const nextErrors: FieldErrors = {};
    if (!isStrongPassword(password)) nextErrors.password = t("密码至少需要 12 个字符");
    if (password !== passwordConfirm) nextErrors.passwordConfirm = t("两次输入的密码不一致");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    moveToStep("profile", 1);
  };

  const requestVerificationCode = async(params: {
    inviteChallengeValue: string;
    inviteCodeValue: string;
    signal: AbortSignal;
  }) => {
    const result = await requestRegisterVerification({
      identity: committedIdentity,
      identityType,
      inviteChallenge: params.inviteChallengeValue,
      inviteCode: params.inviteCodeValue,
    }, { signal: params.signal });
    if (!result.accepted || !result.requestId) {
      throw new Error(t("后端未返回验证码发送结果"));
    }
    setVerificationChallenge("");
    setVerificationChallengeExpiresAt(0);
    setVerificationIdentityKey(committedIdentityKey);
    setVerificationRequestId(result.requestId);
    setResendCooldownSeconds(result.cooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS);
    if (result.devVerificationCode) {
      setVerificationCode(result.devVerificationCode);
      onNotice(t("本地开发验证码已填入"));
    } else {
      setVerificationCode("");
      onNotice(result.delivery ? t("验证码已发送到{{delivery}}", { delivery: result.delivery }) : t("验证码已发送"));
    }
  };

  const sendVerificationCode = async() => {
    if (isFormLocked || verificationBusy || resendCooldownSeconds > 0) return;
    if (!inviteChallenge) {
      moveToStep("invitation", -1);
      setErrors({ inviteCode: t("请先校验邀请码") });
      return;
    }
    if (!committedIdentity || !committedIdentityKey) {
      moveToStep("identity", -1);
      setErrors({ identity: t("账号信息已变化，请重新填写") });
      return;
    }

    setVerificationBusy(true);
    setErrors((current) => ({ ...current, verificationCode: undefined }));
    const abortController = new AbortController();
    verificationAbortRef.current?.abort();
    verificationAbortRef.current = abortController;
    try {
      await requestVerificationCode({
        inviteChallengeValue: inviteChallenge,
        inviteCodeValue: inviteCode,
        signal: abortController.signal,
      });
    } catch (error) {
      if (abortController.signal.aborted) return;
      const errorCode = getPriestessApiErrorCode(error);
      if (["registration_invite_challenge_required", "registration_invite_challenge_invalid"].includes(errorCode)) {
        setInviteChallenge("");
        resetVerificationState();
        moveToStep("invitation", -1);
        setErrors({ inviteCode: getPriestessApiErrorMessage(error, t("邀请码校验已失效")) });
        return;
      }
      setVerificationRequestId("");
      setVerificationIdentityKey("");
      setErrors((current) => ({ ...current, verificationCode: getPriestessApiErrorMessage(error, t("验证码发送失败")) }));
    } finally {
      if (verificationAbortRef.current === abortController) {
        verificationAbortRef.current = null;
        setVerificationBusy(false);
      }
    }
  };

  const submitInvitation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked || verificationBusy) return;

    const normalizedInviteCode = inviteCode.trim();
    if (!normalizedInviteCode) {
      setErrors((current) => ({ ...current, inviteCode: t("请输入邀请码") }));
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
    setErrors((current) => ({ ...current, inviteCode: undefined, turnstile: undefined }));
    const abortController = new AbortController();
    verificationAbortRef.current?.abort();
    verificationAbortRef.current = abortController;
    try {
      const result = await checkRegisterInvite({
        identity: committedIdentity,
        identityType,
        inviteCode: normalizedInviteCode,
        turnstileToken,
      }, { signal: abortController.signal });
      if (!result.accepted || !result.inviteChallenge) {
        throw new Error(t("后端未返回邀请码校验结果"));
      }
      setInviteCode(normalizedInviteCode);
      setInviteChallenge(result.inviteChallenge);
      setTurnstileToken("");
      setTurnstileResetSignal((current) => current + 1);
      resetVerificationState();
      moveToStep("verification", 1);
      onNotice(t("邀请码已验证，正在发送验证码"));
      try {
        await requestVerificationCode({
          inviteChallengeValue: result.inviteChallenge,
          inviteCodeValue: normalizedInviteCode,
          signal: abortController.signal,
        });
      } catch (error) {
        if (abortController.signal.aborted) return;
        setErrors({ verificationCode: getPriestessApiErrorMessage(error, t("验证码发送失败，请重试")) });
      }
    } catch (error) {
      if (abortController.signal.aborted) return;
      const errorCode = getPriestessApiErrorCode(error);
      const message = getPriestessApiErrorMessage(error, t("邀请码校验失败"));
      if (["local_user_exists", "invalid_registration_identity", "invalid_registration_identity_type"].includes(errorCode)) {
        resetCredentialState();
        moveToStep("identity", -1);
        setErrors({ identity: message });
        return;
      }
      if (["registration_turnstile_failed", "registration_turnstile_not_configured", "turnstile_invalid", "turnstile_required"].includes(errorCode)) {
        setErrors((current) => ({ ...current, turnstile: message }));
      } else {
        setErrors((current) => ({ ...current, inviteCode: message }));
      }
      setInviteChallenge("");
      setTurnstileToken("");
      setTurnstileResetSignal((current) => current + 1);
    } finally {
      if (verificationAbortRef.current === abortController) {
        verificationAbortRef.current = null;
        setVerificationBusy(false);
      }
    }
  };

  const submitVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFormLocked || verificationBusy) return;
    const hasActiveVerificationChallenge = isRegistrationVerificationActive(
      verificationChallenge,
      verificationChallengeExpiresAt,
      verificationIdentityKey,
      committedIdentityKey,
    );
    if (hasActiveVerificationChallenge) {
      setErrors((current) => ({ ...current, verificationCode: undefined }));
      moveToStep("password", 1);
      return;
    }
    if (verificationChallenge) {
      setVerificationChallenge("");
      setVerificationChallengeExpiresAt(0);
      setVerificationCode("");
      setVerificationRequestId("");
      setErrors((current) => ({ ...current, verificationCode: t("账号验证已过期，请重新发送验证码") }));
      return;
    }

    const normalizedVerificationCode = verificationCode.trim();
    if (!isVerificationReady) {
      setErrors((current) => ({ ...current, verificationCode: t("请先发送验证码") }));
      return;
    }
    if (!/^[0-9]{6}$/.test(normalizedVerificationCode)) {
      setErrors((current) => ({ ...current, verificationCode: t("请输入 6 位数字验证码") }));
      return;
    }

    setVerificationBusy(true);
    setErrors((current) => ({ ...current, verificationCode: undefined }));
    const abortController = new AbortController();
    verificationAbortRef.current?.abort();
    verificationAbortRef.current = abortController;
    try {
      const result = await checkRegisterVerification({
        identity: committedIdentity,
        identityType,
        inviteChallenge,
        inviteCode,
        verificationCode: normalizedVerificationCode,
        verificationRequestId,
      }, { signal: abortController.signal });
      if (!result.accepted || !result.verificationChallenge || result.expiresAt <= 0) {
        throw new Error(t("后端未返回账号验证结果"));
      }
      setVerificationCode(normalizedVerificationCode);
      setVerificationChallenge(result.verificationChallenge);
      setVerificationChallengeExpiresAt(result.expiresAt);
      setVerificationIdentityKey(committedIdentityKey);
      setErrors((current) => ({ ...current, verificationCode: undefined }));
      onNotice(t("账号验证码已确认"));
      moveToStep("password", 1);
    } catch (error) {
      if (abortController.signal.aborted) return;
      const errorCode = getPriestessApiErrorCode(error);
      const message = getPriestessApiErrorMessage(error, t("验证码校验失败"));
      if (["registration_invite_challenge_required", "registration_invite_challenge_invalid"].includes(errorCode)) {
        setInviteChallenge("");
        resetVerificationState();
        moveToStep("invitation", -1);
        setErrors({ inviteCode: message });
        return;
      }
      setVerificationChallenge("");
      setVerificationChallengeExpiresAt(0);
      setErrors((current) => ({ ...current, verificationCode: message }));
    } finally {
      if (verificationAbortRef.current === abortController) {
        verificationAbortRef.current = null;
        setVerificationBusy(false);
      }
    }
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
    if (!inviteChallenge) {
      moveToStep("invitation", -1);
      setErrors({ inviteCode: t("请先校验邀请码") });
      return;
    }
    const hasActiveVerificationChallenge = isRegistrationVerificationActive(
      verificationChallenge,
      verificationChallengeExpiresAt,
      verificationIdentityKey,
      committedIdentityKey,
    );
    if (!hasActiveVerificationChallenge) {
      setVerificationChallenge("");
      setVerificationChallengeExpiresAt(0);
      moveToStep("verification", -1);
      setErrors({ verificationCode: t("账号验证已失效，请重新获取验证码") });
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
        inviteChallenge,
        inviteCode,
        password,
        verificationChallenge,
        username: usernameValidation.value,
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

      // 后端最终确认会重新校验跨步骤状态；错误回到对应步骤，避免用户在昵称页处理邀请码或密码问题。
      if (["registration_invite_invalid", "registration_invite_not_configured", "registration_invite_required", "registration_invite_challenge_required", "registration_invite_challenge_invalid"].includes(errorCode)) {
        setInviteChallenge("");
        resetVerificationState();
        moveToStep("invitation", -1);
        setErrors({ inviteCode: message });
        return;
      }
      if (["registration_verification_invalid", "invalid_registration_code", "registration_verification_challenge_required", "registration_verification_challenge_invalid"].includes(errorCode)) {
        setVerificationChallenge("");
        setVerificationChallengeExpiresAt(0);
        moveToStep("verification", -1);
        setErrors({ verificationCode: message });
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
    if (step === "invitation") moveToStep("identity", -1);
    if (step === "verification") moveToStep("invitation", -1);
    if (step === "password") moveToStep("verification", -1);
    if (step === "profile") moveToStep("password", -1);
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

      <div
        className="register-step-viewport"
        style={isMobileViewport
          ? { height: "auto" }
          : panelHeight === null
            ? undefined
            : { height: panelHeight }}
      >
        <AnimatePresence custom={stepDirection} initial={false} mode="wait">
          <RegisterStepMotionPanel
            direction={stepDirection}
            isMobileViewport={isMobileViewport}
            key={step}
            panelRef={setPanelElement}
            shouldReduceMotion={shouldReduceStepMotion}
            step={step}
          >
          <div className="login-card__heading">
            <h1 id="register-title">{t(copy.title)}</h1>
            <p>{t(copy.description)}</p>
          </div>

          {step !== "success" ? (
            <ol className="register-progress" style={progressStyle} aria-label={t("注册进度")}>
              {REGISTER_PROGRESS_STEPS.map((item, index) => {
                const state = index < progressStepIndex ? "done" : index === progressStepIndex ? "current" : "pending";
                return (
                  <li className={`register-progress__item register-progress__item--${state}`} key={item} aria-current={state === "current" ? "step" : undefined}>
                    <span className="register-progress__dot">{index + 1}</span>
                    <span className="register-progress__label">{t(getProgressStepLabel(item, step === "identity" ? identityMode : identityType))}</span>
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
                  autoCapitalize="none"
                  autoComplete="email"
                  disabled={isFormLocked}
                  inputMode="email"
                  onChange={(event) => {
                    // IME 全角 @ 是真实误输入场景，先转半角再统一小写。
                    setEmailIdentity(toHalfWidth(event.target.value).toLowerCase());
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
            <RegisterPasswordStep
              confirmation={passwordConfirm}
              confirmationError={errors.passwordConfirm}
              disabled={isFormLocked}
              onConfirmationChange={(value) => {
                // IME 全角误输入兜底为半角，与密码框保持一致。
                setPasswordConfirm(toHalfWidth(value));
                if (errors.passwordConfirm) clearError("passwordConfirm");
              }}
              onPasswordChange={(value) => {
                // IME 全角误输入兜底为半角，避免存库密码与用户看到的不一致。
                setPassword(toHalfWidth(value));
                if (errors.password) clearError("password");
              }}
              onSubmit={submitPassword}
              password={password}
              passwordError={errors.password}
            />
          ) : null}

          {step === "invitation" ? (
            <RegisterInvitationStep
              busy={verificationBusy}
              canSubmit={canCheckInvite}
              disabled={isFormLocked}
              inviteCode={inviteCode}
              inviteError={errors.inviteCode}
              onInviteCodeChange={(value) => {
                setInviteCode(value);
                // 邀请码变化后，所有绑定旧邀请码的下游状态都必须失效。
                setInviteChallenge("");
                resetVerificationState();
                setPassword("");
                setPasswordConfirm("");
                setDisplayName("");
                setUsername("");
                setUsernameTouched(false);
                setTurnstileToken("");
                setTurnstileResetSignal((current) => current + 1);
                if (errors.inviteCode) clearError("inviteCode");
                if (errors.turnstile) clearError("turnstile");
              }}
              onSubmit={submitInvitation}
              onTurnstileError={() => {
                setInviteChallenge("");
                setTurnstileToken("");
                setErrors((current) => ({ ...current, turnstile: t("验证码组件加载失败，请重试") }));
              }}
              onTurnstileExpire={() => {
                setInviteChallenge("");
                setTurnstileToken("");
                setErrors((current) => ({ ...current, turnstile: t("人机验证已过期，请重新完成") }));
              }}
              onTurnstileToken={(token) => {
                setInviteChallenge("");
                setTurnstileToken(token);
                setErrors((current) => ({ ...current, turnstile: undefined }));
              }}
              resetSignal={turnstileResetSignal}
              siteKey={turnstileSiteKey}
              turnstileError={errors.turnstile}
            />
          ) : null}

          {step === "verification" ? (
            <RegisterVerificationStep
              busy={verificationBusy}
              code={verificationCode}
              codeError={errors.verificationCode}
              disabled={isFormLocked}
              identityType={identityType}
              onCodeChange={(value) => {
                setVerificationCode(value);
                setVerificationChallenge("");
                setVerificationChallengeExpiresAt(0);
                if (errors.verificationCode) clearError("verificationCode");
              }}
              onSend={() => void sendVerificationCode()}
              onSubmit={submitVerification}
              requestReady={isVerificationReady}
              resendCooldownSeconds={resendCooldownSeconds}
              verified={isVerificationConfirmed}
            />
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
                placeholder="kurisurakko"
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
          </RegisterStepMotionPanel>
        </AnimatePresence>
      </div>
    </>
  );
}
