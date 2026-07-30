import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
const TURNSTILE_TOKEN = "browser-turnstile-token";
const TEST_PASSWORD = "smoke-password-123";

let activeScenario = null;
let browser;
let viteServer;
let apiServer;

try {
  const api = await startMockApiServer();
  apiServer = api.server;
  process.env.VITE_PRIESTESS_API_BASE_URL = api.baseUrl;
  process.env.VITE_PRIESTESS_TURNSTILE_SITE_KEY = TURNSTILE_SITE_KEY;

  viteServer = await createViteServer({
    appType: "spa",
    logLevel: "silent",
    root: appRoot,
    server: {
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
  });
  await viteServer.listen();
  const viteAddress = viteServer.httpServer?.address();
  assert.ok(viteAddress && typeof viteAddress === "object", "vite server address missing");
  const appUrl = `http://127.0.0.1:${viteAddress.port}`;

  const { chromium } = await importPlaywright();
  browser = await launchBrowser(chromium);

  await testFirstLoginDoesNotAutoAuthorize(browser, appUrl);
  await testEmptyAccountRefreshReturnsToLogin(browser, appUrl);
  await testAccountChoiceErrorCanRetry(browser, appUrl);
  await testMultipleAccountsRemainSelectable(browser, appUrl);
  await testBareLoginSelectsSavedAccount(browser, appUrl);
  await testReducedMotionAccountSwitch(browser, appUrl);
  await testBareLoginRemainsUsable(browser, appUrl);
  await testTotpReturnsToAccountPicker(browser, appUrl);
  await testPasskeyReturnsToAccountPicker(browser, appUrl);
  await testPhoneRegistrationProgress(browser, appUrl);
  await testRegistrationReturnsToAccountPicker(browser, appUrl);

  console.log("login auth-flow browser smoke passed");
} finally {
  if (browser) await browser.close();
  if (viteServer) await viteServer.close();
  if (apiServer) await closeServer(apiServer);
}

async function testFirstLoginDoesNotAutoAuthorize(browserInstance, appUrl) {
  const scenario = createScenario("first-login", {
    accountDelayAfterAuthMs: 3200,
    accountModeAfterAuth: "single",
    requireTurnstile: true,
  });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    const usernameInput = page.locator("input[autocomplete='username']");
    await usernameInput.waitFor({ state: "visible" });
    assert.equal(await usernameInput.isEnabled(), true, "empty initial account list should expose the password form");
    const initialAccountChoiceRequests = scenario.records.accountChoices.length;

    await submitPassword(page, "turnstile-user");
    await page.waitForSelector(".login-success-overlay.is-challenge", { timeout: 5000 });
    await page.locator("[data-priestess-smoke-turnstile='ready']").click();
    await page.waitForSelector(".login-success-overlay.is-success", { timeout: 2500 });
    await page.waitForSelector(".login-success-overlay", { state: "detached", timeout: 3500 });

    // 慢账号列表仍在请求中时，成功遮罩和提交锁必须已经释放。
    assert.equal(await page.locator(".login-card--submit-stage").count(), 0);
    assert.equal(scenario.records.authorizations.length, 0, "single account must not be auto-authorized");
    assert.equal(new URL(page.url()).pathname, "/login");

    const accountButton = page.locator(".account-picker__row-main").first();
    await accountButton.waitFor({ state: "visible", timeout: 7000 });
    assert.equal(await accountButton.isEnabled(), true);
    assert.ok(scenario.records.accountChoices.length > initialAccountChoiceRequests, "account list should refresh after the animation");
    assert.equal(scenario.records.authorizations.length, 0);

    await accountButton.click();
    await page.waitForURL((url) => url.searchParams.get("authorized") === "1", { timeout: 5000 });
    assert.deepEqual(scenario.records.authorizations, [{
      app_id: scenario.appId,
      choice_id: `choice-${scenario.appId}`,
      return_to: `${appUrl}/client-callback`,
    }]);
    assert.deepEqual(scenario.records.loginBodies, [
      { password: TEST_PASSWORD, username: "turnstile-user" },
      { password: TEST_PASSWORD, turnstile_token: TURNSTILE_TOKEN, username: "turnstile-user" },
    ]);
  });
}

async function testEmptyAccountRefreshReturnsToLogin(browserInstance, appUrl) {
  const scenario = createScenario("empty-after-login", { accountModeAfterAuth: "empty" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible" });
    const initialAccountChoiceRequests = scenario.records.accountChoices.length;

    await submitPassword(page, "empty-user");
    await page.waitForSelector(".login-success-overlay.is-success", { timeout: 5000 });
    await page.waitForSelector(".login-success-overlay", { state: "detached", timeout: 5000 });
    const usernameInput = page.locator("input[autocomplete='username']");
    await usernameInput.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await usernameInput.isEnabled(), true, "empty refresh result should return to an unlocked login form");
    assert.equal(await page.locator(".login-form .primary-button[type='submit']").isEnabled(), true);
    assert.ok(scenario.records.accountChoices.length > initialAccountChoiceRequests);
    assert.equal(scenario.records.authorizations.length, 0);
  });
}

async function testAccountChoiceErrorCanRetry(browserInstance, appUrl) {
  const scenario = createScenario("account-error", { accountError: true, accountModeBeforeAuth: "single" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    const retryButton = page.locator(".account-picker__retry");
    await retryButton.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await retryButton.isEnabled(), true);

    scenario.accountError = false;
    await retryButton.click();
    const accountButtons = page.locator(".account-picker__row-main");
    await accountButtons.first().waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await accountButtons.count(), 1);
    assert.equal(scenario.records.authorizations.length, 0);
  });
}

async function testMultipleAccountsRemainSelectable(browserInstance, appUrl) {
  const scenario = createScenario("multi-account", { accountModeBeforeAuth: "multi" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    const accountButtons = page.locator(".account-picker__row-main");
    await accountButtons.first().waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await accountButtons.count(), 2);
    assert.equal(await accountButtons.first().isEnabled(), true);
    assert.equal(scenario.records.authorizations.length, 0);
  });
}

async function testBareLoginRemainsUsable(browserInstance, appUrl) {
  const scenario = createScenario("bare-login");

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    const usernameInput = page.locator("input[autocomplete='username']");
    await usernameInput.waitFor({ state: "visible" });
    assert.equal(await usernameInput.isEnabled(), true);
    assert.equal(await page.getByRole("button", { name: /Passkey/ }).isEnabled(), true);
    assert.equal(scenario.records.accountChoices.length, 0, "plain /login must not request app account choices");
    assert.ok(scenario.records.browserAccounts >= 1, "plain /login should check the browser account container");
  });
}

async function testBareLoginSelectsSavedAccount(browserInstance, appUrl) {
  const scenario = createScenario("bare-account", { browserAccountMode: "single" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/`, { waitUntil: "domcontentloaded" });
    const accountButton = page.locator(".account-picker__row-main").first();
    await accountButton.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(new URL(page.url()).pathname, "/login");
    assert.equal(await page.getByText("选择账号进入 Priestess 个人中心").count(), 1);
    assert.equal(scenario.records.accountChoices.length, 0);
    assert.ok(scenario.records.browserAccounts >= 1);

    const outgoingPicker = page.locator('[data-auth-account-panel="account-picker"]');
    await page.locator(".account-picker__other").click();
    await waitForExitingPanelStopsPointer(page, '[data-auth-account-panel="account-picker"]', "account picker");
    await page.waitForSelector('[data-auth-account-panel="login-form"]');
    assert.equal(await outgoingPicker.count(), 0, "fade-through must finish the old panel before mounting the new panel");
    await page.waitForTimeout(320);

    const accountSwitchLayout = await page.evaluate(() => {
      const card = document.querySelector(".login-card");
      const viewport = document.querySelector(".auth-card-viewport");
      if (!(card instanceof HTMLElement) || !(viewport instanceof HTMLElement)) return null;
      const cardStyle = getComputedStyle(card);
      const viewportStyle = getComputedStyle(viewport);
      return {
        cardClientHeight: card.clientHeight,
        cardOverflowY: cardStyle.overflowY,
        cardScrollHeight: card.scrollHeight,
        panelCount: document.querySelectorAll("[data-auth-account-panel]").length,
        viewportClientHeight: viewport.clientHeight,
        viewportInlineHeight: viewport.style.height,
        viewportOverflowY: viewportStyle.overflowY,
        viewportScrollHeight: viewport.scrollHeight,
      };
    });
    assert.ok(accountSwitchLayout);
    assert.equal(accountSwitchLayout.panelCount, 1);
    assert.equal(accountSwitchLayout.cardOverflowY, "auto");
    assert.ok(accountSwitchLayout.cardScrollHeight > accountSwitchLayout.cardClientHeight, "short mobile viewport should scroll the full login form");
    assert.equal(accountSwitchLayout.viewportInlineHeight, "auto");
    assert.equal(accountSwitchLayout.viewportOverflowY, "visible");
    assert.ok(
      accountSwitchLayout.viewportScrollHeight <= accountSwitchLayout.viewportClientHeight + 1,
      `mobile auth viewport must expand instead of clipping its content: ${JSON.stringify(accountSwitchLayout)}`,
    );

    assert.equal(
      await page.locator('[data-auth-account-panel="login-form"]').getAttribute("data-auth-account-motion-origin"),
      "right",
    );
    assert.equal(
      await page.locator('[data-auth-account-panel="login-form"]').getAttribute("data-mobile-motion"),
      "fade-through",
    );
    await assertControlCanReceivePointer(page, page.locator("input[autocomplete='username']"), "username input");
    await assertControlCanReceivePointer(page, page.locator("input[autocomplete='current-password']"), "password input");
    await assertControlCanReceivePointer(page, page.getByRole("button", { name: "忘记密码？" }), "forgot password");
    await assertControlCanReceivePointer(page, page.getByRole("button", { name: "使用 Passkey 登录" }), "Passkey");
    await assertControlCanReceivePointer(page, page.getByRole("button", { name: "创建账号" }), "create account");

    const backButton = page.getByRole("button", { name: "返回账号选择" });
    const outgoingLoginForm = page.locator('[data-auth-account-panel="login-form"]');
    await backButton.click();
    await waitForExitingPanelStopsPointer(page, '[data-auth-account-panel="login-form"]', "login form");
    await page.waitForSelector('[data-auth-account-panel="account-picker"]');
    assert.equal(await outgoingLoginForm.count(), 0, "fade-through return must not overlap both panels");
    assert.equal(
      await page.locator('[data-auth-account-panel="account-picker"]').getAttribute("data-auth-account-motion-origin"),
      "left",
    );
    await page.waitForTimeout(320);
    await accountButton.waitFor({ state: "visible" });

    await accountButton.click();
    await page.waitForURL((url) => url.pathname === "/manage", { timeout: 5000 });
    assert.deepEqual(scenario.records.activations, [{
      body: {},
      userId: "user-bare-account-primary",
    }]);
    assert.equal(scenario.records.authorizations.length, 0);
  }, { reducedMotion: "no-preference", viewport: { height: 667, width: 375 } });
}

async function testReducedMotionAccountSwitch(browserInstance, appUrl) {
  const scenario = createScenario("bare-account-reduced-motion", { browserAccountMode: "single" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator(".account-picker__other").waitFor({ state: "visible", timeout: 5000 });
    await page.locator(".account-picker__other").click();
    await page.waitForSelector('[data-auth-account-panel="login-form"]');
    assert.equal(await page.locator('[data-auth-account-panel="account-picker"]').count(), 0);
    assert.equal(
      await page.locator('[data-auth-account-panel="login-form"]').evaluate((element) => getComputedStyle(element).transform),
      "none",
    );
    const reducedMotionLayout = await page.evaluate(() => {
      const card = document.querySelector(".login-card");
      const viewport = document.querySelector(".auth-card-viewport");
      if (!(card instanceof HTMLElement) || !(viewport instanceof HTMLElement)) return null;
      return {
        cardOverflowY: getComputedStyle(card).overflowY,
        viewportClientHeight: viewport.clientHeight,
        viewportInlineHeight: viewport.style.height,
        viewportOverflowY: getComputedStyle(viewport).overflowY,
        viewportScrollHeight: viewport.scrollHeight,
      };
    });
    assert.ok(reducedMotionLayout);
    assert.equal(reducedMotionLayout.cardOverflowY, "auto");
    assert.equal(reducedMotionLayout.viewportInlineHeight, "auto");
    assert.equal(reducedMotionLayout.viewportOverflowY, "visible");
    assert.ok(
      reducedMotionLayout.viewportScrollHeight <= reducedMotionLayout.viewportClientHeight + 1,
      `reduced-motion mobile viewport must not clip the login form: ${JSON.stringify(reducedMotionLayout)}`,
    );
    await assertControlCanReceivePointer(page, page.locator("input[autocomplete='username']"), "reduced-motion username input");
    await assertControlCanReceivePointer(page, page.locator("input[autocomplete='current-password']"), "reduced-motion password input");
    await assertControlCanReceivePointer(page, page.getByRole("button", { name: "忘记密码？" }), "reduced-motion forgot password");
    await assertControlCanReceivePointer(page, page.getByRole("button", { name: "使用 Passkey 登录" }), "reduced-motion Passkey");
    await assertControlCanReceivePointer(page, page.getByRole("button", { name: "创建账号" }), "reduced-motion create account");

    await page.getByRole("button", { name: "创建账号" }).click();
    await page.waitForSelector('[data-auth-mode-panel="register"]');
    assert.equal(await page.locator('[data-auth-mode-panel="login"]').count(), 0);
    assert.equal(
      await page.locator('[data-auth-mode-panel="register"]').evaluate((element) => getComputedStyle(element).transform),
      "none",
    );
    await page.locator("input[autocomplete='email']").fill("reduced-motion@example.com");
    await page.locator("#register-terms-consent").check();
    await page.locator(".login-form .primary-button[type='submit']").click();
    await page.waitForSelector('[data-register-step-panel="invitation"]');
    assert.equal(await page.locator('[data-register-step-panel="identity"]').count(), 0);
    assert.equal(
      await page.locator('[data-register-step-panel="invitation"]').evaluate((element) => getComputedStyle(element).transform),
      "none",
    );
    await page.getByRole("button", { name: "上一步" }).click();
    await page.waitForSelector('[data-register-step-panel="identity"]');
    assert.equal(await page.locator('[data-register-step-panel="invitation"]').count(), 0);
    await page.getByRole("button", { name: "返回登录" }).click();
    await page.waitForSelector('[data-auth-mode-panel="login"]');
    assert.equal(await page.locator('[data-auth-mode-panel="register"]').count(), 0);

    await page.getByRole("button", { name: "忘记密码？" }).click();
    await page.waitForSelector('[data-auth-mode-panel="forgot-password"]');
    assert.equal(await page.locator('[data-auth-mode-panel="login"]').count(), 0);
    assert.equal(
      await page.locator('[data-auth-mode-panel="forgot-password"]').evaluate((element) => getComputedStyle(element).transform),
      "none",
    );
    await page.getByRole("button", { name: "返回登录" }).click();
    await page.waitForSelector('[data-auth-mode-panel="login"]');
    assert.equal(await page.locator('[data-auth-mode-panel="forgot-password"]').count(), 0);

    await page.getByRole("button", { name: "返回账号选择" }).click();
    await page.waitForSelector('[data-auth-account-panel="account-picker"]');
    assert.equal(await page.locator('[data-auth-account-panel="login-form"]').count(), 0);
  }, { reducedMotion: "reduce", viewport: { height: 844, width: 390 } });
}

async function testTotpReturnsToAccountPicker(browserInstance, appUrl) {
  const scenario = createScenario("totp-login", { accountModeAfterAuth: "single", loginKind: "totp" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible" });
    await submitPassword(page, "totp-user");

    const totpInput = page.locator("input[autocomplete='one-time-code']");
    await totpInput.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await totpInput.isEnabled(), true);
    await totpInput.fill("123456");
    await page.locator(".login-form .primary-button[type='submit']").click();
    await waitForSuccessfulAccountPicker(page);

    assert.deepEqual(scenario.records.totpBodies, [{ challenge_id: "totp-challenge", code: "123456" }]);
    assert.equal(scenario.records.authorizations.length, 0);
  });
}

async function testPasskeyReturnsToAccountPicker(browserInstance, appUrl) {
  const scenario = createScenario("passkey-login", { accountModeAfterAuth: "single" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    const passkeyButton = page.getByRole("button", { name: /使用 Passkey 登录/ });
    await passkeyButton.waitFor({ state: "visible" });
    await passkeyButton.click();
    await waitForSuccessfulAccountPicker(page);

    assert.equal(scenario.records.passkeyOptions, 1);
    assert.equal(scenario.records.passkeyVerifications.length, 1);
    assert.equal(scenario.records.passkeyVerifications[0].challenge_id, "passkey-challenge");
    assert.equal(scenario.records.authorizations.length, 0);
  });
}

async function testPhoneRegistrationProgress(browserInstance, appUrl) {
  const scenario = createScenario("registration-phone-progress");

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "创建账号" }).click();
    await page.getByRole("button", { name: "使用手机号注册" }).click();
    await page.locator("input[autocomplete='tel-national']").waitFor({ state: "visible" });

    assert.deepEqual(
      await page.locator(".register-progress__label").allTextContents(),
      ["手机号", "验证", "密码", "资料"],
    );
  });
}

async function testRegistrationReturnsToAccountPicker(browserInstance, appUrl) {
  const scenario = createScenario("registration", { accountModeAfterAuth: "single" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "创建账号" }).click();

    const emailInput = page.locator("input[autocomplete='email']");
    await emailInput.waitFor({ state: "visible", timeout: 5000 });
    assert.deepEqual(await page.locator(".register-progress__label").allTextContents(), ["邮箱", "验证", "密码", "资料"]);
    await emailInput.fill("first-login@example.com");
    await page.locator("#register-terms-consent").check();
    await page.locator(".login-form .primary-button[type='submit']").click();

    const inviteInput = page.locator("input[placeholder='输入邀请码']");
    await inviteInput.waitFor({ state: "visible" });
    assert.equal(await page.locator(".register-progress__item--current .register-progress__dot").textContent(), "2");
    await inviteInput.fill("INVITE-SMOKE");
    await page.locator("[data-priestess-smoke-turnstile='ready']").click();
    await page.getByRole("button", { name: "校验邀请码" }).click();
    const verificationInput = page.locator("input[autocomplete='one-time-code']");
    await assertInputValue(verificationInput, "654321", 5000);
    assert.equal(await page.locator(".register-progress__item--current .register-progress__dot").textContent(), "2");
    await page.getByRole("button", { name: /秒后可重发/ }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "验证并继续" }).click();

    const passwordInputs = page.locator("input[autocomplete='new-password']");
    await passwordInputs.first().waitFor({ state: "visible" });
    await page.getByRole("button", { name: "上一步" }).click();
    await page.locator(".login-form .signup-line", { hasText: "账号验证码已确认" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "继续设置密码" }).click();
    await passwordInputs.first().waitFor({ state: "visible" });
    await passwordInputs.nth(0).fill(TEST_PASSWORD);
    await passwordInputs.nth(1).fill(TEST_PASSWORD);
    await page.locator(".login-form .primary-button[type='submit']").click();

    const displayNameInput = page.locator("input[autocomplete='nickname']");
    await displayNameInput.waitFor({ state: "visible" });
    await displayNameInput.fill("First Login User");
    await page.locator("input[autocomplete='username']").fill("firstloginuser");
    await page.locator(".login-form .primary-button[type='submit']").click();
    await page.getByText("正在进入 Priestess").waitFor({ state: "visible", timeout: 5000 });
    await page.locator(".account-picker__row-main").first().waitFor({ state: "visible", timeout: 7000 });

    assert.deepEqual(scenario.records.registrationInviteChecks, [{
      identity: "first-login@example.com",
      identity_type: "email",
      invite_code: "INVITE-SMOKE",
      turnstile_token: TURNSTILE_TOKEN,
    }]);
    assert.equal(scenario.records.registrationVerifications.length, 1);
    assert.deepEqual(scenario.records.registrationVerifications[0], {
      identity: "first-login@example.com",
      identity_type: "email",
      invite_challenge: "registration-invite-challenge",
      invite_code: "INVITE-SMOKE",
    });
    assert.equal(scenario.records.registrationVerificationChecks.length, 1);
    assert.deepEqual(scenario.records.registrationVerificationChecks[0], {
      identity: "first-login@example.com",
      identity_type: "email",
      invite_challenge: "registration-invite-challenge",
      invite_code: "INVITE-SMOKE",
      verification_code: "654321",
      verification_request_id: "registration-request",
    });
    assert.equal(scenario.records.registrationConfirms.length, 1);
    assert.deepEqual(scenario.records.registrationConfirms[0], {
      display_name: "First Login User",
      identity: "first-login@example.com",
      identity_type: "email",
      invite_challenge: "registration-invite-challenge",
      invite_code: "INVITE-SMOKE",
      password: TEST_PASSWORD,
      username: "firstloginuser",
      verification_challenge: "registration-verification-challenge",
    });
    assert.equal(await page.locator(".login-success-overlay.is-challenge").count(), 0);
    assert.equal(scenario.records.authorizations.length, 0);
  });
}

async function withScenario(browserInstance, scenario, callback, options = {}) {
  activeScenario = scenario;
  const context = await browserInstance.newContext({
    locale: "zh-CN",
    reducedMotion: options.reducedMotion ?? "reduce",
    viewport: options.viewport,
  });
  const page = await context.newPage();
  await installBrowserStubs(page);
  try {
    await callback(page);
  } finally {
    await context.close();
    activeScenario = null;
  }
}

async function assertControlCanReceivePointer(page, locator, label) {
  assert.equal(await locator.count(), 1, `${label} must be unique`);
  assert.equal(await locator.isEnabled(), true, `${label} must be enabled`);
  const canReceivePointer = await locator.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" });
    const rect = element.getBoundingClientRect();
    const pointX = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
    const pointY = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
    const hit = document.elementFromPoint(pointX, pointY);
    return Boolean(hit && (hit === element || element.contains(hit)));
  });
  assert.equal(canReceivePointer, true, `${label} must not be covered by an exiting panel`);
}

async function waitForExitingPanelStopsPointer(page, selector, label) {
  await page.waitForFunction((panelSelector) => {
    const panel = document.querySelector(panelSelector);
    return !(panel instanceof HTMLElement) || getComputedStyle(panel).pointerEvents === "none";
  }, selector, { timeout: 1000 });
  const panel = page.locator(selector);
  if (!await panel.count()) return;
  assert.equal(
    await panel.evaluate((element) => getComputedStyle(element).pointerEvents),
    "none",
    `exiting ${label} must stop intercepting taps before the next panel enters`,
  );
}

async function installBrowserStubs(page) {
  await page.addInitScript(({ siteKey, token }) => {
    window.__PRIESTESS_CONFIG__ = { turnstileSiteKey: siteKey };
    window.turnstile = {
      render(container, options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Fake Cloudflare Turnstile";
        button.dataset.priestessSmokeTurnstile = "ready";
        button.addEventListener("click", () => {
          button.textContent = "Verified";
          window.setTimeout(() => options.callback(token), 20);
        });
        container.appendChild(button);
        return "smoke-turnstile-widget";
      },
      remove() {},
      reset() {},
    };

    window.PublicKeyCredential = class PublicKeyCredential {};
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: {
        async get() {
          const bytes = (values) => new Uint8Array(values).buffer;
          return {
            authenticatorAttachment: "platform",
            getClientExtensionResults: () => ({}),
            id: "smoke-passkey",
            rawId: bytes([1, 2, 3, 4]),
            response: {
              authenticatorData: bytes([5, 6, 7, 8]),
              clientDataJSON: bytes([9, 10, 11, 12]),
              signature: bytes([13, 14, 15, 16]),
              userHandle: null,
            },
            type: "public-key",
          };
        },
      },
    });
  }, { siteKey: TURNSTILE_SITE_KEY, token: TURNSTILE_TOKEN });
}

function createScenario(appId, options = {}) {
  return {
    accountDelayAfterAuthMs: options.accountDelayAfterAuthMs ?? 0,
    accountError: options.accountError ?? false,
    accountModeAfterAuth: options.accountModeAfterAuth ?? "empty",
    accountModeBeforeAuth: options.accountModeBeforeAuth ?? "empty",
    browserAccountMode: options.browserAccountMode ?? "empty",
    appId,
    authenticated: false,
    loginKind: options.loginKind ?? "password",
    records: {
      accountChoices: [],
      activations: [],
      authorizations: [],
      browserAccounts: 0,
      loginBodies: [],
      passkeyOptions: 0,
      passkeyVerifications: [],
      registrationConfirms: [],
      registrationInviteChecks: [],
      registrationVerificationChecks: [],
      registrationVerifications: [],
      totpBodies: [],
    },
    requireTurnstile: options.requireTurnstile ?? false,
  };
}

function buildAuthUrl(appUrl, appId) {
  const url = new URL("/login", appUrl);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("return_to", `${appUrl}/client-callback`);
  return url.toString();
}

async function submitPassword(page, username) {
  await page.locator("input[autocomplete='username']").fill(username);
  await page.locator("input[autocomplete='current-password']").fill(TEST_PASSWORD);
  await page.locator(".login-form .primary-button[type='submit']").click();
}

async function waitForSuccessfulAccountPicker(page) {
  await page.waitForSelector(".login-success-overlay.is-success", { timeout: 5000 });
  await page.waitForSelector(".login-success-overlay", { state: "detached", timeout: 5000 });
  await page.locator(".account-picker__row-main").first().waitFor({ state: "visible", timeout: 5000 });
}

async function assertInputValue(locator, expected, timeoutMs) {
  await waitFor(async() => await locator.inputValue() === expected, timeoutMs, `expected input value ${expected}`);
}

async function startMockApiServer() {
  const server = createHttpServer(async(req, res) => {
    const origin = req.headers.origin || "http://127.0.0.1";
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "accept, content-type");
    res.setHeader("Access-Control-Allow-Methods", "DELETE, GET, OPTIONS, POST");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    const scenario = activeScenario;
    if (!scenario) {
      writeJson(res, 503, { error: { code: "missing_scenario" } });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/session") {
      writeJson(res, 200, scenario.authenticated ? authenticatedSession(scenario) : { authenticated: false });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/browser-accounts") {
      scenario.records.browserAccounts += 1;
      writeJson(res, 200, {
        accounts: buildAccounts(scenario, scenario.browserAccountMode).map(({ choice_id: _choiceId, ...account }) => account),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/account-choices") {
      scenario.records.accountChoices.push({
        appId: url.searchParams.get("app_id"),
        returnTo: url.searchParams.get("return_to"),
      });
      if (scenario.accountError) {
        writeJson(res, 500, { error: { code: "account_choices_unavailable", message: "Account choices unavailable" } });
        return;
      }
      if (scenario.authenticated && scenario.accountDelayAfterAuthMs > 0) {
        await delay(scenario.accountDelayAfterAuthMs);
      }
      const mode = scenario.authenticated ? scenario.accountModeAfterAuth : scenario.accountModeBeforeAuth;
      writeJson(res, 200, {
        accounts: buildAccounts(scenario, mode),
        app: { app_id: scenario.appId, return_to_origin: origin },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/session") {
      const body = await readJsonBody(req);
      scenario.records.loginBodies.push(body);
      if (scenario.requireTurnstile && !body.turnstile_token) {
        writeJson(res, 403, { error: { code: "local_login_turnstile_required", message: "Turnstile verification is required" } });
        return;
      }
      if (scenario.requireTurnstile && body.turnstile_token !== TURNSTILE_TOKEN) {
        writeJson(res, 403, { error: { code: "local_login_turnstile_failed", message: "Turnstile verification failed" } });
        return;
      }
      if (scenario.loginKind === "totp") {
        writeJson(res, 200, {
          authenticated: false,
          challenge_id: "totp-challenge",
          mfa_required: true,
          mfa_type: "totp",
          user: { display_name: "TOTP User", user_id: "user-totp", username: "totp-user" },
        });
        return;
      }
      scenario.authenticated = true;
      writeJson(res, 200, authenticatedSession(scenario));
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/session/totp/verify") {
      const body = await readJsonBody(req);
      scenario.records.totpBodies.push(body);
      scenario.authenticated = true;
      writeJson(res, 200, authenticatedSession(scenario));
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/passkeys/authentication/options") {
      scenario.records.passkeyOptions += 1;
      writeJson(res, 200, {
        challenge_id: "passkey-challenge",
        options: {
          allowCredentials: [],
          challenge: "AQIDBAUGBwgJCgsMDQ4PEA",
          rpId: "127.0.0.1",
          timeout: 60_000,
          userVerification: "preferred",
        },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/passkeys/authentication/verify") {
      const body = await readJsonBody(req);
      scenario.records.passkeyVerifications.push(body);
      scenario.authenticated = true;
      writeJson(res, 200, authenticatedSession(scenario));
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/register/verification-requests") {
      const body = await readJsonBody(req);
      scenario.records.registrationVerifications.push(body);
      writeJson(res, 200, {
        accepted: true,
        dev_verification_code: "654321",
        request_id: "registration-request",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/register/verification-check") {
      const body = await readJsonBody(req);
      scenario.records.registrationVerificationChecks.push(body);
      writeJson(res, 200, {
        accepted: true,
        expires_at: Math.floor(Date.now() / 1000) + 600,
        verification_challenge: "registration-verification-challenge",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/register/invite-check") {
      const body = await readJsonBody(req);
      scenario.records.registrationInviteChecks.push(body);
      writeJson(res, 200, {
        accepted: true,
        expires_at: "2026-07-29T12:00:00.000Z",
        invite_challenge: "registration-invite-challenge",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/register/confirm") {
      const body = await readJsonBody(req);
      scenario.records.registrationConfirms.push(body);
      scenario.authenticated = true;
      writeJson(res, 200, authenticatedSession(scenario, {
        displayName: body.display_name,
        email: body.identity,
        username: body.username,
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/authorize") {
      const body = await readJsonBody(req);
      scenario.records.authorizations.push(body);
      const redirectUrl = new URL(body.return_to);
      redirectUrl.searchParams.set("authorized", "1");
      writeJson(res, 200, { redirect_url: redirectUrl.toString() });
      return;
    }

    const activationMatch = url.pathname.match(/^\/auth\/priestess\/account-choices\/([^/]+)\/activate$/);
    if (req.method === "POST" && activationMatch) {
      const body = await readJsonBody(req);
      scenario.records.activations.push({
        body,
        userId: decodeURIComponent(activationMatch[1]),
      });
      scenario.authenticated = true;
      writeJson(res, 200, authenticatedSession(scenario));
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/qr/sessions") {
      writeJson(res, 201, {
        expires_in: 120,
        qr_url: `https://priestess.test/qr-login?sessionId=qr-${scenario.appId}`,
        session_id: `qr-${scenario.appId}`,
        status: "pending",
        status_url: `/auth/priestess/qr/sessions/qr-${scenario.appId}/status`,
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/auth/priestess/qr/sessions/")) {
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

function buildAccounts(scenario, mode) {
  if (mode === "empty") return [];
  const primary = buildAccount(scenario.appId, "Primary");
  return mode === "multi" ? [primary, buildAccount(scenario.appId, "Secondary")] : [primary];
}

function buildAccount(appId, suffix) {
  const normalizedSuffix = suffix.toLowerCase();
  return {
    authenticated: true,
    choice_id: `choice-${appId}${suffix === "Primary" ? "" : `-${normalizedSuffix}`}`,
    current: suffix === "Primary",
    display_name: `${suffix} ${appId}`,
    email: `${appId}-${normalizedSuffix}@example.com`,
    user_id: `user-${appId}-${normalizedSuffix}`,
    username: `${appId}-${normalizedSuffix}`,
  };
}

function authenticatedSession(scenario, overrides = {}) {
  return {
    authenticated: true,
    expires_at: "2026-07-16T00:00:00.000Z",
    user: {
      display_name: overrides.displayName || `User ${scenario.appId}`,
      email: overrides.email || `${scenario.appId}@example.com`,
      user_id: `user-${scenario.appId}`,
      username: overrides.username || scenario.appId,
    },
  };
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const packageRoot = findPackageRootFromPath("playwright");
    if (!packageRoot) {
      throw new Error("Playwright is not available. Run this script through `npx --yes --package playwright -c \"node scripts/login-turnstile-browser-smoke.mjs\"`.");
    }
    return import(pathToFileURL(resolve(packageRoot, "index.mjs")).href);
  }
}

function findPackageRootFromPath(packageName) {
  for (const entry of process.env.PATH.split(delimiter)) {
    const maybeBinDir = resolve(entry);
    if (!maybeBinDir.endsWith(`${delimiter}.bin`) && !maybeBinDir.endsWith("/.bin")) continue;
    const packageRoot = resolve(maybeBinDir, "..", packageName);
    if (existsSync(resolve(packageRoot, "package.json"))) {
      return packageRoot;
    }
  }
  return "";
}

async function launchBrowser(chromium) {
  const executablePath = findChromeExecutable();
  if (executablePath) {
    return chromium.launch({ executablePath, headless: true });
  }

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
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
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
