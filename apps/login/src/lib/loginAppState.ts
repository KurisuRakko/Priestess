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

export type LoginCardOriginRect = ReturnType<typeof getLoginCardOriginRect>;

// 入场镜头是 500ms delay + 720ms 行程，是全站最长的一条「卡片仍会移动」链路；
// 上限只是防御性兜底：等待期间表单仍可见、登录请求已并行发出、提交按钮已禁用，
// 所以取值宽裕不会产生可感知代价，同时给慢布局回归用例留出拉长过渡的空间。
export const LOGIN_CARD_SETTLE_TIMEOUT_MS = 2400;
// 连续 3 次采样完全一致（约 3 帧 / 50ms 静止）即认定收敛。
const LOGIN_CARD_SETTLE_STABLE_FRAMES = 3;

export type LoginCardOriginWaitResult = { cancelled: boolean; rect: LoginCardOriginRect };
export type LoginCardOriginWait = { cancel: () => void; promise: Promise<LoginCardOriginWaitResult> };

// 静止 delay 窗口（入场镜头前 500ms）里逐帧比对会假收敛——卡片还没开始动，
// 所以必须叠加 data-login-card-settled 声明信号，两个条件同时成立才算收敛。
// 不设容差：布局量化到 1/64px，缓动尾部导数为 0，精确相等在最后几帧自然成立；
// 设容差反而会提前收敛，把还没停稳的矩形钉成结果层原点。
function isSameLoginCardOriginRect(a: LoginCardOriginRect, b: LoginCardOriginRect) {
  // 两者皆 null 视为不相等，避免卡片尚未挂载时连续空转帧被误判为收敛。
  if (!a || !b) {
    return false;
  }
  return a.left === b.left
    && a.top === b.top
    && a.width === b.width
    && a.height === b.height
    && a.borderRadius === b.borderRadius;
}

function watchLoginCardOrigin(
  node: HTMLElement | null,
  options: { requireSettled: boolean; stableFramesRequired: number },
): LoginCardOriginWait {
  let cancelled = false;
  let frameId = 0;
  let stableFrames = 0;
  let previous: LoginCardOriginRect = null;
  const startedAt = performance.now();
  let resolveWait: (result: LoginCardOriginWaitResult) => void = () => undefined;

  const promise = new Promise<LoginCardOriginWaitResult>((resolve) => {
    resolveWait = resolve;
    const sample = () => {
      if (cancelled) {
        return;
      }
      const rect = getLoginCardOriginRect(node);
      const settled = !options.requireSettled || node?.dataset.loginCardSettled === "true";
      if (settled && isSameLoginCardOriginRect(rect, previous)) {
        stableFrames += 1;
      } else {
        stableFrames = 0;
      }
      previous = rect;
      if (
        stableFrames >= options.stableFramesRequired
        || performance.now() - startedAt >= LOGIN_CARD_SETTLE_TIMEOUT_MS
      ) {
        resolve({ cancelled: false, rect });
        return;
      }
      frameId = requestAnimationFrame(sample);
    };
    frameId = requestAnimationFrame(sample);
  });

  return {
    cancel: () => {
      if (cancelled) {
        return;
      }
      cancelled = true;
      cancelAnimationFrame(frameId);
      // 不 reject、不悬垂：取消路径必定立即落地。
      resolveWait({ cancelled: true, rect: null });
    },
    promise,
  };
}

export function waitForSettledLoginCardOrigin(node: HTMLElement | null) {
  return watchLoginCardOrigin(node, {
    requireSettled: true,
    stableFramesRequired: LOGIN_CARD_SETTLE_STABLE_FRAMES,
  });
}

export function waitForLoginCardFrame(node: HTMLElement | null) {
  // requireSettled: false + 0 个稳定帧：下一帧即落地，只用于「状态翻转前先抓一帧矩形」。
  return watchLoginCardOrigin(node, { requireSettled: false, stableFramesRequired: 0 });
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
