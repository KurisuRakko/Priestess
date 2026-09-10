import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

// 固定基准时钟只用于夹具时间戳；相对时间断言必须自己算偏移，避免测试随时钟漂移。
const NOW = Date.parse("2026-09-10T12:00:00.000Z");
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

let AccountDevicesView = null;
let PriestessI18nProvider = React.Fragment;
let loginI18nResources = undefined;

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

try {
  const devicesModule = await server.ssrLoadModule("/src/components/AccountDevicesView.tsx");
  const loginI18nModule = await server.ssrLoadModule("/src/i18n/index.ts");
  // 共享包路径从脚本位置推导，必须走 /@fs 前缀，否则会加载出第二份 React。
  const sharedLibDir = new URL("../../../packages/priestess-shared/src/lib/", import.meta.url).pathname;
  const sharedI18nModule = await server.ssrLoadModule(`/@fs${sharedLibDir}i18n.tsx`);
  ({ loginI18nResources } = loginI18nModule);
  ({ PriestessI18nProvider } = sharedI18nModule);

  const { sortDeviceSessions } = devicesModule;
  ({ AccountDevicesView } = devicesModule);

  testSortDeviceSessions({ sortDeviceSessions });
  testInitialLoadingSkeleton();
  testRefreshingKeepsList();
  testCurrentDeviceFirst();
  testLegacyNoiseRemoved();
  testDeviceCapacity();
  testRelativeTimeInPrimaryLine();
  testInlineConfirm();
  testRevokeOthers();
  testErrorAndEmptyState();
  testAccessibilityIds();
  testCurrentDeviceDialog();

  console.log("account-devices smoke passed");
} finally {
  await server.close();
}

function testSortDeviceSessions({ sortDeviceSessions }) {
  // 1. 当前设备排第一，即使它已经很久没用过。
  const currentFirst = sortDeviceSessions([
    buildSession({ current: false, lastUsedAt: new Date(NOW - HOUR_MS).toISOString(), sessionId: "s-other" }),
    buildSession({ current: true, lastUsedAt: new Date(NOW - 10 * DAY_MS).toISOString(), sessionId: "s-current" }),
  ]);
  assert.equal(currentFirst[0].current, true);

  // 2. 非当前设备按 lastUsedAt 降序。
  const ordered = sortDeviceSessions([
    buildSession({ lastUsedAt: new Date(NOW - 3 * HOUR_MS).toISOString(), sessionId: "s-3h" }),
    buildSession({ lastUsedAt: new Date(NOW - HOUR_MS).toISOString(), sessionId: "s-1h" }),
    buildSession({ lastUsedAt: new Date(NOW - 2 * HOUR_MS).toISOString(), sessionId: "s-2h" }),
  ]);
  assert.deepEqual(ordered.map((session) => session.sessionId), ["s-1h", "s-2h", "s-3h"]);

  // 3. lastUsedAt 为空时回落 createdAt 参与排序。
  const byCreatedAt = sortDeviceSessions([
    buildSession({ createdAt: new Date(NOW - 5 * DAY_MS).toISOString(), lastUsedAt: "", sessionId: "s-old" }),
    buildSession({ createdAt: new Date(NOW - HOUR_MS).toISOString(), lastUsedAt: "", sessionId: "s-new" }),
  ]);
  assert.deepEqual(byCreatedAt.map((session) => session.sessionId), ["s-new", "s-old"]);

  // 4. 已撤销的会话不出现在界面数据里。
  const alive = sortDeviceSessions([
    buildSession({ sessionId: "s-alive" }),
    buildSession({ revokedAt: new Date(NOW - HOUR_MS).toISOString(), sessionId: "s-revoked" }),
  ]);
  assert.equal(alive.length, 1);
  assert.equal(alive[0].sessionId, "s-alive");

  // 5. 纯函数不改原数组。
  const input = [
    buildSession({ lastUsedAt: new Date(NOW - 3 * HOUR_MS).toISOString(), sessionId: "s-late" }),
    buildSession({ lastUsedAt: new Date(NOW - HOUR_MS).toISOString(), sessionId: "s-early" }),
  ];
  const inputOrder = input.map((session) => session.sessionId);
  sortDeviceSessions(input);
  assert.deepEqual(input.map((session) => session.sessionId), inputOrder);
  assert.equal(input.length, 2);
}

function testInitialLoadingSkeleton() {
  const markup = renderView({ isInitialLoading: true, sessions: [] });
  assert.ok(markup.includes("account-skeleton-list--device"), "first load must render the device skeleton");
  assert.equal(countClass(markup, "account-device-list"), 0, "skeleton state must not render the list container");
  assert.equal(markup.includes("account-device-card"), false, "skeleton state must not render device cards");
}

function testRefreshingKeepsList() {
  const sessions = [
    buildSession({ current: true, ipAddress: "10.0.0.1", sessionId: "s-a" }),
    buildSession({ ipAddress: "10.0.0.2", sessionId: "s-b" }),
  ];
  const markup = renderView({ isRefreshing: true, sessions });
  assert.equal(countClass(markup, "account-device-list"), 1, "refreshing must keep the list mounted");
  assert.ok(markup.includes("10.0.0.1"));
  assert.ok(markup.includes("10.0.0.2"));
  assert.ok(markup.includes('data-active="true"'), "refreshing must light the header indicator");
  assert.equal(markup.includes("account-skeleton-list"), false, "skeleton is first-load only");

  const idle = renderView({ isRefreshing: false, sessions });
  assert.ok(idle.includes('data-active="false"'));
  assert.equal(idle.includes('data-active="true"'), false);
}

function testCurrentDeviceFirst() {
  const markup = renderView({
    deviceCount: 2,
    sessions: [
      buildSession({ ipAddress: "203.0.113.9", sessionId: "s-other" }),
      buildSession({ current: true, ipAddress: "198.51.100.7", lastUsedAt: new Date(NOW - 10 * DAY_MS).toISOString(), sessionId: "s-current" }),
    ],
  });
  const currentIndex = markup.indexOf("account-device-card--current");
  const otherIndex = markup.indexOf("203.0.113.9");
  assert.ok(currentIndex >= 0, "current device must carry the --current modifier");
  assert.ok(otherIndex >= 0, "other device must still render");
  assert.ok(currentIndex < otherIndex, "current device must be rendered before the other devices");
  assert.ok(markup.includes("此设备"), "current device must carry the 此设备 pill");
}

function testLegacyNoiseRemoved() {
  const markup = renderView({ sessions: [buildSession({ ipAddress: "1.2.3.4" })] });
  assert.equal(markup.includes(">已登录<"), false, "non-current devices must not carry the 已登录 pill");
  assert.equal(markup.includes("account-device-card__facts"), false, "the equal-weight dl must be gone");
  assert.equal(markup.includes("过期时间"), false, "expiry is not a user-facing device fact");
  assert.equal(markup.includes("IP 地址"), false, "IP must only appear inline, not as a dt/dd label");
  assert.equal(markup.includes("浏览器 · 1.2.3.4"), false, "the device · ip subtitle must be gone");
  assert.ok(markup.includes("Chrome · macOS"), "the card heading must be browser · os");
}

function testDeviceCapacity() {
  const normal = renderView({ deviceCount: 3, deviceLimit: 5, sessions: [] });
  assert.ok(normal.includes("3 / 5"));
  assert.equal(
    countClass(normal, "account-device-capacity__dot") + countClass(normal, "account-device-capacity__dot is-used"),
    5,
    "capacity must render one dot per limit slot",
  );
  assert.equal(countClass(normal, "account-device-capacity__dot is-used"), 3);
  assert.equal(normal.includes("is-full"), false, "3 / 5 must not be a full capacity state");
  assert.ok(normal.includes("超过 5 台时，最久未使用的设备会被自动退出登录"));

  const full = renderView({ deviceCount: 5, deviceLimit: 5, sessions: [] });
  assert.ok(full.includes("account-device-capacity is-full"));

  const withoutLimit = renderView({ deviceCount: 3, deviceLimit: 0, sessions: [] });
  assert.equal(withoutLimit.includes("account-device-capacity"), false, "no backend limit means no capacity block");
  assert.equal(withoutLimit.includes("account-device-panel__hint"), false);
}

function testRelativeTimeInPrimaryLine() {
  // formatRelativeTime 内部用 Date.now()，所以这里必须按真实当前时间算偏移。
  const markup = renderView({
    sessions: [buildSession({
      lastUsedAt: new Date(Date.now() - 3 * HOUR_MS).toISOString(),
      sessionId: "s-recent",
    })],
  });
  assert.ok(markup.includes("3小时前使用"), "primary line must lead with relative activity time");
}

function testInlineConfirm() {
  const idle = renderView({ sessions: [buildSession({ sessionId: "s-b" })] });
  assert.equal(idle.includes("account-device-card__confirm"), false);
  assert.ok(idle.includes("退出登录"));

  const confirming = renderView({ confirmingSessionId: "s-b", sessions: [buildSession({ sessionId: "s-b" })] });
  assert.ok(confirming.includes("account-device-card__confirm"));
  assert.ok(confirming.includes("确认退出"));
  assert.ok(confirming.includes("取消"));

  const revoking = renderView({ revokingSessionId: "s-b", sessions: [buildSession({ sessionId: "s-b" })] });
  assert.ok(revoking.includes("正在退出"));
  assert.equal(revoking.includes("account-device-card__confirm"), false);

  const current = renderView({ sessions: [buildSession({ current: true, sessionId: "s-current" })] });
  assert.ok(current.includes("退出此设备"));
  // 容量说明句里也含「退出登录」四个字，所以只在当前设备卡片内部断言按钮文案。
  const currentCard = current.slice(current.indexOf("account-device-card--current"));
  assert.equal(currentCard.includes("退出登录"), false, "the current device must go through the dialog, not the inline revoke");
}

function testRevokeOthers() {
  const sessions = [buildSession({ current: true, sessionId: "s-current" }), buildSession({ sessionId: "s-b" })];
  assert.ok(renderView({ sessions }).includes("退出其他所有设备"));

  const onlyCurrent = renderView({ sessions: [buildSession({ current: true, sessionId: "s-current" })] });
  assert.equal(onlyCurrent.includes("退出其他所有设备"), false, "no other devices means no bulk revoke entry");

  assert.ok(renderView({ isConfirmingRevokeOthers: true, sessions }).includes("account-device-panel__confirm"));
  assert.ok(renderView({ isRevokingOthers: true, sessions }).includes("正在退出"));
}

function testErrorAndEmptyState() {
  const withError = renderView({ error: "boom", sessions: [] });
  assert.ok(withError.includes("account-inline-alert--error"));
  assert.ok(withError.includes("boom"));
  assert.ok(withError.includes("重试"));
  assert.equal(withError.includes("account-empty-state"), false, "an error must not stack the empty state on top");

  const empty = renderView({ error: "", isInitialLoading: false, sessions: [] });
  assert.ok(empty.includes("account-empty-state"));
  assert.ok(empty.includes("当前没有可显示的登录设备。"));
}

function testAccessibilityIds() {
  const markup = renderView({ sessions: [buildSession({ sessionId: "s-b" })] });
  assert.doesNotMatch(markup, /account-device-list-title/, "the inner panel must not repeat aria-labelledby");
  assert.doesNotMatch(markup, /account-motion-surface/, "account-motion-surface has no CSS definition and must be gone");
}

function testCurrentDeviceDialog() {
  const sessions = [buildSession({ current: true, sessionId: "s-current" })];

  const open = renderView({ isCurrentDeviceDialogOpen: true, sessions });
  assert.ok(open.includes("account-dialog"));
  assert.ok(open.includes("account-device-revoke-title"));
  assert.ok(open.includes("退出此设备后需要重新登录 Priestess。"));

  const closed = renderView({ isCurrentDeviceDialogOpen: false, sessions });
  assert.equal(closed.includes("account-device-revoke-title"), false);
}

function buildSession(overrides) {
  return {
    browser: "Chrome",
    browserId: "",
    createdAt: new Date(NOW - DAY_MS).toISOString(),
    current: false,
    device: "浏览器",
    expiresAt: new Date(NOW + DAY_MS).toISOString(),
    ipAddress: "1.2.3.4",
    lastUsedAt: new Date(NOW - HOUR_MS).toISOString(),
    os: "macOS",
    raw: null,
    revokedAt: "",
    revokedReason: "",
    sessionId: "s-default",
    userAgentSummary: "",
    ...overrides,
  };
}

function renderView(overrides = {}) {
  return renderWithI18n(React.createElement(AccountDevicesView, {
    confirmingSessionId: "",
    deviceCount: 3,
    deviceLimit: 5,
    error: "",
    isConfirmingRevokeOthers: false,
    isCurrentDeviceDialogOpen: false,
    isInitialLoading: false,
    isRefreshing: false,
    isRevokingOthers: false,
    onCancelRevoke() {},
    onCancelRevokeOthers() {},
    onCloseCurrentDeviceDialog() {},
    onConfirmRevoke() {},
    onConfirmRevokeOthers() {},
    onOpenCurrentDeviceDialog() {},
    onRefresh() {},
    onRequestRevoke() {},
    onRequestRevokeOthers() {},
    revokingSessionId: "",
    sessions: [],
    ...overrides,
  }));
}

function renderWithI18n(element) {
  return renderToStaticMarkup(React.createElement(PriestessI18nProvider, {
    resources: loginI18nResources,
  }, element));
}

function countClass(markup, className) {
  return markup.split(`class="${className}"`).length - 1;
}
