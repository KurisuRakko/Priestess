import { usePriestessTranslation } from "../lib/i18n";

type BrandMarkProps = {
  size?: "sm" | "md";
};

export function BrandMark({ size = "md" }: BrandMarkProps) {
  const { t } = usePriestessTranslation("common");
  const markSize = size === "sm" ? 28 : 36;

  return (
    <a className={`brand-mark brand-mark--${size}`} href="/" aria-label={t("Priestess 首页")}>
      <svg
        aria-hidden="true"
        className="brand-mark__symbol"
        height={markSize}
        viewBox="0 0 48 48"
        width={markSize}
      >
        <path d="M24 5c5.5 4.5 5.5 10.5 0 16-5.5-5.5-5.5-11.5 0-16Z" />
        <path d="M43 24c-4.5 5.5-10.5 5.5-16 0 5.5-5.5 11.5-5.5 16 0Z" />
        <path d="M24 43c-5.5-4.5-5.5-10.5 0-16 5.5 5.5 5.5 11.5 0 16Z" />
        <path d="M5 24c4.5-5.5 10.5-5.5 16 0-5.5 5.5-11.5 5.5-16 0Z" />
        <circle cx="24" cy="24" r="3.2" />
      </svg>
      <span className="brand-mark__text">Priestess</span>
    </a>
  );
}
