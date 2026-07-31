import { Languages } from "lucide-react";
import {
  changePriestessLanguage,
  normalizePriestessLocale,
  PRIESTESS_DEFAULT_LOCALE,
  PRIESTESS_EN_LOCALE,
  usePriestessTranslation,
  type PriestessLocale,
} from "@priestess/shared";
import "./PriestessLanguageSwitcher.css";

export function PriestessLanguageSwitcher() {
  const { i18n, t } = usePriestessTranslation("common");
  const locale = normalizePriestessLocale(i18n.resolvedLanguage || i18n.language);

  const selectLocale = (nextLocale: string) => {
    if (nextLocale !== PRIESTESS_DEFAULT_LOCALE && nextLocale !== PRIESTESS_EN_LOCALE) {
      return;
    }
    void changePriestessLanguage(nextLocale as PriestessLocale);
  };

  return (
    <label className="priestess-language-switcher">
      <Languages aria-hidden="true" size={16} strokeWidth={1.8} />
      <span className="priestess-language-switcher__label">
        {locale === PRIESTESS_EN_LOCALE ? "EN" : "中"}
      </span>
      <select
        aria-label={t("切换界面语言")}
        onChange={(event) => selectLocale(event.target.value)}
        value={locale}
      >
        <option value={PRIESTESS_DEFAULT_LOCALE}>{t("简体中文")}</option>
        <option value={PRIESTESS_EN_LOCALE}>{t("英语")}</option>
      </select>
    </label>
  );
}
