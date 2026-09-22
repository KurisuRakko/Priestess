import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

const QR_SECURITY_REASONS = ["same_ip", "local_network", "same_region", "unknown_context", "different_region"];

let PriestessI18nProvider = React.Fragment;
let loginI18nResources = undefined;
let QrSecurityNotice = null;
let QrSecurityOverlay = null;
let getQrSecurityReasonKey = null;

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

try {
  const noticeModule = await server.ssrLoadModule("/src/components/QrSecurityNotice.tsx");
  const loginI18nModule = await server.ssrLoadModule("/src/i18n/index.ts");
  // 共享包路径从脚本位置推导，必须走 /@fs 前缀，否则会加载出第二份 React。
  const sharedLibDir = new URL("../../../packages/priestess-shared/src/lib/", import.meta.url).pathname;
  const sharedI18nModule = await server.ssrLoadModule(`/@fs${sharedLibDir}i18n.tsx`);
  ({ loginI18nResources } = loginI18nModule);
  ({ PriestessI18nProvider } = sharedI18nModule);
  ({ QrSecurityNotice, QrSecurityOverlay, getQrSecurityReasonKey } = noticeModule);

  testKnownReasonKeys();
  testUnknownAndMissingReasons();
  testCopyDistinguishesRisk();
  testNoticeMarkupIsNeverEmpty();
  testOverlayRendersOriginAndReason();
  testOverlayDegradesWithoutOriginOrReason();
  testEnglishTranslations();

  console.log("qr-login-security-notice smoke passed");
} finally {
  await server.close();
}

// A. 后端已声明的风险原因必须各有独立分支
function testKnownReasonKeys() {
  const keys = QR_SECURITY_REASONS.map((reason) => getQrSecurityReasonKey(reason));
  for (const reason of QR_SECURITY_REASONS) {
    assert.ok(getQrSecurityReasonKey(reason).length > 0, `1. ${reason} 必须有非空文案`);
  }
  assert.equal(new Set(keys).size, QR_SECURITY_REASONS.length, "1. 已知风险原因之间文案不能重复");
  assert.equal(
    getQrSecurityReasonKey("different_region"),
    "电脑端和手机端位于不同地区，这是一次异地登录尝试。如果不是你本人操作，请立即取消。",
    "1. different_region 命中异地文案",
  );
  assert.equal(getQrSecurityReasonKey("same_ip"), "电脑端和手机端来自同一个公网 IP。", "1. same_ip 命中同 IP 文案");
  assert.equal(getQrSecurityReasonKey("local_network"), "电脑端和手机端处于同一本地网络。", "1. local_network 命中本地网文案");
  assert.equal(getQrSecurityReasonKey("same_region"), "电脑端和手机端位于同一区域。", "1. same_region 命中同区域文案");
}

// B. 未知值与空值都要有兜底，不能渲染空段落
function testUnknownAndMissingReasons() {
  const fallbackKey = getQrSecurityReasonKey("quantum_anomaly");
  assert.equal(fallbackKey, "无法确认本次登录的风险情况。如果不是你本人操作，请立即取消。", "2. 未知取值走兜底文案");
  assert.ok(!QR_SECURITY_REASONS.map((reason) => getQrSecurityReasonKey(reason)).includes(fallbackKey), "2. 兜底文案不与已知原因重复");

  const emptyKey = getQrSecurityReasonKey("");
  assert.equal(emptyKey, "电脑端和手机端环境存在差异，请核对后再授权登录。", "2. 空值保留原有提示");
  assert.equal(getQrSecurityReasonKey("   "), emptyKey, "2. 纯空白按空值处理");
}

// C. 异地/未知必须点明异常并要求取消；同网/同区只陈述事实
function testCopyDistinguishesRisk() {
  const riskyKeys = ["different_region", "unknown_context"].map((reason) => getQrSecurityReasonKey(reason));
  for (const key of riskyKeys) {
    assert.match(key, /如果不是你本人操作，请立即取消/, "3. 高风险原因必须提示立即取消");
  }
  assert.match(getQrSecurityReasonKey("different_region"), /异地/, "3. 异地必须点明是异地登录");

  const neutralKeys = ["same_ip", "local_network", "same_region"].map((reason) => getQrSecurityReasonKey(reason));
  for (const key of neutralKeys) {
    assert.doesNotMatch(key, /取消/, "3. 同网/同区不制造恐慌，不带取消提示");
    assert.doesNotMatch(key, /危险|盗号|异常|risk|danger/i, "3. 同网/同区不做风险渲染");
  }
}

// D. 组件渲染出的段落文本与映射一致，且不为空
function testNoticeMarkupIsNeverEmpty() {
  for (const reason of [...QR_SECURITY_REASONS, "quantum_anomaly", ""]) {
    const markup = renderNotice(reason);
    assert.match(markup, /^<p>[\s\S]*<\/p>$/, `4. ${reason || "(空值)"} 渲染单个段落`);
    assert.ok(markup.includes(getQrSecurityReasonKey(reason)), `4. ${reason || "(空值)"} 渲染映射后的文案`);
    assert.doesNotMatch(markup, /<p><\/p>/, `4. ${reason || "(空值)"} 不能渲染空段落`);
  }
}

// E. 二次确认浮层同时暴露风险原因与授权目标
function testOverlayRendersOriginAndReason() {
  const markup = renderOverlay({
    origin: "https://example.com",
    reason: "different_region",
  });
  assert.match(markup, /role="dialog"/, "5. 渲染 dialog 语义");
  assert.ok(markup.includes("https://example.com"), "5. 渲染授权目标 origin");
  assert.ok(markup.includes(getQrSecurityReasonKey("different_region")), "5. 渲染异地风险文案");
  assert.ok(markup.includes("PC 位置"), "5. 保留 PC 位置行");
  assert.ok(markup.includes("手机位置"), "5. 保留手机位置行");
  assert.ok(markup.includes("确认登录"), "5. 保留最终确认按钮");
}

// F. 字段缺失时不出现空行或占位符
function testOverlayDegradesWithoutOriginOrReason() {
  const withoutOrigin = renderOverlay({ origin: "", reason: "same_ip" });
  assert.equal(withoutOrigin.includes("授权目标"), false, "6. origin 缺失时不渲染授权目标行");
  assert.equal(withoutOrigin.includes("{{origin}}"), false, "6. 不渲染未替换的占位符");
  assert.equal(withoutOrigin.includes("qr-mobile-overlay-origin"), false, "6. 不渲染空的 origin 容器");

  const withoutReason = renderOverlay({ origin: "https://example.com", reason: "" });
  assert.ok(withoutReason.includes("电脑端和手机端环境存在差异，请核对后再授权登录。"), "6. reason 缺失时保留原有提示");
  assert.equal(withoutReason.includes("{{"), false, "6. 不渲染未替换的插值占位符");
}

// G. 英文资源必须逐条补齐
function testEnglishTranslations() {
  const englishLogin = loginI18nResources["en-US"].login;
  const expectedEnglish = {
    "电脑端和手机端处于同一本地网络。": "The computer and phone are on the same local network.",
    "电脑端和手机端来自同一个公网 IP。": "The computer and phone share the same public IP address.",
    "电脑端和手机端位于不同地区，这是一次异地登录尝试。如果不是你本人操作，请立即取消。": "The computer and phone are in different regions, so this is an off-site sign-in attempt. If this was not you, cancel now.",
    "电脑端和手机端位于同一区域。": "The computer and phone are in the same region.",
    "无法确认电脑端和手机端的网络环境。如果不是你本人操作，请立即取消。": "The network environment of the computer and phone cannot be confirmed. If this was not you, cancel now.",
    "无法确认本次登录的风险情况。如果不是你本人操作，请立即取消。": "The risk level of this sign-in cannot be confirmed. If this was not you, cancel now.",
    "授权目标：{{origin}}": "Authorizing: {{origin}}",
  };
  for (const [zhKey, enValue] of Object.entries(expectedEnglish)) {
    assert.equal(englishLogin[zhKey], enValue, `7. en-US 缺少或写错 ${zhKey}`);
  }
  // 中文文案本身即 key，中文界面必须原样渲染出来。
  assert.ok(
    renderNotice("different_region").includes("如果不是你本人操作，请立即取消"),
    "8. 中文界面渲染中文文案",
  );
}

function renderNotice(reason) {
  return renderWithI18n(React.createElement(QrSecurityNotice, { reason }));
}

function renderOverlay({ origin, reason }) {
  return renderWithI18n(React.createElement(QrSecurityOverlay, {
    errorMessage: "",
    isSubmitting: false,
    onCancel() {},
    onFinalConfirm() {},
    origin,
    pcLocation: "US / SJC",
    phoneLocation: "CN / HKG",
    reason,
    warningCountdown: 0,
  }));
}

function renderWithI18n(element) {
  return renderToStaticMarkup(React.createElement(PriestessI18nProvider, {
    resources: loginI18nResources,
  }, element));
}
