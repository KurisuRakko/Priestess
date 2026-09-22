import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const BROKEN_AVATAR_URL = "https://broken.example.invalid/avatar-does-not-exist.png";
// 同源慢速断图：既能观测到「重新尝试真实头像」，又会在最后以 404 收场。
const SLOW_BROKEN_AVATAR_PATH = "/slow-broken-avatar.png";
const RETURN_TO = "https://client.example.com/callback?login_code=leaky";
const RETURN_TO_ORIGIN = "https://client.example.com";
const QR_CONFIRM_POLL_INTERVAL_MS = 1500;
// 观察窗口取轮询间隔的 1.6 倍：进入终态后只要还发一次请求就必然落在窗口里。
const POLL_QUIET_WINDOW_MS = Math.round(QR_CONFIRM_POLL_INTERVAL_MS * 1.6);

let activeScenario = null;
let mockApiBaseUrl = "";
let browser;
let viteServer;
let apiServer;

try {
  const api = await startMockApiServer();
  apiServer = api.server;
  mockApiBaseUrl = api.baseUrl;
  process.env.VITE_PRIESTESS_API_BASE_URL = api.baseUrl;
  process.env.VITE_PRIESTESS_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

  viteServer = await createViteServer({
    appType: "spa",
    logLevel: "silent",
    root: appRoot,
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await viteServer.listen();
  const viteAddress = viteServer.httpServer?.address();
  assert.ok(viteAddress && typeof viteAddress === "object", "vite server address missing");
  const appUrl = `http://127.0.0.1:${viteAddress.port}`;

  const { chromium } = await importPlaywright();
  browser = await launchBrowser(chromium);
  const defaultAvatarAssetPath = await readDefaultAvatarAssetPath();

  await testConfirmAvatarFallsBackWhenImageFails({ appUrl, defaultAvatarAssetPath });
  await testConfirmAvatarResetsAfterUrlChange({ appUrl, defaultAvatarAssetPath });
  await testAccountPickerAvatarFallsBackWhenImageFails({ appUrl, defaultAvatarAssetPath });
  await testConfirmPageShowsAuthorizationOrigin({ appUrl });
  await testSecurityReasonCopyDiffers({ appUrl });
  await testPollingStopsAfterTerminalState({ appUrl });
  await testBackgroundRefreshKeepsOverlayOpen({ appUrl });

  console.log("qr-login-confirm browser smoke passed");
} finally {
  if (browser) await browser.close();
  if (viteServer) await viteServer.close();
  if (apiServer) await closeServer(apiServer);
}

// 1. 确认页给断图补上默认头像兜底（断言 DOM 属性，不看观感）
async function testConfirmAvatarFallsBackWhenImageFails({ appUrl, defaultAvatarAssetPath }) {
  await withScenario(createScenario({ avatarUrl: BROKEN_AVATAR_URL }), async(page) => {
    const avatar = await openConfirmPage(page, appUrl, "session-avatar-broken");
    const expectedAvatarUrl = await readDefaultAvatarUrl(page, defaultAvatarAssetPath);
    const finalSrc = await readImageSrc(avatar, expectedAvatarUrl);
    assert.equal(new URL(finalSrc).pathname, defaultAvatarAssetPath, "最终 src 必须落在默认头像上");

    const fallback = await readFallbackSrcAttempts(page, ".qr-mobile-device-card img.qr-mobile-avatar");
    assert.equal(fallback.currentFallback, expectedAvatarUrl, "断图后必须真的把默认头像写进 src");
    assert.deepEqual(fallback.fallbackUrls, [expectedAvatarUrl], "默认头像必须指向内置资源");
    assert.equal(fallback.fallbackWrites, 1, "默认头像只能写入一次，不能出现 onError 递归");
    assert.equal(await isImageLoaded(avatar), true, "兜底后的头像必须真的加载成功");
  });
}

// 2. avatar_url 变化后必须重置失败态，重新尝试真实头像
async function testConfirmAvatarResetsAfterUrlChange({ appUrl, defaultAvatarAssetPath }) {
  const scenario = createScenario({ avatarUrl: BROKEN_AVATAR_URL });
  await withScenario(scenario, async(page) => {
    const avatar = await openConfirmPage(page, appUrl, "session-avatar-reset");
    const defaultAvatarUrl = await readDefaultAvatarUrl(page, defaultAvatarAssetPath);
    await readImageSrc(avatar, defaultAvatarUrl);

    // 后端刷新出新的 avatar_url 后，失败态必须被清掉，不能永远停在默认图。
    // 必须走 mock API 的同源地址：页面 origin 上的路径会被 Vite dev server 自己接走。
    const nextAvatarUrl = `${mockApiBaseUrl}${SLOW_BROKEN_AVATAR_PATH}`;
    scenario.sessionAvatarUrl = nextAvatarUrl;
    const previousStatusRequests = scenario.records.statusRequests;
    await waitFor(
      () => scenario.records.statusRequests > previousStatusRequests,
      POLL_QUIET_WINDOW_MS * 3,
      "等待轮询拉回新的 avatar_url",
    );
    await waitFor(
      async() => await avatar.getAttribute("src") === nextAvatarUrl,
      POLL_QUIET_WINDOW_MS * 3,
      "avatar_url 变化后必须重新尝试真实头像",
    );

    // 新地址最终也失败，必须再兜底一次；两步合起来证明失败态确实跟着 avatar_url 重置了。
    await readImageSrc(avatar, defaultAvatarUrl);
    const fallback = await readFallbackSrcAttempts(page, ".qr-mobile-device-card img.qr-mobile-avatar");
    assert.equal(fallback.fallbackWrites, 2, "每个 avatar_url 各自兜底一次，失败态不能粘住");
  });
}

// 3. 账号选择卡片的头像同样要退到默认头像
async function testAccountPickerAvatarFallsBackWhenImageFails({ appUrl, defaultAvatarAssetPath }) {
  await withScenario(createScenario({ accountAvatarUrl: BROKEN_AVATAR_URL }), async(page) => {
    const url = new URL("/login", appUrl);
    url.searchParams.set("app_id", "canvas");
    url.searchParams.set("return_to", `${appUrl}/client-callback`);
    await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

    const avatar = page.locator(".account-picker__avatar img").first();
    await avatar.waitFor({ state: "visible", timeout: 7000 });
    const expectedAvatarUrl = await readDefaultAvatarUrl(page, defaultAvatarAssetPath);
    const finalSrc = await readImageSrc(avatar, expectedAvatarUrl);
    assert.equal(new URL(finalSrc).pathname, defaultAvatarAssetPath, "账号卡片最终 src 必须落在默认头像上");

    const fallback = await readFallbackSrcAttempts(page, ".account-picker__avatar img");
    assert.equal(fallback.currentFallback, expectedAvatarUrl, "账号卡片断图后必须真的把默认头像写进 src");
    assert.deepEqual(fallback.fallbackUrls, [expectedAvatarUrl], "账号卡片默认头像只能写入一次");
    assert.equal(await isImageLoaded(avatar), true, "兜底后的账号头像必须真的加载成功");
  });
}

// 4. 确认页必须把后端下发的 returnToOrigin 显示出来
async function testConfirmPageShowsAuthorizationOrigin({ appUrl }) {
  await withScenario(createScenario(), async(page) => {
    await openConfirmPage(page, appUrl, "session-origin");
    const origin = page.locator(".qr-mobile-origin");
    await origin.waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await origin.textContent(), `授权目标：${RETURN_TO_ORIGIN}`, "授权目标必须按 origin 渲染");
    // 只允许展示 origin：回跳地址里的 login_code 这类敏感参数不能泄漏到页面上。
    assert.equal((await page.locator("main.qr-mobile-shell").textContent()).includes("login_code"), false, "页面不能出现完整 return_to 里的敏感参数");
    assert.equal(await origin.getAttribute("title"), RETURN_TO_ORIGIN, "授权目标 title 只放 origin");
  });
}

// 5. 不同 securityReason 必须产出不同且非空的浮层文案
async function testSecurityReasonCopyDiffers({ appUrl }) {
  const differentRegion = await readOverlayMessage(appUrl, "different_region");
  const sameIp = await readOverlayMessage(appUrl, "same_ip");

  assert.ok(differentRegion.length > 0, "different_region 文案不能为空");
  assert.ok(sameIp.length > 0, "same_ip 文案不能为空");
  assert.notEqual(differentRegion, sameIp, "异地与同网文案必须不同");
  assert.match(differentRegion, /不同地区/, "异地文案必须点明地区差异");
  assert.match(differentRegion, /请立即取消/, "异地文案必须提示立即取消");
  assert.doesNotMatch(sameIp, /请立即取消/, "同网文案保持中性陈述");
}

// 6. 会话进入终态后必须停止轮询（断言终态之后一段时间内没有新请求命中 mock server）
async function testPollingStopsAfterTerminalState({ appUrl }) {
  const scenario = createScenario({ finalConfirmResult: "confirmed" });
  await withScenario(scenario, async(page) => {
    await openConfirmPage(page, appUrl, "session-terminal");
    await openFinalConfirmOverlay(page);

    await page.locator(".qr-mobile-overlay .qr-mobile-primary--danger").click();
    await page.locator(".qr-mobile-center--result").waitFor({ state: "visible", timeout: 7000 });
    assert.equal(await page.locator("h1", { hasText: "已授权登录" }).count(), 1, "终态渲染成功结果页");

    const requestsAtTerminal = scenario.records.statusRequests;
    assert.ok(requestsAtTerminal >= 2, "终态之前必须确实轮询过");
    await page.waitForTimeout(POLL_QUIET_WINDOW_MS);
    assert.equal(
      scenario.records.statusRequests,
      requestsAtTerminal,
      `进入终态后 ${POLL_QUIET_WINDOW_MS}ms 内不允许再有状态请求`,
    );
  });
}

// 7. 后台刷新失败按网络抖动处理：不打断界面，也不重复弹二次确认浮层
async function testBackgroundRefreshKeepsOverlayOpen({ appUrl }) {
  const scenario = createScenario();
  await withScenario(scenario, async(page) => {
    await openConfirmPage(page, appUrl, "session-flaky");
    await openFinalConfirmOverlay(page);
    assert.equal(await page.locator(".qr-mobile-overlay").count(), 1, "浮层初始状态可见");

    await waitFor(
      async() => await page.locator(".qr-mobile-overlay .qr-mobile-primary--danger").isEnabled(),
      6000,
      "等待二次确认按钮解禁",
    );
    scenario.statusError = true;
    const before = scenario.records.statusRequests;
    await waitFor(() => scenario.records.statusRequests > before, POLL_QUIET_WINDOW_MS * 3, "等待一次失败的轮询");

    assert.equal(await page.locator(".qr-mobile-overlay").count(), 1, "刷新失败不能把浮层关掉");
    assert.equal(await page.locator(".qr-mobile-center--error").count(), 0, "刷新失败不能把页面切成错误态");
    assert.equal(await page.locator("#qr-mobile-overlay-title").isVisible(), true, "浮层标题保持可见");
    assert.equal(
      await page.locator("#qr-mobile-overlay-title").textContent(),
      "请确认是你本人操作",
      "浮层标题不被刷新失败改写",
    );
  });
}

async function openConfirmPage(page, appUrl, sessionId) {
  const url = new URL("/qr-login", appUrl);
  url.searchParams.set("sessionId", sessionId);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  const avatar = page.locator(".qr-mobile-device-card img.qr-mobile-avatar");
  await avatar.waitFor({ state: "visible", timeout: 7000 });
  return avatar;
}

async function openFinalConfirmOverlay(page) {
  await page.locator(".qr-mobile-overlay").waitFor({ state: "visible", timeout: 7000 });
  assert.equal(await page.locator("#qr-mobile-overlay-title").textContent(), "请确认是你本人操作", "浮层标题必须渲染");
  await waitFor(
    async() => await page.locator(".qr-mobile-overlay .qr-mobile-primary--danger").isEnabled(),
    7000,
    "等待二次确认按钮解禁",
  );
}

async function readOverlayMessage(appUrl, securityReason) {
  let message = "";
  await withScenario(createScenario({ securityReason }), async(page) => {
    await openConfirmPage(page, appUrl, `session-reason-${securityReason}`);
    await page.locator(".qr-mobile-overlay").waitFor({ state: "visible", timeout: 7000 });
    const notice = page.locator(".qr-mobile-overlay > p").first();
    assert.equal(await notice.count(), 1, "浮层必须且只能有一个风险提示段落");
    message = (await notice.textContent())?.trim() ?? "";
  });
  return message;
}

async function withScenario(scenario, callback) {
  activeScenario = scenario;
  const context = await browser.newContext({
    locale: "zh-CN",
    // 二次确认倒计时必须真的跑起来，才能验证按钮在倒计时结束后解禁。
    reducedMotion: "no-preference",
    viewport: { height: 844, width: 390 },
  });
  const page = await context.newPage();
  await installImageSrcRecorder(page);
  try {
    await callback(page);
  } finally {
    await context.close();
    activeScenario = null;
  }
}

/**
 * 断图 -> 兜底是瞬时完成的，必须抢在 React 写入之前记录每一次 src 赋值，
 * 否则测试只能看到最终值，无法证明它确实经过默认头像。
 */
function installImageSrcRecorder(page) {
  return page.addInitScript(() => {
    window.__qrSmokeSrcs = [];
    const record = (element, value) => {
      if (!(element instanceof HTMLImageElement)) return;
      window.__qrSmokeSrcs.push({ url: String(value) });
    };

    // React 写 src 可能走属性赋值，也可能走 setAttribute，两条路径都要记录。
    const srcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      configurable: true,
      get() {
        return srcDescriptor.get.call(this);
      },
      set(value) {
        record(this, value);
        srcDescriptor.set.call(this, value);
      },
    });

    const setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function patchedSetAttribute(name, value) {
      if (String(name).toLowerCase() === "src") record(this, value);
      return setAttribute.call(this, name, value);
    };
  });
}

/** 读取该元素经历过的默认头像 URL 写入记录；断图场景下它必须出现过。 */
async function readFallbackSrcAttempts(page, selector) {
  return page.evaluate((imageSelector) => {
    const image = document.querySelector(imageSelector);
    const records = Array.isArray(window.__qrSmokeSrcs) ? window.__qrSmokeSrcs : [];
    const current = image instanceof HTMLImageElement ? image.getAttribute("src") ?? "" : "";
    const fallbackUrls = records
      .filter((entry) => entry.url.includes("priestess-default-avatar"))
      .map((entry) => new URL(entry.url, window.location.href).href);
    return {
      currentFallback: current.includes("priestess-default-avatar") ? current : "",
      fallbackUrls: Array.from(new Set(fallbackUrls)),
      fallbackWrites: fallbackUrls.length,
    };
  }, selector);
}

function createScenario(options = {}) {
  return {
    accountAvatarUrl: options.accountAvatarUrl ?? "",
    avatarUrl: options.avatarUrl ?? "",
    sessionAvatarUrl: options.sessionAvatarUrl ?? "",
    finalConfirmResult: options.finalConfirmResult ?? "confirmed",
    securityReason: options.securityReason ?? "different_region",
    statusError: options.statusError ?? false,
    records: {
      accountChoices: 0,
      finalConfirms: 0,
      sessionReads: 0,
      statusRequests: 0,
    },
  };
}

async function startMockApiServer() {
  const server = createHttpServer(async(req, res) => {
    const origin = req.headers.origin || "http://127.0.0.1";
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "accept, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS, POST");
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

    // 慢速断图端点：先让前端真的去尝试新地址，再以失败收场。
    if (req.method === "GET" && url.pathname === SLOW_BROKEN_AVATAR_PATH) {
      // 够慢，让「重新尝试真实头像」这个中间态可观测；又要能在断言窗口内失败收场。
      await delay(1500);
      writeJson(res, 404, { error: { code: "avatar_not_found" } });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/session") {
      scenario.records.sessionReads += 1;
      writeJson(res, 200, {
        authenticated: true,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        user: buildSessionUser(scenario.sessionAvatarUrl || scenario.avatarUrl),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/priestess/account-choices") {
      scenario.records.accountChoices += 1;
      writeJson(res, 200, {
        accounts: [{
          avatar_url: scenario.accountAvatarUrl,
          choice_id: "choice-qr-smoke",
          current: true,
          display_name: "扫码确认用户",
          email: "qr-smoke@example.com",
          user_id: "user-qr-smoke",
          username: "qr-smoke",
        }],
        app: { app_id: "canvas", return_to_origin: origin },
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/priestess/qr/sessions") {
      writeJson(res, 201, { expires_in: 120, qr_url: `${origin}/qr-login`, session_id: "qr-smoke-1", status: "pending" });
      return;
    }

    const qrSessionMatch = url.pathname.match(/^\/auth\/priestess\/qr\/sessions\/([^/]+)$/);
    if (req.method === "GET" && qrSessionMatch) {
      scenario.records.statusRequests += 1;
      if (scenario.statusError) {
        writeJson(res, 503, { error: { code: "qr_session_unavailable", message: "扫码会话暂时不可用" } });
        return;
      }
      writeJson(res, 200, buildQrEnvelope(scenario, "pre_confirmed"));
      return;
    }

    const qrConfirmMatch = url.pathname.match(/^\/auth\/priestess\/qr\/sessions\/([^/]+)\/confirm-final$/);
    if (req.method === "POST" && qrConfirmMatch) {
      scenario.records.finalConfirms += 1;
      writeJson(res, 200, buildQrEnvelope(scenario, scenario.finalConfirmResult));
      return;
    }

    writeJson(res, 404, { error: { code: "not_found" } });
  });

  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object", "mock API server address missing");
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

function buildSessionUser(avatarUrl) {
  return {
    avatar_url: avatarUrl,
    display_name: "扫码确认用户",
    user_id: "user-qr-smoke",
    username: "qr-smoke",
  };
}

function buildQrEnvelope(scenario, status) {
  const terminal = status === "confirmed" || status === "rejected" || status === "expired";
  return {
    can_confirm: status === "pending",
    can_final_confirm: status === "pre_confirmed",
    can_reject: !terminal,
    expires_in: 120,
    requires_confirmation: status === "pre_confirmed",
    security_reason: status === "pre_confirmed" ? scenario.securityReason : "",
    server_time: Math.floor(Date.now() / 1000),
    // 轮询响应也会带回本地用户：avatar_url 变了，前端必须重新尝试真实头像。
    user: buildSessionUser(scenario.sessionAvatarUrl || scenario.avatarUrl),
    session: {
      app: { app_id: "canvas", name: "Canvas" },
      expires_in: 120,
      pc_context: { colo: "SJC", country: "US", ip_address: "203.0.113.7", user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120" },
      phone_context: { colo: "HKG", country: "CN", ip_address: "198.51.100.9", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1" },
      return_to: RETURN_TO,
      return_to_origin: RETURN_TO_ORIGIN,
      session_id: "qr-smoke-1",
      status,
    },
  };
}

async function readImageSrc(locator, expectedUrl) {
  // 断图 -> onError -> setState -> 换 src 是异步的，必须等到 src 真的换成默认头像。
  await waitFor(
    async() => await locator.getAttribute("src") === expectedUrl,
    5000,
    `头像 src 必须回落到默认头像 ${expectedUrl}`,
  );
  return locator.getAttribute("src");
}

function isImageLoaded(locator) {
  return locator.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0);
}

/**
 * 默认头像 URL 只从共享包的客户端产物里读：SSR 转换保留 `../assets/...` 相对写法，
 * 只有客户端转换会把 import.meta.url 改写成浏览器真正请求的 `${origin}/@fs/...`。
 */
async function readDefaultAvatarAssetPath() {
  const sharedLibDir = new URL("../../../packages/priestess-shared/src/lib/", import.meta.url).pathname;
  const transformed = await viteServer.transformRequest(`/@fs${sharedLibDir}avatar.ts`);
  assert.ok(transformed?.code, "avatar.ts 的客户端转换结果缺失");
  const match = transformed.code.match(/PRIESTESS_DEFAULT_AVATAR_URL = new URL\("([^"]+)"/);
  assert.ok(match, "avatar.ts 客户端产物里找不到默认头像 URL");
  const assetPath = new URL(match[1], "http://127.0.0.1").pathname;
  assert.match(assetPath, /^\/@fs\/.+priestess-default-avatar\.png$/, `默认头像必须是 Vite /@fs 资源路径，实际拿到 ${assetPath}`);
  return assetPath;
}

/** 浏览器里默认头像解析到 ${pageOrigin}/@fs/...，必须按真实页面 origin 拼出期望值。 */
async function readDefaultAvatarUrl(page, assetPath) {
  const pageOrigin = await page.evaluate(() => window.location.origin);
  return `${pageOrigin}${assetPath}`;
}

async function importPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const packageRoot = findPackageRootFromPath("playwright");
    if (!packageRoot) {
      throw new Error("Playwright is not available. Run this script through `npx --yes --package playwright -c \"node scripts/qr-login-confirm-browser-smoke.mjs\"`.");
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
