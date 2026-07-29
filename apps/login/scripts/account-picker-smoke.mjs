import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { language: "zh-CN", languages: ["zh-CN"] },
});

let PriestessI18nProvider = React.Fragment;
let loginI18nResources = undefined;

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  root: new URL("..", import.meta.url).pathname,
  server: { middlewareMode: true },
});

try {
  const accountPickerModule = await server.ssrLoadModule("/src/components/AccountPickerCard.tsx");
  const accountManagementActionModule = await server.ssrLoadModule("/src/lib/accountManagementAction.ts");
  const accountAuthorizationModule = await server.ssrLoadModule("/src/lib/accountAuthorization.ts");
  const authRequestModule = await server.ssrLoadModule("/src/lib/authRequest.ts");
  const authAccountChoicesModule = await server.ssrLoadModule("/src/lib/useAuthAccountChoices.ts");
  const loginFormModule = await server.ssrLoadModule("/src/components/LoginForm.tsx");
  const loginI18nModule = await server.ssrLoadModule("/src/i18n/index.ts");
  const loginNextModule = await server.ssrLoadModule("/src/lib/loginNext.ts");
  const loginLayoutStateModule = await server.ssrLoadModule("/src/lib/loginLayoutState.ts");
  const mobileLoginRevealStateModule = await server.ssrLoadModule("/src/lib/mobileLoginRevealState.ts");
  const localLoginTurnstileRetryModule = await server.ssrLoadModule("/src/lib/localLoginTurnstileRetry.ts");
  // 共享包路径从脚本位置推导，避免硬编码仓库绝对路径在 worktree/其它机器上加载出第二份 React。
  const sharedLibDir = new URL("../../../packages/priestess-shared/src/lib/", import.meta.url).pathname;
  const sharedI18nModule = await server.ssrLoadModule(`/@fs${sharedLibDir}i18n.tsx`);
  const sharedApiModule = await server.ssrLoadModule(`/@fs${sharedLibDir}priestessApi.ts`);
  const { AccountPickerActionsDialog, AccountPickerCard, getAccountKey, getAccountMoreActionsLabel, getAccountRemoveDescription, getAccountRemoveLabel, getAccountSelectLabel, getSafeAvatarUrl } = accountPickerModule;
  const { buildAccountManagementActionPath, getAccountManagementActionSection, readAccountManagementAction, removeAccountManagementActionFromSearch, resolveAccountManagementActionTarget } = accountManagementActionModule;
  const { buildAuthAccountAuthorizeParams, getAuthAccountAuthorizeBlocker, shouldShowAuthAccountPicker } = accountAuthorizationModule;
  const { getAuthRequestAppLabel, getAuthRequestReturnToOrigin, readAuthRequest } = authRequestModule;
  const { getAuthAccountChoiceErrorMessage, readAuthAccountChoicesForRequest, readStandaloneBrowserAccounts, redactSensitiveAuthText } = authAccountChoicesModule;
  const { LoginForm } = loginFormModule;
  const { buildLoginPathWithNext, getCurrentAccountNextPath, normalizePriestessNextPath, readLoginNext } = loginNextModule;
  const { loginLocalSessionWithTurnstileRetry } = localLoginTurnstileRetryModule;
  const { MOBILE_LOGIN_BREAKPOINT_PX, MOBILE_LOGIN_REVEAL_TIMEOUT_MS, isMobileLoginDataReady, resolveMobileLoginRevealStep, shouldAnimateMobileLoginReveal } = mobileLoginRevealStateModule;
  ({ loginI18nResources } = loginI18nModule);
  const { resolveLoginLayoutState } = loginLayoutStateModule;
  ({ PriestessI18nProvider } = sharedI18nModule);
  const { activateLocalAccountChoice, authorizeLocalSession, checkRegisterInvite, confirmLocalRegistration, getPriestessApiErrorMessage, listLocalAccountChoices, listLocalBrowserAccounts, loginLocalSession, removeLocalAccountChoice, PriestessApiError } = sharedApiModule;

  testAuthRequestHelpers({ getAuthRequestAppLabel, getAuthRequestReturnToOrigin, readAuthRequest });
  testAccountAuthorizationHelpers({ buildAuthAccountAuthorizeParams, getAuthAccountAuthorizeBlocker, shouldShowAuthAccountPicker });
  testAccountManagementActionHelpers({ buildAccountManagementActionPath, getAccountManagementActionSection, normalizePriestessNextPath, readAccountManagementAction, removeAccountManagementActionFromSearch, resolveAccountManagementActionTarget });
  testLoginNextHelpers({ buildLoginPathWithNext, getCurrentAccountNextPath, normalizePriestessNextPath, readLoginNext });
  testLoginLayoutState({ resolveLoginLayoutState });
  testMobileLoginRevealState({ MOBILE_LOGIN_BREAKPOINT_PX, MOBILE_LOGIN_REVEAL_TIMEOUT_MS, isMobileLoginDataReady, resolveMobileLoginRevealStep, shouldAnimateMobileLoginReveal });
  testAccountPickerMarkup({ AccountPickerActionsDialog, AccountPickerCard, getAccountKey, getAccountMoreActionsLabel, getAccountRemoveDescription, getAccountRemoveLabel, getAccountSelectLabel, getSafeAvatarUrl });
  testLoginFormBackButton({ LoginForm });
  await testSharedApiContract({ activateLocalAccountChoice, authorizeLocalSession, checkRegisterInvite, confirmLocalRegistration, listLocalAccountChoices, listLocalBrowserAccounts, loginLocalSession, removeLocalAccountChoice });
  await testLocalLoginTurnstileRetry({ loginLocalSessionWithTurnstileRetry, PriestessApiError });
  testAccountChoiceErrorRedaction({ getAuthAccountChoiceErrorMessage, getPriestessApiErrorMessage, redactSensitiveAuthText });
  await testAccountChoiceFallback({ readAuthAccountChoicesForRequest, readStandaloneBrowserAccounts });

  console.log("account-picker smoke passed");
} finally {
  await server.close();
}

function testAccountAuthorizationHelpers({ buildAuthAccountAuthorizeParams, getAuthAccountAuthorizeBlocker, shouldShowAuthAccountPicker }) {
  const authRequest = {
    appId: "canvas",
    returnTo: "https://example.com/callback",
  };
  const selectedAccount = buildAccount({
    choiceId: "choice-rakko",
    email: "y@rakko.cn",
    userId: "u-rakko",
  });
  const currentSessionAccount = {
    ...buildAccount({
      choiceId: "",
      email: "current@example.com",
      userId: "u-current",
    }),
    authorizeChoiceId: null,
    source: "current-session",
  };
  const brokenChoiceAccount = {
    ...buildAccount({
      choiceId: "",
      email: "broken@example.com",
      userId: "u-broken",
    }),
    authorizeChoiceId: null,
    source: "account-choices",
  };

  assert.equal(getAuthAccountAuthorizeBlocker(selectedAccount), "");
  assert.equal(getAuthAccountAuthorizeBlocker(currentSessionAccount), "");
  assert.match(getAuthAccountAuthorizeBlocker(brokenChoiceAccount), /缺少 choice_id/);
  assert.deepEqual(buildAuthAccountAuthorizeParams(authRequest, selectedAccount), {
    appId: "canvas",
    choiceId: "choice-rakko",
    returnTo: "https://example.com/callback",
  });
  assert.deepEqual(buildAuthAccountAuthorizeParams(authRequest, currentSessionAccount), {
    appId: "canvas",
    returnTo: "https://example.com/callback",
  });

  const basePickerState = {
    authMode: "login",
    hasAuthRequest: true,
    hasTotpChallenge: false,
    showLoginFormForAccountPicker: false,
    standalone: false,
  };
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, status: "loading" }), true);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, status: "ready" }), true);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, status: "error" }), true);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, status: "empty" }), false);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, status: "idle" }), false);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, authMode: "register", status: "ready" }), false);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, hasAuthRequest: false, status: "ready" }), false);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, hasAuthRequest: false, standalone: true, status: "loading" }), true);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, hasAuthRequest: false, standalone: true, status: "ready" }), true);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, hasAuthRequest: false, standalone: true, status: "empty" }), false);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, hasTotpChallenge: true, status: "ready" }), false);
  assert.equal(shouldShowAuthAccountPicker({ ...basePickerState, showLoginFormForAccountPicker: true, status: "ready" }), false);
}

function testAccountManagementActionHelpers({ buildAccountManagementActionPath, getAccountManagementActionSection, normalizePriestessNextPath, readAccountManagementAction, removeAccountManagementActionFromSearch, resolveAccountManagementActionTarget }) {
  assert.equal(buildAccountManagementActionPath("password"), "/manage?account_action=password#security");
  assert.equal(buildAccountManagementActionPath("profile"), "/manage");
  assert.equal(buildAccountManagementActionPath("avatar"), "/manage?account_action=avatar");
  assert.equal(normalizePriestessNextPath(buildAccountManagementActionPath("password")), "/manage?account_action=password#security");
  assert.equal(normalizePriestessNextPath(buildAccountManagementActionPath("profile")), "/manage");
  assert.equal(normalizePriestessNextPath(buildAccountManagementActionPath("avatar")), "/manage?account_action=avatar");
  assert.equal(readAccountManagementAction("?account_action=password"), "password");
  assert.equal(readAccountManagementAction("?account_action=profile"), "profile");
  assert.equal(readAccountManagementAction("?account_action=avatar"), "avatar");
  assert.equal(readAccountManagementAction("?account_action=devices"), null);
  assert.equal(getAccountManagementActionSection("password"), "security");
  assert.equal(getAccountManagementActionSection("profile"), "overview");
  assert.equal(getAccountManagementActionSection("avatar"), "overview");
  assert.equal(removeAccountManagementActionFromSearch("?account_action=password&next=1"), "?next=1");
  assert.equal(removeAccountManagementActionFromSearch("?account_action=profile"), "");
  assert.equal(removeAccountManagementActionFromSearch("?account_action=avatar"), "");

  const editableAccount = buildAccount({
    authenticated: true,
    email: "alice@example.com",
    userId: "u-alice",
    username: "alice",
  });
  const matchingSession = buildLocalSession({
    email: "alice@example.com",
    userId: "u-alice",
    username: "alice",
  });
  assert.deepEqual(resolveAccountManagementActionTarget(editableAccount, "profile", matchingSession), {
    path: "/manage",
    status: "ready",
  });
  assert.deepEqual(resolveAccountManagementActionTarget(editableAccount, "password", buildLocalSession({ userId: "u-bob", username: "bob" })), {
    path: "",
    status: "session-mismatch",
  });
  assert.deepEqual(resolveAccountManagementActionTarget({ ...editableAccount, authenticated: false, revoked: true }, "avatar", matchingSession), {
    path: "",
    status: "signed-out",
  });
}

function testLoginNextHelpers({ buildLoginPathWithNext, getCurrentAccountNextPath, normalizePriestessNextPath, readLoginNext }) {
  assert.equal(normalizePriestessNextPath("/manage"), "/manage");
  assert.equal(normalizePriestessNextPath("/manage#services"), "/manage#services");
  assert.equal(normalizePriestessNextPath("/Manage#devices"), "/manage#devices");
  assert.equal(normalizePriestessNextPath("/auth-ui/account#privacy"), "/manage#privacy");
  assert.equal(normalizePriestessNextPath("https://example.com/manage"), "");
  assert.equal(normalizePriestessNextPath("//example.com/manage"), "");
  assert.equal(normalizePriestessNextPath("javascript:alert(1)"), "");
  assert.equal(normalizePriestessNextPath("/login"), "");
  assert.equal(normalizePriestessNextPath("/qr-login"), "");
  assert.equal(readLoginNext({ search: "?next=/manage%23devices" }), "/manage#devices");
  assert.equal(readLoginNext({ search: "?next=https%3A%2F%2Fexample.com%2Fmanage" }), "/manage");
  assert.equal(buildLoginPathWithNext("/manage#devices"), "/login?next=/manage%23devices");
  assert.equal(buildLoginPathWithNext("https://example.com/manage"), "/login?next=/manage");
  assert.equal(getCurrentAccountNextPath({ pathname: "/Manage", search: "", hash: "#services" }), "/manage#services");
  assert.equal(getCurrentAccountNextPath({ pathname: "/auth-ui/account", search: "", hash: "#privacy" }), "/manage#privacy");
}

function testLoginLayoutState({ resolveLoginLayoutState }) {
  const baseState = {
    authMode: "login",
    hasAuthRequest: true,
    hasTotpChallenge: false,
    isLoginIntroStage: false,
    isLoginRoute: true,
    isLoginSubmitStage: false,
    isRegisterDrawerStage: false,
    shouldShowAccountPicker: false,
  };

  const passwordLogin = resolveLoginLayoutState(baseState);
  assert.equal(passwordLogin.isLoginCenteredStage, false);
  assert.equal(passwordLogin.isQrDrawerOpen, true);
  assert.equal(passwordLogin.authGridClassName, "auth-grid");

  const accountPicker = resolveLoginLayoutState({
    ...baseState,
    shouldShowAccountPicker: true,
  });
  assert.equal(accountPicker.isLoginCenteredStage, true);
  assert.equal(accountPicker.isQrDrawerOpen, false);
  assert.match(accountPicker.authGridClassName, /auth-grid--login-centered/);

  const bareLogin = resolveLoginLayoutState({
    ...baseState,
    hasAuthRequest: false,
  });
  assert.equal(bareLogin.isLoginCenteredStage, true);
  assert.equal(bareLogin.isQrDrawerOpen, false);

  const totpLogin = resolveLoginLayoutState({
    ...baseState,
    hasTotpChallenge: true,
  });
  assert.equal(totpLogin.isLoginCenteredStage, true);
  assert.equal(totpLogin.isQrDrawerOpen, false);

  const registerLayout = resolveLoginLayoutState({
    ...baseState,
    authMode: "register",
  });
  assert.equal(registerLayout.isSoloAuthMode, true);
  assert.equal(registerLayout.isQrDrawerOpen, false);
  assert.match(registerLayout.authGridClassName, /auth-grid--register/);

  // 抽屉收回阶段维持宽布局（register-drawer），此时不应同时出现 --register 收拢样式。
  const registerDrawerStage = resolveLoginLayoutState({
    ...baseState,
    authMode: "register",
    isRegisterDrawerStage: true,
  });
  assert.equal(registerDrawerStage.authGridClassName, "auth-grid auth-grid--register-drawer");
}

function testMobileLoginRevealState({
  MOBILE_LOGIN_BREAKPOINT_PX,
  MOBILE_LOGIN_REVEAL_TIMEOUT_MS,
  isMobileLoginDataReady,
  resolveMobileLoginRevealStep,
  shouldAnimateMobileLoginReveal,
}) {
  assert.equal(MOBILE_LOGIN_BREAKPOINT_PX, 820);
  assert.equal(MOBILE_LOGIN_REVEAL_TIMEOUT_MS, 5000);

  const plainLogin = {
    accountChoicesStatus: "loading",
    hasAuthRequest: false,
    localSessionStatus: "loading",
  };
  assert.equal(isMobileLoginDataReady(plainLogin), false);
  assert.equal(isMobileLoginDataReady({ ...plainLogin, localSessionStatus: "ready" }), true);
  assert.equal(isMobileLoginDataReady({ ...plainLogin, localSessionStatus: "error" }), true);

  const authorizationLogin = {
    accountChoicesStatus: "loading",
    hasAuthRequest: true,
    localSessionStatus: "idle",
  };
  assert.equal(isMobileLoginDataReady(authorizationLogin), false);
  for (const accountChoicesStatus of ["ready", "empty", "error"]) {
    assert.equal(isMobileLoginDataReady({ ...authorizationLogin, accountChoicesStatus }), true);
  }

  const waitingReveal = {
    dataReady: false,
    hasRevealed: false,
    isMobileViewport: true,
    timedOut: false,
  };
  assert.equal(resolveMobileLoginRevealStep(waitingReveal), "waiting");
  assert.equal(resolveMobileLoginRevealStep({ ...waitingReveal, dataReady: true }), "schedule-after-paint");
  assert.equal(resolveMobileLoginRevealStep({ ...waitingReveal, timedOut: true }), "schedule-after-paint");
  assert.equal(resolveMobileLoginRevealStep({ ...waitingReveal, isMobileViewport: false }), "revealed");
  assert.equal(resolveMobileLoginRevealStep({ ...waitingReveal, hasRevealed: true }), "revealed");

  assert.equal(shouldAnimateMobileLoginReveal(false), true);
  assert.equal(shouldAnimateMobileLoginReveal(true), false);
}

function testAuthRequestHelpers({ getAuthRequestAppLabel, getAuthRequestReturnToOrigin, readAuthRequest }) {
  assert.equal(readAuthRequest({ search: "" }), null);
  assert.equal(readAuthRequest({ search: "?app_id=canvas" }), null);
  assert.deepEqual(readAuthRequest({ search: "?app_id=canvas&return_to=https%3A%2F%2Fexample.com%2Fcallback" }), {
    appId: "canvas",
    returnTo: "https://example.com/callback",
  });
  assert.equal(getAuthRequestReturnToOrigin("https://example.com/callback?login_code=secret"), "https://example.com");
  assert.equal(getAuthRequestReturnToOrigin("http://example.test/callback?token=secret"), "http://example.test");
  assert.equal(getAuthRequestReturnToOrigin("javascript:alert(1)"), "");
  assert.equal(getAuthRequestReturnToOrigin("data:text/html,secret"), "");
  assert.equal(getAuthRequestReturnToOrigin("not a url"), "");
  assert.equal(getAuthRequestAppLabel({ appId: "canvas", returnTo: "https://example.com/callback" }), "canvas");
  assert.equal(getAuthRequestAppLabel({ appId: "", returnTo: "https://example.com/callback?token=secret" }), "https://example.com");
  assert.equal(getAuthRequestAppLabel({ appId: "", returnTo: "javascript:alert(1)" }), "当前应用");
}

function testAccountPickerMarkup({ AccountPickerActionsDialog, AccountPickerCard, getAccountKey, getAccountMoreActionsLabel, getAccountRemoveDescription, getAccountRemoveLabel, getAccountSelectLabel, getSafeAvatarUrl }) {
  const accounts = [
    buildAccount({
      choiceId: "choice-bowen",
      current: true,
      displayName: "Bowen Yang",
      email: "z5717379@ad.unsw.edu.au",
      username: "z5717379",
      userId: "u-bowen",
    }),
    buildAccount({
      choiceId: "choice-rakko",
      displayName: "KurisuRakko",
      email: "y@rakko.cn",
      username: "kurisu",
      userId: "u-rakko",
    }),
  ];

  assert.equal(getAccountKey(accounts[0]), "choice-bowen");
  assert.equal(getSafeAvatarUrl("https://example.com/avatar.png"), "https://example.com/avatar.png");
  assert.equal(getSafeAvatarUrl("http://example.test/avatar.png"), "http://example.test/avatar.png");
  assert.equal(getSafeAvatarUrl("/avatars/rakko.png"), "/avatars/rakko.png");
  assert.equal(getSafeAvatarUrl("//example.com/avatar.png"), "");
  assert.equal(getSafeAvatarUrl("javascript:alert(1)"), "");
  assert.equal(getSafeAvatarUrl("data:image/svg+xml;base64,PHN2Zy8+"), "");
  assert.equal(
    getAccountSelectLabel(accounts[0], "canvas"),
    "使用 Bowen Yang，z5717379@ad.unsw.edu.au，已登录 继续访问 canvas",
  );
  assert.equal(
    getAccountSelectLabel(accounts[1], "canvas", true),
    "正在使用 KurisuRakko，y@rakko.cn 继续访问 canvas",
  );
  assert.equal(
    getAccountRemoveLabel(accounts[0]),
    "移除 Bowen Yang 的登录状态",
  );
  assert.equal(
    getAccountRemoveDescription(accounts[0]),
    "这会从当前浏览器移除 Bowen Yang（z5717379@ad.unsw.edu.au），不会删除 Priestess 用户资料。",
  );
  assert.equal(
    getAccountMoreActionsLabel(accounts[0]),
    "打开 Bowen Yang 的更多操作",
  );
  assert.equal(loginI18nResources["en-US"].login["选择账号"], "Welcome Back");

  const readyHtml = renderPicker(AccountPickerCard, {
    accounts,
    status: "ready",
  });
  assert.match(readyHtml, /选择账号/);
  assert.match(readyHtml, /继续访问/);
  assert.match(readyHtml, /canvas/);
  assert.match(readyHtml, /https:\/\/example\.com/);
  assert.match(readyHtml, /Bowen Yang/);
  assert.match(readyHtml, /KurisuRakko/);
  assert.match(readyHtml, /M24 5c5\.5 4\.5 5\.5 10\.5 0 16/);
  assert.doesNotMatch(readyHtml, /account-picker__mark/);
  assert.doesNotMatch(readyHtml, /lucide-user-round/);
  assert.match(readyHtml, /已登录/);
  assert.match(readyHtml, /aria-label="使用 Bowen Yang，z5717379@ad\.unsw\.edu\.au，已登录 继续访问 canvas"/);
  assert.match(readyHtml, /aria-label="打开 Bowen Yang 的更多操作"/);
  assert.match(readyHtml, /lucide-ellipsis-vertical/);
  assert.doesNotMatch(readyHtml, /lucide-arrow-right/);
  assert.doesNotMatch(readyHtml, /lucide-trash-2/);
  assert.match(readyHtml, /使用其他账号/);
  assert.doesNotMatch(readyHtml, /输入密码/);

  const standaloneHtml = renderPicker(AccountPickerCard, {
    accounts,
    mode: "standalone",
    status: "ready",
  });
  assert.match(standaloneHtml, /选择账号进入 Priestess 个人中心/);
  assert.doesNotMatch(standaloneHtml, /继续访问/);
  assert.doesNotMatch(standaloneHtml, /https:\/\/example\.com/);
  assert.match(standaloneHtml, /aria-label="使用 Bowen Yang，z5717379@ad\.unsw\.edu\.au，已登录 进入 Priestess 个人中心"/);

  const currentActionsHtml = renderAccountActionsDialog(AccountPickerActionsDialog, {
    account: accounts[0],
  });
  assert.match(currentActionsHtml, /账号操作/);
  assert.match(currentActionsHtml, /Bowen Yang/);
  assert.match(currentActionsHtml, /修改密码/);
  assert.match(currentActionsHtml, /设定资料/);
  assert.match(currentActionsHtml, /设定头像/);
  assert.match(currentActionsHtml, /登出账号/);
  assert.doesNotMatch(currentActionsHtml, /这个账号已在此浏览器登出/);

  const otherActionsHtml = renderAccountActionsDialog(AccountPickerActionsDialog, {
    account: accounts[1],
  });
  assert.match(otherActionsHtml, /KurisuRakko/);
  assert.match(otherActionsHtml, /修改密码/);
  assert.match(otherActionsHtml, /设定资料/);
  assert.match(otherActionsHtml, /设定头像/);
  assert.match(otherActionsHtml, /登出账号/);
  assert.doesNotMatch(otherActionsHtml, /这个账号已在此浏览器登出/);

  const signedOutAccount = buildAccount({
    authenticated: false,
    choiceId: "choice-signed-out",
    displayName: "Signed Out User",
    email: "signed.out@example.com",
    revoked: true,
    userId: "u-signed-out",
  });
  const signedOutActionsHtml = renderAccountActionsDialog(AccountPickerActionsDialog, {
    account: signedOutAccount,
  });
  assert.match(signedOutActionsHtml, /Signed Out User/);
  assert.match(signedOutActionsHtml, /这个账号已在此浏览器登出，不能修改资料、密码或头像。/);
  assert.match(signedOutActionsHtml, /登出账号/);
  assert.doesNotMatch(signedOutActionsHtml, /修改密码/);
  assert.doesNotMatch(signedOutActionsHtml, /设定资料/);
  assert.doesNotMatch(signedOutActionsHtml, /设定头像/);

  const busyActionsHtml = renderAccountActionsDialog(AccountPickerActionsDialog, {
    account: accounts[0],
    busy: true,
  });
  assert.match(busyActionsHtml, /登出中/);
  assert.match(busyActionsHtml, /disabled=""/);

  const singleHtml = renderPicker(AccountPickerCard, {
    accounts: [accounts[0]],
    status: "ready",
  });
  assert.match(singleHtml, /Bowen Yang/);
  assert.match(singleHtml, /使用其他账号/);
  assert.doesNotMatch(singleHtml, /KurisuRakko/);

  const loadingHtml = renderPicker(AccountPickerCard, {
    accounts: [],
    status: "loading",
  });
  assert.match(loadingHtml, /aria-busy="true"/);
  assert.match(loadingHtml, /正在读取账号/);

  const emptyHtml = renderPicker(AccountPickerCard, {
    accounts: [],
    status: "empty",
  });
  assert.match(emptyHtml, /没有可用账号/);
  assert.match(emptyHtml, /使用其他账号/);

  const errorHtml = renderPicker(AccountPickerCard, {
    accounts: [],
    error: "账号选择接口暂未接入",
    status: "error",
  });
  assert.match(errorHtml, /账号选择暂时不可用/);
  assert.match(errorHtml, /账号选择接口暂未接入/);
  assert.match(errorHtml, /重试/);

  const busyHtml = renderPicker(AccountPickerCard, {
    accounts,
    busyAccountId: "choice-bowen",
    status: "ready",
  });
  assert.match(busyHtml, /aria-busy="true"/);
  assert.match(busyHtml, /aria-label="正在使用 Bowen Yang，z5717379@ad\.unsw\.edu\.au，已登录 继续访问 canvas"/);
  assert.match(busyHtml, /继续中/);

  const removingHtml = renderPicker(AccountPickerCard, {
    accounts,
    removingAccountId: "choice-bowen",
    status: "ready",
  });
  assert.match(removingHtml, /aria-busy="true"/);
  assert.match(removingHtml, /登出中/);

  const signedOutHtml = renderPicker(AccountPickerCard, {
    accounts: [signedOutAccount],
    status: "ready",
  });
  assert.match(signedOutHtml, /Signed Out User/);
  assert.match(signedOutHtml, /已登出/);
  assert.match(signedOutHtml, /aria-label="打开 Signed Out User 的更多操作"/);

  const longTextHtml = renderPicker(AccountPickerCard, {
    accounts: [buildAccount({
      choiceId: "choice-long",
      current: true,
      displayName: "VeryLongDisplayNameWithoutNaturalBreaksVeryLongDisplayNameWithoutNaturalBreaks",
      email: "very.long.account.identifier.without.breaks.very.long.account.identifier.without.breaks@example.com",
      userId: "u-long",
    })],
    app: {
      appId: "very-long-client-id-without-natural-breaks-very-long-client-id-without-natural-breaks",
      raw: null,
      returnToOrigin: "https://very-long-return-origin-without-natural-breaks.example.com",
    },
    status: "ready",
  });
  assert.match(longTextHtml, /very-long-client-id-without-natural-breaks/);
  assert.match(longTextHtml, /very\.long\.account\.identifier/);

  const safeAvatarHtml = renderPicker(AccountPickerCard, {
    accounts: [buildAccount({
      avatarUrl: "https://example.com/avatar.png",
      choiceId: "choice-avatar",
      displayName: "Avatar User",
      userId: "u-avatar",
    })],
    status: "ready",
  });
  assert.match(safeAvatarHtml, /src="https:\/\/example\.com\/avatar\.png"/);

  const unsafeAvatarHtml = renderPicker(AccountPickerCard, {
    accounts: [buildAccount({
      avatarUrl: "data:image/svg+xml;base64,PHN2Zy8+",
      choiceId: "choice-unsafe-avatar",
      displayName: "Unsafe Avatar",
      userId: "u-unsafe-avatar",
    })],
    status: "ready",
  });
  assert.match(unsafeAvatarHtml, /<img /);
  assert.match(unsafeAvatarHtml, /priestess-default-avatar\.png/);
  assert.doesNotMatch(unsafeAvatarHtml, /data:image/);
  assert.doesNotMatch(unsafeAvatarHtml, />U</);
}

function testLoginFormBackButton({ LoginForm }) {
  const authRequestLoginHtml = renderLoginForm(LoginForm, {
    showBackToAccountPicker: true,
  });
  assert.match(authRequestLoginHtml, /aria-label="返回账号选择"/);
  assert.match(authRequestLoginHtml, /title="返回账号选择"/);
  assert.match(authRequestLoginHtml, /欢迎回来/);

  const bareLoginHtml = renderLoginForm(LoginForm, {
    showBackToAccountPicker: false,
  });
  assert.doesNotMatch(bareLoginHtml, /返回账号选择/);

  const totpHtml = renderLoginForm(LoginForm, {
    showBackToAccountPicker: true,
    totpChallenge: {
      displayName: "Bowen Yang",
      username: "bowen",
    },
  });
  assert.doesNotMatch(totpHtml, /aria-label="返回账号选择"/);
  assert.match(totpHtml, /返回密码登录/);
}

async function testSharedApiContract({ activateLocalAccountChoice, authorizeLocalSession, checkRegisterInvite, confirmLocalRegistration, listLocalAccountChoices, listLocalBrowserAccounts, loginLocalSession, removeLocalAccountChoice }) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const responses = [
    {
      accounts: [
        {
          avatar_url: "https://example.com/a.png",
          choice_id: "choice-snake",
          current: true,
          display_name: "Snake Case",
          email: "snake@example.com",
          expires_at: "2026-05-24T12:00:00.000Z",
          last_used_at: "2026-05-24T01:00:00.000Z",
          user_id: "user-snake",
          username: "snake",
        },
        {
          authenticated: false,
          avatarUrl: "https://example.com/b.png",
          choiceId: "choice-camel",
          current: false,
          displayName: "Camel Case",
          email: "camel@example.com",
          expiresAt: "2026-05-24T13:00:00.000Z",
          lastUsedAt: "2026-05-24T02:00:00.000Z",
          revoked: true,
          userId: "user-camel",
          username: "camel",
        },
      ],
      app: { app_id: "canvas", return_to_origin: "https://example.com" },
    },
    {
      data: {
        account_choices: [
          {
            choice_id: "choice-nested",
            current: true,
            expires_at: "2026-05-24T14:00:00.000Z",
            last_used_at: "2026-05-24T03:00:00.000Z",
            user: {
              display_name: "Nested User",
              email: "nested@example.com",
              user_id: "user-nested",
              username: "nested",
            },
          },
        ],
        client: { client_id: "canvas-nested", origin: "https://nested.example.com" },
      },
    },
    {
      accounts: [
        {
          current: true,
          display_name: "Browser User",
          email: "browser@example.com",
          expires_at: "2026-05-24T15:00:00.000Z",
          last_used_at: "2026-05-24T04:00:00.000Z",
          user_id: "user-browser",
          username: "browser",
        },
      ],
    },
    { redirect_url: "https://example.com/callback?login_code=mock", expires_in: 60, expires_at: 1_779_600_000 },
    { redirectUrl: "https://example.com/current", expiresIn: 30, expiresAt: 1_779_600_030 },
    { authenticated: true, current: false, removed: true, revoked: true, user_id: "user-snake" },
    { authenticated: true, expires_at: "2026-05-24T12:30:00.000Z", user: { email: "snake@example.com", user_id: "user-snake", username: "snake" } },
    { authenticated: true, expires_at: "2026-05-24T12:00:00.000Z", user: { user_id: "user-login", username: "login-user" } },
    { accepted: true, expires_at: "2026-05-24T12:05:00.000Z", invite_challenge: "invite.challenge" },
    { authenticated: true, expires_at: "2026-05-24T13:00:00.000Z", user: { user_id: "user-register", username: "register-user" } },
  ];

  globalThis.fetch = async(url, init = {}) => {
    calls.push({
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      credentials: init.credentials,
      headers: init.headers,
      method: init.method ?? "GET",
      url: String(url),
    });
    const response = responses.shift();
    assert.ok(response, `unexpected fetch call ${String(url)}`);
    return new Response(JSON.stringify(response), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  };

  try {
    const choices = await listLocalAccountChoices({
      appId: "canvas",
      returnTo: "https://example.com/callback",
    });
    assert.equal(choices.accounts.length, 2);
    assert.equal(choices.accounts[0].choiceId, "choice-snake");
    assert.equal(choices.accounts[0].avatarUrl, "https://example.com/a.png");
    assert.equal(choices.accounts[1].choiceId, "choice-camel");
    assert.equal(choices.accounts[1].authenticated, false);
    assert.equal(choices.accounts[1].displayName, "Camel Case");
    assert.equal(choices.accounts[1].revoked, true);
    assert.equal(choices.app.appId, "canvas");
    assert.equal(choices.app.returnToOrigin, "https://example.com");

    const testApiBaseUrl = "https://priestess.test";
    const listUrl = new URL(calls[0].url, testApiBaseUrl);
    assert.equal(listUrl.pathname, "/auth/priestess/account-choices");
    assert.equal(listUrl.searchParams.get("app_id"), "canvas");
    assert.equal(listUrl.searchParams.get("return_to"), "https://example.com/callback");
    assert.equal(calls[0].credentials, "include");

    const nestedChoices = await listLocalAccountChoices({
      appId: "canvas-nested",
      returnTo: "https://nested.example.com/callback",
    });
    assert.equal(nestedChoices.accounts.length, 1);
    assert.equal(nestedChoices.accounts[0].choiceId, "choice-nested");
    assert.equal(nestedChoices.accounts[0].displayName, "Nested User");
    assert.equal(nestedChoices.accounts[0].email, "nested@example.com");
    assert.equal(nestedChoices.app.appId, "canvas-nested");
    assert.equal(nestedChoices.app.returnToOrigin, "https://nested.example.com");

    const browserAccounts = await listLocalBrowserAccounts();
    assert.equal(browserAccounts.accounts.length, 1);
    assert.equal(browserAccounts.accounts[0].choiceId, "");
    assert.equal(browserAccounts.accounts[0].current, true);
    assert.equal(browserAccounts.accounts[0].displayName, "Browser User");
    const browserListUrl = new URL(calls[2].url, testApiBaseUrl);
    assert.equal(browserListUrl.pathname, "/auth/priestess/browser-accounts");
    assert.equal(calls[2].credentials, "include");

    const selected = await authorizeLocalSession({
      appId: "canvas",
      choiceId: "choice-snake",
      returnTo: "https://example.com/callback",
    });
    assert.equal(selected.redirectUrl, "https://example.com/callback?login_code=mock");
    assert.deepEqual(calls[3].body, {
      app_id: "canvas",
      choice_id: "choice-snake",
      return_to: "https://example.com/callback",
    });

    const current = await authorizeLocalSession({
      appId: "canvas",
      returnTo: "https://example.com/current",
    });
    assert.equal(current.redirectUrl, "https://example.com/current");
    assert.deepEqual(calls[4].body, {
      app_id: "canvas",
      return_to: "https://example.com/current",
    });

    const removed = await removeLocalAccountChoice("user-snake");
    assert.equal(removed.authenticated, true);
    assert.equal(removed.current, false);
    assert.equal(removed.removed, true);
    assert.equal(removed.revoked, true);
    assert.equal(removed.userId, "user-snake");
    const removeUrl = new URL(calls[5].url, testApiBaseUrl);
    assert.equal(removeUrl.pathname, "/auth/priestess/account-choices/user-snake");
    assert.equal(calls[5].method, "DELETE");
    assert.equal(calls[5].credentials, "include");

    const activated = await activateLocalAccountChoice("user-snake", { choiceId: "choice-snake" });
    assert.equal(activated.authenticated, true);
    assert.equal(activated.user?.userId, "user-snake");
    assert.equal(activated.user?.username, "snake");
    const activateUrl = new URL(calls[6].url, testApiBaseUrl);
    assert.equal(activateUrl.pathname, "/auth/priestess/account-choices/user-snake/activate");
    assert.equal(calls[6].method, "POST");
    assert.deepEqual(calls[6].body, { choice_id: "choice-snake" });
    assert.equal(calls[6].credentials, "include");

    const login = await loginLocalSession({
      password: "secret-password",
      turnstileToken: "turnstile-ok",
      username: "login-user",
    });
    assert.equal(login.authenticated, true);
    assert.deepEqual(calls[7].body, {
      password: "secret-password",
      turnstile_token: "turnstile-ok",
      username: "login-user",
    });

    const inviteCheck = await checkRegisterInvite({
      identity: "register@example.com",
      identityType: "email",
      inviteCode: "INVITE-2026",
      turnstileToken: "turnstile-register",
    });
    assert.equal(inviteCheck.accepted, true);
    assert.equal(inviteCheck.inviteChallenge, "invite.challenge");
    const inviteCheckUrl = new URL(calls[8].url, testApiBaseUrl);
    assert.equal(inviteCheckUrl.pathname, "/auth/priestess/register/invite-check");
    assert.deepEqual(calls[8].body, {
      identity: "register@example.com",
      identity_type: "email",
      invite_code: "INVITE-2026",
      turnstile_token: "turnstile-register",
    });

    const registration = await confirmLocalRegistration({
      displayName: "Register User",
      identity: "register@example.com",
      identityType: "email",
      inviteChallenge: "invite.challenge",
      inviteCode: "INVITE-2026",
      password: "secret-register-password",
      username: "register-user",
      verificationCode: "482913",
      verificationRequestId: "prv_test_request",
    });
    assert.equal(registration.authenticated, true);
    const registrationUrl = new URL(calls[9].url, testApiBaseUrl);
    assert.equal(registrationUrl.pathname, "/auth/priestess/register/confirm");
    assert.deepEqual(calls[9].body, {
      display_name: "Register User",
      identity: "register@example.com",
      identity_type: "email",
      invite_challenge: "invite.challenge",
      invite_code: "INVITE-2026",
      password: "secret-register-password",
      username: "register-user",
      verification_code: "482913",
      verification_request_id: "prv_test_request",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testLocalLoginTurnstileRetry({ loginLocalSessionWithTurnstileRetry, PriestessApiError }) {
  const credentials = {
    password: "secret-password",
    username: "login-user",
  };
  const requiredError = new PriestessApiError("Turnstile required", {
    payload: { error: { code: "local_login_turnstile_required" } },
    status: 403,
  });
  const successfulSession = {
    authenticated: true,
    expiresAt: "",
    mfaRequired: false,
    user: { userId: "user-login", username: "login-user" },
  };
  const loginCalls = [];
  const challengeCalls = [];

  const session = await loginLocalSessionWithTurnstileRetry({
    credentials,
    login: async(nextCredentials) => {
      loginCalls.push(nextCredentials);
      if (loginCalls.length === 1) throw requiredError;
      return successfulSession;
    },
    readSiteKey: () => "site-key-login",
    requestChallenge: async(params) => {
      challengeCalls.push(params);
      return "turnstile-ok";
    },
    signal: new AbortController().signal,
    t: (key) => key,
  });

  assert.equal(session, successfulSession);
  assert.deepEqual(loginCalls, [
    credentials,
    {
      ...credentials,
      turnstileToken: "turnstile-ok",
    },
  ]);
  assert.deepEqual(challengeCalls, [{
    action: "local_login",
    description: "这次登录需要先通过 Cloudflare 验证。",
    siteKey: "site-key-login",
    title: "请完成人机验证",
  }]);

  const missingSiteKeyError = await rejectsWithValue(() => loginLocalSessionWithTurnstileRetry({
    credentials,
    login: async() => {
      throw requiredError;
    },
    readSiteKey: () => "",
    requestChallenge: async() => {
      throw new Error("should not render challenge");
    },
    signal: new AbortController().signal,
    t: (key) => key,
  }));
  assert.match(String(missingSiteKeyError?.message), /验证码组件未配置/);

  const invalidCredentialsError = new PriestessApiError("Invalid password", {
    payload: { error: { code: "invalid_local_credentials" } },
    status: 401,
  });
  const failedRetryCalls = [];
  const failedRetryError = await rejectsWithValue(() => loginLocalSessionWithTurnstileRetry({
    credentials,
    login: async(nextCredentials) => {
      failedRetryCalls.push(nextCredentials);
      if (failedRetryCalls.length === 1) throw requiredError;
      throw invalidCredentialsError;
    },
    readSiteKey: () => "site-key-login",
    requestChallenge: async() => "turnstile-ok",
    signal: new AbortController().signal,
    t: (key) => key,
  }));
  assert.equal(failedRetryError, invalidCredentialsError);
  assert.deepEqual(failedRetryCalls[1], {
    ...credentials,
    turnstileToken: "turnstile-ok",
  });
}

async function rejectsWithValue(run) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  assert.fail("expected promise to reject");
}

async function testAccountChoiceFallback({ readAuthAccountChoicesForRequest, readStandaloneBrowserAccounts }) {
  const authRequest = {
    appId: "canvas",
    returnTo: "https://example.com/callback",
  };

  const authenticatedFallback = await withMockFetch([
    jsonResponse({ error: "not_found" }, 404),
    jsonResponse({
      authenticated: true,
      expires_at: "2026-05-24T12:00:00.000Z",
      user: {
        display_name: "Current User",
        email: "current@example.com",
        user_id: "user-current",
        username: "current",
      },
    }),
  ], async(calls) => {
    const result = await readAuthAccountChoicesForRequest(authRequest, new AbortController().signal);
    assert.equal(calls.length, 2);
    const testApiBaseUrl = "https://priestess.test";
    assert.equal(new URL(calls[0].url, testApiBaseUrl).pathname, "/auth/priestess/account-choices");
    assert.equal(new URL(calls[1].url, testApiBaseUrl).pathname, "/auth/priestess/session");
    return result;
  });

  assert.equal(authenticatedFallback.error, "");
  assert.equal(authenticatedFallback.accounts.length, 1);
  assert.equal(authenticatedFallback.accounts[0].source, "current-session");
  assert.equal(authenticatedFallback.accounts[0].authorizeChoiceId, null);
  assert.equal(authenticatedFallback.accounts[0].displayName, "Current User");

  const emptyFallback = await withMockFetch([
    jsonResponse({ code: "unsupported_endpoint" }, 501),
    jsonResponse({ authenticated: false }),
  ], async() => readAuthAccountChoicesForRequest(authRequest, new AbortController().signal));

  assert.equal(emptyFallback.accounts.length, 0);
  assert.equal(emptyFallback.error, "");

  const standaloneAccounts = await withMockFetch([
    jsonResponse({
      accounts: [{
        current: true,
        display_name: "Standalone User",
        email: "standalone@example.com",
        user_id: "user-standalone",
        username: "standalone",
      }],
    }),
  ], async(calls) => {
    const result = await readStandaloneBrowserAccounts(new AbortController().signal);
    assert.equal(new URL(calls[0].url, "https://priestess.test").pathname, "/auth/priestess/browser-accounts");
    return result;
  });
  assert.equal(standaloneAccounts.accounts.length, 1);
  assert.equal(standaloneAccounts.accounts[0].source, "browser-accounts");
  assert.equal(standaloneAccounts.accounts[0].authorizeChoiceId, null);
  assert.equal(standaloneAccounts.app, null);

  const missingChoiceId = await withMockFetch([
    jsonResponse({
      accounts: [{
        display_name: "Missing Choice",
        email: "missing@example.com",
        user_id: "user-missing",
        username: "missing",
      }],
    }),
  ], async() => readAuthAccountChoicesForRequest(authRequest, new AbortController().signal));

  assert.equal(missingChoiceId.accounts.length, 1);
  assert.match(missingChoiceId.error, /缺少 choice_id/);

  await assert.rejects(
    () => withMockFetch([
      jsonResponse({ error: "server_error" }, 500),
    ], async() => readAuthAccountChoicesForRequest(authRequest, new AbortController().signal)),
    /账户服务|server_error|请求失败|账号选择/,
  );
}

function testAccountChoiceErrorRedaction({ getAuthAccountChoiceErrorMessage, getPriestessApiErrorMessage, redactSensitiveAuthText }) {
  assert.equal(
    redactSensitiveAuthText("redirect failed: https://example.com/callback?login_code=abc123&state=ok token=xyz"),
    "redirect failed: https://example.com/callback?login_code=[已隐藏]&state=ok token=[已隐藏]",
  );
  assert.equal(
    redactSensitiveAuthText("session_id=sess_123; cookie=cf_clearance; password=hunter2"),
    "session_id=[已隐藏]; cookie=[已隐藏]; password=[已隐藏]",
  );
  assert.equal(
    getAuthAccountChoiceErrorMessage(new Error("choice_id=choice-secret private_key=secret"), "fallback"),
    "choice_id=[已隐藏] private_key=[已隐藏]",
  );
  assert.equal(
    getPriestessApiErrorMessage(new Error("access_token=abc123 refresh_token=def456")),
    "access_token=[已隐藏] refresh_token=[已隐藏]",
  );
}

function renderPicker(AccountPickerCard, props) {
  // 用 SSR 只验证可见文案和状态分支，真实交互仍由浏览器 smoke 覆盖。
  return renderWithI18n(React.createElement(AccountPickerCard, {
    accounts: props.accounts,
    app: props.app ?? {
      appId: "canvas",
      raw: null,
      returnToOrigin: "https://example.com",
    },
    busyAccountId: props.busyAccountId ?? "",
    disabled: false,
    error: props.error ?? "",
    mode: props.mode ?? "authorization",
    removingAccountId: props.removingAccountId ?? "",
    onOpenAccountAction() {},
    onRemoveAccount() {},
    onRetry() {},
    onSelectAccount() {},
    onUseAnotherAccount() {},
    status: props.status,
  }));
}

function renderAccountActionsDialog(AccountPickerActionsDialog, props) {
  return renderWithI18n(React.createElement(AccountPickerActionsDialog, {
    account: props.account,
    busy: props.busy ?? false,
    onClose() {},
    onOpenAccountAction() {},
    onSignOut() {},
  }));
}

function renderLoginForm(LoginForm, props = {}) {
  // 登录表单的返回按钮只依赖 props 分支，用 SSR 覆盖裸登录、授权添加账号和 TOTP 三种入口。
  return renderWithI18n(React.createElement(LoginForm, {
    disabled: false,
    isAuthorizing: false,
    onBackToAccountPicker() {},
    onCancelTotp() {},
    onCreateAccount() {},
    onForgotPassword() {},
    onPasskeyLogin() {},
    onTotpSubmit() {},
    onValidSubmit() {},
    showBackToAccountPicker: props.showBackToAccountPicker ?? false,
    showCreateAccount: true,
    totpChallenge: props.totpChallenge ?? null,
  }));
}

function renderWithI18n(element) {
  return renderToStaticMarkup(React.createElement(PriestessI18nProvider, {
    resources: loginI18nResources,
  }, element));
}

function buildAccount(overrides) {
  return {
    authenticated: true,
    avatarUrl: "",
    authorizeChoiceId: overrides.choiceId,
    choiceId: overrides.choiceId,
    current: false,
    displayName: "",
    email: "",
    expiresAt: "",
    lastUsedAt: "",
    raw: {},
    revoked: false,
    source: "account-choices",
    userId: "",
    username: "",
    ...overrides,
  };
}

function buildLocalSession(userOverrides = {}) {
  return {
    authenticated: true,
    challengeId: "",
    expiresAt: "",
    mfaRequired: false,
    mfaType: "",
    raw: {},
    user: {
      address: "",
      avatarUrl: "",
      birthday: "",
      displayName: "",
      email: "",
      enabled: true,
      passwordManager: null,
      phone: "",
      userId: "",
      username: "",
      ...userOverrides,
    },
  };
}

async function withMockFetch(responses, callback) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async(url, init = {}) => {
    calls.push({
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
      credentials: init.credentials,
      headers: init.headers,
      method: init.method ?? "GET",
      url: String(url),
    });
    const response = responses.shift();
    assert.ok(response, `unexpected fetch call ${String(url)}`);
    return response;
  };

  try {
    return await callback(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
