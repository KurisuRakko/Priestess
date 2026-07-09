import { type CSSProperties, useEffect, useRef } from "react";
import { translatePriestess, usePriestessTranslation } from "../lib/i18n";

const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TURNSTILE_SCRIPT_TIMEOUT_MS = 8000;
const TURNSTILE_WIDGET_RENDER_TIMEOUT_MS = 10000;
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

type TurnstileAppearance = "always" | "execute" | "interaction-only";

type TurnstileRenderOptions = {
  action?: string;
  appearance?: TurnstileAppearance;
  callback: (token: string) => void;
  "error-callback": () => void;
  "expired-callback": () => void;
  sitekey: string;
  theme?: "light";
};

declare global {
  interface Window {
    __PRIESTESS_CONFIG__?: {
      turnstileSiteKey?: string;
    };
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;

export function readTurnstileSiteKey() {
  const runtimeSiteKey = typeof window === "undefined"
    ? ""
    : window.__PRIESTESS_CONFIG__?.turnstileSiteKey?.trim() || "";
  const configuredSiteKey = import.meta.env.VITE_PRIESTESS_TURNSTILE_SITE_KEY?.trim()
    || runtimeSiteKey
    || "";

  // 本地开发可使用 Cloudflare 官方测试 site key；生产必须显式配置真实 key。
  if (!configuredSiteKey && import.meta.env.DEV) return TURNSTILE_TEST_SITE_KEY;
  return configuredSiteKey;
}

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.reject(new Error(translatePriestess("login:当前环境无法加载验证码")));
  if (window.turnstile) return Promise.resolve();
  if (turnstileScriptPromise) return turnstileScriptPromise;

  turnstileScriptPromise = new Promise((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (error) {
        turnstileScriptPromise = null;
        reject(error);
        return;
      }
      resolve();
    };
    timer = window.setTimeout(() => finish(new Error(translatePriestess("login:验证码组件加载超时"))), TURNSTILE_SCRIPT_TIMEOUT_MS);
    const bindScriptEvents = (script: HTMLScriptElement) => {
      script.addEventListener("load", () => finish(), { once: true });
      script.addEventListener("error", () => finish(new Error(translatePriestess("login:验证码组件加载失败"))), { once: true });
    };

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    if (existingScript) {
      bindScriptEvents(existingScript);
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.src = TURNSTILE_SCRIPT_SRC;
    bindScriptEvents(script);
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

export function TurnstileWidget({
  action,
  appearance = "always",
  className = "text-field",
  containerClassName,
  disabled,
  minHeight = 84,
  onError,
  onExpire,
  onToken,
  resetSignal,
  siteKey,
}: {
  action?: string;
  appearance?: TurnstileAppearance;
  className?: string;
  containerClassName?: string;
  disabled: boolean;
  minHeight?: number;
  onError: () => void;
  onExpire: () => void;
  onToken: (token: string) => void;
  resetSignal: number;
  siteKey: string;
}) {
  const { t } = usePriestessTranslation("login");
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const widgetIdRef = useRef("");
  const widgetStatusTimerRef = useRef<number | null>(null);
  const tokenResolvedRef = useRef(false);
  const callbacksRef = useRef({ onError, onExpire, onToken });
  callbacksRef.current = { onError, onExpire, onToken };

  useEffect(() => {
    if (!siteKey || disabled) return;

    let active = true;
    void loadTurnstileScript()
      .then(() => {
        if (!active || !containerRef.current) return;
        if (!window.turnstile) {
          // Turnstile 脚本可能被浏览器策略中断；显式报错避免留下不可操作的空白框。
          callbacksRef.current.onError();
          return;
        }

        containerRef.current.innerHTML = "";
        tokenResolvedRef.current = false;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          ...(action ? { action } : {}),
          appearance,
          sitekey: siteKey,
          theme: "light",
          callback: (token) => {
            tokenResolvedRef.current = true;
            callbacksRef.current.onToken(token);
          },
          "expired-callback": () => callbacksRef.current.onExpire(),
          "error-callback": () => {
            tokenResolvedRef.current = true;
            callbacksRef.current.onError();
          },
        });
        widgetStatusTimerRef.current = window.setTimeout(() => {
          if (!active || tokenResolvedRef.current || containerRef.current?.querySelector("iframe")) return;
          callbacksRef.current.onError();
        }, TURNSTILE_WIDGET_RENDER_TIMEOUT_MS);
      })
      .catch(() => callbacksRef.current.onError());

    return () => {
      active = false;
      if (widgetStatusTimerRef.current !== null) {
        window.clearTimeout(widgetStatusTimerRef.current);
        widgetStatusTimerRef.current = null;
      }
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = "";
    };
  }, [action, appearance, disabled, resetSignal, siteKey]);

  const wrapperStyle = {
    justifyContent: "center",
    minHeight,
    padding: "10px 12px",
  } satisfies CSSProperties;

  return (
    <span className={className} style={wrapperStyle}>
      {siteKey ? (
        <span ref={containerRef} className={containerClassName} style={{ minHeight: Math.max(64, minHeight - 20), width: "100%" }} />
      ) : (
        <span style={{ color: "var(--color-muted)", fontSize: 14 }}>{t("验证码组件未配置，请联系管理员。")}</span>
      )}
    </span>
  );
}
