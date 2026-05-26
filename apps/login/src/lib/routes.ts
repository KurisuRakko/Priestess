export const LOGIN_ROUTE_PATH = "/login";
export const LEGACY_LOGIN_ROUTE_PATH = "/auth-ui/login";
export const ACCOUNT_ROUTE_PATH = "/auth-ui/account";
export const QR_LOGIN_ROUTE_PATH = "/qr-login";
export const MANAGE_ROUTE_PATH = "/manage";
export const LEGACY_MANAGE_ROUTE_PATH = "/Manage";
export const RESET_PASSWORD_ROUTE_PATH = "/auth-ui/reset-password";

export type AppRoute = "account" | "login" | "not-found" | "qr-login" | "reset-password";

export function matchesRoutePath(pathname: string, routePath: string) {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

export function isManageRoute(pathname: string) {
  return matchesRoutePath(pathname, MANAGE_ROUTE_PATH) || matchesRoutePath(pathname, LEGACY_MANAGE_ROUTE_PATH);
}

export function getCurrentRoute(): AppRoute {
  if (typeof window === "undefined") {
    return "login";
  }

  const { pathname } = window.location;
  if (pathname === "/" || matchesRoutePath(pathname, LOGIN_ROUTE_PATH) || matchesRoutePath(pathname, LEGACY_LOGIN_ROUTE_PATH)) {
    return "login";
  }
  if (matchesRoutePath(pathname, QR_LOGIN_ROUTE_PATH)) {
    return "qr-login";
  }
  if (matchesRoutePath(pathname, RESET_PASSWORD_ROUTE_PATH)) {
    return "reset-password";
  }
  if (matchesRoutePath(pathname, ACCOUNT_ROUTE_PATH) || isManageRoute(pathname)) {
    return "account";
  }

  return "not-found";
}
