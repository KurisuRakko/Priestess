/**
 * Priestess 本地预览用的 Demo API。
 *
 * 这里只在 Vite 开发环境、并且显式设置 VITE_PRIESTESS_DEMO=1（或 URL
 * 带有 demo=1）时接管请求。生产构建和正常的本地联调都继续走真实 Worker。
 */

type DemoRequestOptions = {
  body?: unknown;
  method?: string;
  searchParams?: URLSearchParams;
  signal?: AbortSignal;
};

type DemoRequestResult = {
  handled: boolean;
  payload?: unknown;
};

const DEMO_USER = {
  address: "",
  avatar_url: "/priestess-default-avatar.png",
  birthday: "",
  display_name: "Demo Priestess",
  email: "demo@priestess.local",
  enabled: true,
  phone: "",
  preferred_languages: ["zh-CN", "en-US"],
  role: "user",
  user_id: "demo-priestess",
  username: "demo",
};

const DEMO_SESSION_ID = "pls_a81f_demo_session_7c2d";
const DEMO_CHALLENGE_ID = "demo-totp-challenge";
const DEMO_ACCOUNT_CHOICE_ID = "demo-account-choice";

// 预览模式默认已经有一个可用 Demo 会话，直接打开 /manage 也能看到完整个人中心。
let demoAuthenticated = true;
let demoAccountVisible = true;

export function isPriestessDemoEnabled() {
  if (!import.meta.env.DEV) {
    return false;
  }

  const configured = String(import.meta.env.VITE_PRIESTESS_DEMO ?? "").trim().toLowerCase();
  if (configured === "1" || configured === "true" || configured === "yes") {
    return true;
  }

  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).get("demo") === "1";
  }

  return false;
}

export async function requestPriestessDemoJson(path: string, options: DemoRequestOptions = {}): Promise<DemoRequestResult> {
  if (!isPriestessDemoEnabled()) {
    return { handled: false };
  }

  if (options.signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }

  const method = (options.method ?? "GET").toUpperCase();
  const normalizedPath = path.split("?", 1)[0] || "/";
  const userChoicePath = `/auth/priestess/account-choices/${encodeURIComponent(DEMO_USER.user_id)}`;
  const userChoiceActivationPath = `${userChoicePath}/activate`;

  if (normalizedPath === "/auth/priestess/browser-accounts" && method === "GET") {
    return {
      handled: true,
      payload: {
        accounts: demoAccountVisible ? [buildDemoAccount(false)] : [],
      },
    };
  }

  if (normalizedPath === "/auth/priestess/account-choices" && method === "GET") {
    const appId = options.searchParams?.get("app_id") || "demo-app";
    const returnTo = options.searchParams?.get("return_to") || "/";
    return {
      handled: true,
      payload: {
        accounts: demoAccountVisible ? [buildDemoAccount(true)] : [],
        app: {
          app_id: appId,
          return_to_origin: readOrigin(returnTo),
        },
      },
    };
  }

  if (normalizedPath === "/auth/priestess/session" && method === "GET") {
    return { handled: true, payload: buildDemoSession(demoAuthenticated) };
  }

  if (normalizedPath === "/auth/priestess/session" && method === "POST") {
    demoAuthenticated = true;
    return { handled: true, payload: buildDemoSession(true) };
  }

  if (normalizedPath === "/auth/priestess/session" && method === "DELETE") {
    demoAuthenticated = false;
    return { handled: true, payload: { authenticated: false, revoked: true } };
  }

  if (normalizedPath === userChoiceActivationPath && method === "POST") {
    demoAuthenticated = true;
    return { handled: true, payload: buildDemoSession(true) };
  }

  if (normalizedPath === userChoicePath && method === "DELETE") {
    demoAccountVisible = false;
    demoAuthenticated = false;
    return {
      handled: true,
      payload: {
        authenticated: false,
        current: false,
        removed: true,
        revoked: true,
        user_id: DEMO_USER.user_id,
      },
    };
  }

  if (normalizedPath === "/auth/priestess/authorize" && method === "POST") {
    const body = asRecord(options.body);
    const returnTo = readString(body, "return_to") || "/";
    return {
      handled: true,
      payload: {
        expires_at: Date.now() + 5 * 60_000,
        expires_in: 300,
        redirect_url: buildDemoRedirectUrl(returnTo),
      },
    };
  }

  if (normalizedPath === "/api/priestess/status" && method === "GET") {
    return { handled: true, payload: { enabled: true, mode: "local-demo" } };
  }

  if (normalizedPath === "/auth/priestess/devices/sessions" && method === "GET") {
    return {
      handled: true,
      payload: {
        sessions: demoAuthenticated ? [buildDemoDeviceSession()] : [],
      },
    };
  }

  if (normalizedPath === "/auth/priestess/privacy/activities" && method === "GET") {
    return {
      handled: true,
      payload: {
        activities: [],
        has_more: false,
        next_offset: null,
        offset: Number(options.searchParams?.get("offset") || 0),
        page_size: Number(options.searchParams?.get("limit") || 10),
        total: 0,
      },
    };
  }

  if (normalizedPath === "/auth/priestess/services/sessions" && method === "GET") {
    return { handled: true, payload: { services: [] } };
  }

  if (normalizedPath === "/auth/priestess/passkeys" && method === "GET") {
    return { handled: true, payload: { passkeys: [] } };
  }

  if (normalizedPath === "/auth/priestess/totp" && method === "GET") {
    return { handled: true, payload: { totp: null } };
  }

  if (normalizedPath === "/auth/priestess/profile" && method === "PATCH") {
    const body = asRecord(options.body);
    return {
      handled: true,
      payload: {
        ...DEMO_USER,
        ...body,
        avatar_url: readString(body, "avatar_url") || DEMO_USER.avatar_url,
        user_id: DEMO_USER.user_id,
        username: DEMO_USER.username,
      },
    };
  }

  if (normalizedPath === "/auth/priestess/password" && method === "PATCH") {
    return { handled: true, payload: buildDemoSession(true) };
  }

  if (normalizedPath === "/auth/priestess/passkeys" && method === "POST") {
    return { handled: true, payload: { passkey: buildDemoPasskey() } };
  }

  if (normalizedPath === "/auth/priestess/passkeys/registration/options" && method === "POST") {
    return {
      handled: true,
      payload: { challenge_id: "demo-passkey-registration", expires_at: new Date(Date.now() + 300_000).toISOString(), options: {} },
    };
  }

  if (normalizedPath === "/auth/priestess/passkeys/authentication/options" && method === "POST") {
    return {
      handled: true,
      payload: { challenge_id: "demo-passkey-authentication", expires_at: new Date(Date.now() + 300_000).toISOString(), options: {} },
    };
  }

  if (normalizedPath === "/auth/priestess/passkeys/authentication/verify" && method === "POST") {
    demoAuthenticated = true;
    return { handled: true, payload: buildDemoSession(true) };
  }

  if (normalizedPath === "/auth/priestess/session/totp/verify" && method === "POST") {
    demoAuthenticated = true;
    return { handled: true, payload: buildDemoSession(true) };
  }

  return { handled: false };
}

function buildDemoAccount(withChoiceId: boolean) {
  return {
    authenticated: true,
    avatar_url: DEMO_USER.avatar_url,
    ...(withChoiceId ? { choice_id: DEMO_ACCOUNT_CHOICE_ID } : {}),
    current: demoAuthenticated,
    display_name: DEMO_USER.display_name,
    email: DEMO_USER.email,
    expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    last_used_at: new Date().toISOString(),
    user_id: DEMO_USER.user_id,
    username: DEMO_USER.username,
  };
}

function buildDemoSession(authenticated: boolean) {
  return {
    authenticated,
    challenge_id: authenticated ? "" : DEMO_CHALLENGE_ID,
    expires_at: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
    mfa_required: false,
    mfa_type: "",
    user: authenticated ? DEMO_USER : null,
  };
}

function buildDemoDeviceSession() {
  const now = new Date();
  return {
    browser: "Chrome",
    created_at: new Date(now.getTime() - 36 * 60 * 60_000).toISOString(),
    current: true,
    device: "Local preview",
    expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString(),
    ip_address: "127.0.0.1",
    last_used_at: now.toISOString(),
    os: "macOS",
    session_id: DEMO_SESSION_ID,
    user_agent_summary: "Priestess local demo",
  };
}

function buildDemoPasskey() {
  return {
    backed_up: true,
    counter: 1,
    created_at: new Date().toISOString(),
    credential_id: "demo-passkey",
    device_type: "platform",
    name: "Demo Passkey",
    transports: ["internal"],
  };
}

function buildDemoRedirectUrl(returnTo: string) {
  try {
    const target = new URL(returnTo, typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin);
    target.searchParams.set("demo", "authorized");
    return target.toString();
  } catch {
    return "/?demo=authorized";
  }
}

function readOrigin(value: string) {
  try {
    return new URL(value, typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin).origin;
  } catch {
    return typeof window === "undefined" ? "http://127.0.0.1" : window.location.origin;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}
