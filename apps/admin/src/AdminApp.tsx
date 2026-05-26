import { useEffect, useMemo, useState } from "react";
import { Toast, usePriestessTranslation } from "@priestess/shared";
import { AdminPage } from "./components/AdminPage";

const DEFAULT_LOGIN_URL = "http://127.0.0.1:5173/login";
const CANONICAL_MANAGE_PATH = "/Manage";
const LOWERCASE_MANAGE_PATH = "/manage";

function getLoginUrl() {
  return import.meta.env.VITE_PRIESTESS_LOGIN_URL?.trim() || DEFAULT_LOGIN_URL;
}

function normalizeManagePath() {
  const { hash, pathname, search } = window.location;
  if (pathname !== LOWERCASE_MANAGE_PATH && !pathname.startsWith(`${LOWERCASE_MANAGE_PATH}/`)) {
    return;
  }

  // 管理前端以 /Manage 作为规范地址，同时兼容用户手输的小写 /manage。
  const suffix = pathname.slice(LOWERCASE_MANAGE_PATH.length);
  window.history.replaceState(null, "", `${CANONICAL_MANAGE_PATH}${suffix}${search}${hash}`);
}

export function AdminApp() {
  const { t } = usePriestessTranslation("admin");
  const [notice, setNotice] = useState("");
  const loginUrl = useMemo(() => getLoginUrl(), []);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 2600);
  };

  useEffect(() => {
    normalizeManagePath();
    document.title = t("Priestess Manage");
  }, [t]);

  return (
    <>
      <AdminPage
        onNavigateToLogin={() => window.location.assign(loginUrl)}
        onNotice={showNotice}
      />
      <Toast message={notice} />
    </>
  );
}
