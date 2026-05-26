const PHONE_PATTERN = /^\+?[0-9]{6,20}$/;
const BIRTHDAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeProfilePhone(value: string) {
  return value.trim().replace(/[\s().-]/g, "");
}

export function isValidProfilePhone(value: string) {
  return PHONE_PATTERN.test(value);
}

export function isValidProfileBirthday(value: string) {
  if (!BIRTHDAY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const birthdayTime = Date.UTC(year, month - 1, day);
  const birthdayDate = new Date(birthdayTime);

  // 用 UTC 复核日期，避免 2026-02-31 这类值被 Date 自动进位后误判为合法。
  if (
    birthdayDate.getUTCFullYear() !== year ||
    birthdayDate.getUTCMonth() !== month - 1 ||
    birthdayDate.getUTCDate() !== day
  ) {
    return false;
  }

  const today = new Date();
  const todayTime = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return birthdayTime <= todayTime;
}

export function getTodayDateInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
