import { MANAGE_ROUTE_PATH } from "./routes";
import type { LocalSession } from "@priestess/shared";
import type { AuthAccountChoice } from "./useAuthAccountChoices";

export type AccountManagementAction = "avatar" | "password" | "profile";
export type AccountManagementActionSection = "overview" | "security";
export type AccountManagementActionTarget =
  | { path: string; status: "ready" }
  | { path: ""; status: "session-mismatch" | "signed-out" };

export const ACCOUNT_MANAGEMENT_ACTION_PARAM = "account_action";

const ACCOUNT_MANAGEMENT_ACTIONS = new Set<AccountManagementAction>(["avatar", "password", "profile"]);

export function buildAccountManagementActionPath(action: AccountManagementAction) {
  const search = `${ACCOUNT_MANAGEMENT_ACTION_PARAM}=${encodeURIComponent(action)}`;
  const hash = getAccountManagementActionSection(action) === "security" ? "#security" : "";
  return `${MANAGE_ROUTE_PATH}?${search}${hash}`;
}

export function getAccountManagementActionSection(action: AccountManagementAction): AccountManagementActionSection {
  return action === "password" ? "security" : "overview";
}

export function readAccountManagementAction(search: string | URLSearchParams | null = getBrowserSearch()) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? "");
  const action = params.get(ACCOUNT_MANAGEMENT_ACTION_PARAM);
  return isAccountManagementAction(action) ? action : null;
}

export function removeAccountManagementActionFromSearch(search: string | URLSearchParams | null) {
  const params = search instanceof URLSearchParams ? new URLSearchParams(search) : new URLSearchParams(search ?? "");
  params.delete(ACCOUNT_MANAGEMENT_ACTION_PARAM);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : "";
}

export function resolveAccountManagementActionTarget(
  account: AuthAccountChoice,
  action: AccountManagementAction,
  session: LocalSession,
): AccountManagementActionTarget {
  if (!isAccountEditableInBrowser(account)) {
    return { path: "", status: "signed-out" };
  }
  if (!isSessionForAccountChoice(session, account)) {
    return { path: "", status: "session-mismatch" };
  }
  return { path: buildAccountManagementActionPath(action), status: "ready" };
}

export function isAccountEditableInBrowser(account: AuthAccountChoice) {
  return account.authenticated && !account.revoked;
}

export function isSessionForAccountChoice(session: LocalSession, account: AuthAccountChoice) {
  const user = session.user;
  if (!session.authenticated || !user) {
    return false;
  }
  if (account.userId && user.userId) {
    return account.userId === user.userId;
  }
  const accountUsername = account.username.trim().toLowerCase();
  const sessionUsername = user.username.trim().toLowerCase();
  if (accountUsername && sessionUsername && accountUsername === sessionUsername) {
    return true;
  }
  const accountEmail = account.email.trim().toLowerCase();
  const sessionEmail = user.email.trim().toLowerCase();
  return Boolean(accountEmail && sessionEmail && accountEmail === sessionEmail);
}

function isAccountManagementAction(action: string | null): action is AccountManagementAction {
  return ACCOUNT_MANAGEMENT_ACTIONS.has(action as AccountManagementAction);
}

function getBrowserSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}
