/**
 * 个人中心共用的动效常量。
 * EASE_OUT 与 base.css 的 --ease-out 是同一条曲线，JS 侧不再各自复制数组。
 */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
export const EASE_LAYOUT = [0.22, 1, 0.36, 1] as const;
export const DURATION_FAST = 0.16;
export const DURATION_BASE = 0.24;
export const DURATION_SLOW = 0.34;
