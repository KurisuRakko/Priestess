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
  await testManageLoadingCopyRetires({ appUrl, browserInstance, createScenario, withScenario });
  await testManageHeaderAndFlowSignOut({ appUrl, browserInstance, createScenario, withScenario });
}

async function testManageLoadingCopyRetires({
  appUrl,
  browserInstance,
  createScenario,
  withScenario,
}) {
  const scenario = createScenario("manage-loading-copy");
  scenario.authenticated = true;

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/manage`, { waitUntil: "domcontentloaded" });
    const devicesTab = page.locator(".account-nav").getByRole("button", { name: "设备" });
    await devicesTab.waitFor({ state: "visible", timeout: 5000 });
    await devicesTab.click();
    const deviceList = page.locator(".account-device-list");
    await page.locator(".account-device-list, .account-inline-alert").first().waitFor({ state: "visible", timeout: 5000 });

    // 首次 effect 在开发态可能被 StrictMode 的校验重挂载取消；从用户主动刷新触发稳定的 loading → content 交接。
    scenario.deviceSessionsDelayMs = 700;
    await page.locator(".account-device-panel__header").getByRole("button", { name: "刷新" }).click();
    const loadingCopy = page.locator(".account-inline-loading");
    await loadingCopy.waitFor({ state: "visible", timeout: 5000 });
    await deviceList.waitFor({ state: "visible", timeout: 5000 });

    const exitingLoadingCopy = page.locator('.account-inline-loading[data-account-motion-presence="exiting"]');
    await exitingLoadingCopy.waitFor({ state: "attached", timeout: 1000 });
    assert.equal(await exitingLoadingCopy.getAttribute("aria-hidden"), "true");
    assert.equal(await exitingLoadingCopy.evaluate((element) => element.inert), true);
    assert.equal(
      await exitingLoadingCopy.evaluate((element) => getComputedStyle(element).visibility),
      "hidden",
      "resolved Manage data must not retain loading copy over the device list",
    );
    await loadingCopy.waitFor({ state: "detached", timeout: 1500 });
  }, { reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
}

async function testManageHeaderAndFlowSignOut({
  appUrl,
  browserInstance,
  createScenario,
  withScenario,
}) {
  const viewports = [
    { height: 900, name: "desktop", width: 1440 },
    { height: 844, name: "mobile-390", width: 390 },
    { height: 667, name: "mobile-375", width: 375 },
  ];

  for (const [index, viewport] of viewports.entries()) {
    const scenario = createScenario(`manage-layout-${viewport.name}`);
    scenario.authenticated = true;

    await withScenario(browserInstance, scenario, async(page) => {
      await page.goto(`${appUrl}/manage`, { waitUntil: "domcontentloaded" });
      const topbar = page.locator(".account-topbar");
      const leading = topbar.locator(".account-topbar__leading");
      const currentAccount = topbar.locator(".account-topbar__identity");
      const footer = page.locator(".account-page__signout");
      const signOutButton = footer.locator(".account-button--danger");
      await currentAccount.waitFor({ state: "visible", timeout: 5000 });

      assert.equal(await leading.locator(".brand-mark").count(), 1);
      assert.equal(await leading.locator(".priestess-language-switcher").count(), 1);
      assert.equal(await currentAccount.locator(":scope > .account-topbar__avatar").count(), 1);
      assert.equal(await currentAccount.locator(":scope > *").count(), 1, "top-right account control should contain only the avatar");
      assert.doesNotMatch(
        await topbar.innerText(),
        new RegExp(`User ${scenario.appId}|${scenario.appId}@example\\.com|退出|Sign out`),
      );
      assert.equal(await topbar.locator(".account-button--danger").count(), 0);

      const headerGeometry = await topbar.evaluate((element) => {
        const left = element.querySelector(".account-topbar__leading")?.getBoundingClientRect();
        const right = element.querySelector(".account-topbar__identity")?.getBoundingClientRect();
        return {
          avatarInsideViewport: Boolean(right && right.left >= 0 && right.right <= window.innerWidth),
          avatarSize: right?.width || 0,
          leftCenter: left ? left.left + left.width / 2 : 0,
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
          rightCenter: right ? right.left + right.width / 2 : 0,
        };
      });
      assert.equal(headerGeometry.avatarInsideViewport, true);
      assert.ok(headerGeometry.avatarSize >= 44);
      assert.ok(headerGeometry.leftCenter < headerGeometry.rightCenter);
      assert.equal(headerGeometry.noHorizontalOverflow, true);

      const flowMetrics = await footer.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          documentGap: document.documentElement.scrollHeight - (rect.bottom + window.scrollY),
          initialTop: rect.top,
          position: getComputedStyle(element).position,
          viewportHeight: window.innerHeight,
        };
      });
      assert.equal(flowMetrics.position, "static");
      assert.ok(
        flowMetrics.initialTop >= flowMetrics.viewportHeight,
        `sign-out must begin below the initial ${viewport.name} viewport: ${JSON.stringify(flowMetrics)}`,
      );
      assert.ok(flowMetrics.documentGap >= 0 && flowMetrics.documentGap <= 64);

      await signOutButton.scrollIntoViewIfNeeded();
      await signOutButton.waitFor({ state: "visible" });
      if (viewport.width <= 390) {
        const footerWidth = await footer.evaluate((element) => element.clientWidth);
        const buttonWidth = await signOutButton.evaluate((element) => element.getBoundingClientRect().width);
        assert.ok(Math.abs(footerWidth - buttonWidth) < 2, "mobile sign-out button should fill the available width");
      }

      if (index === viewports.length - 1) {
        scenario.logoutError = true;
        await signOutButton.click();
        const failureNotice = page.locator(".toast");
        await failureNotice.waitFor({ state: "visible", timeout: 2500 });
        assert.match(await failureNotice.innerText(), /账户服务|退出/);
        assert.equal(new URL(page.url()).pathname, "/manage");
        assert.equal(await signOutButton.isEnabled(), true);

        scenario.logoutError = false;
        await signOutButton.click();
        await page.waitForURL((url) => url.pathname === "/login", { timeout: 5000 });
        assert.equal(scenario.records.logouts, 2);
      }
    }, {
      reducedMotion: "reduce",
      viewport: { height: viewport.height, width: viewport.width },
    });
  }
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
