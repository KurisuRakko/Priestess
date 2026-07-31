import assert from "node:assert/strict";

export async function runInlineAccountActionsBrowserCases({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  createScenario,
  waitForExitingPanelStopsPointer,
  withScenario,
}) {
  await testInlineAccountActions({
    appUrl,
    assertControlCanReceivePointer,
    browserInstance,
    createScenario,
    waitForExitingPanelStopsPointer,
    withScenario,
  });
  await testInlineAccountActionsOnMobile({
    appUrl,
    assertControlCanReceivePointer,
    browserInstance,
    createScenario,
    withScenario,
  });
}

async function testInlineAccountActions({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  createScenario,
  waitForExitingPanelStopsPointer,
  withScenario,
}) {
  const scenario = createScenario("inline-account-actions", { browserAccountMode: "single" });

  await withScenario(browserInstance, scenario, async(page) => {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    const listView = page.locator('[data-account-picker-view="list"]');
    const moreButton = page.getByRole("button", { name: /打开 Primary inline-account-actions 的更多操作/ });
    await moreButton.waitFor({ state: "visible", timeout: 5000 });
    await page.waitForSelector('[data-login-card-entry="ready"]');
    const listGeometry = await readAccountIdentityGeometry(page, "list");

    await startAccountSharedMotionProbe(page, "account-actions-forward");
    await moreButton.click();
    await page.waitForSelector('[data-account-picker-view="actions"]');
    await waitForExitingPanelStopsPointer(page, '[data-account-picker-view="list"]', "inline account list");
    const exitingListView = page.locator('[data-account-picker-view="list"][data-account-picker-presence="exiting"]');
    await exitingListView.waitFor({ state: "attached", timeout: 1000 });
    assert.equal(await exitingListView.getAttribute("aria-hidden"), "true");
    assert.equal(await exitingListView.evaluate((element) => element.inert), true);
    assert.equal(
      await exitingListView.locator(".account-picker__heading").evaluate((element) => getComputedStyle(element).visibility),
      "hidden",
      "retired account-list copy must not remain over the actions view",
    );
    await listView.waitFor({ state: "detached", timeout: 1500 });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "返回账号选择", null, { timeout: 1500 });
    await waitForAccountSharedElementsSettled(page);

    const actionGeometry = await readAccountIdentityGeometry(page, "actions");
    assert.ok(
      actionGeometry.avatarTop < listGeometry.avatarTop - 24,
      `shared avatar should take over the top of the card: ${JSON.stringify({ actionGeometry, listGeometry })}`,
    );
    assert.ok(
      actionGeometry.identityTop < listGeometry.identityTop - 24,
      `shared identity should take over the top of the card: ${JSON.stringify({ actionGeometry, listGeometry })}`,
    );
    assert.equal(await page.locator(".account-dialog-backdrop").count(), 0, "account actions must stay inside the card");
    assert.equal(await page.locator('[role="dialog"]').count(), 0, "opening account actions must not create a dialog");
    assert.equal(await page.locator('[data-account-shared-part="avatar"]').count(), 1);
    assert.equal(await page.locator('[data-account-shared-part="identity"]').count(), 1);
    const headerAlignment = await page.locator(".account-picker-actions").evaluate((actions) => {
      const navigation = actions.querySelector(".account-picker-actions__navigation");
      const backButton = actions.querySelector(".account-picker-actions__back");
      const avatar = actions.querySelector('[data-account-shared-part="avatar"]');
      const title = actions.querySelector("#account-picker-actions-title");
      if (!(navigation instanceof HTMLElement)
        || !(backButton instanceof HTMLElement)
        || !(avatar instanceof HTMLElement)
        || !(title instanceof HTMLElement)) return null;
      const navigationRect = navigation.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      return {
        avatarTop: avatar.getBoundingClientRect().top,
        backBackground: getComputedStyle(backButton).backgroundColor,
        backBottom: backButton.getBoundingClientRect().bottom,
        backBorderWidth: getComputedStyle(backButton).borderTopWidth,
        navigationCenter: navigationRect.left + navigationRect.width / 2,
        titleCenter: titleRect.left + titleRect.width / 2,
      };
    });
    assert.ok(headerAlignment);
    assert.ok(
      headerAlignment.backBottom <= headerAlignment.avatarTop,
      `back navigation should occupy its own row above the account profile: ${JSON.stringify(headerAlignment)}`,
    );
    assert.ok(Math.abs(headerAlignment.titleCenter - headerAlignment.navigationCenter) < 1);
    assert.equal(headerAlignment.backBorderWidth, "0px");
    assert.equal(headerAlignment.backBackground, "rgba(0, 0, 0, 0)");
    assertAccountSharedMotion(
      await finishAccountSharedMotionProbe(page, "account-actions-forward"),
      "desktop account actions forward",
    );
    for (const label of ["修改密码", "设定资料", "设定头像", "登出账号"]) {
      await assertControlCanReceivePointer(page, page.getByRole("button", { name: label }), `desktop inline action ${label}`);
    }

    await page.getByRole("button", { name: "登出账号" }).click();
    const removeDialog = page.getByRole("dialog");
    await removeDialog.waitFor({ state: "visible" });
    assert.match(await removeDialog.innerText(), /登出这个账号/);
    await removeDialog.getByRole("button", { name: "取消" }).click();
    await removeDialog.waitFor({ state: "detached" });
    assert.equal(await page.locator('[data-account-picker-view="actions"]').count(), 1, "cancelling sign-out must return to inline actions");

    await startAccountSharedMotionProbe(page, "account-actions-back");
    await page.getByRole("button", { name: "返回账号选择" }).click();
    await page.locator('[data-account-picker-view="actions"]').waitFor({ state: "detached", timeout: 1500 });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.includes("Primary inline-account-actions"), null, { timeout: 1500 });
    assert.equal(await page.locator('[data-account-picker-view="list"]').count(), 1);
    await waitForAccountSharedElementsSettled(page);
    const returnedGeometry = await readAccountIdentityGeometry(page, "list");
    assert.ok(
      Math.abs(returnedGeometry.avatarTop - listGeometry.avatarTop) < 3,
      `return should restore the avatar to its list position: ${JSON.stringify({ listGeometry, returnedGeometry })}`,
    );
    assert.ok(
      Math.abs(returnedGeometry.identityTop - listGeometry.identityTop) < 3,
      `return should restore the identity to its list position: ${JSON.stringify({ listGeometry, returnedGeometry })}`,
    );
    assertAccountSharedMotion(
      await finishAccountSharedMotionProbe(page, "account-actions-back"),
      "desktop account actions return",
    );

    await moreButton.click();
    await page.waitForSelector('[data-account-picker-view="actions"]');
    await page.getByRole("button", { name: "修改密码" }).click();
    await page.waitForURL((url) => url.pathname === "/manage" && url.searchParams.get("account_action") === "password" && url.hash === "#security", { timeout: 5000 });
    const passwordDialog = page.getByRole("dialog", { name: "修改密码" });
    await passwordDialog.waitFor({ state: "visible", timeout: 2500 });
    assert.equal(
      await passwordDialog.locator("input[autocomplete='current-password']").evaluate((element) => element === document.activeElement),
      true,
      "the destination action must keep its URL until the mounted dialog has received focus",
    );
    await page.waitForURL((url) => url.pathname === "/manage" && !url.searchParams.has("account_action") && url.hash === "#security", { timeout: 2500 });
    assert.deepEqual(scenario.records.activations.at(-1), {
      body: {},
      userId: "user-inline-account-actions-primary",
    });
  }, { reducedMotion: "no-preference", viewport: { height: 800, width: 1280 } });
}

async function testInlineAccountActionsOnMobile({
  appUrl,
  assertControlCanReceivePointer,
  browserInstance,
  createScenario,
  withScenario,
}) {
  for (const testCase of [
    { reducedMotion: "no-preference", viewport: { height: 844, width: 390 } },
    { reducedMotion: "reduce", viewport: { height: 667, width: 375 } },
  ]) {
    const suffix = `${testCase.viewport.width}-${testCase.reducedMotion}`;
    const scenario = createScenario(`inline-mobile-${suffix}`, { browserAccountMode: "multi" });

    await withScenario(browserInstance, scenario, async(page) => {
      await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
      const moreButtons = page.locator(".account-picker__more");
      await moreButtons.first().waitFor({ state: "visible", timeout: 5000 });
      await moreButtons.first().click();
      await page.waitForSelector('[data-account-picker-view="actions"]');
      await page.locator('[data-account-picker-view="list"]').waitFor({ state: "detached", timeout: 1500 });

      const mobileLayout = await page.evaluate(() => {
        const card = document.querySelector(".login-card");
        const viewport = document.querySelector(".auth-card-viewport");
        const actions = document.querySelector('[data-account-picker-view="actions"]');
        if (!(card instanceof HTMLElement) || !(viewport instanceof HTMLElement) || !(actions instanceof HTMLElement)) return null;
        return {
          cardOverflowY: getComputedStyle(card).overflowY,
          viewportHeight: viewport.style.height,
          viewportOverflowY: getComputedStyle(viewport).overflowY,
          viewPointerEvents: getComputedStyle(actions).pointerEvents,
          viewTransform: getComputedStyle(actions).transform,
        };
      });
      assert.ok(mobileLayout);
      assert.equal(mobileLayout.cardOverflowY, "auto");
      assert.equal(mobileLayout.viewportHeight, "auto");
      assert.equal(mobileLayout.viewportOverflowY, "visible");
      assert.equal(mobileLayout.viewPointerEvents, "auto");
      if (testCase.reducedMotion === "reduce") {
        assert.equal(mobileLayout.viewTransform, "none");
      }
      for (const label of ["修改密码", "设定资料", "设定头像", "登出账号"]) {
        await assertControlCanReceivePointer(page, page.getByRole("button", { name: label }), `${suffix} inline action ${label}`);
      }

      await page.getByRole("button", { name: "登出账号" }).click();
      const removeDialog = page.getByRole("dialog");
      await removeDialog.waitFor({ state: "visible" });
      await removeDialog.getByRole("button", { exact: true, name: "登出账号" }).click();
      await removeDialog.waitFor({ state: "detached", timeout: 2000 });
      await page.locator('[data-account-picker-view="list"]').waitFor({ state: "visible", timeout: 3000 });
      assert.equal(await page.getByText(`Secondary inline-mobile-${suffix}`).count(), 1);
      assert.deepEqual(scenario.records.removals, [`user-inline-mobile-${suffix}-primary`]);
    }, testCase);
  }
}

async function readAccountIdentityGeometry(page, view) {
  return page.locator(`[data-account-picker-view="${view}"]`).evaluate((container) => {
    const card = container.closest(".login-card");
    const avatar = container.querySelector('[data-account-shared-part="avatar"]');
    const identity = container.querySelector('[data-account-shared-part="identity"]');
    if (!(card instanceof HTMLElement) || !(avatar instanceof HTMLElement) || !(identity instanceof HTMLElement)) {
      throw new Error(`missing shared account elements in ${container.getAttribute("data-account-picker-view")}`);
    }
    const readLayoutTop = (element) => {
      let current = element;
      let top = 0;
      while (current instanceof HTMLElement && current !== card) {
        top += current.offsetTop;
        current = current.offsetParent;
      }
      if (current !== card) throw new Error("shared account element is not positioned inside the login card");
      return top;
    };
    return {
      avatarTop: readLayoutTop(avatar),
      identityTop: readLayoutTop(identity),
    };
  });
}

async function startAccountSharedMotionProbe(page, key) {
  await page.evaluate((probeKey) => {
    const probe = {
      blurredFrames: 0,
      firstMovingAt: null,
      frames: 0,
      lastMovingAt: null,
      maxElementCount: 0,
      maxTravel: 0,
      running: true,
    };
    window[probeKey] = probe;

    const sample = () => {
      if (!probe.running) return;
      const elements = [...document.querySelectorAll("[data-account-shared-part]")].filter((element) => element instanceof HTMLElement);
      probe.frames += 1;
      probe.maxElementCount = Math.max(probe.maxElementCount, elements.length);
      let frameTravel = 0;
      for (const element of elements) {
        const style = getComputedStyle(element);
        const transform = style.transform === "none" ? null : new DOMMatrixReadOnly(style.transform);
        frameTravel = Math.max(frameTravel, Math.abs(transform?.m41 ?? 0), Math.abs(transform?.m42 ?? 0));
        if (style.filter !== "none" && style.filter !== "blur(0px)") probe.blurredFrames += 1;
      }
      probe.maxTravel = Math.max(probe.maxTravel, frameTravel);
      if (frameTravel > 0.5) {
        const now = performance.now();
        probe.firstMovingAt ??= now;
        probe.lastMovingAt = now;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }, `__priestessAccountMotionProbe_${key}`);
}

async function finishAccountSharedMotionProbe(page, key) {
  return page.evaluate((probeKey) => {
    const probe = window[probeKey];
    if (!probe) return null;
    probe.running = false;
    delete window[probeKey];
    return {
      blurredFrames: probe.blurredFrames,
      frames: probe.frames,
      maxElementCount: probe.maxElementCount,
      maxTravel: probe.maxTravel,
      movingDuration: probe.firstMovingAt === null || probe.lastMovingAt === null
        ? 0
        : probe.lastMovingAt - probe.firstMovingAt,
    };
  }, `__priestessAccountMotionProbe_${key}`);
}

function assertAccountSharedMotion(motion, label) {
  assert.ok(motion, `${label} probe missing`);
  assert.ok(motion.frames >= 8, `${label} should preserve a readable shared-element timeline: ${JSON.stringify(motion)}`);
  assert.ok(motion.maxTravel >= 24, `${label} should visibly move the avatar and identity: ${JSON.stringify(motion)}`);
  assert.ok(motion.movingDuration >= 380, `${label} should preserve the 520ms shared-element easing: ${JSON.stringify(motion)}`);
  assert.ok(motion.maxElementCount <= 4, `${label} should only retain the outgoing and incoming shared pairs: ${JSON.stringify(motion)}`);
  assert.equal(motion.blurredFrames, 0, `${label} must keep shared text sharp`);
}

async function waitForAccountSharedElementsSettled(page) {
  await page.waitForFunction(() => {
    const elements = [...document.querySelectorAll("[data-account-shared-part]")].filter((element) => element instanceof HTMLElement);
    if (elements.length !== 2) return false;
    return elements.every((element) => {
      const transform = getComputedStyle(element).transform;
      if (transform === "none") return true;
      const matrix = new DOMMatrixReadOnly(transform);
      return Math.abs(matrix.m41) < 0.5
        && Math.abs(matrix.m42) < 0.5
        && Math.abs(matrix.a - 1) < 0.01
        && Math.abs(matrix.d - 1) < 0.01;
    });
  }, null, { timeout: 2000 });
}
