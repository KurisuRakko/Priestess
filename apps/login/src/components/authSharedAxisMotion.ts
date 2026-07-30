const MOBILE_SHARED_AXIS_ENTER_DISTANCE = 24;
const MOBILE_SHARED_AXIS_EXIT_DISTANCE = 14;
const DESKTOP_SHARED_AXIS_ENTER_DISTANCE = 30;
const DESKTOP_SHARED_AXIS_EXIT_DISTANCE = 18;

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

// 桌面端保留更长的空间行程，并把入场稍微错开，让内容、卡片高度和布局变化连续发生。
export const DESKTOP_SHARED_AXIS_ENTER_TRANSITION = {
  delay: 0.06,
  duration: 0.34,
  ease: [0.16, 1, 0.3, 1],
} as const;

export const DESKTOP_SHARED_AXIS_EXIT_TRANSITION = {
  duration: 0.18,
  ease: [0.4, 0, 1, 1],
} as const;

export const DESKTOP_HEIGHT_SPRING = {
  damping: 34,
  mass: 0.78,
  stiffness: 310,
  type: "spring",
} as const;

export function getDesktopSharedAxisInitial(direction: number) {
  return {
    filter: "blur(3px)",
    opacity: 0,
    x: direction * DESKTOP_SHARED_AXIS_ENTER_DISTANCE,
  };
}

export function getDesktopSharedAxisEnter() {
  return {
    filter: "blur(0px)",
    opacity: 1,
    transition: DESKTOP_SHARED_AXIS_ENTER_TRANSITION,
    x: 0,
  };
}

export function getDesktopSharedAxisExit(direction: number) {
  return {
    filter: "blur(2px)",
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
