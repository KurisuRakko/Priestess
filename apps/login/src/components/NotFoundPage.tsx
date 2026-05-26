import { usePriestessTranslation } from "@priestess/shared";
import "./NotFoundPage.css";

const KURISU_RAKKO_HOME_URL = "https://rakko.cn/";

export function NotFoundPage() {
  const { t } = usePriestessTranslation("login");

  return (
    <main aria-labelledby="not-found-title" className="not-found-page">
      <h1 className="not-found-page__title" id="not-found-title">{t("页面不存在")}</h1>
      <a className="not-found-page__home-link" href={KURISU_RAKKO_HOME_URL}>
        {t("回到 KurisuRakko 主站")}
      </a>
    </main>
  );
}
