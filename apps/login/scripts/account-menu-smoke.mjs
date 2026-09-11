import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

let AccountMenuDialog = null;
let PriestessI18nProvider = React.Fragment;
let loginI18nResources = undefined;

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

try {
  const menuModule = await server.ssrLoadModule("/src/components/AccountMenuDialog.tsx");
  const loginI18nModule = await server.ssrLoadModule("/src/i18n/index.ts");
  // 共享包路径从脚本位置推导，必须走 /@fs 前缀，否则会加载出第二份 React。
  const sharedLibDir = new URL("../../../packages/priestess-shared/src/lib/", import.meta.url).pathname;
  const sharedI18nModule = await server.ssrLoadModule(`/@fs${sharedLibDir}i18n.tsx`);
  ({ loginI18nResources } = loginI18nModule);
  ({ PriestessI18nProvider } = sharedI18nModule);
  ({ AccountMenuDialog } = menuModule);

  testClosedState();
  testOpenStructure();
  testMenuItems();
  testLoggingOutState();
  testAvatar();
  testMenuStructure();

  console.log("account-menu smoke passed");
} finally {
  await server.close();
}

// A. 关闭态不渲染任何弹窗结构
function testClosedState() {
  const markup = renderDialog({ open: false });
  assert.equal(markup.includes("account-dialog-backdrop"), false, "1. 关闭态不渲染遮罩");
  assert.equal(markup.includes("account-menu-title"), false, "1. 关闭态不渲染菜单标题");
}

// B. 打开态渲染卡片与账号名
function testOpenStructure() {
  const markup = renderDialog({ open: true });
  assert.ok(markup.includes("account-dialog-backdrop"), "2. 打开态渲染遮罩");
  assert.ok(markup.includes('role="dialog"'), "2. 打开态渲染 dialog 语义");
  assert.ok(markup.includes("account-menu-title"), "2. 打开态渲染菜单标题 id");
  assert.ok(markup.includes("Priestess Tester"), "3. 打开态渲染传入的显示名称");
}

// C. 菜单项文案与顺序
function testMenuItems() {
  const markup = renderDialog({ open: true });
  assert.ok(markup.includes("切换账号"), "4. 含切换账号");
  assert.ok(markup.includes("退出"), "4. 含退出");
  const switchIndex = markup.indexOf("切换账号");
  const signOutIndex = markup.indexOf("退出");
  assert.ok(switchIndex >= 0, "5. 切换账号必须存在于产物中");
  assert.ok(signOutIndex >= 0, "5. 退出必须存在于产物中");
  assert.ok(switchIndex < signOutIndex, "5. 切换账号必须排在退出之前");
}

// D. 退出进行中禁用
function testLoggingOutState() {
  const loggingOutMarkup = renderDialog({ isLoggingOut: true, open: true });
  assert.match(
    loggingOutMarkup,
    /account-menu-item--danger"[^>]*\bdisabled\b[^>]*>[\s\S]*?退出中/,
    "6. 退出中时菜单项显示退出中且被禁用",
  );
  assert.match(
    loggingOutMarkup,
    /account-menu-item"[^>]*\bdisabled\b/,
    "6. 退出中时切换账号也被禁用",
  );
}

// E. 头像
function testAvatar() {
  const markup = renderDialog({ avatarUrl: "https://cdn.example.test/avatar-42.png", open: true });
  assert.ok(markup.includes("account-menu-dialog__avatar"), "7. 打开态渲染头像");
  assert.ok(markup.includes("https://cdn.example.test/avatar-42.png"), "7. 头像使用传入地址");
}

// F. 菜单结构（页脚是否复活由 account-handoff 浏览器用例在真实页面上守）
function testMenuStructure() {
  const openMarkup = renderDialog({ open: true });
  assert.equal(countClass(openMarkup, "account-menu-item"), 2, "8. 菜单恰好两项");
  assert.ok(openMarkup.includes("account-menu-item--danger"), "8. 退出项带危险修饰类");
}

function renderDialog(overrides = {}) {
  return renderWithI18n(React.createElement(AccountMenuDialog, {
    avatarUrl: "https://cdn.example.test/default-avatar.png",
    displayName: "Priestess Tester",
    isLoggingOut: false,
    onAvatarError() {},
    onClose() {},
    onSignOut() {},
    onSwitchAccount() {},
    open: false,
    ...overrides,
  }));
}

function renderWithI18n(element) {
  return renderToStaticMarkup(React.createElement(PriestessI18nProvider, {
    resources: loginI18nResources,
  }, element));
}

/**
 * 按 class 属性取值里的完整类名计数：菜单项里「切换账号」是纯类名、「退出」带 --danger 修饰，
 * 直接 split('class="account-menu-item"') 会漏掉带修饰的那个，数不出「恰好两项」。
 */
function countClass(markup, className) {
  const classValues = markup.match(/class="[^"]*"/g) ?? [];
  return classValues.filter((value) => value.slice(7, -1).split(/\s+/).includes(className)).length;
}
