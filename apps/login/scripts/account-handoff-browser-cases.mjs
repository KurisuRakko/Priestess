import assert from "node:assert/strict";

export async function runAccountHandoffBrowserCases({
  appUrl,
  browserInstance,
  createScenario,
  submitPassword,
  withScenario,
}) {
  await testAccountHandoffTimeoutCanRetry({ appUrl, browserInstance, createScenario, submitPassword, withScenario });
  await testLanguagePreferencePersistsThroughHandoff({ appUrl, browserInstance, createScenario, submitPassword, withScenario });
}

async function testLanguagePreferencePersistsThroughHandoff({
  appUrl,
  browserInstance,
  createScenario,
  submitPassword,
  withScenario,
}) {
  const scenario = createScenario("language-handoff");

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    const languageSelect = page.locator(".priestess-language-switcher select").first();
    await languageSelect.waitFor({ state: "attached", timeout: 5000 });
    assert.equal(await languageSelect.inputValue(), "en-US", "browser language should select English on first visit");

    await languageSelect.selectOption("zh-CN");
    await page.getByRole("button", { name: "登录", exact: true }).waitFor({ state: "visible" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "登录", exact: true }).waitFor({ state: "visible" });
    assert.equal(
      await page.locator(".priestess-language-switcher select").first().inputValue(),
      "zh-CN",
      "explicit language choice must win over browser locale after refresh",
    );

    await page.locator(".priestess-language-switcher select").first().selectOption("en-US");
    await page.getByRole("button", { name: "Sign in", exact: true }).waitFor({ state: "visible" });
    await submitPassword(page, "language-user");
    const successOverlay = page.locator(".login-success-overlay.is-success");
    await successOverlay.waitFor({ state: "visible", timeout: 5000 });
    assert.match(await successOverlay.innerText(), /Signed in successfully/);
    await page.waitForURL((url) => url.pathname === "/manage", { timeout: 5000 });
    await page.locator(".account-topbar__identity").waitFor({ state: "visible", timeout: 2500 });
    assert.match(await page.title(), /Priestess Account Center/);
    assert.equal(await page.locator(".priestess-language-switcher select").inputValue(), "en-US");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".account-topbar__identity").waitFor({ state: "visible", timeout: 5000 });
    assert.match(await page.title(), /Priestess Account Center/);
    assert.equal(await page.locator(".priestess-language-switcher select").inputValue(), "en-US");
    assert.doesNotMatch(await page.locator("body").innerText(), /正在加载|正在登录|退出中/);
  }, { locale: "en-US", reducedMotion: "reduce", viewport: { height: 900, width: 1440 } });
}

async function testAccountHandoffTimeoutCanRetry({
  appUrl,
  browserInstance,
  createScenario,
  submitPassword,
  withScenario,
}) {
  const scenario = createScenario("handoff-timeout");

  await withScenario(browserInstance, scenario, async(page) => {
    let accountModuleRequests = 0;
    await page.route("**/src/components/AccountPage.tsx*", async(route) => {
      accountModuleRequests += 1;
      if (accountModuleRequests === 1) {
        await new Promise((resolve) => setTimeout(resolve, 11_000));
      }
      await route.continue();
    });

    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible" });
    const sessionReadsBeforeLogin = scenario.records.sessionReads;
    await submitPassword(page, "timeout-user");
    await page.locator(".login-success-overlay.is-success").waitFor({ state: "visible", timeout: 5000 });

    const handoffError = page.locator(".account-route-handoff-error");
    await handoffError.waitFor({ state: "visible", timeout: 13_000 });
    assert.equal(new URL(page.url()).pathname, "/login", "handoff timeout must keep the authenticated user on the login URL");
    assert.match(await handoffError.innerText(), /个人中心准备超时/);
    assert.equal(await page.locator(".login-success-overlay.is-failure").count(), 0, "target loading errors must not be reported as sign-in failures");

    await handoffError.getByRole("button", { name: "重试" }).click();
    await page.waitForURL((url) => url.pathname === "/manage", { timeout: 5000 });
    await page.locator(".account-topbar__identity").waitFor({ state: "visible", timeout: 2500 });
    assert.equal(scenario.records.sessionReads, sessionReadsBeforeLogin);
    assert.equal(await page.locator(".account-shell").count(), 1);
  }, { reducedMotion: "reduce", viewport: { height: 900, width: 1440 } });
}
