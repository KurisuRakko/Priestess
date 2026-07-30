export type LoginIdentityMotionRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type LoginIdentityMotionSource = {
  avatarRect: LoginIdentityMotionRect;
  kind: "account-picker";
};

export function captureAccountPickerIdentitySource(
  accountButton: HTMLElement,
): LoginIdentityMotionSource | null {
  const avatar = accountButton.querySelector<HTMLElement>('[data-account-shared-part="avatar"]');
  if (!avatar) {
    return null;
  }

  const rect = avatar.getBoundingClientRect();
  if (
    !Number.isFinite(rect.top)
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }

  // 只保存一次点击瞬间的视口坐标。账号卡随后可以正常退场，
  // 状态层仍能从用户刚刚看到的头像位置接续这段运动。
  return {
    avatarRect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    kind: "account-picker",
  };
}
