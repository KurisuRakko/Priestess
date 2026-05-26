import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import i18next, { createInstance, type i18n, type ResourceLanguage, type TOptions } from "i18next";
import { I18nextProvider, initReactI18next, useTranslation } from "react-i18next";

export const PRIESTESS_DEFAULT_LOCALE = "zh-CN";
export const PRIESTESS_EN_LOCALE = "en-US";
export const PRIESTESS_SUPPORTED_LOCALES = [PRIESTESS_DEFAULT_LOCALE, PRIESTESS_EN_LOCALE] as const;

export type PriestessLocale = typeof PRIESTESS_SUPPORTED_LOCALES[number];
export type PriestessI18nResources = Partial<Record<PriestessLocale, ResourceLanguage>>;

type PriestessI18nProviderProps = {
  children: ReactNode;
  resources?: PriestessI18nResources;
};

const sharedResources: Record<PriestessLocale, ResourceLanguage> = {
  "zh-CN": {
    common: {
      "common.appName": "Priestess",
      "Priestess 首页": "Priestess 首页",
      "Rakko 服务": "Rakko 服务",
      "[已隐藏]": "[已隐藏]",
      "未知 IP": "未知 IP",
      "未知浏览器": "未知浏览器",
      "未知系统": "未知系统",
      "浏览器": "浏览器",
      "账户活动": "账户活动",
      "账号 {{count}}": "账号 {{count}}",
      "当前应用": "当前应用",
      currentOrigin: "当前域名",
    },
    errors: {
      accountServiceUnavailable: "账户服务暂时不可用，请稍后再试或联系管理员",
      adminLoginRequired: "请先登录管理员会话",
      adminPasswordInvalid: "管理员密码不正确",
      apiRequestFailed: "后端请求失败 ({{status}})",
      cancelled: "请求已取消",
      forbidden: "当前会话没有管理权限",
      jsonParseFailed: "后端 JSON 响应解析失败",
      localApiBaseMissing: "账户服务暂时不可用，请稍后再试或联系管理员",
      invalidCurrentPassword: "当前密码不正确",
      invalidDisplayName: "昵称不能为空",
      invalidEmail: "邮箱格式不正确",
      invalidIdentity: "邮箱或手机号格式不正确",
      invalidPasskeyName: "Passkey 名称不能为空，且最多 80 个字符",
      invalidPasswordManager: "暂不支持这个密码管理器",
      invalidPasswordManagerLabel: "密码管理器名称不能为空，且最多 80 个字符",
      invalidTotpCode: "动态验证码不正确",
      invalidUsername: "用户名需为 3-32 位，并以字母开头",
      localLoginTemporarilyLocked: "登录已暂时冷却，请稍后再试",
      localUserExists: "这个邮箱或手机号已注册",
      notFound: "后端接口暂未接入",
      nonJsonResponse: "后端返回了非 JSON 响应，请检查 API 代理或前后端路径",
      passwordResetInvalid: "重置链接无效或已过期",
      registrationChannelFailed: "验证码发送失败，请稍后再试",
      registrationChannelMissing: "验证码发送通道未配置，请联系管理员",
      registrationCodeInvalid: "验证码不正确或已过期",
      registrationTurnstileMissing: "验证码组件未配置，请联系管理员",
      requestFailed: "请求失败",
      returnUrlNotAllowed: "当前应用回跳地址未被允许",
      sessionInvalid: "登录已失效或账号密码不正确",
      totpChallengeInvalid: "二步验证已过期，请重新登录",
      turnstileFailed: "人机验证未通过，请重试",
      usernameExists: "这个用户名已被占用",
      usernameReserved: "这个用户名不能使用，请换一个",
      weakPassword: "新密码强度不足，至少需要 12 个字符",
      originNotAllowed: "当前前端域名未被后端允许，请检查 Priestess Origin 配置",
    },
  },
  "en-US": {
    common: {
      "common.appName": "Priestess",
      "Priestess 首页": "Priestess home",
      "Rakko 服务": "Rakko service",
      "[已隐藏]": "[Hidden]",
      "未知 IP": "Unknown IP",
      "未知浏览器": "Unknown browser",
      "未知系统": "Unknown system",
      "浏览器": "Browser",
      "账户活动": "Account activity",
      "账号 {{count}}": "Account {{count}}",
      "当前应用": "Current application",
      currentOrigin: "Current origin",
    },
    errors: {
      accountServiceUnavailable: "The account service is temporarily unavailable. Please try again later or contact an administrator.",
      adminLoginRequired: "Please sign in to the admin session first.",
      adminPasswordInvalid: "The admin password is incorrect.",
      apiRequestFailed: "Backend request failed ({{status}}).",
      cancelled: "The request was cancelled.",
      forbidden: "This session does not have admin permission.",
      jsonParseFailed: "Failed to parse the backend JSON response.",
      localApiBaseMissing: "The account service is temporarily unavailable. Please try again later or contact an administrator.",
      invalidCurrentPassword: "The current password is incorrect.",
      invalidDisplayName: "Display name cannot be empty.",
      invalidEmail: "The email format is invalid.",
      invalidIdentity: "Enter a valid email address or phone number.",
      invalidPasskeyName: "Passkey name cannot be empty and must be 80 characters or fewer.",
      invalidPasswordManager: "This password manager is not supported yet.",
      invalidPasswordManagerLabel: "Password manager name cannot be empty and must be 80 characters or fewer.",
      invalidTotpCode: "The authenticator code is incorrect.",
      invalidUsername: "Username must be 3-32 characters and start with a letter.",
      localLoginTemporarilyLocked: "Sign-in is temporarily cooling down. Please try again later.",
      localUserExists: "This email address or phone number is already registered.",
      notFound: "The backend endpoint is not connected yet.",
      nonJsonResponse: "The backend returned a non-JSON response. Check the API proxy or frontend/backend path.",
      passwordResetInvalid: "The reset link is invalid or has expired.",
      registrationChannelFailed: "Failed to send the verification code. Please try again later.",
      registrationChannelMissing: "The verification delivery channel is not configured. Please contact an administrator.",
      registrationCodeInvalid: "The verification code is incorrect or has expired.",
      registrationTurnstileMissing: "The verification widget is not configured. Please contact an administrator.",
      requestFailed: "Request failed.",
      returnUrlNotAllowed: "This application's return URL is not allowed.",
      sessionInvalid: "The session expired or the account/password is incorrect.",
      totpChallengeInvalid: "Two-step verification expired. Please sign in again.",
      turnstileFailed: "Human verification failed. Please try again.",
      usernameExists: "This username is already taken.",
      usernameReserved: "This username cannot be used. Please choose another one.",
      weakPassword: "The new password is too weak. Use at least 12 characters.",
      originNotAllowed: "The current frontend origin is not allowed by the backend. Check the Priestess Origin configuration.",
    },
  },
};

const PriestessI18nContext = createContext<i18n | null>(null);
let activeI18n: i18n | null = null;
let fallbackI18n: i18n | null = null;

export function detectPriestessLanguage(languages = readBrowserLanguages()): PriestessLocale {
  const normalizedLanguages = languages.map((language) => language.toLowerCase());
  return normalizedLanguages.some((language) => language === "en" || language.startsWith("en-"))
    ? PRIESTESS_EN_LOCALE
    : PRIESTESS_DEFAULT_LOCALE;
}

export function PriestessI18nProvider({ children, resources = {} }: PriestessI18nProviderProps) {
  const instance = useMemo(() => {
    const nextInstance = createInstance();
    nextInstance.use(initReactI18next);
    void nextInstance.init({
      defaultNS: "common",
      fallbackLng: PRIESTESS_DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
      initAsync: false,
      lng: detectPriestessLanguage(),
      resources: mergeI18nResources(sharedResources, resources),
      returnEmptyString: false,
    });
    return nextInstance;
  }, [resources]);
  activeI18n = instance;

  useEffect(() => {
    activeI18n = instance;
    if (typeof document !== "undefined") {
      document.documentElement.lang = normalizePriestessLanguage(instance.language);
    }

    const handleLanguageChanged = (language: string) => {
      if (typeof document !== "undefined") {
        document.documentElement.lang = normalizePriestessLanguage(language);
      }
    };

    instance.on("languageChanged", handleLanguageChanged);
    return () => {
      instance.off("languageChanged", handleLanguageChanged);
      if (activeI18n === instance) {
        activeI18n = null;
      }
    };
  }, [instance]);

  return (
    <PriestessI18nContext.Provider value={instance}>
      <I18nextProvider i18n={instance}>{children}</I18nextProvider>
    </PriestessI18nContext.Provider>
  );
}

export function usePriestessI18n() {
  return useContext(PriestessI18nContext) ?? i18next;
}

export function usePriestessTranslation(namespace?: string | string[]) {
  return useTranslation(namespace);
}

export function translatePriestess(key: string, options?: TOptions) {
  return (activeI18n ?? getFallbackI18n()).t(key, options);
}

function getFallbackI18n() {
  if (!fallbackI18n) {
    fallbackI18n = createInstance();
    void fallbackI18n.init({
      defaultNS: "common",
      fallbackLng: PRIESTESS_DEFAULT_LOCALE,
      interpolation: { escapeValue: false },
      initAsync: false,
      lng: detectPriestessLanguage(),
      resources: sharedResources,
      returnEmptyString: false,
    });
  }

  return fallbackI18n;
}

function mergeI18nResources(...resourcesList: Array<PriestessI18nResources | Record<PriestessLocale, ResourceLanguage>>) {
  const merged: Record<PriestessLocale, ResourceLanguage> = {
    "zh-CN": {},
    "en-US": {},
  };

  for (const resources of resourcesList) {
    for (const locale of PRIESTESS_SUPPORTED_LOCALES) {
      const languageResources = resources[locale];
      if (!languageResources) continue;
      merged[locale] = deepMergeResourceLanguage(merged[locale], languageResources);
    }
  }

  return merged;
}

function deepMergeResourceLanguage(base: ResourceLanguage, next: ResourceLanguage): ResourceLanguage {
  const merged: ResourceLanguage = { ...base };
  for (const [namespace, namespaceResources] of Object.entries(next)) {
    const currentResources = merged[namespace];
    if (isPlainRecord(currentResources) && isPlainRecord(namespaceResources)) {
      merged[namespace] = {
        ...currentResources,
        ...namespaceResources,
      };
    } else {
      merged[namespace] = namespaceResources;
    }
  }

  return merged;
}

function normalizePriestessLanguage(language: string) {
  return language.toLowerCase().startsWith("en") ? PRIESTESS_EN_LOCALE : PRIESTESS_DEFAULT_LOCALE;
}

function readBrowserLanguages() {
  if (typeof navigator === "undefined") {
    return [PRIESTESS_DEFAULT_LOCALE];
  }

  return navigator.languages?.length ? Array.from(navigator.languages) : [navigator.language || PRIESTESS_DEFAULT_LOCALE];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
