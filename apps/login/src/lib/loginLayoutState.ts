export type LoginLayoutAuthMode = "forgot-password" | "login" | "register";

export type LoginLayoutStateParams = {
  authMode: LoginLayoutAuthMode;
  hasAuthRequest: boolean;
  hasTotpChallenge: boolean;
  isLoginIntroStage: boolean;
  isLoginRoute: boolean;
  isLoginSubmitStage: boolean;
  isRegisterDrawerStage: boolean;
  shouldShowAccountPicker: boolean;
};

export type LoginLayoutState = {
  authGridClassName: string;
  isLoginCenteredStage: boolean;
  isLoginSubmitCardStage: boolean;
  isQrDrawerOpen: boolean;
  isSoloAuthMode: boolean;
  isSoloLayoutMode: boolean;
  shouldUseCenteredWallpaper: boolean;
};

export function resolveLoginLayoutState(params: LoginLayoutStateParams): LoginLayoutState {
  const isSoloAuthMode = params.authMode !== "login";
  const shouldKeepLoginCardSolo = !params.hasAuthRequest || params.shouldShowAccountPicker;
  // 没有授权上下文时不保留空二维码槽；账号选择是授权确认态，只有切回账号密码登录才让二维码抽屉滑回右侧。
  const isLoginCenteredStage = (
    params.isLoginIntroStage
    || params.isLoginSubmitStage
    || params.hasTotpChallenge
    || shouldKeepLoginCardSolo
  ) && !isSoloAuthMode;
  const isSoloLayoutMode = isSoloAuthMode && !params.isRegisterDrawerStage;

  return {
    authGridClassName: [
      "auth-grid",
      isLoginCenteredStage ? "auth-grid--login-centered" : "",
      params.isLoginIntroStage && !isSoloAuthMode ? "auth-grid--login-intro" : "",
      params.isRegisterDrawerStage ? "auth-grid--register-drawer" : "",
      isSoloLayoutMode ? "auth-grid--register" : "",
    ].filter(Boolean).join(" "),
    isLoginCenteredStage,
    isLoginSubmitCardStage: params.isLoginSubmitStage && !isSoloAuthMode,
    isQrDrawerOpen: params.isLoginRoute && params.authMode === "login" && params.hasAuthRequest && !isLoginCenteredStage,
    isSoloAuthMode,
    isSoloLayoutMode,
    shouldUseCenteredWallpaper: isSoloAuthMode || isLoginCenteredStage,
  };
}
