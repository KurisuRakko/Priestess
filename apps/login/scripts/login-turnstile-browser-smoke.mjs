import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { delimiter } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
const TURNSTILE_TOKEN = "browser-turnstile-token";

const loginBodies = [];
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
  const page = await browser.newPage();
  await page.addInitScript(({ siteKey, token }) => {
    window.__PRIESTESS_CONFIG__ = { turnstileSiteKey: siteKey };
    window.turnstile = {
      render(container, options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Fake Cloudflare Turnstile";
        button.dataset.priestessSmokeTurnstile = "ready";
        button.style.cssText = "width: 100%; min-height: 58px; border-radius: 8px; border: 1px solid #d7d0c8; background: #fff; color: #24231f;";
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
  }, { siteKey: TURNSTILE_SITE_KEY, token: TURNSTILE_TOKEN });

  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("input[autocomplete='username']").fill("login-user");
  await page.locator("input[autocomplete='current-password']").fill("secret-password");
  await page.locator(".login-form .primary-button[type='submit']").click();

  await page.waitForSelector(".login-success-overlay.is-challenge", { timeout: 5000 });
  await page.waitForSelector("[data-priestess-smoke-turnstile='ready']", { timeout: 5000 });
  await writeScreenshot(page, "login-turnstile-challenge.png");
  await page.locator("[data-priestess-smoke-turnstile='ready']").click();

  await page.waitForSelector(".login-success-overlay.is-success", { timeout: 5000 });
  await waitFor(() => loginBodies.length === 2, 5000, "expected login retry with Turnstile token");
  assert.deepEqual(loginBodies[0], {
    password: "secret-password",
    username: "login-user",
  });
  assert.deepEqual(loginBodies[1], {
    password: "secret-password",
    turnstile_token: TURNSTILE_TOKEN,
    username: "login-user",
  });

  console.log("login turnstile browser smoke passed");
} finally {
  if (browser) await browser.close();
  if (viteServer) await viteServer.close();
  if (apiServer) await closeServer(apiServer);
}

async function startMockApiServer() {
  const server = createHttpServer(async(req, res) => {
    const origin = req.headers.origin || "http://127.0.0.1";
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "accept, content-type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/auth/priestess/session") {
      writeJson(res, 200, { authenticated: false });
      return;
    }

    if (req.method === "POST" && req.url === "/auth/priestess/session") {
      const body = await readJsonBody(req);
      loginBodies.push(body);
      if (!body.turnstile_token) {
        writeJson(res, 403, {
          error: {
            code: "local_login_turnstile_required",
            message: "Turnstile verification is required",
          },
        });
        return;
      }
      if (body.turnstile_token !== TURNSTILE_TOKEN) {
        writeJson(res, 403, {
          error: {
            code: "local_login_turnstile_failed",
            message: "Turnstile verification failed",
          },
        });
        return;
      }
      writeJson(res, 200, {
        authenticated: true,
        expires_at: "2026-06-03T00:00:00.000Z",
        user: {
          display_name: "Login User",
          email: "login@example.com",
          user_id: "user-login",
          username: "login-user",
        },
      });
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

async function writeScreenshot(page, filename) {
  const outputDir = resolve(repoRoot, "output/playwright");
  mkdirSync(outputDir, { recursive: true });
  await page.screenshot({ fullPage: true, path: resolve(outputDir, filename) });
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

async function waitFor(predicate, timeoutMs, message) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw new Error(message);
}
