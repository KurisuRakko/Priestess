import type { AuthAccountChoicesStatus } from "./useAuthAccountChoices";

export const MOBILE_LOGIN_BREAKPOINT_PX = 820;
export const MOBILE_LOGIN_REVEAL_TIMEOUT_MS = 5_000;

export type LocalSessionCheckStatus = "error" | "idle" | "loading" | "ready";
export type MobileLoginRevealStep = "revealed" | "schedule-after-paint" | "waiting";

type MobileLoginDataReadyParams = {
  accountChoicesStatus: AuthAccountChoicesStatus;
  hasAuthRequest: boolean;
  localSessionStatus: LocalSessionCheckStatus;
};

type MobileLoginRevealStepParams = {
  dataReady: boolean;
  hasRevealed: boolean;
  isMobileViewport: boolean;
  timedOut: boolean;
};

export function isMobileLoginDataReady(params: MobileLoginDataReadyParams) {
  if (params.hasAuthRequest) {
    return ["empty", "error", "ready"].includes(params.accountChoicesStatus);
  }

  return params.localSessionStatus === "ready" || params.localSessionStatus === "error";
}

export function resolveMobileLoginRevealStep(params: MobileLoginRevealStepParams): MobileLoginRevealStep {
  // 一旦展示过卡片，后续视口切换只调整布局，不重播手机首屏动画。
  if (params.hasRevealed || !params.isMobileViewport) {
    return "revealed";
  }

  return params.dataReady || params.timedOut ? "schedule-after-paint" : "waiting";
}

export function shouldAnimateMobileLoginReveal(prefersReducedMotion: boolean) {
  return !prefersReducedMotion;
}
