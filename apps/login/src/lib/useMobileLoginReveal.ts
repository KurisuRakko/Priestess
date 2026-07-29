import { useEffect, useRef, useState } from "react";
import { getLocalSession } from "@priestess/shared";
import {
  MOBILE_LOGIN_BREAKPOINT_PX,
  MOBILE_LOGIN_REVEAL_TIMEOUT_MS,
  isMobileLoginDataReady,
  resolveMobileLoginRevealStep,
  shouldAnimateMobileLoginReveal,
  type LocalSessionCheckStatus,
} from "./mobileLoginRevealState";
import type { AuthAccountChoicesStatus } from "./useAuthAccountChoices";

type UseMobileLoginRevealParams = {
  accountChoicesStatus: AuthAccountChoicesStatus;
  enabled: boolean;
  hasAuthRequest: boolean;
  prefersReducedMotion: boolean;
};

export type MobileLoginRevealState = {
  dataReady: boolean;
  didTimeout: boolean;
  isMobileViewport: boolean;
  revealed: boolean;
  shouldAnimateReveal: boolean;
};

function readMobileViewport() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(`(max-width: ${MOBILE_LOGIN_BREAKPOINT_PX}px)`).matches;
}

export function useMobileLoginReveal({
  accountChoicesStatus,
  enabled,
  hasAuthRequest,
  prefersReducedMotion,
}: UseMobileLoginRevealParams): MobileLoginRevealState {
  const initialMobileRef = useRef(readMobileViewport());
  const revealStartedAtRef = useRef(typeof performance === "undefined" ? 0 : performance.now());
  const [didTimeout, setDidTimeout] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(initialMobileRef.current);
  const [localSessionStatus, setLocalSessionStatus] = useState<LocalSessionCheckStatus>(
    initialMobileRef.current && enabled && !hasAuthRequest ? "loading" : "idle",
  );
  const [revealed, setRevealed] = useState(!enabled || !initialMobileRef.current);
  const dataReady = isMobileLoginDataReady({
    accountChoicesStatus,
    hasAuthRequest,
    localSessionStatus,
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_LOGIN_BREAKPOINT_PX}px)`);
    const handleChange = (event: MediaQueryListEvent) => setIsMobileViewport(event.matches);
    setIsMobileViewport(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (!initialMobileRef.current || !enabled || hasAuthRequest) {
      return undefined;
    }

    const abortController = new AbortController();
    setLocalSessionStatus("loading");
    void getLocalSession({ signal: abortController.signal })
      .then(() => {
        if (!abortController.signal.aborted) {
          setLocalSessionStatus("ready");
        }
      })
      .catch(() => {
        if (!abortController.signal.aborted) {
          // 会话检查失败也是首屏终态；登录表单仍可继续工作。
          setLocalSessionStatus("error");
        }
      });
    return () => abortController.abort();
  }, [enabled, hasAuthRequest]);

  useEffect(() => {
    if (!enabled || revealed || !initialMobileRef.current) {
      return undefined;
    }

    const elapsed = (typeof performance === "undefined" ? 0 : performance.now()) - revealStartedAtRef.current;
    const timeout = window.setTimeout(
      () => setDidTimeout(true),
      Math.max(MOBILE_LOGIN_REVEAL_TIMEOUT_MS - elapsed, 0),
    );
    return () => window.clearTimeout(timeout);
  }, [enabled, revealed]);

  useEffect(() => {
    const step = resolveMobileLoginRevealStep({
      dataReady,
      hasRevealed: revealed,
      isMobileViewport,
      timedOut: didTimeout,
    });
    if (step === "revealed") {
      if (!revealed) setRevealed(true);
      return undefined;
    }
    if (step === "waiting") {
      return undefined;
    }

    let secondFrame = 0;
    // 双 requestAnimationFrame 保证低清壁纸至少完整绘制一帧，再挂载并上滑卡片。
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setRevealed(true));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [dataReady, didTimeout, isMobileViewport, revealed]);

  return {
    dataReady,
    didTimeout,
    isMobileViewport,
    revealed,
    shouldAnimateReveal: initialMobileRef.current
      && shouldAnimateMobileLoginReveal(prefersReducedMotion),
  };
}
