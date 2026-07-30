const MOBILE_SHARED_AXIS_ENTER_DISTANCE = 24;
const MOBILE_SHARED_AXIS_EXIT_DISTANCE = 14;
const DESKTOP_SHARED_AXIS_ENTER_DISTANCE = 156;
const DESKTOP_SHARED_AXIS_EXIT_DISTANCE = 96;
export const DESKTOP_SHARED_AXIS_EXIT_DURATION_MS = 260;

// 手机端采用 Material fade-through 节奏：旧内容先快速让位，新内容再清晰进入，
// 避免两层表单文字同时半透明叠在一起造成廉价的重影感。
export const MOBILE_SHARED_AXIS_ENTER_TRANSITION = {
  duration: 0.24,
  ease: [0, 0, 0.2, 1],
} as const;

export const MOBILE_SHARED_AXIS_EXIT_TRANSITION = {
  duration: 0.1,
  ease: [0.4, 0, 1, 1],
} as const;

export function getMobileSharedAxisInitial(direction: number) {
  return {
    opacity: 0,
    x: direction * MOBILE_SHARED_AXIS_ENTER_DISTANCE,
  };
}

export function getMobileSharedAxisEnter() {
  return {
    opacity: 1,
    transition: MOBILE_SHARED_AXIS_ENTER_TRANSITION,
    x: 0,
  };
}

export function getMobileSharedAxisExit(direction: number) {
  return {
    opacity: 0,
    transition: MOBILE_SHARED_AXIS_EXIT_TRANSITION,
    x: direction * MOBILE_SHARED_AXIS_EXIT_DISTANCE,
  };
}

export const MOBILE_STEP_SHARED_AXIS_VARIANTS = {
  center: getMobileSharedAxisEnter(),
  enter: (direction: number) => getMobileSharedAxisInitial(direction),
  exit: (direction: number) => getMobileSharedAxisExit(direction > 0 ? -1 : 1),
};

// 桌面端使用清晰的大行程共享轴；退场完成后才挂载下一块内容，
// 因此这里不再叠加 blur 或额外 delay，避免文字重影和两段动画互相拖拽。
export const DESKTOP_SHARED_AXIS_ENTER_TRANSITION = {
  duration: 0.46,
  ease: [0.16, 1, 0.3, 1],
} as const;

export const DESKTOP_SHARED_AXIS_EXIT_TRANSITION = {
  duration: DESKTOP_SHARED_AXIS_EXIT_DURATION_MS / 1000,
  ease: [0.4, 0, 0.2, 1],
} as const;

// 高度由最外层认证视口统一驱动；固定时长比嵌套弹簧更容易和共享轴保持同一节奏。
export const DESKTOP_HEIGHT_TRANSITION = {
  duration: 0.46,
  ease: [0.16, 1, 0.3, 1],
} as const;

export function getDesktopSharedAxisInitial(direction: number) {
  return {
    opacity: 0,
    x: direction * DESKTOP_SHARED_AXIS_ENTER_DISTANCE,
  };
}

export function getDesktopSharedAxisEnter() {
  return {
    opacity: 1,
    transition: DESKTOP_SHARED_AXIS_ENTER_TRANSITION,
    x: 0,
  };
}

export function getDesktopSharedAxisExit(direction: number) {
  return {
    opacity: 0,
    transition: DESKTOP_SHARED_AXIS_EXIT_TRANSITION,
    x: direction * DESKTOP_SHARED_AXIS_EXIT_DISTANCE,
  };
}

export const DESKTOP_STEP_SHARED_AXIS_VARIANTS = {
  center: getDesktopSharedAxisEnter(),
  enter: (direction: number) => getDesktopSharedAxisInitial(direction),
  exit: (direction: number) => getDesktopSharedAxisExit(direction > 0 ? -1 : 1),
};
