export const PRIESTESS_DEFAULT_AVATAR_URL = new URL("../assets/priestess-default-avatar.png", import.meta.url).href;

export function getSafePriestessAvatarUrl(value?: string | null) {
  const trimmedValue = value?.trim() ?? "";
  if (!trimmedValue || trimmedValue.startsWith("//")) {
    return "";
  }
  if (trimmedValue.startsWith("/")) {
    return trimmedValue;
  }

  try {
    const url = new URL(trimmedValue);
    // 头像展示只接受普通 Web 资源；空值或不可信 scheme 统一回落到内置默认头像。
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function getPriestessDisplayAvatarUrl(value?: string | null) {
  return getSafePriestessAvatarUrl(value) || PRIESTESS_DEFAULT_AVATAR_URL;
}
