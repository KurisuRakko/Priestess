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
  await testManageDeviceRefreshKeepsList({ appUrl, browserInstance, createScenario, withScenario });
  await testManageHeaderAndFlowSignOut({ appUrl, browserInstance, createScenario, withScenario });
}

async function testManageDeviceRefreshKeepsList({
  appUrl,
  browserInstance,
  createScenario,
  withScenario,
}) {
  const scenario = createScenario("manage-device-refresh");
  scenario.authenticated = true;

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/manage`, { waitUntil: "domcontentloaded" });
    const devicesTab = page.locator(".account-nav").getByRole("button", { name: "设备" });
    await devicesTab.waitFor({ state: "visible", timeout: 5000 });
    await devicesTab.click();

    const deviceList = page.locator(".account-device-list");
    // 共享请求已不再绑定单个调用方的 signal，StrictMode 重挂载不会再让首屏落到错误态：首屏必须直接出列表。
    await deviceList.waitFor({ state: "visible", timeout: 5000 });
    const cardsBefore = await page.locator(".account-device-card").count();
    assert.ok(cardsBefore > 0, "device list must render at least one card before refreshing");

    // 后台刷新期间列表必须一直挂在 DOM 上，只有头部指示器进入 active。
    scenario.deviceSessionsDelayMs = 700;
    await page.locator(".account-device-panel__header").getByRole("button", { name: "刷新" }).click();

    const indicator = page.locator('.account-refresh-indicator[data-active="true"]');
    await indicator.waitFor({ state: "attached", timeout: 5000 });
    assert.equal(await deviceList.isVisible(), true, "refreshing must not unmount the device list");
    assert.equal(await page.locator(".account-device-card").count(), cardsBefore);
    assert.equal(await page.locator(".account-skeleton-list").count(), 0, "skeleton is first-load only");

    await page.locator('.account-refresh-indicator[data-active="false"]').waitFor({ state: "attached", timeout: 5000 });
    assert.equal(await deviceList.isVisible(), true);
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

      // 页脚登出已经并入头像菜单：菜单没打开时，页面上不该还留着旧的页脚入口。
      assert.equal(await page.locator(".account-page__signout").count(), 0);
      assert.equal(await page.locator(".account-menu-dialog").count(), 0);

      await currentAccount.click();
      const menuBackdrop = page.locator(".account-dialog-backdrop");
      await menuBackdrop.waitFor({ state: "visible", timeout: 5000 });
      const accountMenu = page.locator(".account-menu-dialog");
      const menuItems = accountMenu.locator(".account-menu-item");
      const signOutButton = accountMenu.locator(".account-menu-item--danger");

      assert.equal(await accountMenu.locator(".account-menu-dialog__avatar").count(), 1);
      assert.equal(await menuItems.count(), 2);
      assert.match(await menuItems.nth(0).innerText(), /切换账号|Switch account/);
      assert.match(await menuItems.nth(1).innerText(), /退出|Sign out/);

      const menuGeometry = await accountMenu.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const avatar = element.querySelector(".account-menu-dialog__avatar-slot")?.getBoundingClientRect();
        const name = element.querySelector(".account-menu-dialog__name")?.getBoundingClientRect();
        return {
          avatarAboveName: Boolean(avatar && name && avatar.bottom <= name.top + 1),
          avatarCenter: avatar ? avatar.left + avatar.width / 2 : 0,
          cardCenter: card.left + card.width / 2,
          cardInsideViewport: card.left >= 0 && card.right <= window.innerWidth,
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        };
      });
      assert.equal(menuGeometry.cardInsideViewport, true);
      assert.equal(menuGeometry.noHorizontalOverflow, true);
      assert.equal(menuGeometry.avatarAboveName, true);
      assert.ok(
        Math.abs(menuGeometry.avatarCenter - menuGeometry.cardCenter) <= 2,
        `avatar must sit centred at the top of the menu card: ${JSON.stringify(menuGeometry)}`,
      );

      if (viewport.width <= 390) {
        const itemsWidth = await accountMenu.locator(".account-menu-dialog__items").evaluate((element) => element.clientWidth);
        const itemWidth = await signOutButton.evaluate((element) => element.getBoundingClientRect().width);
        assert.ok(Math.abs(itemsWidth - itemWidth) < 2, "mobile menu items should fill the available width");
      }

      await page.keyboard.press("Escape");
      await menuBackdrop.waitFor({ state: "detached", timeout: 5000 });
      assert.equal(await accountMenu.count(), 0);

      if (index === viewports.length - 1) {
        scenario.logoutError = true;
        await currentAccount.click();
        await menuBackdrop.waitFor({ state: "visible", timeout: 5000 });
        await signOutButton.click();
        const failureNotice = page.locator(".toast");
        await failureNotice.waitFor({ state: "visible", timeout: 2500 });
        assert.match(await failureNotice.innerText(), /账户服务|退出/);
        assert.equal(new URL(page.url()).pathname, "/manage");
        // 登出失败不关菜单，用户可以直接重试。
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
        await new Promise((resolve) => setTimeout(resolve, 5_000));
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
