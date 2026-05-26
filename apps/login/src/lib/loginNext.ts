import {
  ACCOUNT_ROUTE_PATH,
  LEGACY_MANAGE_ROUTE_PATH,
  LOGIN_ROUTE_PATH,
  MANAGE_ROUTE_PATH,
  matchesRoutePath,
} from "./routes";

const LOGIN_NEXT_PARAM = "next";
const NEXT_URL_BASE = "https://priestess.local";

export function readLoginNext(location: Pick<Location, "search"> | null = getBrowserLocation()) {
  if (!location) {
    return MANAGE_ROUTE_PATH;
  }

  const params = new URLSearchParams(location.search);
  return normalizePriestessNextPath(params.get(LOGIN_NEXT_PARAM)) || MANAGE_ROUTE_PATH;
}

export function buildLoginPathWithNext(nextPath: string) {
  const safeNext = normalizePriestessNextPath(nextPath) || MANAGE_ROUTE_PATH;
  return `${LOGIN_ROUTE_PATH}?${LOGIN_NEXT_PARAM}=${encodeLoginNext(safeNext)}`;
}

export function getCurrentAccountNextPath(location: Pick<Location, "hash" | "pathname" | "search"> | null = getBrowserLocation()) {
  if (!location) {
    return MANAGE_ROUTE_PATH;
  }

  return normalizePriestessNextPath(`${location.pathname}${location.search}${location.hash}`) || MANAGE_ROUTE_PATH;
}

export function normalizePriestessNextPath(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || !trimmedValue.startsWith("/") || trimmedValue.startsWith("//") || trimmedValue.includes("\\")) {
    return "";
  }

  try {
    const url = new URL(trimmedValue, NEXT_URL_BASE);
    if (url.origin !== NEXT_URL_BASE) {
      return "";
    }

    const normalizedPathname = normalizeAccountPathname(url.pathname);
    if (!normalizedPathname) {
      return "";
    }

    return `${normalizedPathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function normalizeAccountPathname(pathname: string) {
  if (matchesRoutePath(pathname, MANAGE_ROUTE_PATH)) {
    return `${MANAGE_ROUTE_PATH}${pathname.slice(MANAGE_ROUTE_PATH.length)}`;
  }
  if (matchesRoutePath(pathname, LEGACY_MANAGE_ROUTE_PATH)) {
    return `${MANAGE_ROUTE_PATH}${pathname.slice(LEGACY_MANAGE_ROUTE_PATH.length)}`;
  }
  if (matchesRoutePath(pathname, ACCOUNT_ROUTE_PATH)) {
    return `${MANAGE_ROUTE_PATH}${pathname.slice(ACCOUNT_ROUTE_PATH.length)}`;
  }

  return "";
}

function encodeLoginNext(value: string) {
  return encodeURIComponent(value).replace(/%2F/gi, "/");
}

function getBrowserLocation() {
  return typeof window === "undefined" ? null : window.location;
}
