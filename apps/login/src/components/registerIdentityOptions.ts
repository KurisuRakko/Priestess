const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 注册身份统一为邮箱；返回归一化后的邮箱地址，格式不合法时返回 null。 */
export function normalizeEmailIdentity(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!EMAIL_PATTERN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}
