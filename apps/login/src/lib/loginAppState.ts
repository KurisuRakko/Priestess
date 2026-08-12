import { getPriestessApiBaseUrl } from "@priestess/shared";

// 登录结果动画需要留出确认感，避免后端返回后过快切页或回收表单。
export const LOGIN_RESULT_ANIMATION_MS = 1200;
// 这是身份揭示序列（880ms）跑完之后的额外停留，只用于让用户看清姓名，不影响揭示动画本身。
export const LOGIN_SUCCESS_HOLD_MS = 400;
// 减动效下身份信息在第 0 帧就全部呈现，400ms 停留是纯静止画面，只留够读姓名的时间。
export const LOGIN_SUCCESS_HOLD_REDUCED_MS = 200;
// 失败信息需要给用户留出完整阅读时间，但不拖慢成功登录后的跳转。
export const LOGIN_FAILURE_HOLD_MS = 2400;
export const LOGIN_INTRO_QR_DELAY_MS = 1280;
export const QR_CONFIRMED_REDIRECT_HOLD_MS = 650;
// 大行程抽屉和完整布局等待是桌面镜头的一部分，同时给二维码与表单留足加载时间。
export const AUTH_MODE_DRAWER_IN_MS = 760;
export const AUTH_MODE_TRANSITION_MS = 820;
// 二维码不提供手动刷新，按这个周期自动重建会话；最短加载时长保证转圈动画至少完整转一圈。
export const QR_AUTO_REFRESH_INTERVAL_MS = 120 * 1000;
export const QR_REFRESH_SPIN_MIN_MS = 700;
export const LOCAL_LOGIN_FAILURE_LIMIT = 10;
export const LOCAL_LOGIN_COOLDOWN_MS = 10 * 60 * 1000;

const LOCAL_LOGIN_COOLDOWN_STORAGE_PREFIX = "priestess:local-login-cooldown:v1:";

export function getLoginCardOriginRect(node: HTMLElement | null) {
  if (!node || typeof window === "undefined") {
    return null;
  }

  const rect = node.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    return null;
  }

  return {
    borderRadius: window.getComputedStyle(node).borderTopLeftRadius || "0px",
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}

export function readLocalLoginCooldownUntil() {
  if (typeof window === "undefined") {
    return 0;
  }

  const storageKey = getLocalLoginCooldownStorageKey();
  if (!storageKey) {
    return 0;
  }

  try {
    const storedValue = window.localStorage.getItem(storageKey);
    const cooldownUntil = storedValue ? Number.parseInt(storedValue, 10) : 0;
    if (!Number.isFinite(cooldownUntil) || cooldownUntil <= Date.now()) {
      window.localStorage.removeItem(storageKey);
      return 0;
    }
    return cooldownUntil;
  } catch {
    return 0;
  }
}

export function writeLocalLoginCooldownUntil(cooldownUntil: number) {
  const storageKey = getLocalLoginCooldownStorageKey();
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, String(cooldownUntil));
  } catch {
    // localStorage 被禁用时仍保留内存冷却，避免安全体验完全失效。
  }
}

export function clearLocalLoginCooldownUntil() {
  const storageKey = getLocalLoginCooldownStorageKey();
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // 无法清理本地存储不影响本次会话恢复。
  }
}

export function isLocalPasswordLoginRiskError(errorCode: string) {
  return errorCode === "invalid_local_credentials" || errorCode === "local_login_temporarily_locked";
}

function getLocalLoginCooldownStorageKey() {
  if (typeof window === "undefined") {
    return "";
  }

  const scope = getPriestessApiBaseUrl() || window.location.origin;
  return `${LOCAL_LOGIN_COOLDOWN_STORAGE_PREFIX}${encodeURIComponent(scope)}`;
}
