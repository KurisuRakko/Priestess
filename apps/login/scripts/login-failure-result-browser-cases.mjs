import assert from "node:assert/strict";

export async function runLoginFailureResultBrowserCases({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  buildAuthUrl,
  createScenario,
  submitPassword,
  withScenario,
}) {
  await testLoginFailureKeepsFormYielded({
    appUrl,
    assertControlCanReceivePointer,
    browserInstance,
    createScenario,
    submitPassword,
    withScenario,
  });
  await testAuthorizationLoginFailureKeepsCardPinned({
    appUrl,
    assertControlCanReceivePointer,
    browserInstance,
    buildAuthUrl,
    createScenario,
    submitPassword,
    withScenario,
  });
  await testReducedMotionLoginFailureKeepsFormYielded({
    appUrl,
    assertControlCanReceivePointer,
    browserInstance,
    createScenario,
    submitPassword,
    withScenario,
  });
}

async function testLoginFailureKeepsFormYielded({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  createScenario,
  submitPassword,
  withScenario,
}) {
  const scenario = createScenario("login-failure-hold", { loginError: true });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-login-card-entry="ready"]');
    await startFailureYieldProbe(page, "login-failure-hold");
    await submitPassword(page, "failure-user");

    const failureOverlay = page.locator(".login-success-overlay.is-failure");
    await failureOverlay.waitFor({ state: "visible", timeout: 5000 });
    // 保留原「失败态不泄露身份」断言。
    assert.equal(await failureOverlay.locator("[data-login-identity-avatar]").count(), 0, "failed credentials must not reveal an avatar");
    assert.equal(await failureOverlay.locator("[data-login-identity-name]").count(), 0, "failed credentials must not reveal a name");

    await page.waitForTimeout(2000);
    assert.equal(await page.locator(".login-card--submit-stage-fade").count(), 1, "the yielded form must stay hidden through the failure hold");
    assert.equal(await page.locator(".auth-card-content").evaluate((element) => getComputedStyle(element).opacity), "0");
    assert.equal(await page.locator(".auth-card-viewport").evaluate((element) => element.inert), true);
    assert.equal(await failureOverlay.count(), 1, "failure result should remain visible long enough to read");
    assert.match(await failureOverlay.innerText(), /Sign-in failed/);
    assert.match(await failureOverlay.innerText(), /用户名或密码错误/);

    await failureOverlay.waitFor({ state: "detached", timeout: 3000 });
    const stats = await finishFailureYieldProbe(page, "login-failure-hold");
    assert.ok(stats, "failure yield probe must be recorded");
    assert.equal(stats.failureCollisionFrameCount, 0, `form must not overlap the failure result during the hold: ${JSON.stringify(stats)}`);
    assert.equal(stats.unyieldedFadeClassFrameCount, 0, `the form must stay yielded until the result layer exits: ${JSON.stringify(stats)}`);
    assert.equal(stats.blankCardFrameCount, 0, `the card must never be empty while the failure result overlay is live: ${JSON.stringify(stats)}`);
    assert.ok(stats.formCrossfadeFrameCount >= 3, `the form should fade back through its 180ms transition while the result exits: ${JSON.stringify(stats)}`);

    await page.waitForSelector(".login-card--submit-stage", { state: "detached", timeout: 2000 });
    assert.equal(await page.locator(".login-card--submit-stage").count(), 0, "submit stage classes must be released after the result layer unmounts");
    assert.equal(await page.locator(".auth-card-viewport").evaluate((element) => element.inert), false);
    assert.equal(await page.locator(".login-form .primary-button[type='submit']").isEnabled(), true);
    await assertControlCanReceivePointer(page, page.locator("input[autocomplete='username']"), "username input");
  }, { locale: "en-US", reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
}

async function testAuthorizationLoginFailureKeepsCardPinned({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  buildAuthUrl,
  createScenario,
  submitPassword,
  withScenario,
}) {
  const scenario = createScenario("authorization-login-failure", { loginError: true });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(buildAuthUrl(appUrl, scenario.appId), { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible", timeout: 5000 });
    await page.waitForSelector('.login-card[data-login-card-settled="true"]', { timeout: 8000 });
    await startFailureYieldProbe(page, "authorization-login-failure");
    await submitPassword(page, "failure-user");

    const failureOverlay = page.locator(".login-success-overlay.is-failure");
    await failureOverlay.waitFor({ state: "visible", timeout: 5000 });
    await failureOverlay.waitFor({ state: "detached", timeout: 6000 });
    const stats = await finishFailureYieldProbe(page, "authorization-login-failure");
    assert.ok(stats, "failure yield probe must be recorded");
    assert.ok(stats.originStyle !== null, `the overlay must pin an origin rect: ${JSON.stringify(stats)}`);
    assert.ok(stats.maxCardLeftDrift <= 0.5, `the login card must stay pinned to the failure origin left: ${JSON.stringify(stats)}`);
    assert.ok(stats.maxCardWidthDrift <= 0.5, `the login card must stay pinned to the failure origin width: ${JSON.stringify(stats)}`);
    assert.ok(stats.maxQrDrawerWidth <= 0.5, `the QR drawer slot must stay collapsed during the failure result: ${JSON.stringify(stats)}`);
    assert.equal(stats.failureCollisionFrameCount, 0, `form must not overlap the failure result during the hold: ${JSON.stringify(stats)}`);
  }, { locale: "en-US", reducedMotion: "no-preference", viewport: { height: 900, width: 1440 } });
}

async function testReducedMotionLoginFailureKeepsFormYielded({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  createScenario,
  submitPassword,
  withScenario,
}) {
  const scenario = createScenario("login-failure-reduced", { loginError: true });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator("input[autocomplete='username']").waitFor({ state: "visible" });
    await submitPassword(page, "failure-user");

    const failureOverlay = page.locator(".login-success-overlay.is-failure");
    await failureOverlay.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForTimeout(1200);
    assert.equal(await page.locator(".login-card--submit-stage-fade").count(), 1, "the yielded form must stay hidden through the reduced-motion failure hold");
    assert.equal(await page.locator(".auth-card-content").evaluate((element) => getComputedStyle(element).opacity), "0");
    assert.equal(await page.locator(".auth-card-viewport").evaluate((element) => element.inert), true);

    await failureOverlay.waitFor({ state: "detached", timeout: 5000 });
    await page.waitForSelector(".login-card--submit-stage", { state: "detached", timeout: 2000 });
    assert.equal(await page.locator(".login-card--submit-stage").count(), 0);
    assert.equal(await page.locator(".auth-card-viewport").evaluate((element) => element.inert), false);
    assert.equal(await page.locator(".login-form .primary-button[type='submit']").isEnabled(), true);
    await assertControlCanReceivePointer(page, page.locator("input[autocomplete='username']"), "username input");
  }, { locale: "en-US", reducedMotion: "reduce", viewport: { height: 844, width: 390 } });
}

// 提交前预挂的 rAF 采样器：逐帧记录表单/结果层的不透明度与矩形、overlay 与卡片的
// 类名、二维码抽屉宽度，事后按失败窗口统计。窗口内短于 waitFor 轮询间距（500ms）
// 的状态变化全部由逐帧采样覆盖，不依赖轮询对齐。
async function startFailureYieldProbe(page, key) {
  await page.evaluate((probeKey) => {
    const probe = {
      frames: [],
      originStyle: null,
      running: true,
    };
    window[probeKey] = probe;

    const sample = () => {
      if (!probe.running) return;
      const card = document.querySelector(".login-card");
      const formContent = document.querySelector(".auth-card-content");
      const passwordInput = document.querySelector("input[autocomplete='current-password']");
      const overlay = document.querySelector(".login-success-overlay");
      const resultContent = document.querySelector(".login-success-overlay-content");
      const qrDrawer = document.querySelector(".qr-drawer-slot");
      const readRect = (element) => {
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
        };
      };
      const frame = {
        cardClassName: card instanceof HTMLElement ? card.className : "",
        cardLeft: card instanceof HTMLElement ? card.getBoundingClientRect().left : 0,
        cardWidth: card instanceof HTMLElement ? card.getBoundingClientRect().width : 0,
        formOpacity: formContent instanceof HTMLElement ? Number.parseFloat(getComputedStyle(formContent).opacity) : 0,
        formRect: readRect(passwordInput),
        overlayClassName: overlay instanceof HTMLElement ? overlay.className : "",
        overlayExists: overlay instanceof HTMLElement,
        qrDrawerWidth: qrDrawer instanceof HTMLElement ? qrDrawer.getBoundingClientRect().width : 0,
        resultOpacity: resultContent instanceof HTMLElement ? Number.parseFloat(getComputedStyle(resultContent).opacity) : 0,
        resultRect: readRect(resultContent),
      };
      probe.frames.push(frame);
      if (overlay instanceof HTMLElement && probe.originStyle === null) {
        const style = getComputedStyle(overlay);
        probe.originStyle = {
          left: Number.parseFloat(style.getPropertyValue("--lso-origin-card-left")),
          width: Number.parseFloat(style.getPropertyValue("--lso-origin-content-width")),
        };
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, `__priestessFailureYieldProbe_${key}`);
}

async function finishFailureYieldProbe(page, key) {
  return page.evaluate((probeKey) => {
    const probe = window[probeKey];
    if (!probe) return null;
    probe.running = false;
    delete window[probeKey];

    const rectsIntersect = (left, right) => (
      left !== null
      && right !== null
      && left.width > 0
      && left.height > 0
      && right.width > 0
      && right.height > 0
      && left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top
    );

    const stats = {
      blankCardFrameCount: 0,
      failureCollisionFrameCount: 0,
      failureFrameCount: 0,
      formCrossfadeFrameCount: 0,
      maxCardLeftDrift: 0,
      maxCardWidthDrift: 0,
      maxQrDrawerWidth: 0,
      originStyle: probe.originStyle,
      totalFrameCount: probe.frames.length,
      unyieldedFadeClassFrameCount: 0,
    };
    for (const frame of probe.frames) {
      const isFailure = frame.overlayClassName.includes("is-failure");
      const isExiting = frame.overlayClassName.includes("is-exiting");
      if (frame.overlayExists && frame.formOpacity + frame.resultOpacity < 0.4) {
        stats.blankCardFrameCount += 1;
      }
      if (frame.formOpacity > 0.05 && frame.formOpacity < 0.95) {
        stats.formCrossfadeFrameCount += 1;
      }
      if (isFailure && !isExiting) {
        stats.failureFrameCount += 1;
        // 只统计表单已实质可见（opacity > 0.05）的帧：revealSubmitContent 的 setState 与
        // overlay 的 is-exiting 分属两个 React root，负载下 scheduler 时间切片可能把它们
        // 拆到相邻两帧；那 1 帧表单刚启动 180ms 淡入、opacity 仍约 0，视觉上无重叠。
        if (
          !frame.cardClassName.includes("login-card--submit-stage-fade")
          && frame.formOpacity > 0.05
        ) {
          stats.unyieldedFadeClassFrameCount += 1;
        }
        if (
          frame.formOpacity > 0.05
          && frame.resultOpacity > 0.05
          && rectsIntersect(frame.formRect, frame.resultRect)
        ) {
          stats.failureCollisionFrameCount += 1;
        }
        if (probe.originStyle !== null) {
          stats.maxCardLeftDrift = Math.max(stats.maxCardLeftDrift, Math.abs(frame.cardLeft - probe.originStyle.left));
          stats.maxCardWidthDrift = Math.max(stats.maxCardWidthDrift, Math.abs(frame.cardWidth - probe.originStyle.width));
        }
        stats.maxQrDrawerWidth = Math.max(stats.maxQrDrawerWidth, frame.qrDrawerWidth);
      }
    }
    return stats;
  }, `__priestessFailureYieldProbe_${key}`);
}
