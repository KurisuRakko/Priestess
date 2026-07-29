import type { RegisterIdentityType } from "@priestess/shared";

export const REGISTER_STEPS = ["identity", "invitation", "verification", "password", "profile"] as const;

export type RegisterStep = (typeof REGISTER_STEPS)[number] | "success";

export const REGISTER_STEP_LABELS: Record<(typeof REGISTER_STEPS)[number], string> = {
  identity: "账号",
  invitation: "邀请",
  password: "密码",
  profile: "资料",
  verification: "验证",
};

export const STEP_PANEL_EASE = [0.2, 0.8, 0.2, 1] as const;

export const STEP_PANEL_VARIANTS = {
  center: {
    filter: "blur(0px)",
    opacity: 1,
    x: 0,
  },
  enter: (direction: number) => ({
    filter: "blur(6px)",
    opacity: 0,
    x: direction > 0 ? 26 : -26,
  }),
  exit: (direction: number) => ({
    filter: "blur(5px)",
    opacity: 0,
    x: direction > 0 ? -22 : 22,
  }),
};

export function getStepCopy(step: RegisterStep, identityType: RegisterIdentityType) {
  if (step === "password") return { title: "设置密码", description: "至少 12 个字符，建议使用不重复的长密码。" };
  if (step === "invitation") {
    return {
      title: "验证邀请码",
      description: identityType === "phone"
        ? "邀请码会绑定当前手机号，完成人机验证后继续。"
        : "邀请码会绑定当前邮箱，完成人机验证后继续。",
    };
  }
  if (step === "verification") {
    return {
      title: "输入验证码",
      description: identityType === "phone"
        ? "输入发送到当前手机号的 6 位验证码。"
        : "输入发送到当前邮箱的 6 位验证码。",
    };
  }
  if (step === "profile") return { title: "创建个人资料", description: "设置昵称和唯一用户名，用户名会先从昵称自动生成。" };
  if (step === "success") return { title: "注册完成", description: "账号已创建，正在为你进入应用。" };
  return {
    title: "创建账号",
    description: identityType === "phone" ? "选择手机号所属地区，再输入本地号码。" : "输入邮箱，用于验证和找回。",
  };
}

export function getStepLabel(step: (typeof REGISTER_STEPS)[number], identityType: RegisterIdentityType) {
  if (step === "identity") return identityType === "phone" ? "手机号" : "邮箱";
  return REGISTER_STEP_LABELS[step];
}
