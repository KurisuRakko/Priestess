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
  await testAccountMenuAvatarFlight({ appUrl, browserInstance, createScenario, withScenario });
  await testLoginHandoffAvatarVisibility({ appUrl, browserInstance, createScenario, submitPassword, withScenario });
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
    // 登录过场探针：只测量不修。这一条是减动效路径，共享头像元素根本不会创建，数字本身就是结论。
    await startAvatarFlightFrameProbe(page, "handoff-reduced", HANDOFF_FLIGHT_SELECTORS);
    await submitPassword(page, "language-user");
    const successOverlay = page.locator(".login-success-overlay.is-success");
    await successOverlay.waitFor({ state: "visible", timeout: 5000 });
    assert.match(await successOverlay.innerText(), /Signed in successfully/);
    await page.waitForURL((url) => url.pathname === "/manage", { timeout: 5000 });
    await page.locator(".account-topbar__identity").waitFor({ state: "visible", timeout: 2500 });
    const reducedHandoffProbe = summarizeHandoffFlight(await finishAvatarFlightFrameProbe(page, "handoff-reduced"));
    console.log(`HANDOFF AVATAR PROBE (reduced motion): ${JSON.stringify(reducedHandoffProbe)}`);
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

// 账号菜单头像飞行：开、关两个方向都断言飞行全程不被任何祖先的 overflow 裁掉。
// 飞行用 transform 把头像挪到另一个容器位置，容器上的 overflow 会按原位裁剪，所以可见比例是这件事唯一的证据。
// 关闭方向按 perSelector 分别断言可见比例，并断言顶栏那张确实是从卡片槽飞回顶栏；
// minOpacity 故意不断言：motion 对同 layoutId 的兄弟做交叉淡入时两张都会经过 0，同一帧里合成后始终可见。
async function testAccountMenuAvatarFlight({
  appUrl,
  browserInstance,
  createScenario,
  withScenario,
}) {
  const scenario = createScenario("account-menu-avatar-flight");
  scenario.authenticated = true;

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/manage`, { waitUntil: "domcontentloaded" });
    const identity = page.locator(".account-topbar__identity");
    const menuBackdrop = page.locator(".account-dialog-backdrop");
    await identity.waitFor({ state: "visible", timeout: 5000 });

    // 打开方向：头像从顶栏飞进菜单卡片。
    await startAvatarFlightFrameProbe(page, "menu-open", MENU_FLIGHT_SELECTORS);
    await identity.click();
    await menuBackdrop.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(450);

    const openProbe = summarizeMenuFlight(await finishAvatarFlightFrameProbe(page, "menu-open"));
    console.log(`MENU OPEN PROBE: ${JSON.stringify(openProbe)}`);
    const openAvatar = openProbe.perSelector[".account-menu-dialog__avatar"];
    assert.ok(openAvatar, `the menu-open flight must be sampled on the menu avatar: ${JSON.stringify(openProbe)}`);
    assert.ok(
      openProbe.frameCount >= 3,
      `the avatar flight must provide a measurable frame sequence: ${JSON.stringify(openProbe)}`,
    );
    assert.ok(
      openAvatar.minVisibleRatio >= 0.99,
      `the flying avatar must never be clipped by an ancestor while the menu opens: ${JSON.stringify({
        minVisibleRatio: openAvatar.minVisibleRatio,
        worstFrame: openProbe.worstFrame,
      })}`,
    );
    assert.ok(
      openAvatar.minOpacity > 0,
      `the flying avatar must never render a fully transparent frame: ${JSON.stringify(openProbe)}`,
    );

    const topbarCenter = await readElementCenter(page, ".account-topbar__avatar");
    const slotCenter = await readElementCenter(page, ".account-menu-dialog__avatar-slot");
    // 关闭方向要用卡片槽和顶栏的矩形判定起止；弹窗关闭后会卸载，必须在还开着的时候量好。
    const slotRect = await readElementRect(page, ".account-menu-dialog__avatar-slot");
    const departureDistance = rectDistance(openAvatar.firstRect, topbarCenter);
    const arrivalDistance = rectDistance(openAvatar.lastRect, slotCenter);
    assert.ok(
      departureDistance < 40,
      `the flight must start on the topbar avatar: ${JSON.stringify({ departureDistance, firstRect: openAvatar.firstRect, topbarCenter })}`,
    );
    assert.ok(
      arrivalDistance < 4,
      `the flight must settle inside the menu avatar slot: ${JSON.stringify({ arrivalDistance, lastRect: openAvatar.lastRect, slotCenter })}`,
    );

    // 关闭方向：头像从菜单卡片飞回顶栏。
    await startAvatarFlightFrameProbe(page, "menu-close", MENU_FLIGHT_SELECTORS);
    await page.keyboard.press("Escape");
    await menuBackdrop.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForTimeout(450);

    const closeProbe = summarizeMenuFlight(await finishAvatarFlightFrameProbe(page, "menu-close"));
    console.log(`MENU CLOSE PROBE: ${JSON.stringify(closeProbe)}`);
    assert.ok(
      closeProbe.frameCount >= 3,
      `the return flight must provide a measurable frame sequence: ${JSON.stringify(closeProbe)}`,
    );
    // 交叉淡入必须真的发生过：同一 layoutId 的两张图并存至少一帧，证据就是候选数为 2 的帧。
    assert.ok(
      (closeProbe.candidateCountHistogram["2"] || 0) >= 1,
      `the return flight must show both same-layoutId avatars at once: ${JSON.stringify(closeProbe)}`,
    );
    for (const selector of MENU_FLIGHT_SELECTORS) {
      const group = closeProbe.perSelector[selector];
      assert.ok(group, `${selector} must be sampled during the return flight: ${JSON.stringify(closeProbe)}`);
      assert.ok(
        group.minVisibleRatio >= 0.99,
        `${selector} must never be clipped by an ancestor while the menu closes: ${JSON.stringify({
          minVisibleRatio: group.minVisibleRatio,
          worstFrame: group.worstFrame,
        })}`,
      );
    }

    // 顶栏那张必须是「从卡片槽飞回顶栏」，而不是原地出现。起点看该 selector 最早 5 帧里有没有一帧落在卡片槽内：
    // 慢机上探针可能晚一帧才采到 motion 应用 projection 的状态，只看首帧会随机翻红。终点没有这个竞态，仍然只认最后一帧。
    const returnAvatar = closeProbe.perSelector[".account-topbar__avatar img"];
    const topbarAvatarRect = await readElementRect(page, ".account-topbar__avatar");
    const startedInSlot = (returnAvatar?.firstRects || [])
      .some((rect) => rectContainsPoint(slotRect, rectCenter(rect), 4));
    assert.ok(
      startedInSlot,
      `the return flight must start inside the menu avatar slot: ${JSON.stringify({ firstRects: returnAvatar?.firstRects, slotRect })}`,
    );
    assert.ok(
      rectContainsPoint(topbarAvatarRect, rectCenter(returnAvatar?.lastRect), 4),
      `the return flight must end inside the topbar avatar: ${JSON.stringify({ lastRect: returnAvatar?.lastRect, topbarAvatarRect })}`,
    );
  }, { reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
}

// 登录过场头像（.account-route-handoff-avatar，由 accountRouteTransfer 动态挂到 body 上）全程可见比例与遮挡测量。
// 只打日志、不做断言：登录过场这一轮不改行为，这组数字是留给后续决策的证据。
async function testLoginHandoffAvatarVisibility({
  appUrl,
  browserInstance,
  createScenario,
  submitPassword,
  withScenario,
}) {
  const scenario = createScenario("handoff-avatar-visibility");

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible", timeout: 5000 });

    await startAvatarFlightFrameProbe(page, "handoff-motion", HANDOFF_FLIGHT_SELECTORS);
    await submitPassword(page, "handoff-avatar-user");
    await page.locator(".login-success-overlay.is-success").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForURL((url) => url.pathname === "/manage", { timeout: 8000 });
    await page.locator(".account-topbar__identity").waitFor({ state: "visible", timeout: 2500 });
    await page.waitForTimeout(450);

    const handoffProbe = summarizeHandoffFlight(await finishAvatarFlightFrameProbe(page, "handoff-motion"));
    console.log(`HANDOFF AVATAR PROBE: ${JSON.stringify(handoffProbe)}`);
  }, { locale: "zh-CN", reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
}

// 菜单飞行的候选集合：开菜单时飞的是卡片里那张，关菜单时飞的是顶栏里那张。
// 退场过渡期间两张带同一 layoutId 的图可能同时在 DOM 里，所以每帧采整个候选集合，而不是只取第一个命中的元素 ——
// 只取一个的话，关闭阶段可能一直采到静止的那张，可见比例恒为 1，断言实际上没在测飞行。
const MENU_FLIGHT_SELECTORS = [".account-menu-dialog__avatar", ".account-topbar__avatar img"];
const HANDOFF_FLIGHT_SELECTORS = [".account-route-handoff-avatar"];

/**
 * 挂一个 rAF 采样器，逐帧把候选集合整体采下来，一帧一个元素都不丢。
 * 每个候选记录：命中的 selector、矩形、自身 opacity、被祖先裁剪后的可见比例，以及中心点上真正被命中的元素（遮挡检测）。
 */
async function startAvatarFlightFrameProbe(page, key, selectors) {
  await page.evaluate(([probeKey, candidateSelectors]) => {
    const probe = { frames: [], running: true };
    window[probeKey] = probe;

    const describeClipper = (ancestor) => {
      const rect = ancestor.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        className: ancestor.getAttribute("class") || "",
        left: rect.left,
        right: rect.right,
        top: rect.top,
      };
    };

    // 遮挡检测：pointer-events: none 的元素（如 .account-route-handoff-avatar）永远不在命中链里，
    // 祖先也永远排在自身之后，所以临时放开 pointer-events 取命中链，再只看「排在自身之前且不是后代」的元素。
    const describeOccluder = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const previousPointerEvents = element.style.pointerEvents;
      element.style.pointerEvents = "auto";
      const hits = document.elementsFromPoint(centerX, centerY);
      element.style.pointerEvents = previousPointerEvents;
      const selfIndex = hits.indexOf(element);
      if (selfIndex < 0) return { className: "<not-in-hit-list>", tagName: "" };
      for (let index = 0; index < selfIndex; index += 1) {
        const candidate = hits[index];
        if (!element.contains(candidate)) {
          return { className: String(candidate.className || ""), tagName: candidate.tagName };
        }
      }
      return null;
    };

    const measure = (element, selector) => {
      const rect = element.getBoundingClientRect();
      const candidate = {
        occludedBy: describeOccluder(element),
        opacity: Number.parseFloat(getComputedStyle(element).opacity),
        rect: { height: rect.height, width: rect.width, x: rect.left, y: rect.top },
        selector,
        visibleRatio: 1,
        worstClipper: null,
        zeroArea: false,
      };
      const ownArea = rect.width * rect.height;
      if (!(ownArea > 0)) {
        // 尺寸为 0 的候选无法算比例，记 1 并单独计数，避免被当成裁剪证据。
        candidate.zeroArea = true;
        return candidate;
      }
      // 从元素自身向上遍历到 body：overflow 不是 visible 的祖先就是潜在裁剪者，把所有交集依次相交。
      let visible = { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top };
      let visibleArea = ownArea;
      let ancestor = element.parentElement;
      while (ancestor) {
        if (getComputedStyle(ancestor).overflow !== "visible") {
          const ancestorRect = ancestor.getBoundingClientRect();
          visible = {
            bottom: Math.min(visible.bottom, ancestorRect.bottom),
            left: Math.max(visible.left, ancestorRect.left),
            right: Math.min(visible.right, ancestorRect.right),
            top: Math.max(visible.top, ancestorRect.top),
          };
          const intersectionArea = Math.max(0, visible.right - visible.left)
            * Math.max(0, visible.bottom - visible.top);
          if (intersectionArea < visibleArea) {
            visibleArea = intersectionArea;
            candidate.worstClipper = describeClipper(ancestor);
          }
        }
        if (ancestor === document.body) break;
        ancestor = ancestor.parentElement;
      }
      candidate.visibleRatio = Math.min(1, Math.max(0, visibleArea / ownArea));
      return candidate;
    };

    const sample = () => {
      if (!probe.running) return;
      const candidates = [];
      for (const selector of candidateSelectors) {
        for (const element of document.querySelectorAll(selector)) {
          if (element instanceof HTMLElement) candidates.push(measure(element, selector));
        }
      }
      probe.frames.push({ candidates });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, [`__priestessAvatarFlightProbe_${key}`, selectors]);
}

/** 停掉采样器并把原始帧取回来；帧结构是 { candidates: [...] }，统计放在 Node 侧，页面里只做测量。 */
async function finishAvatarFlightFrameProbe(page, key) {
  return page.evaluate((probeKey) => {
    const probe = window[probeKey];
    if (!probe) return null;
    probe.running = false;
    delete window[probeKey];
    return probe.frames;
  }, `__priestessAvatarFlightProbe_${key}`);
}

/**
 * 菜单飞行的统计。
 * frameCount 只数「至少有一个候选」的帧，也就是真的看见头像的帧；sampledFrameCount 是采样总帧数。
 * candidateCountHistogram 用来回答「关闭期间会不会同时存在两张带同一 layoutId 的图」。
 * perSelector 按 selector 分组，每组给出：firstRects（最早 5 帧的矩形，用来避免只看首帧的竞态）、
 * firstRect / lastRect、occludedFrameCount（被别的元素盖住的帧数）、minOpacity、minVisibleRatio、
 * worstFrame（该 selector 可见比例最低的那一帧的完整候选数组）。
 * 顶层 worstFrame 是全体候选里可见比例最低的那一帧，同样是完整候选数组。
 */
function summarizeMenuFlight(frames) {
  const candidateCountHistogram = {};
  const perSelector = {};
  let frameCount = 0;
  let worstCandidate = null;
  let worstFrame = null;

  for (const frame of frames || []) {
    const candidates = frame.candidates || [];
    if (candidates.length > 0) frameCount += 1;
    candidateCountHistogram[String(candidates.length)] = (candidateCountHistogram[String(candidates.length)] || 0) + 1;
    for (const candidate of candidates) {
      const group = perSelector[candidate.selector] || (perSelector[candidate.selector] = {
        firstRect: candidate.rect,
        firstRects: [],
        lastRect: candidate.rect,
        minOpacity: candidate.opacity,
        minVisibleRatio: candidate.visibleRatio,
        occludedFrameCount: 0,
        worstFrame: null,
      });
      if (group.firstRects.length < 5) group.firstRects.push(candidate.rect);
      group.lastRect = candidate.rect;
      group.minOpacity = Math.min(group.minOpacity, candidate.opacity);
      if (group.worstFrame === null || candidate.visibleRatio < group.minVisibleRatio) {
        group.minVisibleRatio = candidate.visibleRatio;
        group.worstFrame = frame.candidates;
      }
      if (candidate.occludedBy) group.occludedFrameCount += 1;
      if (!worstCandidate || candidate.visibleRatio < worstCandidate.visibleRatio) {
        worstCandidate = candidate;
        worstFrame = frame;
      }
    }
  }

  return {
    candidateCountHistogram,
    frameCount,
    perSelector,
    sampledFrameCount: (frames || []).length,
    worstFrame: worstFrame ? worstFrame.candidates : null,
  };
}

/** 登录过场只有一张头像：汇总成单元素视角的字段 + 遮挡统计（occludedFrameCount / firstOccludedFrame）。 */
function summarizeHandoffFlight(frames) {
  const candidates = [];
  for (const frame of frames || []) {
    for (const candidate of frame.candidates || []) candidates.push(candidate);
  }

  const summary = {
    firstFrame: candidates[0] || null,
    firstOccludedFrame: null,
    frameCount: candidates.length,
    lastFrame: candidates[candidates.length - 1] || null,
    minOpacity: null,
    minVisibleRatio: null,
    occludedFrameCount: 0,
    worstFrame: null,
    zeroAreaFrameCount: 0,
  };

  for (const candidate of candidates) {
    if (candidate.zeroArea) summary.zeroAreaFrameCount += 1;
    if (candidate.occludedBy) {
      summary.occludedFrameCount += 1;
      if (!summary.firstOccludedFrame) summary.firstOccludedFrame = candidate;
    }
    if (summary.minVisibleRatio === null || candidate.visibleRatio < summary.minVisibleRatio) {
      summary.minVisibleRatio = candidate.visibleRatio;
      summary.worstFrame = candidate;
    }
    summary.minOpacity = summary.minOpacity === null
      ? candidate.opacity
      : Math.min(summary.minOpacity, candidate.opacity);
  }

  return summary;
}

async function readElementCenter(page, selector) {
  return page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
}

async function readElementRect(page, selector) {
  return page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    return { height: rect.height, width: rect.width, x: rect.left, y: rect.top };
  }, selector);
}

function rectCenter(rect) {
  return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
}

/** 点是否落在矩形内（带容差）；缺数据返回 false，让断言直接失败而不是静默跳过。 */
function rectContainsPoint(rect, point, tolerance) {
  if (!rect || !point) return false;
  return point.x >= rect.x - tolerance
    && point.x <= rect.x + rect.width + tolerance
    && point.y >= rect.y - tolerance
    && point.y <= rect.y + rect.height + tolerance;
}

/** 矩形中心到给定点的距离；缺数据时返回 Infinity，让起点/落点断言直接失败而不是静默跳过。 */
function rectDistance(rect, center) {
  if (!rect || !center) return Number.POSITIVE_INFINITY;
  return Math.hypot(rect.x + rect.width / 2 - center.x, rect.y + rect.height / 2 - center.y);
}
