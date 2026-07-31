import { lazy } from "react";

// 与登录首屏无关的路由继续按需解析；AccountPage 由交接控制器单独管理。
export const QrLoginConfirmPage = lazy(async() => {
  const module = await import("./QrLoginConfirmPage");
  return { default: module.QrLoginConfirmPage };
});

export const ResetPasswordPage = lazy(async() => {
  const module = await import("./ResetPasswordPage");
  return { default: module.ResetPasswordPage };
});

export type TotpChallenge = {
  challengeId: string;
  displayName: string;
  username: string;
};
