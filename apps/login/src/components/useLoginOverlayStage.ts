import { useCallback, useRef, useState, type RefObject } from "react";
import {
  startLoginTransitionOverlay,
  type LoginTransitionOverlayController,
  type LoginTransitionOverlayParams,
} from "./LoginTransitionOverlay";
import { AUTH_MODE_DRAWER_IN_MS, getLoginCardOriginRect } from "../lib/loginAppState";

type OverlayParams = Omit<LoginTransitionOverlayParams, "onClose" | "originRect">;

type LoginOverlayStageOptions = {
  loginCardRef: RefObject<HTMLDivElement | null>;
  loginTransitionOverlayRef: RefObject<LoginTransitionOverlayController | null>;
  prefersReducedMotion: boolean;
  setLoginIntroStage: (active: boolean) => void;
};

export function useLoginOverlayStage({
  loginCardRef,
  loginTransitionOverlayRef,
  prefersReducedMotion,
  setLoginIntroStage,
}: LoginOverlayStageOptions) {
  const submitStageTimeoutRef = useRef<number | null>(null);
  const [isAccountSelectionStage, setIsAccountSelectionStage] = useState(false);
  const [isSubmitStage, setIsSubmitStage] = useState(false);

  const clearSubmitStageTimeout = useCallback(() => {
    if (submitStageTimeoutRef.current !== null) {
      window.clearTimeout(submitStageTimeoutRef.current);
      submitStageTimeoutRef.current = null;
    }
  }, []);

  const releaseSubmitStage = useCallback(() => {
    clearSubmitStageTimeout();
    setIsAccountSelectionStage(false);
    setIsSubmitStage(false);
  }, [clearSubmitStageTimeout]);

  const openOverlay = useCallback((params: OverlayParams, originRect: LoginTransitionOverlayParams["originRect"]) => {
    const controller = startLoginTransitionOverlay({
      ...params,
      originRect,
      onClose: () => {
        loginTransitionOverlayRef.current = null;
      },
    });
    loginTransitionOverlayRef.current = controller;
    return controller;
  }, [loginTransitionOverlayRef]);

  const startCenteredOverlay = useCallback(async(params: OverlayParams) => {
    clearSubmitStageTimeout();
    setIsAccountSelectionStage(false);
    setLoginIntroStage(false);
    // 普通登录继续沿用原有的桌面二维码归位时序。
    setIsSubmitStage(true);
    const delay = prefersReducedMotion ? 40 : AUTH_MODE_DRAWER_IN_MS;
    await new Promise<void>((resolve) => {
      submitStageTimeoutRef.current = window.setTimeout(() => {
        submitStageTimeoutRef.current = null;
        window.requestAnimationFrame(() => resolve());
      }, delay);
    });
    return openOverlay(params, getLoginCardOriginRect(loginCardRef.current));
  }, [clearSubmitStageTimeout, loginCardRef, openOverlay, prefersReducedMotion, setLoginIntroStage]);

  const startAccountSelectionOverlay = useCallback(async(params: OverlayParams) => {
    // 点击当下先保存登录卡片区域；下一次布局提交后原卡即可立即退场，
    // 共享头像仍从用户刚看到的账号行坐标接续。
    const originRect = getLoginCardOriginRect(loginCardRef.current);
    clearSubmitStageTimeout();
    setIsAccountSelectionStage(true);
    setLoginIntroStage(false);
    setIsSubmitStage(true);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    return openOverlay(params, originRect);
  }, [clearSubmitStageTimeout, loginCardRef, openOverlay, setLoginIntroStage]);

  return {
    clearSubmitStageTimeout,
    isAccountSelectionStage,
    isSubmitStage,
    releaseSubmitStage,
    startAccountSelectionOverlay,
    startCenteredOverlay,
  };
}
