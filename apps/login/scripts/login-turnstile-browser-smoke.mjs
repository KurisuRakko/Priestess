import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import { runAccountHandoffBrowserCases } from "./account-handoff-browser-cases.mjs";
import { runInlineAccountActionsBrowserCases } from "./inline-account-actions-browser-cases.mjs";

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
  await testSavedAccountAuthorizationFailureReturnsPicker(browser, appUrl);
  await runInlineAccountActionsBrowserCases({
    appUrl,
    assertControlCanReceivePointer,
    browserInstance: browser,
    createScenario,
    waitForExitingPanelStopsPointer,
    withScenario,
  });
  await testSavedAccountDefersQrAndReusesSession(browser, appUrl);
  await testExpiredQrCreatesOneReplacement(browser, appUrl);
  await testQrConfirmationCompletesThroughOverlay(browser, appUrl);
  await testBareLoginSelectsSavedAccount(browser, appUrl);
  await testSavedAccountAvatarMovesIntoIdentityRing(browser, appUrl);
  await testReducedMotionSavedAccountIdentity(browser, appUrl);
  await testReducedMotionAccountSwitch(browser, appUrl);
  await testBareLoginRemainsUsable(browser, appUrl);
  await testLazyStandaloneRoutesRender(browser, appUrl);
  await testPasswordLoginRevealsIdentityAfterVerification(browser, appUrl);
  await testSessionReferenceFallback(browser, appUrl);
  await runAccountHandoffBrowserCases({
    appUrl,
    browserInstance: browser,
    createScenario,
    submitPassword,
    withScenario,
  });
  await testReducedMotionIdentityReveal(browser, appUrl);
  await testLoginFailureRemainsReadable(browser, appUrl);
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
    const selectedIdentity = page.locator('.login-success-overlay.is-success [data-login-identity-phase="success"]');
    await selectedIdentity.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await selectedIdentity.locator("[data-login-identity-name]").innerText(), `Primary ${scenario.appId}`);
    assert.equal(new URL(page.url()).pathname, "/login", "authorization redirect must wait for the identity confirmation");
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

async function testSavedAccountAuthorizationFailureReturnsPicker(browserInstance, appUrl) {
  const scenario = createScenario("authorization-failure", {
    accountModeBeforeAuth: "single",
    authorizeError: true,
  });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    const accountButton = page.locator(".account-picker__row-main").first();
    await accountButton.waitFor({ state: "visible", timeout: 5000 });
    await accountButton.click();

    const failureOverlay = page.locator(".login-success-overlay.is-failure");
    await failureOverlay.waitFor({ state: "visible", timeout: 5000 });
    const returningAvatar = failureOverlay.locator('[data-login-identity-avatar="shared"]');
    assert.equal(await returningAvatar.count(), 1, "a previously visible saved-account avatar should hand back to its source");
    assert.equal(await returningAvatar.getAttribute("data-login-identity-motion"), "returning");
    assert.match(await failureOverlay.innerText(), /授权失败/);
    await page.waitForTimeout(500);
    assert.equal(await page.locator(".login-card--submit-stage").count(), 0, "account picker should be prepared behind authorization failure");
    await failureOverlay.waitFor({ state: "detached", timeout: 4000 });

    await accountButton.waitFor({ state: "visible", timeout: 2000 });
    assert.equal(await accountButton.isEnabled(), true);
    assert.equal(new URL(page.url()).pathname, "/login");
  }, { reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
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
    const initialResourceNames = await page.evaluate(() => (
      performance.getEntriesByType("resource").map((entry) => entry.name)
    ));
    assert.equal(
      initialResourceNames.some((name) => /QrPanel/.test(name)),
      false,
      "bare login should never load QR rendering modules",
    );
    await page.waitForFunction(() => (
      performance.getEntriesByType("resource")
        .some((entry) => /RegisterFirstStepForm/.test(entry.name))
    ), null, { timeout: 5000 });
  });
}

async function testSavedAccountDefersQrAndReusesSession(browserInstance, appUrl) {
  const scenario = createScenario("qr-demand", { accountModeBeforeAuth: "single" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.locator(".account-picker__row-main").first().waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(300);

    const initialAccountChoiceRequests = scenario.records.accountChoices.length;
    assert.ok(initialAccountChoiceRequests >= 1);
    assert.equal(scenario.records.qrSessions.length, 0, "saved-account picker must not create a hidden QR session");
    assert.equal(
      await hasLoadedResource(page, /QrPanel|RegisterFirstStepForm/),
      false,
      "saved-account picker must not preload login-only modules",
    );

    await page.locator(".account-picker__other").click();
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible", timeout: 5000 });
    await waitFor(
      () => scenario.records.qrSessions.length === 1,
      5000,
      "password login should create exactly one QR session",
    );
    await page.waitForFunction(() => {
      const resources = performance.getEntriesByType("resource");
      return resources.some((entry) => /QrPanel/.test(entry.name))
        && resources.some((entry) => /RegisterFirstStepForm/.test(entry.name));
    }, null, { timeout: 5000 });

    await waitFor(
      () => scenario.records.qrStatuses.length > 0,
      5000,
      "visible QR session should begin polling",
    );
    await page.getByRole("button", { name: "创建账号" }).click();
    await page.locator('[data-auth-mode-panel="register"]').waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(300);
    const pausedPollCount = scenario.records.qrStatuses.length;
    await page.waitForTimeout(1800);
    assert.equal(
      scenario.records.qrStatuses.length,
      pausedPollCount,
      "hidden QR session must stop polling while registration is open",
    );

    await page.getByRole("button", { name: "返回登录" }).click();
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible", timeout: 5000 });
    await waitFor(
      () => scenario.records.qrStatuses.length > pausedPollCount,
      5000,
      "returning to login should reconcile the retained QR session",
    );
    assert.equal(scenario.records.qrSessions.length, 1, "returning to login must reuse the unexpired QR session");
    assert.equal(
      scenario.records.accountChoices.length,
      initialAccountChoiceRequests,
      "short auth-mode round trips must reuse fresh account choices",
    );
  });
}

async function testExpiredQrCreatesOneReplacement(browserInstance, appUrl) {
  const scenario = createScenario("qr-expiry", { qrSessionExpiresIn: 1 });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible", timeout: 5000 });
    await waitFor(
      () => scenario.records.qrSessions.length === 2,
      5000,
      "expired QR should create one replacement session",
    );
    await page.waitForTimeout(300);
    assert.equal(scenario.records.qrSessions.length, 2, "expiry and auto-refresh timers must not race into duplicate sessions");
  });
}

async function testQrConfirmationCompletesThroughOverlay(browserInstance, appUrl) {
  const scenario = createScenario("qr-confirmed", { qrConfirmAfterPolls: 1 });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.locator(".qr-frame__code").waitFor({ state: "visible", timeout: 5000 });

    const successOverlay = page.locator(".login-success-overlay.is-success");
    await successOverlay.waitFor({ state: "visible", timeout: 7000 });
    assert.match(await successOverlay.innerText(), /已在手机确认/);
    assert.match(await successOverlay.innerText(), /正在返回应用/);
    assert.equal(await successOverlay.locator("[data-login-identity-phase]").count(), 0, "QR confirmation has no backend identity to reveal");
    assert.equal(new URL(page.url()).pathname, "/login", "QR redirect must wait for the completion transition");

    await page.waitForURL((url) => url.searchParams.get("qr_authorized") === "1", { timeout: 5000 });
  });
}

async function testLoginFailureRemainsReadable(browserInstance, appUrl) {
  const scenario = createScenario("login-failure-hold", { loginError: true });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible" });
    await submitPassword(page, "failure-user");

    const failureOverlay = page.locator(".login-success-overlay.is-failure");
    await failureOverlay.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await failureOverlay.locator("[data-login-identity-avatar]").count(), 0, "failed credentials must not reveal an avatar");
    assert.equal(await failureOverlay.locator("[data-login-identity-name]").count(), 0, "failed credentials must not reveal a name");
    await page.waitForTimeout(2000);
    assert.equal(await failureOverlay.count(), 1, "failure result should remain visible long enough to read");
    assert.equal(await page.locator(".login-card--submit-stage").count(), 0, "the retry form should be prepared behind the readable failure result");
    assert.match(await failureOverlay.innerText(), /登录失败/);
    assert.match(await failureOverlay.innerText(), /用户名或密码错误/);
    await failureOverlay.waitFor({ state: "detached", timeout: 3000 });
  });
}

async function testPasswordLoginRevealsIdentityAfterVerification(browserInstance, appUrl) {
  const scenario = createScenario("identity-reveal");

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    const usernameInput = page.locator("input[autocomplete='username']");
    await usernameInput.waitFor({ state: "visible" });
    const sessionReadsBeforeLogin = scenario.records.sessionReads;
    await usernameInput.fill("identity-user");
    await page.locator("input[autocomplete='current-password']").fill(TEST_PASSWORD);
    const submitButton = page.locator(".login-form .primary-button[type='submit']");
    await startLoginTransitionFrameProbe(page, "identity-entry");
    await submitButton.evaluate((element) => {
      element.addEventListener("click", () => {
        window.__priestessSmokeSubmitDispatchedAt = Date.now();
      }, { capture: true, once: true });
    });
    await submitButton.click();
    await waitFor(() => scenario.records.loginBodies.length === 1, 1000, "login request should start with the submit transition");
    const submitDispatchedAt = await page.evaluate(() => window.__priestessSmokeSubmitDispatchedAt);
    const requestStartDelayMs = scenario.records.loginRequestedAt - submitDispatchedAt;
    assert.ok(
      requestStartDelayMs < 650,
      `network login must not wait for the 760ms card-centering transition (observed ${requestStartDelayMs}ms)`,
    );
    const submitSurface = page.locator(".login-card--submit-stage .auth-card-content");
    await submitSurface.waitFor({ state: "attached", timeout: 1000 });
    const submitSurfaceStyle = await submitSurface.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        filter: style.filter,
        transitionProperty: style.transitionProperty,
      };
    });
    assert.equal(submitSurfaceStyle.filter, "none", "the large login form must not animate a rasterizing blur during handoff");
    assert.equal(submitSurfaceStyle.transitionProperty, "opacity");

    const loadingOverlay = page.locator(".login-success-overlay.is-loading");
    const loadingIdentity = loadingOverlay.locator('[data-login-identity-phase="loading"]');
    await loadingIdentity.waitFor({ state: "visible", timeout: 5000 });
    const loadingObservedAt = Date.now();
    await page.waitForTimeout(180);
    assert.equal(await loadingIdentity.locator("[data-login-identity-avatar]").count(), 0);
    assert.equal(await loadingIdentity.locator("[data-login-identity-name]").count(), 0);
    assert.equal(await loadingIdentity.locator(".login-identity-transition__status").innerText(), "Trying to sign you in…");
    await loadingIdentity.locator(".login-identity-transition__status").evaluate((element) => {
      window.__priestessIdentityStatusExitObserved = false;
      const observer = new MutationObserver(() => {
        if (element.getAttribute("data-login-identity-status-presence") === "exiting") {
          window.__priestessIdentityStatusExitObserved = true;
          observer.disconnect();
        }
      });
      observer.observe(element, { attributeFilter: ["data-login-identity-status-presence"] });
    });

    const loadingMotion = await loadingIdentity.evaluate((element) => {
      const ringMotion = element.querySelector(".login-identity-transition__ring-motion");
      const ringArc = element.querySelector(".login-identity-transition__ring-arc");
      window.__priestessIdentityRingElement = ringMotion;
      window.__priestessIdentityRingAnimation = ringMotion?.getAnimations()[0] || null;
      return {
        arcAnimationName: ringArc ? getComputedStyle(ringArc).animationName : "",
        motionAnimationName: ringMotion ? getComputedStyle(ringMotion).animationName : "",
        motionTiming: ringMotion ? getComputedStyle(ringMotion).animationTimingFunction : "",
      };
    });
    assert.match(loadingMotion.arcAnimationName, /lso-identity-ring-sweep/);
    assert.match(loadingMotion.motionAnimationName, /lso-identity-ring-rotate/);
    assert.notEqual(loadingMotion.motionTiming, "linear", "identity ring must use a non-linear rotation rhythm");

    const successOverlay = page.locator(".login-success-overlay.is-success");
    await successOverlay.waitFor({ state: "visible", timeout: 5000 });
    const successObservedAt = Date.now();
    assert.ok(Date.now() - loadingObservedAt >= 340, "fast login must preserve the pending phase near the 420ms contract");
    assert.equal(await successOverlay.locator("[data-login-identity-name]").innerText(), `User ${scenario.appId}`);
    const successStatus = successOverlay.locator('[data-login-identity-status-phase="success"]');
    await successStatus.waitFor({ state: "visible", timeout: 1000 });
    assert.equal(await successStatus.innerText(), "Signed in successfully");
    assert.equal(
      await page.evaluate(() => window.__priestessIdentityStatusExitObserved),
      true,
      "the pending status must run its exit state before the success text takes over",
    );
    assert.equal(
      await successOverlay.locator(".login-identity-transition__ring-motion").evaluate((element) => (
        element === window.__priestessIdentityRingElement
        && element.getAnimations()[0] === window.__priestessIdentityRingAnimation
      )),
      true,
      "the loading ring must preserve the same rotation timeline through success",
    );
    assert.match(
      await successOverlay.locator("[data-login-identity-avatar]").getAttribute("src"),
      /priestess-default-avatar\.png/,
    );

    const sessionReference = successOverlay.locator("[data-login-session-reference='true']");
    await sessionReference.waitFor({ state: "visible", timeout: 1500 });
    const expectedSessionReference = `${scenario.deviceSessionId.slice(0, 8)}…${scenario.deviceSessionId.slice(-4)}`;
    assert.equal(await sessionReference.textContent(), `Session · ${expectedSessionReference}`);
    assert.equal(await successOverlay.innerText().then((text) => text.includes(scenario.deviceSessionId)), false, "full session id must not enter the success DOM");
    const sessionReferenceGeometry = await page.evaluate(() => {
      const card = document.querySelector(".login-card")?.getBoundingClientRect();
      const label = document.querySelector("[data-login-session-reference='true']")?.getBoundingClientRect();
      if (!card || !label) return null;
      return {
        bottomInset: card.bottom - label.bottom,
        leftInset: label.left - card.left,
      };
    });
    assert.ok(sessionReferenceGeometry && sessionReferenceGeometry.leftInset >= 30 && sessionReferenceGeometry.leftInset <= 36, `session reference should align to the card's lower-left inset: ${JSON.stringify(sessionReferenceGeometry)}`);
    assert.ok(sessionReferenceGeometry && sessionReferenceGeometry.bottomInset >= 20 && sessionReferenceGeometry.bottomInset <= 30, `session reference should sit above the card bottom edge: ${JSON.stringify(sessionReferenceGeometry)}`);
    assert.equal(scenario.records.deviceSessions, 1, "successful desktop login should share one current-device request with the account target");

    const placement = await successOverlay.evaluate((overlay) => {
      const card = document.querySelector(".login-card");
      const content = overlay.querySelector(".login-success-overlay-content");
      const avatar = overlay.querySelector("[data-login-identity-avatar]");
      const cardRect = card?.getBoundingClientRect();
      const contentRect = content?.getBoundingClientRect();
      return {
        avatarWidth: avatar?.getBoundingClientRect().width ?? 0,
        cardCenterY: cardRect ? cardRect.top + cardRect.height / 2 : 0,
        cardTop: cardRect?.top ?? 0,
        cardHeight: cardRect?.height ?? 0,
        contentCenterY: contentRect ? contentRect.top + contentRect.height / 2 : 0,
      };
    });
    const placementProgress = placement.cardHeight > 0
      ? (placement.contentCenterY - placement.cardTop) / placement.cardHeight
      : 0;
    assert.ok(placementProgress >= 0.44 && placementProgress <= 0.50, `desktop identity result should sit near the card's 47% visual anchor: ${JSON.stringify({ placement, placementProgress })}`);

    await Promise.all([
      page.locator(".account-shell").waitFor({ state: "attached", timeout: 2500 }),
      page.waitForTimeout(950),
    ]);
    assert.equal(new URL(page.url()).pathname, "/login", "preloaded account UI must not commit the URL before the success hold");
    assert.equal(await page.locator(".route-loading").count(), 0, "preloading the account target must not expose a route fallback");
    const settled = await successOverlay.evaluate((overlay) => {
      const avatar = overlay.querySelector("[data-login-identity-avatar]");
      const ring = overlay.querySelector(".login-identity-transition__ring-shell");
      return {
        avatarWidth: avatar?.getBoundingClientRect().width ?? 0,
        ringOpacity: ring ? Number.parseFloat(getComputedStyle(ring).opacity) : 1,
      };
    });
    assert.ok(settled.avatarWidth >= 103 && settled.avatarWidth <= 105, "revealed avatar should settle at 104px");
    assert.ok(settled.ringOpacity <= 0.05, "resolved ring should shrink away after the avatar fills it");

    await successOverlay.evaluate((overlay) => {
      window.__priestessIdentityExitObserved = false;
      window.__priestessIdentityExitOpacitySamples = [];
      const body = document.body;
      const observer = new MutationObserver(() => {
        if (overlay.classList.contains("is-exiting") || body.classList.contains("account-route-handoff-running")) {
          window.__priestessIdentityExitObserved = true;
          observer.disconnect();
          const sampleOpacity = () => {
            const content = overlay.querySelector(".login-success-overlay-content");
            if (!(content instanceof HTMLElement) || !content.isConnected) return;
            window.__priestessIdentityExitOpacitySamples.push(
              Number.parseFloat(getComputedStyle(content).opacity),
            );
            if (window.__priestessIdentityExitOpacitySamples.length < 20) {
              requestAnimationFrame(sampleOpacity);
            }
          };
          requestAnimationFrame(sampleOpacity);
        }
      });
      observer.observe(overlay, { attributeFilter: ["class"] });
      observer.observe(body, { attributeFilter: ["class"] });
    });
    await page.waitForURL((url) => url.pathname === "/manage", { timeout: 5000 });
    assert.equal(
      scenario.records.sessionReads,
      sessionReadsBeforeLogin,
      "the account handoff must reuse the authenticated response instead of blocking on another session read",
    );
    assert.ok(Date.now() - successObservedAt >= 2400, "route commit must wait for identity resolve plus the complete 1.6s confirmation hold");
    const entryFrames = await finishLoginTransitionFrameProbe(page, "identity-entry");
    assert.ok(entryFrames);
    assert.ok(entryFrames.frameCount >= 20, `login handoff should provide a measurable frame sequence: ${JSON.stringify(entryFrames)}`);
    assert.ok(entryFrames.p95FrameGapMs <= 35, `login handoff should stay near a smooth frame cadence: ${JSON.stringify(entryFrames)}`);
    assert.ok(entryFrames.longFrameCount <= 1, `login handoff should not repeatedly stall the main thread: ${JSON.stringify(entryFrames)}`);
    assert.equal(entryFrames.blurredFrameCount, 0, "login handoff must not animate a large blurred form surface");
    assert.equal(entryFrames.lowHandoffOpacityFrameCount, 0, "source, identity overlay, and account target must not expose an empty frame");
    assert.ok(entryFrames.minimumHandoffOpacity >= 0.45, `handoff surfaces must keep continuous visible feedback: ${JSON.stringify(entryFrames)}`);
    assert.ok(entryFrames.identityHeightRange <= 0.1, `identity stage height must remain stable across loading and success: ${JSON.stringify(entryFrames)}`);
    assert.ok(entryFrames.visualWidthRange <= 0.1, `identity visual must reserve its final width instead of resizing every frame: ${JSON.stringify(entryFrames)}`);
    assert.equal(entryFrames.visualWidthChangeCount, 0, "identity reveal must not drive layout with per-frame width changes");
    assert.ok(entryFrames.ringWidthRange >= 40, "the fixed identity stage must still show a clearly expanding compositor ring");
    await successOverlay.waitFor({ state: "detached", timeout: 2500 });
    assert.equal(
      await page.evaluate(() => window.__priestessIdentityExitObserved),
      true,
      "the completed identity layer must expose an exit phase before unmounting",
    );
    const exitOpacitySamples = await page.evaluate(() => window.__priestessIdentityExitOpacitySamples);
    assert.ok(
      exitOpacitySamples.some((opacity) => opacity > 0.08 && opacity < 0.92),
      `the parent overlay must visibly crossfade while its avatar and text exit: ${JSON.stringify(exitOpacitySamples)}`,
    );
  }, { locale: "en-US", reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
}

async function testReducedMotionIdentityReveal(browserInstance, appUrl) {
  const scenario = createScenario("identity-reveal-reduced");

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible" });
    await submitPassword(page, "reduced-user");

    const loadingIdentity = page.locator('[data-login-identity-phase="loading"]');
    await loadingIdentity.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(
      await loadingIdentity.locator(".login-identity-transition__ring-motion").evaluate((element) => getComputedStyle(element).animationName),
      "none",
    );

    const successIdentity = page.locator('[data-login-identity-phase="success"]');
    await successIdentity.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await successIdentity.locator("[data-login-identity-avatar]").count(), 1);
    assert.equal(await successIdentity.locator("[data-login-identity-name]").innerText(), `User ${scenario.appId}`);
    assert.equal(
      await successIdentity.locator(".login-identity-transition__avatar").evaluate((element) => getComputedStyle(element).transform),
      "matrix(1, 0, 0, 1, -52, -52)",
    );
  }, { locale: "en-US", reducedMotion: "reduce", viewport: { height: 844, width: 390 } });
}

async function testSessionReferenceFallback(browserInstance, appUrl) {
  const scenario = createScenario("session-reference-fallback", { deviceSessionsError: true });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible" });
    await submitPassword(page, "session-reference-fallback-user");

    const successOverlay = page.locator(".login-success-overlay.is-success");
    await successOverlay.waitFor({ state: "visible", timeout: 5000 });
    const sessionReference = successOverlay.locator("[data-login-session-reference='true']");
    await sessionReference.waitFor({ state: "visible", timeout: 1500 });
    assert.equal(await sessionReference.textContent(), "Session · Signed in");
    assert.equal(scenario.records.deviceSessions, 1);
    await successOverlay.waitFor({ state: "detached", timeout: 5000 });
  }, { locale: "en-US", reducedMotion: "reduce", viewport: { height: 900, width: 1440 } });
}

async function testLazyStandaloneRoutesRender(browserInstance, appUrl) {
  const scenario = createScenario("lazy-routes");

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/auth-ui/reset-password`, { waitUntil: "domcontentloaded" });
    await page.locator(".recovery-page").waitFor({ state: "visible", timeout: 5000 });

    await page.goto(`${appUrl}/qr-login`, { waitUntil: "domcontentloaded" });
    await page.locator(".qr-mobile-shell").waitFor({ state: "visible", timeout: 5000 });
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
    const sharedAvatar = page.locator('.login-success-overlay.is-loading [data-login-identity-avatar="shared"]');
    await sharedAvatar.waitFor({ state: "visible", timeout: 5000 });
    const sharedLoadingObservedAt = Date.now();
    assert.equal(await sharedAvatar.getAttribute("data-login-identity-source"), "account-picker");
    const accountIdentity = page.locator('.login-success-overlay.is-success [data-login-identity-phase="success"]');
    await accountIdentity.waitFor({ state: "visible", timeout: 5000 });
    assert.ok(
      Date.now() - sharedLoadingObservedAt >= 620,
      "fast saved-account activation must let the avatar finish entering the ring before expansion",
    );
    assert.equal(await accountIdentity.locator("[data-login-identity-name]").innerText(), `User ${scenario.appId}`);
    assert.equal(new URL(page.url()).pathname, "/login", "saved-account navigation must wait until identity reveal is perceptible");
    await page.waitForURL((url) => url.pathname === "/manage", { timeout: 5000 });
    await page.locator(".account-shell").waitFor({ state: "visible", timeout: 5000 });
    assert.deepEqual(scenario.records.activations, [{
      body: {},
      userId: "user-bare-account-primary",
    }]);
    assert.equal(scenario.records.authorizations.length, 0);
  }, { reducedMotion: "no-preference", viewport: { height: 667, width: 375 } });
}

async function testSavedAccountAvatarMovesIntoIdentityRing(browserInstance, appUrl) {
  const scenario = createScenario("saved-account-shared-avatar", {
    activationDelayMs: 2200,
    browserAccountMode: "single",
  });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    const accountButton = page.locator(".account-picker__row-main").first();
    const accountAvatar = accountButton.locator('[data-account-shared-part="avatar"]');
    await accountAvatar.waitFor({ state: "visible", timeout: 5000 });
    const sourceRect = await accountAvatar.boundingBox();
    assert.ok(sourceRect);

    await accountButton.click();
    const sharedAvatar = page.locator('.login-success-overlay.is-loading [data-login-identity-avatar="shared"]');
    await sharedAvatar.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await sharedAvatar.getAttribute("data-login-identity-motion"), "source-to-ring");
    assert.equal(await sharedAvatar.getAttribute("data-login-identity-source"), "account-picker");

    const origin = {
      scale: Number(await sharedAvatar.getAttribute("data-login-identity-origin-scale")),
      x: Number(await sharedAvatar.getAttribute("data-login-identity-origin-x")),
      y: Number(await sharedAvatar.getAttribute("data-login-identity-origin-y")),
    };
    assert.ok(Number.isFinite(origin.x) && Number.isFinite(origin.y) && Number.isFinite(origin.scale));
    assert.ok(Math.hypot(origin.x, origin.y) > 24, "saved avatar should have a meaningful source-to-ring travel distance");
    assert.ok(
      Math.abs(origin.scale - sourceRect.width / 104) < 0.03,
      "shared avatar should begin at the account-row avatar size",
    );

    await sharedAvatar.evaluate((element) => {
      window.__priestessSharedAvatarElement = element;
    });
    await page.waitForTimeout(760);
    assert.equal(
      await page.locator(".login-success-overlay.is-loading").count(),
      1,
      "the shared avatar should settle into the ring while account activation is still pending",
    );
    const settledLoadingGeometry = await sharedAvatar.evaluate((avatar) => {
      const visual = avatar.closest(".login-identity-transition__visual");
      const avatarRect = avatar.getBoundingClientRect();
      const visualRect = visual?.getBoundingClientRect();
      return {
        avatarCenterX: avatarRect.left + avatarRect.width / 2,
        avatarCenterY: avatarRect.top + avatarRect.height / 2,
        avatarWidth: avatarRect.width,
        visualCenterX: visualRect ? visualRect.left + visualRect.width / 2 : 0,
        visualCenterY: visualRect ? visualRect.top + visualRect.height / 2 : 0,
      };
    });
    assert.ok(
      Math.abs(settledLoadingGeometry.avatarCenterX - settledLoadingGeometry.visualCenterX) < 2,
      `shared avatar should settle on the ring x-axis: ${JSON.stringify(settledLoadingGeometry)}`,
    );
    assert.ok(
      Math.abs(settledLoadingGeometry.avatarCenterY - settledLoadingGeometry.visualCenterY) < 2,
      `shared avatar should settle on the ring y-axis: ${JSON.stringify(settledLoadingGeometry)}`,
    );
    assert.ok(settledLoadingGeometry.avatarWidth >= 45 && settledLoadingGeometry.avatarWidth <= 47);

    const revealedAvatar = page.locator('.login-success-overlay.is-success [data-login-identity-avatar="revealed"]');
    await revealedAvatar.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await revealedAvatar.getAttribute("data-login-identity-motion"), "expanding");
    assert.equal(
      await revealedAvatar.evaluate((element) => element === window.__priestessSharedAvatarElement),
      true,
      "the account-row avatar clone should remain the same DOM element through success",
    );
    await page.waitForTimeout(620);
    const successWidth = await revealedAvatar.evaluate((element) => element.getBoundingClientRect().width);
    assert.ok(successWidth >= 103 && successWidth <= 105, "the same shared avatar should expand to the resolved identity size");
    await revealedAvatar.evaluate((element) => {
      window.__priestessSharedAvatarExitObserved = false;
      const observer = new MutationObserver(() => {
        if (element.getAttribute("data-login-identity-motion") === "exiting") {
          window.__priestessSharedAvatarExitObserved = true;
          observer.disconnect();
        }
      });
      observer.observe(element, { attributeFilter: ["data-login-identity-motion"] });
    });
    await page.waitForURL((url) => url.pathname === "/manage", { timeout: 6000 });
    await page.locator(".login-success-overlay").waitFor({ state: "detached", timeout: 5000 });
    assert.equal(
      await page.evaluate(() => window.__priestessSharedAvatarExitObserved),
      true,
      "the shared avatar must run an explicit exit state before the overlay unmounts",
    );
  }, { locale: "en-US", reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
}

async function testReducedMotionSavedAccountIdentity(browserInstance, appUrl) {
  const scenario = createScenario("saved-account-shared-avatar-reduced", {
    activationDelayMs: 700,
    browserAccountMode: "single",
  });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    const accountButton = page.locator(".account-picker__row-main").first();
    await accountButton.waitFor({ state: "visible", timeout: 5000 });
    await accountButton.click();

    const sharedAvatar = page.locator('[data-login-identity-avatar="shared"]');
    await sharedAvatar.waitFor({ state: "attached", timeout: 5000 });
    assert.equal(await sharedAvatar.getAttribute("data-login-identity-motion"), "direct");
    assert.equal(Number(await sharedAvatar.evaluate((element) => getComputedStyle(element).opacity)), 0);

    const revealedAvatar = page.locator('[data-login-identity-avatar="revealed"]');
    await revealedAvatar.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await revealedAvatar.getAttribute("data-login-identity-motion"), "direct");
    assert.ok(
      await revealedAvatar.evaluate((element) => (
        Number.parseFloat(getComputedStyle(element).transitionDuration) <= 0.00001
      )),
      "reduced-motion identity should switch without a perceptible transition",
    );
  }, { locale: "en-US", reducedMotion: "reduce", viewport: { height: 844, width: 390 } });
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

    const handoffIdentity = page.locator('[data-login-identity-phase="handoff"]');
    await handoffIdentity.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await handoffIdentity.locator("[data-login-identity-avatar]").count(), 0);
    assert.equal(await handoffIdentity.locator("[data-login-identity-name]").count(), 0);
    assert.match(await handoffIdentity.innerText(), /还需要一步/);
    const totpInput = page.locator("input[autocomplete='one-time-code']");
    await totpInput.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await totpInput.isEnabled(), true);
    await page.locator(".login-success-overlay").waitFor({ state: "detached", timeout: 5000 });

    const outgoingTotpPanel = page.locator('[data-login-form-panel="totp"]');
    await page.getByRole("button", { name: "返回密码登录" }).click();
    const exitingTotpPanel = page.locator('[data-login-form-panel="totp"][data-login-form-presence="exiting"]');
    await exitingTotpPanel.waitFor({ state: "attached", timeout: 1000 });
    const incomingPasswordPanel = page.locator('[data-login-form-panel="password"]');
    await incomingPasswordPanel.waitFor({ state: "visible", timeout: 2000 });
    assert.equal(await outgoingTotpPanel.count(), 1, "the outgoing TOTP panel must overlap the incoming password panel during crossfade");
    assert.equal(
      await exitingTotpPanel.evaluate((element) => getComputedStyle(element).pointerEvents),
      "none",
      "the overlapping outgoing TOTP panel must not block the incoming form",
    );
    await outgoingTotpPanel.waitFor({ state: "detached", timeout: 1000 });

    await page.locator(".login-form .primary-button[type='submit']").click();
    await page.locator('[data-login-identity-phase="handoff"]').waitFor({ state: "visible", timeout: 5000 });
    await page.locator("input[autocomplete='one-time-code']").waitFor({ state: "visible", timeout: 5000 });
    await page.locator(".login-success-overlay").waitFor({ state: "detached", timeout: 5000 });
    await totpInput.fill("123456");
    await page.locator(".login-form .primary-button[type='submit']").click();
    await page.locator('.login-success-overlay.is-success [data-login-identity-avatar="revealed"]').waitFor({ state: "visible", timeout: 5000 });
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
    await page.locator('.login-success-overlay.is-success [data-login-identity-avatar="revealed"]').waitFor({ state: "visible", timeout: 5000 });
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
    locale: options.locale ?? "zh-CN",
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

async function hasLoadedResource(page, pattern) {
  return page.evaluate((source) => {
    const resourcePattern = new RegExp(source);
    return performance.getEntriesByType("resource").some((entry) => resourcePattern.test(entry.name));
  }, pattern.source);
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
    activationDelayMs: options.activationDelayMs ?? 0,
    accountDelayAfterAuthMs: options.accountDelayAfterAuthMs ?? 0,
    accountError: options.accountError ?? false,
    accountModeAfterAuth: options.accountModeAfterAuth ?? "empty",
    accountModeBeforeAuth: options.accountModeBeforeAuth ?? "empty",
    authorizeError: options.authorizeError ?? false,
    browserAccountMode: options.browserAccountMode ?? "empty",
    deviceSessionsError: options.deviceSessionsError ?? false,
    appId,
    authenticated: false,
    loginError: options.loginError ?? false,
    loginKind: options.loginKind ?? "password",
    records: {
      accountChoices: [],
      activations: [],
      authorizations: [],
      browserAccounts: 0,
      deviceSessions: 0,
      loginBodies: [],
      loginRequestedAt: 0,
      passkeyOptions: 0,
      passkeyVerifications: [],
      qrSessions: [],
      qrStatuses: [],
      registrationConfirms: [],
      registrationInviteChecks: [],
      registrationVerificationChecks: [],
      registrationVerifications: [],
      removals: [],
      sessionReads: 0,
      totpBodies: [],
    },
    removedUserIds: new Set(),
    qrSessionExpiresIn: options.qrSessionExpiresIn ?? 120,
    qrConfirmAfterPolls: options.qrConfirmAfterPolls ?? 0,
      requireTurnstile: options.requireTurnstile ?? false,
    deviceSessionId: options.deviceSessionId ?? `pls_${appId}_desktop_session_7c2d`,
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

async function startLoginTransitionFrameProbe(page, key) {
  await page.evaluate((probeKey) => {
    const probe = {
      blurredFrameCount: 0,
      frameGaps: [],
      geometryFrames: [],
      handoffOpacityTotals: [],
      lastFrameAt: null,
      running: true,
    };
    window[probeKey] = probe;

    const sample = (now) => {
      if (!probe.running) return;
      if (probe.lastFrameAt !== null) {
        probe.frameGaps.push(now - probe.lastFrameAt);
      }
      probe.lastFrameAt = now;

      const submitSurface = document.querySelector(".login-card--submit-stage .auth-card-content");
      const overlayContent = document.querySelector(".login-success-overlay-content");
      const accountTarget = document.querySelector(
        '.account-route-stage[data-account-route-phase="transferring"], .account-route-stage[data-account-route-phase="active"]',
      );
      if (submitSurface instanceof HTMLElement) {
        const filter = getComputedStyle(submitSurface).filter;
        if (filter !== "none" && filter !== "blur(0px)") {
          probe.blurredFrameCount += 1;
        }
      }
      if (submitSurface instanceof HTMLElement || overlayContent instanceof HTMLElement || accountTarget instanceof HTMLElement) {
        const formOpacity = submitSurface instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(submitSurface).opacity)
          : 0;
        const overlayOpacity = overlayContent instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(overlayContent).opacity)
          : 0;
        const accountOpacity = accountTarget instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(accountTarget).opacity)
          : 0;
        probe.handoffOpacityTotals.push(formOpacity + overlayOpacity + accountOpacity);
      }

      const identity = document.querySelector(".login-identity-transition");
      const visual = document.querySelector(".login-identity-transition__visual");
      const ring = document.querySelector(".login-identity-transition__ring-shell");
      if (identity instanceof HTMLElement && visual instanceof HTMLElement && ring instanceof HTMLElement) {
        probe.geometryFrames.push({
          identityHeight: identity.getBoundingClientRect().height,
          ringWidth: ring.getBoundingClientRect().width,
          visualWidth: visual.getBoundingClientRect().width,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, `__priestessLoginFrameProbe_${key}`);
}

async function finishLoginTransitionFrameProbe(page, key) {
  return page.evaluate((probeKey) => {
    const probe = window[probeKey];
    if (!probe) return null;
    probe.running = false;
    delete window[probeKey];
    const sortedGaps = [...probe.frameGaps].sort((left, right) => left - right);
    const identityHeights = probe.geometryFrames.map((frame) => frame.identityHeight);
    const ringWidths = probe.geometryFrames.map((frame) => frame.ringWidth);
    const visualWidths = probe.geometryFrames.map((frame) => frame.visualWidth);
    const p95Index = Math.min(sortedGaps.length - 1, Math.floor(sortedGaps.length * 0.95));
    return {
      blurredFrameCount: probe.blurredFrameCount,
      frameCount: sortedGaps.length,
      identityHeightRange: identityHeights.length > 0 ? Math.max(...identityHeights) - Math.min(...identityHeights) : 0,
      longFrameCount: sortedGaps.filter((gap) => gap > 50).length,
      lowHandoffOpacityFrameCount: probe.handoffOpacityTotals.filter((opacity) => opacity < 0.2).length,
      minimumHandoffOpacity: probe.handoffOpacityTotals.length > 0 ? Math.min(...probe.handoffOpacityTotals) : 0,
      p95FrameGapMs: sortedGaps.length > 0 ? sortedGaps[Math.max(0, p95Index)] : 0,
      ringWidthRange: ringWidths.length > 0 ? Math.max(...ringWidths) - Math.min(...ringWidths) : 0,
      visualWidthChangeCount: visualWidths.filter((width, index) => (
        index > 0 && Math.abs(width - visualWidths[index - 1]) > 0.1
      )).length,
      visualWidthRange: visualWidths.length > 0 ? Math.max(...visualWidths) - Math.min(...visualWidths) : 0,
    };
  }, `__priestessLoginFrameProbe_${key}`);
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
      scenario.records.sessionReads += 1;
      writeJson(res, 200, scenario.authenticated ? authenticatedSession(scenario) : { authenticated: false });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/devices/sessions") {
      scenario.records.deviceSessions += 1;
      if (scenario.deviceSessionsError) {
        writeJson(res, 503, { error: { code: "device_sessions_unavailable" } });
        return;
      }
      if (!scenario.authenticated) {
        writeJson(res, 401, { error: { code: "local_session_required" } });
        return;
      }
      writeJson(res, 200, {
        sessions: [{
          browser: "Smoke Browser",
          current: true,
          device: "桌面浏览器",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
          session_id: scenario.deviceSessionId,
        }],
      });
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
      scenario.records.loginRequestedAt = Date.now();
      scenario.records.loginBodies.push(body);
      if (scenario.loginError) {
        writeJson(res, 401, { error: { code: "invalid_local_credentials", message: "用户名或密码错误" } });
        return;
      }
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
      if (scenario.authorizeError) {
        writeJson(res, 409, { error: { code: "authorization_failed", message: "授权失败，请重新选择账号" } });
        return;
      }
      const redirectUrl = new URL(body.return_to);
      redirectUrl.searchParams.set("authorized", "1");
      writeJson(res, 200, { redirect_url: redirectUrl.toString() });
      return;
    }

    const activationMatch = url.pathname.match(/^\/auth\/priestess\/account-choices\/([^/]+)\/activate$/);
    if (req.method === "POST" && activationMatch) {
      const body = await readJsonBody(req);
      const userId = decodeURIComponent(activationMatch[1]);
      scenario.records.activations.push({
        body,
        userId,
      });
      if (scenario.activationDelayMs > 0) {
        await delay(scenario.activationDelayMs);
      }
      scenario.authenticated = true;
      writeJson(res, 200, authenticatedSession(scenario, { userId }));
      return;
    }

    const removalMatch = url.pathname.match(/^\/auth\/priestess\/account-choices\/([^/]+)$/);
    if (req.method === "DELETE" && removalMatch) {
      const userId = decodeURIComponent(removalMatch[1]);
      scenario.records.removals.push(userId);
      scenario.removedUserIds.add(userId);
      writeJson(res, 200, {
        authenticated: true,
        current: userId.endsWith("-primary"),
        removed: true,
        revoked: true,
        user_id: userId,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/qr/sessions") {
      const sessionId = `qr-${scenario.appId}-${scenario.records.qrSessions.length + 1}`;
      scenario.records.qrSessions.push(sessionId);
      writeJson(res, 201, {
        expires_in: scenario.qrSessionExpiresIn,
        qr_url: `https://priestess.test/qr-login?sessionId=${sessionId}`,
        session_id: sessionId,
        status: "pending",
        status_url: `/auth/priestess/qr/sessions/${sessionId}/status`,
      });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/auth/priestess/qr/sessions/")) {
      scenario.records.qrStatuses.push(url.pathname);
      if (scenario.qrConfirmAfterPolls > 0 && scenario.records.qrStatuses.length >= scenario.qrConfirmAfterPolls) {
        writeJson(res, 200, {
          expires_in: scenario.qrSessionExpiresIn,
          redirect_url: `${origin}/client-callback?qr_authorized=1`,
          status: "confirmed",
        });
        return;
      }
      writeJson(res, 200, { expires_in: scenario.qrSessionExpiresIn, status: "pending" });
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
  const accounts = mode === "multi" ? [primary, buildAccount(scenario.appId, "Secondary")] : [primary];
  return accounts.filter((account) => !scenario.removedUserIds.has(account.user_id));
}

function buildAccount(appId, suffix) {
  const normalizedSuffix = suffix.toLowerCase();
  return {
    authenticated: true,
    choice_id: `choice-${appId}${suffix === "Primary" ? "" : `-${normalizedSuffix}`}`,
    current: suffix === "Primary",
    display_name: `${suffix} ${appId}`,
    email: `${appId}-${normalizedSuffix}@example.com`,
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    user_id: `user-${appId}-${normalizedSuffix}`,
    username: `${appId}-${normalizedSuffix}`,
  };
}

function authenticatedSession(scenario, overrides = {}) {
  return {
    authenticated: true,
    expires_at: "2026-07-16T00:00:00.000Z",
    user: {
      avatar_url: "/priestess-default-avatar.png",
      display_name: overrides.displayName || `User ${scenario.appId}`,
      email: overrides.email || `${scenario.appId}@example.com`,
      user_id: overrides.userId || `user-${scenario.appId}`,
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
