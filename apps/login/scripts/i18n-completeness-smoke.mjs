import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDirectory, "..");
const sourceRoot = join(appRoot, "src");
const loginResourcePath = join(sourceRoot, "i18n/loginResources.ts");
const accountResourcePath = join(sourceRoot, "i18n/accountResources.ts");
const sharedResourcePath = resolve(appRoot, "../../packages/priestess-shared/src/lib/i18n.tsx");

const loginKeys = readResourceKeys(loginResourcePath);
const accountKeys = readResourceKeys(accountResourcePath);
const commonKeys = readResourceKeys(sharedResourcePath);
const missing = [];

for (const filePath of walkSourceFiles(sourceRoot)) {
  const source = readFileSync(filePath, "utf8");
  const namespace = source.includes('usePriestessTranslation("account")')
    ? "account"
    : source.includes('usePriestessTranslation("login")') || filePath.endsWith("/App.tsx")
      ? "login"
      : source.includes('usePriestessTranslation("common")')
        ? "common"
        : null;
  if (!namespace) continue;

  const availableKeys = namespace === "account" ? accountKeys : namespace === "login" ? loginKeys : commonKeys;
  for (const key of readLiteralTranslationKeys(source)) {
    if (!availableKeys.has(key)) {
      missing.push(`${namespace}:${key} (${filePath.slice(sourceRoot.length + 1)})`);
    }
  }
}

for (const filePath of walkSourceFiles(sourceRoot)) {
  const source = readFileSync(filePath, "utf8");
  for (const match of source.matchAll(/translatePriestess\("(login|account|common):((?:\\.|[^"])*)"/g)) {
    const namespace = match[1];
    const key = JSON.parse(`"${match[2]}"`);
    const availableKeys = namespace === "account" ? accountKeys : namespace === "login" ? loginKeys : commonKeys;
    if (!availableKeys.has(key)) {
      missing.push(`${namespace}:${key} (${filePath.slice(sourceRoot.length + 1)})`);
    }
  }
}

assert.deepEqual(missing, [], `English i18n resources are missing static keys:\n${missing.join("\n")}`);
console.log(`i18n completeness smoke passed (${loginKeys.size} login, ${accountKeys.size} account, ${commonKeys.size} common keys)`);

function readResourceKeys(filePath) {
  const source = readFileSync(filePath, "utf8");
  return new Set(Array.from(source.matchAll(/^\s+"((?:\\.|[^"])*)":/gm), (match) => JSON.parse(`"${match[1]}"`)));
}

function readLiteralTranslationKeys(source) {
  return Array.from(source.matchAll(/\bt\("((?:\\.|[^"])*)"/g), (match) => JSON.parse(`"${match[1]}"`));
}

function walkSourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return walkSourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(path) && !path.includes("/i18n/") ? [path] : [];
  });
}
