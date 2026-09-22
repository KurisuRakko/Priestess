import assert from "node:assert/strict";

// 透明结果层的不变量：结果层与登录卡片共用同一块矩形且没有自己的背景，
// 只要 .login-success-overlay.has-origin 还挂在 DOM 上，底层卡片就必须保持提交态留白。
// 本文件专门覆盖「结果层仍在场时 SPA 路由切走再切回并带上新的 return_to」这条路径：
// 路由往返会让卡片重挂载并切回账号选择器，此时结果层若失去卡片留白就会两层文字穿透。
export async function runLoginOverlayRouteReturnBrowserCases({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  buildAuthUrl,
  createScenario,
  submitPassword,
  withScenario,
}) {
  await testRouteReturnDuringFailureHoldKeepsCardYielded({
    appUrl,
    assertControlCanReceivePointer,
    browserInstance,
    buildAuthUrl,
    createScenario,
    submitPassword,
    withScenario,
  });
}

async function testRouteReturnDuringFailureHoldKeepsCardYielded({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  buildAuthUrl,
  createScenario,
  submitPassword,
  withScenario,
}) {
  // 先用空账号列表落到登录表单，才能提交一次失败的密码登录拿到透明结果层；
  // 停留期里把账号列表切成有已保存账号，模拟新的 return_to 回来后卡片切回账号选择器。
  const scenario = createScenario("route-return-failure-hold", {
    accountModeBeforeAuth: "empty",
    loginError: true,
  });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible", timeout: 8000 });
    await page.waitForSelector('.login-card[data-login-card-settled="true"]', { timeout: 8000 });
    await submitPassword(page, "route-return-user");

    const failureOverlay = page.locator(".login-success-overlay.is-failure");
    await failureOverlay.waitFor({ state: "visible", timeout: 5000 });
    // 前提：进入停留期时结果层是透明模式，白底完全由底层提交态卡片顶着。
    assert.ok(
      (await failureOverlay.getAttribute("class") || "").includes("has-origin"),
      "the failure result must run in transparent origin mode",
    );
    assert.equal(await page.locator(".login-card--submit-stage-fade").count(), 1, "the failure hold must start from a yielded card");
    assert.equal(await readCardContentOpacity(page), "0", "the failure hold must start from an invisible card content");

    // SPA 路由往返：切走再切回，并带上新的 return_to，全程不刷新页面。
    scenario.accountModeBeforeAuth = "single";
    const nextReturnTo = `${appUrl}/client-callback-secondary`;
    await page.evaluate((awayPath) => {
      window.history.pushState(null, "", awayPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, "/qr-login?session_id=route-return-probe");
    await page.waitForSelector(".login-card", { state: "detached", timeout: 2000 });
    await page.evaluate((backPath) => {
      window.history.pushState(null, "", backPath);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/login?app_id=${scenario.appId}&return_to=${encodeURIComponent(nextReturnTo)}`);

    // 卡片重挂载后，内容必须是账号选择器：这正是生产截图里被结果层穿透的坏画面。
    const pickerRow = page.locator(".account-picker__row-main").first();
    await pickerRow.waitFor({ state: "attached", timeout: 2500 });

    assert.equal(await failureOverlay.count(), 1, "the transparent result layer must still be mounted after the route round trip");
    // 与结果层同帧读取卡片内容容器：既要是账号选择器，又必须保持留白。
    const yieldedState = await readCardContentState(page);
    assert.equal(
      yieldedState.opacity,
      "0",
      `the card content must stay invisible while the transparent result layer is still mounted: ${JSON.stringify(yieldedState)}`,
    );
    assert.ok(
      yieldedState.pickerRowCount > 0,
      `the account picker must be the card content covered by this assertion: ${JSON.stringify(yieldedState)}`,
    );
    assert.equal(await page.locator(".login-card--submit-stage-fade").count(), 1, "the card must stay yielded while the transparent result layer is still mounted");

    // 结果层卸载后卡片必须真的恢复，不能永久停在空白态。
    await failureOverlay.waitFor({ state: "detached", timeout: 6000 });
    await page.waitForSelector(".login-card--submit-stage", { state: "detached", timeout: 2000 });
    const restoredState = await readCardContentState(page);
    assert.equal(
      restoredState.opacity,
      "1",
      `the card content must come back after the result layer unmounts: ${JSON.stringify(restoredState)}`,
    );
    assert.ok(
      restoredState.pickerRowCount > 0,
      `the account picker must be visible again after the result layer unmounts: ${JSON.stringify(restoredState)}`,
    );
    assert.equal(await page.locator(".auth-card-viewport").evaluate((element) => element.inert), false, "the card viewport must be interactive again");
    await pickerRow.waitFor({ state: "visible", timeout: 2000 });
    assert.equal(await pickerRow.isEnabled(), true, "the account picker must be usable again after the result layer unmounts");
    await assertControlCanReceivePointer(page, pickerRow, "account picker row after the result layer exits");
  }, { locale: "en-US", reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
}

async function readCardContentOpacity(page) {
  return page.locator(".auth-card-content").evaluate((element) => getComputedStyle(element).opacity);
}

// 卡片内容容器与它当时承载的内容必须同帧读取，避免两次求值之间状态漂移。
async function readCardContentState(page) {
  return page.locator(".auth-card-content").evaluate((element) => ({
    opacity: getComputedStyle(element).opacity,
    pickerRowCount: element.querySelectorAll(".account-picker__row-main").length,
    pickerRowText: (element.querySelector(".account-picker__row-main")?.textContent || "").trim().slice(0, 80),
  }));
}
