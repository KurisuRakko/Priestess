export type AccountPageModule = typeof import("../components/AccountPage");

let accountPageModulePromise: Promise<AccountPageModule> | null = null;

export function loadAccountPageModule() {
  accountPageModulePromise ??= import("../components/AccountPage").catch((error) => {
    // 分包请求失败后允许用户原位重试；不能永久缓存一次瞬时网络错误。
    accountPageModulePromise = null;
    throw error;
  });
  return accountPageModulePromise;
}

export function resetAccountPageModuleLoader() {
  accountPageModulePromise = null;
}
