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
let AccountServicesView = null;

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

try {
  const servicesViewModule = await server.ssrLoadModule("/src/components/AccountServicesView.tsx");
  const loginI18nModule = await server.ssrLoadModule("/src/i18n/index.ts");
  // 共享包路径从脚本位置推导，避免硬编码仓库绝对路径在 worktree/其它机器上加载出第二份 React。
  const sharedLibDir = new URL("../../../packages/priestess-shared/src/lib/", import.meta.url).pathname;
  const sharedI18nModule = await server.ssrLoadModule(`/@fs${sharedLibDir}i18n.tsx`);
  ({ loginI18nResources } = loginI18nModule);
  ({ PriestessI18nProvider } = sharedI18nModule);
  ({ AccountServicesView } = servicesViewModule);
  const { groupServicesByAccess } = servicesViewModule;

  testGroupServicesByAccess({ groupServicesByAccess });
  testServiceGroupOrder();
  testUnavailableServiceCard();
  testRevokeActions();
  testServiceStatusLine();
  testServiceCountText();
  testLoadingAndRefresh();
  testErrorAndNotice();
  testLegacyStructureRemoved();

  console.log("account-services smoke passed");
} finally {
  await server.close();
}

// A. groupServicesByAccess 纯函数
function testGroupServicesByAccess({ groupServicesByAccess }) {
  const grouped = groupServicesByAccess([
    buildUnavailableService("Beta"),
    buildAvailableService("Alpha"),
  ]);
  assert.equal(grouped.available.length, 1, "1. 可用组只收 access=available");
  assert.equal(grouped.unavailable.length, 1, "1. 未开放组只收其余条目");

  const sorted = groupServicesByAccess([
    buildAvailableService("Zeta"),
    buildAvailableService("Alpha"),
  ]);
  assert.deepEqual(sorted.available.map((service) => service.name), ["Alpha", "Zeta"], "2. 组内按服务名升序");

  const unknownAccess = groupServicesByAccess([
    buildService({ access: "maybe", appId: "app-maybe", name: "Maybe" }),
  ]);
  assert.equal(unknownAccess.available.length, 0, "3. 未知 access 不进可用组");
  assert.deepEqual(unknownAccess.unavailable.map((service) => service.name), ["Maybe"], "3. 未知 access 落进未开放组");

  const input = [buildUnavailableService("Beta"), buildAvailableService("Alpha")];
  const before = input.map((service) => `${service.appId}:${service.access}`);
  groupServicesByAccess(input);
  assert.deepEqual(input.map((service) => `${service.appId}:${service.access}`), before, "4. 不改动传入数组");
  assert.equal(input.length, 2, "4. 传入数组长度不变");
}

// B. 分组顺序与结构
function testServiceGroupOrder() {
  const groupedMarkup = renderView({
    services: [buildAvailableService("Alpha", { activeSession: true }), buildUnavailableService("Beta")],
  });
  const availableIndex = groupedMarkup.indexOf("account-service-group--available");
  const unavailableIndex = groupedMarkup.indexOf("account-service-group--unavailable");
  assert.ok(availableIndex >= 0, "5. 渲染可用组");
  assert.ok(unavailableIndex >= 0, "5. 渲染未开放组");
  assert.ok(availableIndex < unavailableIndex, "5. 可用组必须排在未开放组之前");
  assert.ok(groupedMarkup.includes("可用"), "6. 含可用组标题");
  assert.ok(groupedMarkup.includes("暂未开放"), "6. 含暂未开放组标题");

  const availableOnlyMarkup = renderView({ services: [buildAvailableService("Alpha")] });
  assert.ok(!availableOnlyMarkup.includes("account-service-group--unavailable"), "7. 未开放组为空时整组不渲染");
  assert.ok(!availableOnlyMarkup.includes("暂未开放"), "7. 未开放组为空时不出现组标题");

  const unavailableOnlyMarkup = renderView({ services: [buildUnavailableService("Beta")] });
  assert.match(unavailableOnlyMarkup, /account-empty-state/, "8. 可用组为空时渲染空态");
  assert.ok(unavailableOnlyMarkup.includes("当前没有向你开放的服务"), "8. 空态文案正确");
  assert.match(unavailableOnlyMarkup, /account-service-group--unavailable/, "8. 可用组为空时未开放组仍渲染");
}

// C. 未开放项无操作、不泄露原因（D13）
function testUnavailableServiceCard() {
  const markup = renderView({
    services: [buildUnavailableService("Locked App", { appId: "app-locked" })],
  });

  assert.ok(!markup.includes("解除授权"), "9. 未开放项没有解除授权入口");
  assert.equal(countClass(markup, "account-service-card__actions"), 0, "10. 未开放项不渲染操作区");
  assert.match(markup, /account-service-card--unavailable/, "11. 未开放项带未开放样式");
  assert.ok(markup.includes("未开放"), "11. 未开放项带未开放状态胶囊");
  // 本任务书 §1c 要求渲染的 account-service-group 系列类名自带 "group" 字面量，
  // 所以先剥掉 class 值，只对用户可见文案与其余属性做判定原因检查。
  assert.doesNotMatch(
    readCopyWithoutClassNames(markup),
    /原因|reason|group|规则|未获授权|被禁用/i,
    "12. 未开放项不出现任何判定原因字样",
  );
  assert.ok(!markup.includes("app-locked"), "13. 卡片不把内部 appId 摆给用户看");
}

// D. 解除授权只在有活跃会话时出现
function testRevokeActions() {
  const idleService = buildAvailableService("Alpha", { activeSession: false });
  const activeService = buildAvailableService("Alpha", { activeSession: true, lastUsedAt: new Date().toISOString() });

  const idleMarkup = renderView({ services: [idleService] });
  assert.ok(!idleMarkup.includes("解除授权"), "14. 没有活跃会话时不出现解除授权");

  const activeMarkup = renderView({ services: [activeService] });
  assert.ok(activeMarkup.includes("解除授权"), "15. 有活跃会话时出现解除授权");

  const confirmingMarkup = renderView({
    confirmingAppId: activeService.appId,
    services: [activeService],
  });
  assert.equal(countClass(confirmingMarkup, "account-service-card__confirm"), 1, "16. 确认态渲染内联二次确认");
  assert.ok(confirmingMarkup.includes("确认解除"), "16. 确认态含确认按钮");
  assert.ok(confirmingMarkup.includes("取消"), "16. 确认态含取消按钮");
  assert.ok(!confirmingMarkup.includes("解除授权"), "16. 确认态不再显示初始按钮");

  const revokingMarkup = renderView({
    revokingAppId: activeService.appId,
    services: [activeService],
  });
  assert.ok(revokingMarkup.includes("正在解除"), "17. 提交中显示正在解除");
  assert.equal(countClass(revokingMarkup, "account-service-card__confirm"), 0, "17. 提交中不再显示确认按钮");
}

// E. 状态行
function testServiceStatusLine() {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();

  const usedMarkup = renderView({
    services: [buildAvailableService("Alpha", { activeSession: true, lastUsedAt: twoHoursAgo })],
  });
  assert.ok(usedMarkup.includes("已登录 · 2小时前使用"), "18. 活跃会话显示相对使用时间");

  const idleMarkup = renderView({
    services: [buildAvailableService("Alpha", { activeSession: false })],
  });
  assert.ok(idleMarkup.includes("未登录"), "19. 无活跃会话显示未登录");

  const fallbackMarkup = renderView({
    services: [buildAvailableService("Alpha", { activeSession: true, lastAuthorizedAt: twoHoursAgo })],
  });
  assert.ok(fallbackMarkup.includes("使用"), "20. lastUsedAt 为空时仍渲染使用时间");
  assert.ok(!fallbackMarkup.includes("未提供"), "20. 状态行不回落成未提供");
}

// F. 计数文本
function testServiceCountText() {
  const fiveServicesMarkup = renderView({
    services: [
      buildAvailableService("Alpha"),
      buildAvailableService("Beta"),
      buildUnavailableService("Gamma"),
      buildUnavailableService("Delta"),
      buildUnavailableService("Epsilon"),
    ],
  });
  assert.ok(fiveServicesMarkup.includes("可用 2 / 共 5"), "21. 计数显示可用数与总数");

  const singleUnavailableMarkup = renderView({ services: [buildUnavailableService("Gamma")] });
  assert.ok(singleUnavailableMarkup.includes("可用 0 / 共 1"), "22. 零可用时计数仍完整");
}

// G. 加载与刷新
function testLoadingAndRefresh() {
  const initialLoadingMarkup = renderView({ isInitialLoading: true, services: [] });
  assert.match(initialLoadingMarkup, /account-skeleton-list--service/, "23. 首次加载渲染服务骨架");
  assert.ok(!initialLoadingMarkup.includes("account-service-groups"), "23. 首次加载不渲染分组");

  const refreshingMarkup = renderView({
    isRefreshing: true,
    services: [buildAvailableService("Alpha"), buildUnavailableService("Beta")],
  });
  assert.ok(refreshingMarkup.includes("account-service-groups"), "24. 刷新时列表保持挂载");
  assert.match(refreshingMarkup, /data-active="true"/, "24. 刷新时指示器进入 active");
  assert.ok(!refreshingMarkup.includes("account-skeleton-list"), "24. 刷新时不再显示骨架");

  const idleMarkup = renderView({
    isRefreshing: false,
    services: [buildAvailableService("Alpha")],
  });
  assert.match(idleMarkup, /data-active="false"/, "25. 非刷新态指示器不 active");
}

// H. 错误态与成功提示
function testErrorAndNotice() {
  const errorMarkup = renderView({ error: "boom" });
  assert.match(errorMarkup, /account-inline-alert--error/, "26. 错误走 error 内联条");
  assert.ok(errorMarkup.includes("boom"), "26. 错误原文照实显示");
  assert.ok(errorMarkup.includes("重试"), "26. 错误提供重试入口");

  const noticeMarkup = renderView({ notice: "已解除 X 的授权" });
  assert.match(noticeMarkup, /account-inline-alert--info/, "27. 成功提示走 info 内联条");
  assert.ok(noticeMarkup.includes("已解除 X 的授权"), "27. 成功提示文案照实显示");

  const bothMarkup = renderView({ error: "boom", notice: "n" });
  assert.match(bothMarkup, /account-inline-alert--error/, "28. 错误与提示同时存在时显示错误");
  assert.doesNotMatch(bothMarkup, /account-inline-alert--info/, "28. 错误优先，不叠两条内联条");
}

// I. 旧结构彻底消失 / 无障碍
function testLegacyStructureRemoved() {
  const markup = renderView({
    services: [
      buildAvailableService("Alpha", { activeSession: true, lastUsedAt: new Date().toISOString() }),
      buildUnavailableService("Beta"),
    ],
  });

  assert.doesNotMatch(markup, /account-service-session-/, "29. 旧会话卡片类名已消失");
  assert.doesNotMatch(markup, /account-motion-surface/, "30. 无定义的动效噪音类名已消失");
  assert.doesNotMatch(markup, /服务已停用|正在登录|最长有效到|最近授权|活跃会话/, "31. 旧的四项等权事实栏已消失");
  assert.doesNotMatch(markup, /account-service-session-title/, "32. 内层不再重复 aria-labelledby");
}

function readCopyWithoutClassNames(markup) {
  return markup.replace(/class="[^"]*"/g, "");
}

function renderView(overrides = {}) {
  return renderWithI18n(React.createElement(AccountServicesView, {
    confirmingAppId: "",
    error: "",
    isInitialLoading: false,
    isRefreshing: false,
    notice: "",
    onCancelRevoke() {},
    onConfirmRevoke() {},
    onRefresh() {},
    onRequestRevoke() {},
    revokingAppId: "",
    services: [],
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

function buildService(overrides) {
  return {
    access: "available",
    activeSession: false,
    appId: "app-default",
    lastAuthorizedAt: "",
    lastUsedAt: "",
    name: "Default",
    raw: null,
    ...overrides,
  };
}

function buildAvailableService(name, overrides = {}) {
  return buildService({ access: "available", appId: `app-${name.toLowerCase()}`, name, ...overrides });
}

function buildUnavailableService(name, overrides = {}) {
  return buildService({ access: "unavailable", appId: `app-${name.toLowerCase()}`, name, ...overrides });
}
