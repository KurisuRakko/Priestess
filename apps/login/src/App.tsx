import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { BrandMark, FloatingBackdrop, getPriestessApiErrorMessage, loginLocalSession, Toast } from "@priestess/shared";
import { ForgotPasswordDialog } from "./components/ForgotPasswordDialog";
import { LoginForm, type LoginCredentials } from "./components/LoginForm";
import { startLoginTransitionOverlay, type LoginTransitionOverlayController, type LoginTransitionOverlayParams } from "./components/LoginTransitionOverlay";
import { QrPanel } from "./components/QrPanel";
import { ResetPasswordPage } from "./components/ResetPasswordPage";

const LOGIN_ROUTE_PATH = "/auth-ui/login";
const RESET_PASSWORD_ROUTE_PATH = "/auth-ui/reset-password";
const DEFAULT_ADMIN_URL = "http://127.0.0.1:5174/admin-ui/priestess";

type AppRoute = "login" | "reset-password";

function getCurrentRoute(): AppRoute {
  if (typeof window !== "undefined" && window.location.pathname.startsWith(RESET_PASSWORD_ROUTE_PATH)) {
    return "reset-password";
  }

  return "login";
}

function getAdminUrl() {
  return import.meta.env.VITE_PRIESTESS_ADMIN_URL?.trim() || DEFAULT_ADMIN_URL;
}

export function App() {
  const shouldReduceMotion = useReducedMotion();
  const loginCardRef = useRef<HTMLElement | null>(null);
  const loginTransitionOverlayRef = useRef<LoginTransitionOverlayController | null>(null);
  const loginAbortControllerRef = useRef<AbortController | null>(null);
  const [qrVersion, setQrVersion] = useState(1);
  const [notice, setNotice] = useState("");
  const [forgotPasswordIdentity, setForgotPasswordIdentity] = useState("");
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [loginTransitionActive, setLoginTransitionActive] = useState(false);
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute());
  const adminUrl = useMemo(() => getAdminUrl(), []);
  const qrValue = useMemo(() => {
    return `priestess-demo://login?session=${qrVersion}&surface=login`;
  }, [qrVersion]);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 2600);
  };

  const captureLoginCardOriginRect = (): LoginTransitionOverlayParams["originRect"] => {
    const node = loginCardRef.current;
    if (!node || typeof window === "undefined") {
      return null;
    }

    const rect = node.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return null;
    }

    const computedStyle = window.getComputedStyle(node);
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      borderRadius: computedStyle.borderTopLeftRadius || "0px",
    };
  };

  const navigateTo = (path: string) => {
    window.history.pushState(null, "", path);
    setRoute(getCurrentRoute());
  };

  const openForgotPassword = (identity: string) => {
    setForgotPasswordIdentity(identity);
    setIsForgotPasswordOpen(true);
  };

  const startBackendLoginTransition = async(credentials: LoginCredentials) => {
    if (loginTransitionOverlayRef.current !== null) {
      return;
    }

    // 在启动 overlay 之前捕获卡片矩形，让白色 shell 从当前卡片位置平滑放大到整屏。
    const originRect = captureLoginCardOriginRect();
    if (originRect !== null) {
      setLoginTransitionActive(true);
    }

    const controller = startLoginTransitionOverlay({
      loadingTitle: "正在登录...",
      organizationName: "Priestess",
      username: credentials.username,
      primaryColor: "#c65f72",
      originRect,
      onClose: () => {
        loginTransitionOverlayRef.current = null;
        setLoginTransitionActive(false);
      },
    });
    loginTransitionOverlayRef.current = controller;

    const abortController = new AbortController();
    loginAbortControllerRef.current = abortController;

    try {
      const session = await loginLocalSession(credentials, { signal: abortController.signal });
      const displayName = session.user?.displayName || session.user?.username || credentials.username;

      await controller.succeed({
        durationMs: 760,
        organizationName: "Priestess",
        postAnimationDelayMs: 80,
        title: "登录成功",
        username: displayName,
        onVisualComplete: () => {
          // 成功后会切到管理台，先解除 origin 隐藏，避免浏览器保留不可见卡片状态。
          setLoginTransitionActive(false);
        },
      });

      showNotice("登录成功");
      window.location.assign(adminUrl);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const message = getPriestessApiErrorMessage(error, "登录失败");
      await controller.fail({
        description: message,
        durationMs: 760,
        postAnimationDelayMs: 0,
        onVisualComplete: () => {
          // 失败回退时先把原卡片解除隐藏，让 shrink 动画缩回去时底下表单已经可见。
          setLoginTransitionActive(false);
        },
      });
      showNotice(message);
    } finally {
      if (loginAbortControllerRef.current === abortController) {
        loginAbortControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    const syncRoute = () => setRoute(getCurrentRoute());
    window.addEventListener("popstate", syncRoute);

    return () => {
      window.removeEventListener("popstate", syncRoute);
      loginAbortControllerRef.current?.abort();
      loginTransitionOverlayRef.current?.dismiss();
    };
  }, []);

  useEffect(() => {
    document.title = route === "reset-password" ? "Priestess 重置密码" : "Priestess 登录";
  }, [route]);

  // 入场节奏以页面加载为基准：先让壁纸稳定显示，再弹出表单，最后展开二维码抽屉。
  const loginDelay = 0.5;
  const loginDuration = 0.72;
  const drawerDelay = loginDelay + loginDuration + 0.06;
  const drawerDuration = 0.9;
  const qrContentDelay = drawerDelay + 0.34;
  const loginEnter = shouldReduceMotion ? false : { opacity: 0, x: 360, y: 24, scale: 0.972, filter: "blur(10px)" };
  const drawerEnter = shouldReduceMotion ? false : { opacity: 0, x: -18, clipPath: "inset(0 100% 0 0)" };

  const loginExperience = (
    <main className="app-shell">
      <FloatingBackdrop />
      <header className="topbar" aria-label="Priestess">
        <BrandMark size="sm" />
        <a className="topbar__action" href={adminUrl}>
          <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} />
          <span>管理台</span>
        </a>
      </header>

      <motion.section
        aria-label="Priestess 登录"
        className="login-stage"
      >
        <motion.div
          className="auth-grid"
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16 }}
        >
          <motion.div
            className="login-card-shell"
            initial={loginEnter}
            animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)" }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: loginDelay, duration: loginDuration, ease: [0.16, 1, 0.3, 1] }}
          >
            <LoginForm
              isLoginTransitionOrigin={loginTransitionActive}
              loginCardRef={loginCardRef}
              onForgotPassword={openForgotPassword}
              onNotice={showNotice}
              onValidSubmit={startBackendLoginTransition}
            />
          </motion.div>

          <motion.div
            className="qr-drawer"
            initial={drawerEnter}
            animate={{ opacity: 1, x: 0, clipPath: "inset(0 0% 0 0)" }}
            transition={shouldReduceMotion ? { duration: 0 } : { delay: drawerDelay, duration: drawerDuration, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <QrPanel
              contentDelay={qrContentDelay}
              qrValue={qrValue}
              onRefresh={() => {
                setQrVersion((current) => current + 1);
                showNotice("二维码已刷新");
              }}
            />
          </motion.div>
        </motion.div>
      </motion.section>
    </main>
  );

  return (
    <>
      {route === "reset-password" ? (
        <ResetPasswordPage
          onNavigateToLogin={() => navigateTo(LOGIN_ROUTE_PATH)}
          onNotice={showNotice}
        />
      ) : loginExperience}
      <ForgotPasswordDialog
        defaultIdentity={forgotPasswordIdentity}
        isOpen={isForgotPasswordOpen}
        onClose={() => setIsForgotPasswordOpen(false)}
        onNotice={showNotice}
      />
      <Toast message={notice} />
    </>
  );
}
