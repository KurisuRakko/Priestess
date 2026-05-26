import type { ResourceLanguage } from "i18next";
import type { PriestessI18nResources, PriestessLocale } from "@priestess/shared";
import { accountTextResources } from "./accountResources";
import { loginTextResources } from "./loginResources";

export const loginI18nResources = mergeResources(loginTextResources, accountTextResources);

function mergeResources(...resourcesList: PriestessI18nResources[]): PriestessI18nResources {
  const merged: PriestessI18nResources = {};

  for (const resources of resourcesList) {
    for (const [locale, languageResources] of Object.entries(resources) as Array<[PriestessLocale, ResourceLanguage]>) {
      merged[locale] = {
        ...(merged[locale] ?? {}),
        ...languageResources,
      };
    }
  }

  return merged;
}
