import { useEffect, useRef } from "react";
import { QR_CONFIRMED_REDIRECT_HOLD_MS } from "../lib/loginAppState";
import type { LoginTransitionOverlayController, LoginTransitionOverlayParams } from "./LoginTransitionOverlay";

type TranslationFn = (key: string) => string;

type UseQrLoginCompletionParams = {
  active: boolean;
  confirmedRedirectUrl: string;
  startOverlay: (params: Omit<LoginTransitionOverlayParams, "onClose" | "originRect">) => Promise<LoginTransitionOverlayController>;
  t: TranslationFn;
};

export function useQrLoginCompletion({
  active,
  confirmedRedirectUrl,
  startOverlay,
  t,
}: UseQrLoginCompletionParams) {
  const handledRedirectRef = useRef("");
  const startOverlayRef = useRef(startOverlay);
  const translationRef = useRef(t);
  startOverlayRef.current = startOverlay;
  translationRef.current = t;

  useEffect(() => {
    if (!active || !confirmedRedirectUrl) {
      handledRedirectRef.current = "";
      return;
    }
    if (handledRedirectRef.current === confirmedRedirectUrl) return;
    handledRedirectRef.current = confirmedRedirectUrl;

    void (async() => {
      const translate = translationRef.current;
      const controller = await startOverlayRef.current({
        loadingTitle: translate("正在完成扫码登录…"),
        primaryColor: "#c65f72",
      });
      await controller.succeed({
        durationMs: 1000,
        organizationName: translate("正在返回应用"),
        postAnimationDelayMs: QR_CONFIRMED_REDIRECT_HOLD_MS,
        title: translate("已在手机确认"),
      });
      window.location.assign(confirmedRedirectUrl);
    })();
  }, [active, confirmedRedirectUrl]);
}
