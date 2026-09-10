import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

let PriestessI18nProvider = React.Fragment;
let loginI18nResources = undefined;

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

try {
  const primitivesModule = await server.ssrLoadModule("/src/components/AccountPagePrimitives.tsx");
  const formatModule = await server.ssrLoadModule("/src/components/accountPageFormat.ts");
  const loginI18nModule = await server.ssrLoadModule("/src/i18n/index.ts");
  // 共享包路径从脚本位置推导，避免硬编码仓库绝对路径在 worktree/其它机器上加载出第二份 React。
  const sharedLibDir = new URL("../../../packages/priestess-shared/src/lib/", import.meta.url).pathname;
  const sharedI18nModule = await server.ssrLoadModule(`/@fs${sharedLibDir}i18n.tsx`);
  const sharedApiModule = await server.ssrLoadModule(`/@fs${sharedLibDir}priestessApi.ts`);
  const sharedUserApiModule = await server.ssrLoadModule(`/@fs${sharedLibDir}priestessUserApi.ts`);
  ({ loginI18nResources } = loginI18nModule);
  ({ PriestessI18nProvider } = sharedI18nModule);

  const { getLocalSession } = sharedApiModule;
  const { getLocalDeviceSessionOverview, listLocalDeviceSessions, listLocalServiceAvailability } = sharedUserApiModule;
  const { AccountEmptyState, AccountInlineAlert, AccountRefreshIndicator, AccountSectionView, AccountSkeletonList } = primitivesModule;
  const { formatDateTime, formatRelativeTime } = formatModule;

  testFormatRelativeTimeZh({ formatDateTime, formatRelativeTime });
  testFormatRelativeTimeEn({ formatRelativeTime });
  testDeadCodeRemoved({ formatModule, primitivesModule });
  testAccountSkeletonList({ AccountSkeletonList });
  testAccountInlineAlert({ AccountInlineAlert });
  testAccountEmptyState({ AccountEmptyState });
  testAccountRefreshIndicator({ AccountRefreshIndicator });
  testAccountSectionViewId({ AccountSectionView });
  await testSessionSignedOutReason({ getLocalSession });
  await testDeviceSessionOverview({ getLocalDeviceSessionOverview, listLocalDeviceSessions });
  await testServiceAvailability({ listLocalServiceAvailability });

  console.log("account-primitives smoke passed");
} finally {
  await server.close();
}

function testFormatRelativeTimeZh({ formatDateTime, formatRelativeTime }) {
  const secondMs = 1000;
  const minuteMs = 60 * secondMs;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const now = Date.parse("2026-09-10T12:00:00.000Z");
  setNavigatorLanguage("zh-CN");
  const at = (offsetMs) => new Date(now - offsetMs).toISOString();

  assert.equal(formatRelativeTime("", now), "未提供");
  assert.equal(formatRelativeTime("not-a-date", now), "not-a-date");
  assert.equal(formatRelativeTime(at(30 * secondMs), now), "刚刚");
  assert.equal(formatRelativeTime(at(59 * secondMs), now), "刚刚");
  // 时钟偏差带来的未来时间与「刚刚」同组处理，不单独引出一条措辞。
  assert.equal(formatRelativeTime(at(-60 * secondMs), now), "刚刚");
  assert.equal(formatRelativeTime(at(60 * secondMs), now), "1分钟前");
  assert.equal(formatRelativeTime(at(59 * minuteMs), now), "59分钟前");
  assert.equal(formatRelativeTime(at(60 * minuteMs), now), "1小时前");
  assert.equal(formatRelativeTime(at(23 * hourMs), now), "23小时前");
  assert.equal(formatRelativeTime(at(24 * hourMs), now), "1天前");
  assert.equal(formatRelativeTime(at(6 * dayMs), now), "6天前");

  // 超过一周退回绝对时间；用相等断言而不是硬编码日期串，避免测试绑死时区。
  const weekOld = at(7 * dayMs);
  assert.equal(formatRelativeTime(weekOld, now), formatDateTime(weekOld));
}

function testFormatRelativeTimeEn({ formatRelativeTime }) {
  const minuteMs = 60 * 1000;
  const dayMs = 24 * 60 * minuteMs;
  const now = Date.parse("2026-09-10T12:00:00.000Z");
  setNavigatorLanguage("en-US");
  const at = (offsetMs) => new Date(now - offsetMs).toISOString();

  assert.equal(formatRelativeTime(at(1 * minuteMs), now), "1 minute ago");
  assert.equal(formatRelativeTime(at(3 * minuteMs), now), "3 minutes ago");
  assert.equal(formatRelativeTime(at(2 * dayMs), now), "2 days ago");
}

function testDeadCodeRemoved({ formatModule, primitivesModule }) {
  assert.equal(formatModule.formatSessionRemaining, undefined);
  assert.equal(formatModule.getInitial, undefined);
  assert.equal(primitivesModule.PendingList, undefined);
}

function testAccountSkeletonList({ AccountSkeletonList }) {
  const deviceMarkup = renderWithI18n(React.createElement(AccountSkeletonList, {
    label: "正在读取已登录设备",
    rows: 3,
    variant: "device",
  }));
  assert.equal(countOccurrences(deviceMarkup, 'class="account-skeleton-row"'), 3);
  assert.match(deviceMarkup, /account-skeleton-list--device/);
  assert.match(deviceMarkup, /aria-busy="true"/);

  const singleRowMarkup = renderWithI18n(React.createElement(AccountSkeletonList, {
    label: "正在读取服务",
    rows: 1,
    variant: "service",
  }));
  assert.equal(countOccurrences(singleRowMarkup, 'class="account-skeleton-row"'), 1);
}

function testAccountInlineAlert({ AccountInlineAlert }) {
  const errorMarkup = renderWithI18n(React.createElement(AccountInlineAlert, { tone: "error" }, "无法读取已登录设备"));
  assert.match(errorMarkup, /account-inline-alert--error/);
  assert.doesNotMatch(errorMarkup, /account-inline-alert--info/);

  const infoMarkup = renderWithI18n(React.createElement(AccountInlineAlert, { tone: "info" }, "正在读取服务"));
  assert.match(infoMarkup, /account-inline-alert--info/);

  const defaultToneMarkup = renderWithI18n(React.createElement(AccountInlineAlert, null, "退出设备失败"));
  assert.match(defaultToneMarkup, /account-inline-alert--error/);

  const actionMarkup = renderWithI18n(React.createElement(
    AccountInlineAlert,
    { action: React.createElement("button", { type: "button" }, "重试"), tone: "error" },
    "退出其他设备失败",
  ));
  assert.match(actionMarkup, /account-inline-alert__action/);
  assert.doesNotMatch(errorMarkup, /account-inline-alert__action/);
}

function testAccountEmptyState({ AccountEmptyState }) {
  const markup = renderWithI18n(React.createElement(AccountEmptyState, {
    icon: React.createElement("span", null, "i"),
    title: "当前没有可显示的登录设备。",
  }));
  assert.ok(markup.includes("当前没有可显示的登录设备。"));
  assert.match(markup, /account-empty-state__icon/);
  assert.doesNotMatch(markup, /account-empty-state__description/);

  const describedMarkup = renderWithI18n(React.createElement(AccountEmptyState, {
    description: "当前没有向你开放的服务",
    icon: React.createElement("span", null, "i"),
    title: "当前没有可显示的登录设备。",
  }));
  assert.match(describedMarkup, /account-empty-state__description/);
}

function testAccountRefreshIndicator({ AccountRefreshIndicator }) {
  const activeMarkup = renderWithI18n(React.createElement(AccountRefreshIndicator, { active: true }));
  assert.match(activeMarkup, /data-active="true"/);
  assert.match(activeMarkup, /is-spinning/);

  const idleMarkup = renderWithI18n(React.createElement(AccountRefreshIndicator, { active: false }));
  assert.match(idleMarkup, /data-active="false"/);
  assert.doesNotMatch(idleMarkup, /is-spinning/);
}

function testAccountSectionViewId({ AccountSectionView }) {
  setNavigatorLanguage("zh-CN");
  const zhMarkup = renderWithI18n(React.createElement(AccountSectionView, {
    description: "查看并管理当前账号仍然登录的设备。",
    icon: React.createElement("span", null, "i"),
    title: "设备",
  }, React.createElement("p", null, "内容")));
  setNavigatorLanguage("en-US");
  const enMarkup = renderWithI18n(React.createElement(AccountSectionView, {
    description: "Review and manage the devices still signed in to this account.",
    icon: React.createElement("span", null, "i"),
    title: "Devices",
  }, React.createElement("p", null, "content")));

  const zhId = readAriaLabelledBy(zhMarkup);
  const enId = readAriaLabelledBy(enMarkup);
  // 同一个位置渲染两次必须得到同一个 id，否则切语言会让 aria-labelledby 指向不存在的节点。
  assert.equal(zhId, enId);
  assert.ok(zhMarkup.includes(`id="${zhId}"`));
  assert.ok(enMarkup.includes(`id="${enId}"`));
  assert.doesNotMatch(zhMarkup, /aria-labelledby="account-section-/);
}

async function testSessionSignedOutReason({ getLocalSession }) {
  await withMockFetch([
    jsonResponse({ authenticated: false, signed_out_reason: "device_limit" }, 401),
  ], async () => {
    const session = await getLocalSession();
    assert.equal(session.authenticated, false);
    assert.equal(session.signedOutReason, "device_limit");
    assert.equal(session.user, null);
  });

  await withMockFetch([
    jsonResponse({ authenticated: false, signed_out_reason: "device_limit" }),
  ], async () => {
    const session = await getLocalSession();
    assert.equal(session.authenticated, false);
    assert.equal(session.signedOutReason, "device_limit");
  });

  await withMockFetch([
    jsonResponse({ authenticated: true, user: { user_id: "u1", username: "u1" } }),
  ], async () => {
    const session = await getLocalSession();
    assert.equal(session.authenticated, true);
    assert.equal(session.signedOutReason, "");
  });
}

async function testDeviceSessionOverview({ getLocalDeviceSessionOverview, listLocalDeviceSessions }) {
  await withMockFetch([
    jsonResponse({
      device_count: 3,
      device_limit: 5,
      sessions: [buildDeviceSession({ browser_id: "b1" })],
      total: 3,
    }),
  ], async () => {
    const overview = await getLocalDeviceSessionOverview({ forceRefresh: true });
    assert.equal(overview.deviceLimit, 5);
    assert.equal(overview.deviceCount, 3);
    assert.equal(overview.total, 3);
    assert.equal(overview.sessions[0].browserId, "b1");
  });

  await withMockFetch([
    jsonResponse({ sessions: [buildDeviceSession({ browser_id: "b1", revoked_reason: "device_limit" })] }),
  ], async () => {
    const overview = await getLocalDeviceSessionOverview({ forceRefresh: true });
    assert.equal(overview.sessions[0].revokedReason, "device_limit");
  });

  // 后端没回容量字段时按 browser_id 去重估算活跃设备数，上限回落 0 表示界面不展示容量。
  await withMockFetch([
    jsonResponse({
      sessions: [
        buildDeviceSession({ browser_id: "same-browser", session_id: "pls_1" }),
        buildDeviceSession({ browser_id: "same-browser", session_id: "pls_2" }),
      ],
    }),
  ], async () => {
    const overview = await getLocalDeviceSessionOverview({ forceRefresh: true });
    assert.equal(overview.deviceLimit, 0);
    assert.equal(overview.deviceCount, 1);
  });

  await withMockFetch([
    jsonResponse({
      sessions: [
        buildDeviceSession({ browser_id: "b1" }),
        buildDeviceSession({ browser_id: "" }),
        buildDeviceSession({ browser_id: "b2", revoked_at: "2026-01-01T00:00:00.000Z" }),
      ],
    }),
  ], async () => {
    const overview = await getLocalDeviceSessionOverview({ forceRefresh: true });
    assert.equal(overview.deviceCount, 2);
  });

  // App.tsx 仍然按数组消费设备列表，薄封装必须保持数组形态。
  await withMockFetch([
    jsonResponse({ sessions: [buildDeviceSession({ browser_id: "b1" })] }),
  ], async () => {
    const sessions = await listLocalDeviceSessions({ forceRefresh: true });
    assert.equal(Array.isArray(sessions), true);
  });

  // 41. 共享 in-flight 请求不随第一个调用方 abort：第二个调用方仍拿到数据，且只发了一次 fetch。
  {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    let release = () => {};
    let reachedFetch = () => {};
    const fetchEntered = new Promise((resolve) => { reachedFetch = resolve; });
    globalThis.fetch = async() => {
      fetchCalls += 1;
      reachedFetch();
      await new Promise((resolve) => { release = resolve; });
      return jsonResponse({ device_count: 1, device_limit: 5, sessions: [buildDeviceSession({ browser_id: "b1" })], total: 1 });
    };
    try {
      const first = new AbortController();
      const firstCall = getLocalDeviceSessionOverview({ forceRefresh: true, signal: first.signal });
      const secondCall = getLocalDeviceSessionOverview({ forceRefresh: true });
      await fetchEntered;
      first.abort();
      release();
      const [firstResult, secondResult] = await Promise.allSettled([firstCall, secondCall]);
      assert.equal(secondResult.status, "fulfilled", "second caller must still receive data after the first caller aborted");
      assert.equal(secondResult.value.deviceCount, 1);
      assert.equal(fetchCalls, 1, "both callers must share a single in-flight request");
      // 第一个调用方拿到结果也可以（它自己决定是否消费），但绝不能把 AbortError 传染给别人。
      assert.notEqual(firstResult.status === "rejected" && secondResult.status === "rejected", true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
}

async function testServiceAvailability({ listLocalServiceAvailability }) {
  await withMockFetch([
    jsonResponse({
      services: [
        { access: "available", active_session: true, app_id: "a", name: "A" },
        { access: "unavailable", activeSession: false, appId: "b", name: "B" },
      ],
      total: 2,
    }),
  ], async () => {
    const services = await listLocalServiceAvailability();
    assert.equal(services.length, 2);
    assert.equal(services[0].access, "available");
    assert.equal(services[0].activeSession, true);
    assert.equal(services[1].appId, "b");
  });

  // 未知 access 取值一律按未开放处理，避免前端把后端新枚举当成已授权。
  await withMockFetch([
    jsonResponse({ services: [{ access: "maybe", app_id: "a", name: "A" }] }),
  ], async () => {
    const services = await listLocalServiceAvailability();
    assert.equal(services[0].access, "unavailable");
  });

  await withMockFetch([
    jsonResponse("not-an-object"),
  ], async () => {
    assert.deepEqual(await listLocalServiceAvailability(), []);
  });

  await withMockFetch([
    jsonResponse({ services: "not-an-array" }),
  ], async () => {
    assert.deepEqual(await listLocalServiceAvailability(), []);
  });
}

function setNavigatorLanguage(language) {
  // i18n.tsx 的 readBrowserLanguages() 每次调用都重读 navigator，所以可以中途切换语言。
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { language, languages: [language] },
  });
}

function renderWithI18n(element) {
  return renderToStaticMarkup(React.createElement(PriestessI18nProvider, {
    resources: loginI18nResources,
  }, element));
}

function readAriaLabelledBy(markup) {
  const match = /aria-labelledby="([^"]+)"/.exec(markup);
  assert.ok(match, "AccountSectionView 必须渲染 aria-labelledby");
  return match[1];
}

function countOccurrences(text, fragment) {
  return text.split(fragment).length - 1;
}

function buildDeviceSession(overrides = {}) {
  return {
    browser: "Chrome",
    created_at: "2026-09-01T08:00:00.000Z",
    current: false,
    device: "Desktop",
    expires_at: "2026-10-01T08:00:00.000Z",
    ip_address: "127.0.0.1",
    last_used_at: "2026-09-10T08:00:00.000Z",
    os: "macOS",
    revoked_at: null,
    session_id: "pls_test",
    user_agent_summary: "Chrome / macOS",
    ...overrides,
  };
}

async function withMockFetch(responses, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async() => {
    const response = responses.shift();
    assert.ok(response, "unexpected fetch call");
    return response;
  };

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
