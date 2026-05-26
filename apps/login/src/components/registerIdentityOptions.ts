import type { RegisterIdentityType } from "@priestess/shared";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+[0-9]{6,20}$/;

export type RegisterPhoneRegion = {
  callingCode: string;
  example: string;
  id: string;
  label: string;
  trunkPrefix?: string;
};

export type NormalizedRegisterIdentity = {
  type: RegisterIdentityType;
  value: string;
};

export const REGISTER_PHONE_REGIONS: RegisterPhoneRegion[] = [
  { callingCode: "+61", example: "412345678", id: "AU", label: "澳洲", trunkPrefix: "0" },
  { callingCode: "+86", example: "13800138000", id: "CN", label: "中国大陆" },
  { callingCode: "+852", example: "51234567", id: "HK", label: "香港" },
  { callingCode: "+853", example: "61234567", id: "MO", label: "澳门" },
  { callingCode: "+886", example: "912345678", id: "TW", label: "台湾", trunkPrefix: "0" },
  { callingCode: "+81", example: "9012345678", id: "JP", label: "日本", trunkPrefix: "0" },
  { callingCode: "+82", example: "1012345678", id: "KR", label: "韩国", trunkPrefix: "0" },
  { callingCode: "+65", example: "81234567", id: "SG", label: "新加坡" },
  { callingCode: "+60", example: "123456789", id: "MY", label: "马来西亚", trunkPrefix: "0" },
  { callingCode: "+64", example: "211234567", id: "NZ", label: "新西兰", trunkPrefix: "0" },
  { callingCode: "+1", example: "4155550123", id: "US_CA", label: "美国/加拿大" },
  { callingCode: "+44", example: "7123456789", id: "GB", label: "英国", trunkPrefix: "0" },
];

export const DEFAULT_REGISTER_PHONE_REGION_ID = "AU";

export function getRegisterPhoneRegion(regionId: string) {
  return REGISTER_PHONE_REGIONS.find((region) => region.id === regionId) ?? REGISTER_PHONE_REGIONS[0];
}

export function normalizePhoneLocalInput(rawValue: string, region: RegisterPhoneRegion) {
  const callingDigits = region.callingCode.replace(/\D/g, "");
  const digits = rawValue.replace(/\D/g, "");
  const localDigits = rawValue.trim().startsWith("+") && digits.startsWith(callingDigits)
    ? digits.slice(callingDigits.length)
    : digits;
  return localDigits.slice(0, 18);
}

export function normalizeEmailIdentity(rawValue: string): NormalizedRegisterIdentity | null {
  const trimmed = rawValue.trim();
  if (!EMAIL_PATTERN.test(trimmed)) return null;
  return { type: "email", value: trimmed.toLowerCase() };
}

export function normalizePhoneIdentity(regionId: string, rawLocalNumber: string): NormalizedRegisterIdentity | null {
  const region = getRegisterPhoneRegion(regionId);
  let localDigits = normalizePhoneLocalInput(rawLocalNumber, region);

  // 用户输入本地号码时常会带国内拨号前缀 0；提交前统一去掉，保持后端收到 E.164 风格手机号。
  if (region.trunkPrefix && localDigits.startsWith(region.trunkPrefix) && localDigits.length > region.trunkPrefix.length + 4) {
    localDigits = localDigits.slice(region.trunkPrefix.length);
  }

  const phone = `${region.callingCode}${localDigits}`;
  if (!PHONE_PATTERN.test(phone)) return null;
  return { type: "phone", value: phone };
}
