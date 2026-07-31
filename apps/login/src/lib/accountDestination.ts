import type { LocalSession } from "@priestess/shared";
import {
  getAccountManagementActionSection,
  readAccountManagementAction,
  type AccountManagementAction,
} from "./accountManagementAction";
import { normalizePriestessNextPath } from "./loginNext";

const ACCOUNT_DESTINATION_BASE = "https://priestess.local";

export type AccountPageSection = "overview" | "security" | "devices" | "services" | "privacy";

export type AccountDestination = {
  action: AccountManagementAction | null;
  path: string;
  section: AccountPageSection;
};

export type AccountHandoffRequest = {
  destination: AccountDestination;
  session: LocalSession;
};

const ACCOUNT_PAGE_SECTIONS = new Set<AccountPageSection>([
  "overview",
  "security",
  "devices",
  "services",
  "privacy",
]);

export function resolveAccountDestination(path: string): AccountDestination | null {
  const safePath = normalizePriestessNextPath(path);
  if (!safePath) {
    return null;
  }

  const url = new URL(safePath, ACCOUNT_DESTINATION_BASE);
  const action = readAccountManagementAction(url.search);
  const hashSection = url.hash.replace(/^#/, "");
  const section = action
    ? getAccountManagementActionSection(action)
    : ACCOUNT_PAGE_SECTIONS.has(hashSection as AccountPageSection)
      ? hashSection as AccountPageSection
      : "overview";

  return {
    action,
    path: `${url.pathname}${url.search}${url.hash}`,
    section,
  };
}

export function createAccountHandoffRequest(session: LocalSession, path: string): AccountHandoffRequest | null {
  if (!session.authenticated || !session.user) {
    return null;
  }

  const destination = resolveAccountDestination(path);
  return destination ? { destination, session } : null;
}
