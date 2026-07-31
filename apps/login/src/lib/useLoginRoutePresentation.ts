import { useEffect } from "react";
import { LOGIN_INTRO_QR_DELAY_MS } from "./loginAppState";
import { getCurrentAccountNextPath } from "./loginNext";
import {
  LEGACY_LOGIN_ROUTE_PATH,
  LOGIN_ROUTE_PATH,
  matchesRoutePath,
  type AppRoute,
} from "./routes";

type LoginRoutePresentationOptions = {
  authMode: "forgot-password" | "login" | "register";
  isLoginIntroStage: boolean;
  localLoginCooldownUntil: number;
  onCooldownExpired: () => void;
  onLoginIntroComplete: () => void;
  onNotice: (message: string) => void;
  route: AppRoute;
  shouldReduceMotion: boolean;
  t: (key: string) => string;
};

export function useLoginRoutePresentation({
  authMode,
  isLoginIntroStage,
  localLoginCooldownUntil,
  onCooldownExpired,
  onLoginIntroComplete,
  onNotice,
  route,
  shouldReduceMotion,
  t,
}: LoginRoutePresentationOptions) {
  useEffect(() => {
    if (localLoginCooldownUntil <= Date.now()) {
      if (localLoginCooldownUntil > 0) onCooldownExpired();
      return undefined;
    }

    const cooldownTimer = window.setTimeout(() => {
      onCooldownExpired();
      onNotice(t("登录入口已恢复"));
    }, Math.max(localLoginCooldownUntil - Date.now(), 0));
    return () => window.clearTimeout(cooldownTimer);
  }, [localLoginCooldownUntil, onCooldownExpired, onNotice, t]);

  useEffect(() => {
    if (route !== "login" || authMode !== "login" || shouldReduceMotion || !isLoginIntroStage) {
      if (isLoginIntroStage && (route !== "login" || authMode !== "login" || shouldReduceMotion)) {
        onLoginIntroComplete();
      }
      return undefined;
    }

    // 首屏先让卡片稳定，再展开二维码；其它路由不重复播放这段节奏。
    const introTimer = window.setTimeout(onLoginIntroComplete, LOGIN_INTRO_QR_DELAY_MS);
    return () => window.clearTimeout(introTimer);
  }, [authMode, isLoginIntroStage, onLoginIntroComplete, route, shouldReduceMotion]);

  useEffect(() => {
    if (route !== "login") return;
    const { hash, pathname, search } = window.location;
    const isLegacyLoginPath = matchesRoutePath(pathname, LEGACY_LOGIN_ROUTE_PATH);
    if (!isLegacyLoginPath && matchesRoutePath(pathname, LOGIN_ROUTE_PATH)) return;
    window.history.replaceState(null, "", `${LOGIN_ROUTE_PATH}${search}${hash}`);
  }, [route]);

  useEffect(() => {
    if (route !== "account") return;
    const canonicalPath = getCurrentAccountNextPath();
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (canonicalPath !== currentPath) {
      window.history.replaceState(null, "", canonicalPath);
    }
  }, [route]);

  useEffect(() => {
    const titles: Record<AppRoute, string> = {
      account: "Priestess 个人中心",
      login: authMode === "register"
        ? "Priestess 注册"
        : authMode === "forgot-password"
          ? "Priestess 找回密码"
          : "Priestess 登录",
      "not-found": "Priestess 404",
      "qr-login": "Priestess 扫码确认",
      "reset-password": "Priestess 重置密码",
    };
    document.title = t(titles[route]);
  }, [authMode, route, t]);
}
