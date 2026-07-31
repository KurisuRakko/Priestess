import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const MOBILE_VIEWPORT = { height: 844, width: 390 };
const SHORT_MOBILE_VIEWPORT = { height: 667, width: 375 };
const DESKTOP_VIEWPORT = { height: 800, width: 1280 };

let activeScenario = null;
let apiServer;
let browser;
let viteServer;

try {
  const api = await startMockApiServer();
  apiServer = api.server;
  process.env.VITE_PRIESTESS_API_BASE_URL = api.baseUrl;

  viteServer = await createViteServer({
    appType: "spa",
    logLevel: "silent",
    root: appRoot,
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await viteServer.listen();
  const viteAddress = viteServer.httpServer?.address();
  assert.ok(viteAddress && typeof viteAddress === "object", "vite server address missing");
  const appUrl = `http://127.0.0.1:${viteAddress.port}`;

  const { chromium } = await importPlaywright();
  browser = await launchBrowser(chromium);

  await testMobilePlainLoginReveal(browser, appUrl);
  await testMobileSecondaryAuthTransitions(browser, appUrl);
  await testHungAuthorizationFallsBack(browser, appUrl);
  await testViewportSwitchRestoresDesktopQr(browser, appUrl);
  await testDesktopRevealWaitsForAccountData(browser, appUrl);
  await testDesktopRevealWaitsForQrData(browser, appUrl);
  await testDesktopRevealFallsBackAfterTimeout(browser, appUrl);
  await testDesktopAccountSwitchMotion(browser, appUrl);
  await testDesktopPanelHeightClearsOnMobile(browser, appUrl);
  await testDesktopLoginKeepsQrLayout(browser, appUrl);

  console.log("mobile login reveal browser smoke passed");
} finally {
  if (browser) await browser.close();
  if (viteServer) await viteServer.close();
  if (apiServer) await closeServer(apiServer);
}

async function testMobilePlainLoginReveal(browserInstance, appUrl) {
  const scenario = createScenario({ sessionDelayMs: 700 });

  await withScenario(browserInstance, scenario, { viewport: MOBILE_VIEWPORT }, async(page) => {
    const resourceUrls = [];
    page.on("request", (request) => resourceUrls.push(request.url()));
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });

    const shell = page.locator(".app-shell");
    await shell.waitFor({ state: "attached" });
    assert.equal(await shell.getAttribute("data-mobile-login"), "true");
    assert.equal(await shell.getAttribute("data-mobile-reveal"), "waiting");
    assert.equal(await page.locator(".login-stage").count(), 0, "data pending should leave only the wallpaper shell");

    const mobileWallpaperStyle = await page.locator(".dwall-bg").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundImage: style.backgroundImage,
        backgroundPosition: style.backgroundPosition,
      };
    });
    assert.match(mobileWallpaperStyle.backgroundImage, /dwall-placeholder\.jpg|data:image\/jpeg/, "mobile should use the tiny wallpaper placeholder");
    assert.equal(mobileWallpaperStyle.backgroundPosition, "35% 50%", "mobile wallpaper should keep the character face centered");
    const desktopWallpaperRequests = resourceUrls.filter((url) => /dwall-(?:960|1600|2400).*\.jpg/.test(url));
    assert.deepEqual(desktopWallpaperRequests, [], "mobile must not request desktop wallpapers");

    await page.waitForSelector('.app-shell[data-mobile-reveal="ready"] .login-card', { timeout: 3000 });
    await page.waitForFunction(() => {
      const card = document.querySelector(".login-card");
      return card ? Math.abs(card.getBoundingClientRect().top) < 1 : false;
    }, { timeout: 2000 });

    const cardLayout = await page.locator(".login-card").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        height: rect.height,
        overflowY: style.overflowY,
        width: rect.width,
      };
    });
    assert.ok(Math.abs(cardLayout.width - MOBILE_VIEWPORT.width) < 1, "mobile card should span the viewport width");
    assert.ok(cardLayout.height >= MOBILE_VIEWPORT.height, "mobile card should fill 100svh");
    assert.equal(cardLayout.borderRadius, "0px");
    assert.equal(cardLayout.boxShadow, "none");
    assert.equal(cardLayout.overflowY, "auto");
    assert.ok(scenario.records.sessions > 0, "plain mobile login should check the local session");
    assert.equal(scenario.records.deviceSessions, 0, "mobile success layout must not request desktop session metadata");
    assert.equal(scenario.records.qrCreates, 0, "mobile must not create QR sessions");
    assert.equal(scenario.records.qrPolls, 0, "mobile must not poll QR sessions");
  });
}

async function testMobileSecondaryAuthTransitions(browserInstance, appUrl) {
  const scenario = createScenario();

  await withScenario(browserInstance, scenario, {
    reducedMotion: "no-preference",
    viewport: SHORT_MOBILE_VIEWPORT,
  }, async(page) => {
    await page.goto(buildAuthUrl(appUrl, "mobile-secondary-transitions"), { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.app-shell[data-mobile-reveal="ready"] [data-auth-mode-panel="login"]');

    const createAccountButton = page.getByRole("button", { name: "创建账号" });
    await createAccountButton.scrollIntoViewIfNeeded();
    assert.ok(await page.locator(".login-card").evaluate((element) => element.scrollTop > 0), "short mobile login should scroll before opening registration");
    await createAccountButton.click();
    await waitForExitingPanelStopsPointer(page, '[data-auth-mode-panel="login"]', "login");
    await page.waitForSelector('[data-auth-mode-panel="register"]');
    await page.locator('[data-auth-mode-panel="login"]').waitFor({ state: "detached", timeout: 1000 });
    assert.equal(await page.locator('[data-auth-mode-panel="register"]').getAttribute("data-auth-mode-motion-origin"), "right");
    assert.equal(await page.locator('[data-auth-mode-panel="register"]').getAttribute("data-mobile-motion"), "fade-through");
    assert.equal(
      await page.locator('[data-auth-mode-panel="register"]').evaluate((element) => getComputedStyle(element).filter),
      "none",
      "mobile registration transition must not blur",
    );
    assert.equal(await page.locator(".login-card").evaluate((element) => element.scrollTop), 0, "registration must enter from the top");
    await page.waitForTimeout(320);
    assert.equal(await page.locator("[data-auth-mode-panel]").count(), 1);

    const registrationLayout = await page.evaluate(() => {
      const authViewport = document.querySelector(".auth-card-viewport");
      const registerViewport = document.querySelector(".register-step-viewport");
      if (!(authViewport instanceof HTMLElement) || !(registerViewport instanceof HTMLElement)) return null;
      return {
        authHeight: authViewport.style.height,
        authOverflow: getComputedStyle(authViewport).overflowY,
        registerHeight: registerViewport.style.height,
        registerOverflow: getComputedStyle(registerViewport).overflowY,
      };
    });
    assert.deepEqual(registrationLayout, {
      authHeight: "auto",
      authOverflow: "visible",
      registerHeight: "auto",
      registerOverflow: "visible",
    });

    await page.locator("input[autocomplete='email']").fill("motion@example.com");
    await page.locator("#register-terms-consent").check();
    const identitySubmit = page.locator(".login-form .primary-button[type='submit']");
    await identitySubmit.scrollIntoViewIfNeeded();
    await identitySubmit.click();
    await waitForExitingPanelStopsPointer(page, '[data-register-step-panel="identity"]', "registration identity");
    await page.waitForSelector('[data-register-step-panel="invitation"]');
    await page.locator('[data-register-step-panel="identity"]').waitFor({ state: "detached", timeout: 1000 });
    assert.equal(
      await page.locator('[data-register-step-panel="invitation"]').getAttribute("data-register-step-motion-origin"),
      "right",
    );
    assert.equal(
      await page.locator('[data-register-step-panel="invitation"]').getAttribute("data-mobile-motion"),
      "fade-through",
    );
    assert.equal(
      await page.locator('[data-register-step-panel="invitation"]').evaluate((element) => getComputedStyle(element).filter),
      "none",
      "mobile registration steps must not blur",
    );
    assert.equal(await page.locator(".login-card").evaluate((element) => element.scrollTop), 0, "each registration step must enter from the top");

    await page.getByRole("button", { name: "上一步" }).click();
    await waitForExitingPanelStopsPointer(page, '[data-register-step-panel="invitation"]', "registration invitation");
    await page.waitForSelector('[data-register-step-panel="identity"]');
    await page.locator('[data-register-step-panel="invitation"]').waitFor({ state: "detached", timeout: 1000 });
    assert.equal(
      await page.locator('[data-register-step-panel="identity"]').getAttribute("data-register-step-motion-origin"),
      "left",
    );
    await page.waitForTimeout(320);

    await page.getByRole("button", { name: "返回登录" }).click();
    await waitForExitingPanelStopsPointer(page, '[data-auth-mode-panel="register"]', "register");
    await page.waitForSelector('[data-auth-mode-panel="login"]');
    await page.locator('[data-auth-mode-panel="register"]').waitFor({ state: "detached", timeout: 1000 });
    assert.equal(await page.locator('[data-auth-mode-panel="login"]').getAttribute("data-auth-mode-motion-origin"), "left");
    await page.waitForTimeout(320);

    await page.getByRole("button", { name: "忘记密码？" }).click();
    await waitForExitingPanelStopsPointer(page, '[data-auth-mode-panel="login"]', "login");
    await page.waitForSelector('[data-auth-mode-panel="forgot-password"]');
    await page.locator('[data-auth-mode-panel="login"]').waitFor({ state: "detached", timeout: 1000 });
    assert.equal(await page.locator('[data-auth-mode-panel="forgot-password"]').getAttribute("data-auth-mode-motion-origin"), "right");
    assert.equal(await page.locator('[data-auth-mode-panel="forgot-password"]').getAttribute("data-mobile-motion"), "fade-through");
    assert.equal(
      await page.locator('[data-auth-mode-panel="forgot-password"]').evaluate((element) => getComputedStyle(element).filter),
      "none",
      "mobile password recovery transition must not blur",
    );

    await page.getByRole("button", { name: "返回登录" }).click();
    await waitForExitingPanelStopsPointer(page, '[data-auth-mode-panel="forgot-password"]', "forgot password");
    await page.waitForSelector('[data-auth-mode-panel="login"]');
    await page.locator('[data-auth-mode-panel="forgot-password"]').waitFor({ state: "detached", timeout: 1000 });
    assert.equal(await page.locator('[data-auth-mode-panel="login"]').getAttribute("data-auth-mode-motion-origin"), "left");
  });
}

async function testHungAuthorizationFallsBack(browserInstance, appUrl) {
  const scenario = createScenario({ hangAccountChoices: true });

  await withScenario(browserInstance, scenario, {
    reducedMotion: "reduce",
    viewport: MOBILE_VIEWPORT,
  }, async(page) => {
    await page.goto(buildAuthUrl(appUrl, "hung-mobile"), { waitUntil: "domcontentloaded" });
    const shell = page.locator(".app-shell");
    await shell.waitFor({ state: "attached" });
    assert.equal(await shell.getAttribute("data-mobile-reveal"), "waiting");

    await page.waitForSelector('.app-shell[data-mobile-reveal-timeout="true"][data-mobile-reveal="ready"]', { timeout: 6500 });
    await page.locator(".account-picker__row--skeleton").first().waitFor({ state: "visible" });
    assert.equal(await page.locator(".account-picker").getAttribute("aria-busy"), "true");
    assert.ok(scenario.records.accountChoices > 0);
    assert.equal(scenario.records.qrCreates, 0);
    assert.equal(scenario.records.qrPolls, 0);
  });
}

async function testViewportSwitchRestoresDesktopQr(browserInstance, appUrl) {
  const scenario = createScenario();

  await withScenario(browserInstance, scenario, {
    reducedMotion: "reduce",
    viewport: MOBILE_VIEWPORT,
  }, async(page) => {
    await page.goto(buildAuthUrl(appUrl, "viewport-switch"), { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.app-shell[data-mobile-reveal="ready"] .login-form');
    assert.equal(scenario.records.qrCreates, 0);

    await page.setViewportSize({ height: 800, width: 1024 });
    await page.waitForSelector('.app-shell[data-mobile-login="false"]');
    await waitFor(() => scenario.records.qrCreates > 0, 2500, "desktop switch should create a QR session");

    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.waitForSelector('.app-shell[data-mobile-login="true"][data-mobile-reveal="ready"]');
    assert.equal(await page.locator(".login-card").count(), 1, "desktop-to-mobile must not replay the wallpaper-only stage");
  });
}

async function testDesktopRevealWaitsForAccountData(browserInstance, appUrl) {
  const scenario = createScenario({
    browserAccountDelayMs: 700,
    browserAccountMode: "single",
  });

  await withScenario(browserInstance, scenario, {
    reducedMotion: "no-preference",
    viewport: DESKTOP_VIEWPORT,
  }, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    const shell = page.locator(".app-shell");
    await shell.waitFor({ state: "attached" });
    assert.equal(await shell.getAttribute("data-desktop-reveal"), "waiting");
    assert.equal(await page.locator(".login-stage").count(), 0, "desktop must keep the card hidden while browser accounts are loading");

    await page.waitForSelector('.app-shell[data-desktop-reveal="ready"] [data-auth-account-panel="account-picker"]', { timeout: 2500 });
    await page.waitForSelector('[data-login-card-entry="ready"]');
    assert.ok(scenario.records.browserAccounts >= 1);
  });
}

async function testDesktopRevealWaitsForQrData(browserInstance, appUrl) {
  const scenario = createScenario({ qrCreateDelayMs: 700 });

  await withScenario(browserInstance, scenario, {
    reducedMotion: "no-preference",
    viewport: DESKTOP_VIEWPORT,
  }, async(page) => {
    await page.goto(buildAuthUrl(appUrl, "desktop-qr-readiness"), { waitUntil: "domcontentloaded" });
    const shell = page.locator(".app-shell");
    await shell.waitFor({ state: "attached" });
    assert.equal(await shell.getAttribute("data-desktop-reveal"), "waiting");
    assert.equal(await page.locator(".login-stage").count(), 0, "desktop must not reveal an empty QR drawer");

    await page.waitForSelector('.app-shell[data-desktop-reveal="ready"] .qr-frame__code', { timeout: 2500 });
    await page.waitForSelector('[data-login-card-entry="ready"]');
    assert.ok(scenario.records.qrCreates >= 1);
  });
}

async function testDesktopRevealFallsBackAfterTimeout(browserInstance, appUrl) {
  const scenario = createScenario({ hangAccountChoices: true });

  await withScenario(browserInstance, scenario, {
    reducedMotion: "reduce",
    viewport: DESKTOP_VIEWPORT,
  }, async(page) => {
    await page.goto(buildAuthUrl(appUrl, "desktop-reveal-timeout"), { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.app-shell[data-desktop-reveal="waiting"]');
    assert.equal(await page.locator(".login-stage").count(), 0);

    await page.waitForSelector('.app-shell[data-desktop-reveal-timeout="true"][data-desktop-reveal="ready"]', { timeout: 6500 });
    await page.locator(".account-picker__row--skeleton").first().waitFor({ state: "visible" });
    assert.ok(scenario.records.accountChoices > 0);
  });
}

async function testDesktopAccountSwitchMotion(browserInstance, appUrl) {
  const scenario = createScenario({ browserAccountMode: "single" });

  await withScenario(browserInstance, scenario, {
    reducedMotion: "no-preference",
    viewport: DESKTOP_VIEWPORT,
  }, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-auth-account-panel="account-picker"]');
    await page.waitForSelector('[data-login-card-entry="ready"]');
    assert.equal(await page.locator('[data-auth-account-panel="account-picker"]').getAttribute("data-desktop-motion"), "shared-axis");

    await startDesktopMotionProbe(page, '[data-auth-account-panel]', "account-forward");
    await page.locator(".account-picker__other").click();
    await waitForExitingPanelStopsPointer(page, '[data-auth-account-panel="account-picker"]', "desktop account picker");
    await page.waitForSelector('[data-auth-account-panel="login-form"]');
    assert.equal(await page.locator('[data-auth-account-panel="login-form"]').getAttribute("data-desktop-motion"), "shared-axis");
    assert.equal(await page.locator('[data-auth-account-panel="login-form"]').getAttribute("data-auth-account-motion-origin"), "right");
    await page.locator('[data-auth-account-panel="account-picker"]').waitFor({ state: "detached", timeout: 1000 });
    await waitForPanelSettled(page, '[data-auth-account-panel="login-form"]');
    await assertElementInsideViewport(
      page,
      ".login-card__back-button",
      ".auth-card-viewport",
      "desktop back-to-account-picker button",
    );
    const forwardMotion = await finishDesktopMotionProbe(page, "account-forward");
    assertDesktopCinematicMotion(forwardMotion, "desktop account picker forward");
    assert.equal(await page.locator(".auth-card-viewport").getAttribute("data-desktop-height-motion"), "tween");

    await startDesktopMotionProbe(page, '[data-auth-account-panel]', "account-back");
    await page.getByRole("button", { name: "返回账号选择" }).click();
    await waitForExitingPanelStopsPointer(page, '[data-auth-account-panel="login-form"]', "desktop login form");
    await page.waitForSelector('[data-auth-account-panel="account-picker"]');
    await page.locator('[data-auth-account-panel="login-form"]').waitFor({ state: "detached", timeout: 1000 });
    await waitForPanelSettled(page, '[data-auth-account-panel="account-picker"]');
    const backwardMotion = await finishDesktopMotionProbe(page, "account-back");
    assertDesktopCinematicMotion(backwardMotion, "desktop account picker return");
    assert.equal(await page.locator('[data-auth-account-panel="account-picker"]').getAttribute("data-auth-account-motion-origin"), "left");
  });
}

async function testDesktopLoginKeepsQrLayout(browserInstance, appUrl) {
  const scenario = createScenario();

  await withScenario(browserInstance, scenario, {
    reducedMotion: "no-preference",
    viewport: DESKTOP_VIEWPORT,
  }, async(page) => {
    await page.goto(buildAuthUrl(appUrl, "desktop"), { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.app-shell[data-mobile-login="false"] .login-card');
    await page.waitForSelector('[data-login-card-entry="ready"]');
    await waitFor(() => scenario.records.qrCreates > 0, 2500, "desktop should create a QR session");
    await page.locator(".qr-panel").waitFor({ state: "visible" });
    await waitForPanelSettled(page, ".qr-drawer-surface");
    assert.equal(await page.locator(".auth-grid").getAttribute("data-desktop-layout-motion"), "coordinated");
    assert.equal(await page.locator(".login-card-shell").getAttribute("data-desktop-entry-travel"), "large");
    assert.equal(await page.locator(".qr-drawer-surface").getAttribute("data-desktop-qr-motion"), "smooth");
    assert.equal(await page.locator(".qr-drawer-surface").getAttribute("data-desktop-qr-travel"), "large");
    assert.ok(
      (await page.locator(".auth-grid").evaluate((element) => getComputedStyle(element).transitionDuration)).includes("0.68s"),
      "desktop layout transitions must preserve the coordinated 680ms loading window",
    );

    const cardLayout = await page.locator(".login-card").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        height: rect.height,
        width: rect.width,
      };
    });
    assert.ok(cardLayout.width < DESKTOP_VIEWPORT.width);
    assert.ok(cardLayout.height < DESKTOP_VIEWPORT.height);
    assert.notEqual(cardLayout.borderRadius, "0px");
    assert.notEqual(cardLayout.boxShadow, "none");
  });
}

async function testDesktopPanelHeightClearsOnMobile(browserInstance, appUrl) {
  const scenario = createScenario();

  await withScenario(browserInstance, scenario, {
    reducedMotion: "no-preference",
    viewport: { height: 800, width: 1024 },
  }, async(page) => {
    await page.goto(buildAuthUrl(appUrl, "desktop-panel-height"), { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.app-shell[data-mobile-login="false"] .login-card');
    await page.waitForSelector('[data-login-card-entry="ready"]');
    await page.waitForFunction(() => {
      const viewport = document.querySelector(".auth-card-viewport");
      return viewport instanceof HTMLElement && viewport.style.height.endsWith("px");
    }, { timeout: 3000 });
    await page.locator(".qr-panel").waitFor({ state: "visible", timeout: 3000 });
    await waitForPanelSettled(page, ".qr-drawer-surface");
    assert.equal(await page.locator(".auth-card-viewport").getAttribute("data-desktop-height-motion"), "tween");
    assert.equal(await page.locator('[data-auth-mode-panel="login"]').getAttribute("data-desktop-motion"), "shared-axis");

    const outgoingLogin = page.locator('[data-auth-mode-panel="login"]');
    await startDesktopMotionProbe(page, '[data-auth-mode-panel]', "auth-register");
    await page.getByRole("button", { name: "创建账号" }).click();
    await page.waitForTimeout(320);
    assert.equal(await page.locator('[data-auth-mode-panel="login"]').count(), 1, "desktop must keep login content while the QR drawer exits");
    assert.equal(await page.locator('[data-auth-mode-panel="register"]').count(), 0, "registration content must wait for the QR drawer");
    await waitForExitingPanelStopsPointer(page, '[data-auth-mode-panel="login"]', "desktop login");
    await page.waitForSelector('[data-auth-mode-panel="register"]');
    assert.equal(await page.locator('[data-auth-mode-panel="register"]').getAttribute("data-desktop-motion"), "shared-axis");
    assert.equal(await page.locator('[data-auth-mode-panel="register"]').getAttribute("data-auth-mode-motion-origin"), "right");
    await outgoingLogin.waitFor({ state: "detached", timeout: 1000 });
    await waitForPanelSettled(page, '[data-auth-mode-panel="register"]');
    const authModeMotion = await finishDesktopMotionProbe(page, "auth-register");
    assertDesktopCinematicMotion(authModeMotion, "desktop login to registration");
    await page.locator("input[autocomplete='email']").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll(".auth-card-content").length === 1, { timeout: 2000 });
    await page.waitForFunction(() => {
      const viewport = document.querySelector(".auth-card-viewport");
      return viewport instanceof HTMLElement && viewport.style.height.endsWith("px");
    }, { timeout: 2000 });

    await page.waitForFunction(() => {
      const input = document.querySelector("input[autocomplete='email']");
      return input instanceof HTMLInputElement && !input.disabled;
    }, { timeout: 1500 });
    await page.locator("input[autocomplete='email']").fill("desktop-motion@example.com");
    await page.locator("#register-terms-consent").check();
    await startDesktopMotionProbe(page, '[data-register-step-panel]', "register-step-forward");
    await page.locator(".login-form .primary-button[type='submit']").click();
    await waitForExitingPanelStopsPointer(page, '[data-register-step-panel="identity"]', "desktop registration identity");
    await page.waitForSelector('[data-register-step-panel="invitation"]');
    assert.equal(await page.locator('[data-register-step-panel="invitation"]').getAttribute("data-desktop-motion"), "shared-axis");
    assert.equal(await page.locator('[data-register-step-panel="invitation"]').getAttribute("data-register-step-motion-origin"), "right");
    await page.locator('[data-register-step-panel="identity"]').waitFor({ state: "detached", timeout: 1000 });
    await waitForPanelSettled(page, '[data-register-step-panel="invitation"]');
    const registerStepMotion = await finishDesktopMotionProbe(page, "register-step-forward");
    assertDesktopCinematicMotion(registerStepMotion, "desktop registration step");

    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.waitForSelector('.app-shell[data-mobile-login="true"][data-mobile-reveal="ready"]');
    await page.waitForFunction(() => {
      const viewport = document.querySelector(".auth-card-viewport");
      return viewport instanceof HTMLElement && viewport.style.height === "auto";
    }, { timeout: 2000 });
    await page.waitForFunction(() => document.querySelectorAll(".auth-card-content").length === 1, { timeout: 2000 });

    const mobileViewportLayout = await page.locator(".auth-card-viewport").evaluate((element) => ({
      clientHeight: element.clientHeight,
      inlineHeight: element.style.height,
      overflowY: getComputedStyle(element).overflowY,
      scrollHeight: element.scrollHeight,
    }));
    assert.equal(mobileViewportLayout.inlineHeight, "auto");
    assert.equal(mobileViewportLayout.overflowY, "visible");
    assert.ok(
      mobileViewportLayout.scrollHeight <= mobileViewportLayout.clientHeight + 1,
      `desktop panel height must not clip content after switching to mobile: ${JSON.stringify(mobileViewportLayout)}`,
    );
  });
}

async function withScenario(browserInstance, scenario, options, callback) {
  activeScenario = scenario;
  const context = await browserInstance.newContext({
    locale: "zh-CN",
    reducedMotion: options.reducedMotion ?? "no-preference",
    viewport: options.viewport,
  });
  const page = await context.newPage();
  try {
    await callback(page);
  } finally {
    await context.close();
    activeScenario = null;
  }
}

async function waitForExitingPanelStopsPointer(page, selector, label) {
  await page.waitForFunction((panelSelector) => {
    const panel = document.querySelector(panelSelector);
    return !(panel instanceof HTMLElement) || getComputedStyle(panel).pointerEvents === "none";
  }, selector, { timeout: 2000 });
  const panel = page.locator(selector);
  if (!await panel.count()) return;
  assert.equal(
    await panel.evaluate((element) => getComputedStyle(element).pointerEvents),
    "none",
    `exiting ${label} panel must stop intercepting taps before the next panel enters`,
  );
}

async function assertElementInsideViewport(page, elementSelector, viewportSelector, label) {
  const bounds = await page.evaluate(({ elementSelector: targetSelector, viewportSelector: clipSelector }) => {
    const element = document.querySelector(targetSelector);
    const viewport = document.querySelector(clipSelector);
    if (!(element instanceof HTMLElement) || !(viewport instanceof HTMLElement)) return null;
    const elementRect = element.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    return {
      element: {
        bottom: elementRect.bottom,
        left: elementRect.left,
        right: elementRect.right,
        top: elementRect.top,
      },
      viewport: {
        bottom: viewportRect.bottom,
        left: viewportRect.left,
        right: viewportRect.right,
        top: viewportRect.top,
      },
    };
  }, { elementSelector, viewportSelector });

  assert.ok(bounds, `${label} bounds missing`);
  assert.ok(bounds.element.left >= bounds.viewport.left - 0.5, `${label} left edge must not be clipped: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.element.top >= bounds.viewport.top - 0.5, `${label} top edge must not be clipped: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.element.right <= bounds.viewport.right + 0.5, `${label} right edge must not be clipped: ${JSON.stringify(bounds)}`);
  assert.ok(bounds.element.bottom <= bounds.viewport.bottom + 0.5, `${label} bottom edge must not be clipped: ${JSON.stringify(bounds)}`);
}

async function startDesktopMotionProbe(page, selector, key) {
  await page.evaluate(({ panelSelector, probeKey }) => {
    const probe = {
      blurredFrames: 0,
      heights: [],
      maxConcurrentPanels: 0,
      maxTravel: 0,
      running: true,
    };
    window[probeKey] = probe;

    const sample = () => {
      if (!probe.running) return;
      const panels = [...document.querySelectorAll(panelSelector)].filter((panel) => panel instanceof HTMLElement);
      probe.maxConcurrentPanels = Math.max(probe.maxConcurrentPanels, panels.length);
      for (const panel of panels) {
        const style = getComputedStyle(panel);
        const transform = style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
        probe.maxTravel = Math.max(probe.maxTravel, Math.abs(transform?.m41 ?? 0));
        if (style.filter !== "none" && style.filter !== "blur(0px)") probe.blurredFrames += 1;
      }
      const viewport = document.querySelector(".auth-card-viewport");
      if (viewport instanceof HTMLElement) probe.heights.push(viewport.getBoundingClientRect().height);
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, { panelSelector: selector, probeKey: `__priestessMotionProbe_${key}` });
}

async function finishDesktopMotionProbe(page, key) {
  return page.evaluate((probeKey) => {
    const probe = window[probeKey];
    if (!probe) return null;
    probe.running = false;
    delete window[probeKey];
    return {
      blurredFrames: probe.blurredFrames,
      heights: probe.heights,
      maxConcurrentPanels: probe.maxConcurrentPanels,
      maxTravel: probe.maxTravel,
    };
  }, `__priestessMotionProbe_${key}`);
}

function assertDesktopCinematicMotion(motion, label) {
  assert.ok(motion, `${label} probe missing`);
  assert.ok(motion.maxTravel >= 80, `${label} must preserve a large shared-axis travel: ${JSON.stringify(motion)}`);
  assert.ok(motion.maxConcurrentPanels <= 1, `${label} must not overlap old and new panels: ${JSON.stringify(motion)}`);
  assert.equal(motion.blurredFrames, 0, `${label} must keep text sharp throughout the transition`);
  assert.ok(motion.heights.length >= 3, `${label} must sample the card height timeline`);

  const firstHeight = motion.heights[0];
  const finalHeight = motion.heights.at(-1);
  const direction = Math.sign(finalHeight - firstHeight);
  if (direction === 0) return;
  const reverseFrames = motion.heights.slice(1).reduce((count, height, index) => {
    const delta = height - motion.heights[index];
    return count + (Math.abs(delta) > 1 && Math.sign(delta) !== direction ? 1 : 0);
  }, 0);
  assert.ok(reverseFrames <= 1, `${label} height must move monotonically without spring recoil: ${JSON.stringify(motion)}`);
}

async function waitForPanelSettled(page, selector) {
  await page.waitForFunction((panelSelector) => {
    const panel = document.querySelector(panelSelector);
    if (!(panel instanceof HTMLElement)) return false;
    const style = getComputedStyle(panel);
    const transform = style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
    return Number.parseFloat(style.opacity) > 0.99 && (!transform || Math.abs(transform.m41) < 0.5);
  }, selector, { timeout: 2500 });
}

function createScenario(options = {}) {
  return {
    browserAccountDelayMs: options.browserAccountDelayMs ?? 0,
    browserAccountMode: options.browserAccountMode ?? "empty",
    hangAccountChoices: options.hangAccountChoices ?? false,
    qrCreateDelayMs: options.qrCreateDelayMs ?? 0,
    records: {
      accountChoices: 0,
      browserAccounts: 0,
      qrCreates: 0,
      qrPolls: 0,
      deviceSessions: 0,
      sessions: 0,
    },
    sessionDelayMs: options.sessionDelayMs ?? 0,
  };
}

function buildAuthUrl(appUrl, appId) {
  const url = new URL("/login", appUrl);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("return_to", `${appUrl}/client-callback`);
  return url.toString();
}

async function startMockApiServer() {
  const server = createHttpServer(async(req, res) => {
    const origin = req.headers.origin || "http://127.0.0.1";
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "accept, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS, POST");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const scenario = activeScenario;
    if (!scenario) {
      writeJson(res, 503, { error: { code: "missing_scenario" } });
      return;
    }
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/auth/priestess/session") {
      scenario.records.sessions += 1;
      if (scenario.sessionDelayMs > 0) await delay(scenario.sessionDelayMs);
      if (!res.destroyed) writeJson(res, 200, { authenticated: false });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/devices/sessions") {
      scenario.records.deviceSessions += 1;
      writeJson(res, 401, { error: { code: "local_session_required" } });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/browser-accounts") {
      scenario.records.browserAccounts += 1;
      if (scenario.browserAccountDelayMs > 0) await delay(scenario.browserAccountDelayMs);
      writeJson(res, 200, {
        accounts: scenario.browserAccountMode === "single"
          ? [{
              authenticated: true,
              current: true,
              display_name: "Desktop Motion User",
              email: "desktop-motion@example.com",
              user_id: "desktop-motion-user",
              username: "desktop-motion",
            }]
          : [],
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/account-choices") {
      scenario.records.accountChoices += 1;
      if (scenario.hangAccountChoices) {
        await new Promise((resolveClose) => req.once("close", resolveClose));
        return;
      }
      writeJson(res, 200, {
        accounts: [],
        app: {
          app_id: url.searchParams.get("app_id"),
          return_to_origin: origin,
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/qr/sessions") {
      scenario.records.qrCreates += 1;
      if (scenario.qrCreateDelayMs > 0) await delay(scenario.qrCreateDelayMs);
      writeJson(res, 201, {
        expires_in: 120,
        qr_url: "https://priestess.test/qr-login?sessionId=smoke",
        session_id: "smoke-qr-session",
        status: "pending",
        status_url: "/auth/priestess/qr/sessions/smoke-qr-session/status",
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/qr/sessions/smoke-qr-session/status") {
      scenario.records.qrPolls += 1;
      writeJson(res, 200, { expires_in: 120, status: "pending" });
      return;
    }

    writeJson(res, 404, { error: { code: "not_found" } });
  });

  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object", "mock API server address missing");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const packageRoot = findPackageRootFromPath("playwright");
    if (!packageRoot) {
      throw new Error("Playwright is not available. Run this script through npx --package playwright.");
    }
    return import(pathToFileURL(resolve(packageRoot, "index.mjs")).href);
  }
}

function findPackageRootFromPath(packageName) {
  for (const entry of process.env.PATH.split(delimiter)) {
    const maybeBinDir = resolve(entry);
    if (!maybeBinDir.endsWith(`${delimiter}.bin`) && !maybeBinDir.endsWith("/.bin")) continue;
    const packageRoot = resolve(maybeBinDir, "..", packageName);
    if (existsSync(resolve(packageRoot, "package.json"))) return packageRoot;
  }
  return "";
}

async function launchBrowser(chromium) {
  const executablePath = findChromeExecutable();
  if (executablePath) return chromium.launch({ executablePath, headless: true });
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

function findChromeExecutable() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

function listen(server) {
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
}

function closeServer(server) {
  server.closeAllConnections?.();
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

function writeJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function waitFor(predicate, timeoutMs, message) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await delay(50);
  }
  throw new Error(message);
}
