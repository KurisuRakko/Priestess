import {
  NON_JSON_PAYLOAD,
  PriestessApiError,
  resolveErrorMessage,
} from "./priestessApiErrors";
import { translatePriestess } from "./i18n";
import { requestPriestessDemoJson } from "./priestessDemoApi";

export type RequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  searchParams?: URLSearchParams;
  signal?: AbortSignal;
};

let hasWarnedMissingLocalApiBase = false;

export function getPriestessApiBaseUrl() {
  const configuredBase = normalizeBaseUrl(import.meta.env.VITE_PRIESTESS_API_BASE_URL);
  return configuredBase || "";
}

export function getPriestessApiBaseLabel() {
  return getPriestessApiBaseUrl() || translatePriestess("common:currentOrigin");
}

export async function requestJson(path: string, options: RequestOptions = {}) {
  const demoResponse = await requestPriestessDemoJson(path, options);
  if (demoResponse.handled) {
    return demoResponse.payload;
  }

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(buildApiUrl(path, options.searchParams), {
    body: options.body === undefined ? undefined : isFormData ? options.body as BodyInit : JSON.stringify(options.body),
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body === undefined || isFormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    method: options.method ?? "GET",
    signal: options.signal,
  });

  const text = await response.text();
  const payload = parseJsonPayload(text, response.headers.get("content-type"));

  if (!response.ok) {
    throw new PriestessApiError(resolveErrorMessage(payload, response.status), {
      payload,
      status: response.status,
    });
  }

  if (payload === NON_JSON_PAYLOAD) {
    throw new PriestessApiError(translatePriestess("errors:nonJsonResponse"), {
      payload: text,
      status: response.status,
    });
  }

  return payload;
}

function normalizeBaseUrl(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
}

function buildApiUrl(path: string, searchParams?: URLSearchParams) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const queryString = searchParams?.toString();
  const suffix = queryString ? `${normalizedPath}?${queryString}` : normalizedPath;
  const baseUrl = getPriestessApiBaseUrl();
  ensureExplicitLocalApiBase(baseUrl);

  return baseUrl ? `${baseUrl}${suffix}` : suffix;
}

function ensureExplicitLocalApiBase(baseUrl: string) {
  if (baseUrl || typeof window === "undefined") {
    return;
  }

  const isLocalHost = ["127.0.0.1", "localhost", "::1"].includes(window.location.hostname);
  const isPriestessLocalDev = import.meta.env.DEV && window.location.protocol === "http:" && isLocalHost;

  // 本地联调必须显式跨端口直连 Phainon，避免换端口后请求悄悄落到 Vite 同源服务。
  if (isPriestessLocalDev) {
    if (!hasWarnedMissingLocalApiBase) {
      hasWarnedMissingLocalApiBase = true;
      console.warn("Priestess 本地联调需要配置 VITE_PRIESTESS_API_BASE_URL=http://127.0.0.1:8787");
    }

    throw new PriestessApiError(translatePriestess("errors:localApiBaseMissing"), {
      status: null,
    });
  }
}

function parseJsonPayload(text: string, contentType: string | null) {
  const cleanText = text.trim();
  if (!cleanText) {
    return null;
  }

  const looksJson = cleanText.startsWith("{") || cleanText.startsWith("[") || contentType?.includes("application/json");
  if (!looksJson) {
    return NON_JSON_PAYLOAD;
  }

  try {
    return JSON.parse(cleanText) as unknown;
  } catch (error) {
    throw new PriestessApiError(translatePriestess("errors:jsonParseFailed"), {
      payload: cleanText,
      cause: error,
    });
  }
}
