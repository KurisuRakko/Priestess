import { useEffect, useMemo, useState } from "react";
import { Toast } from "@priestess/shared";
import { AdminPage } from "./components/AdminPage";

const DEFAULT_LOGIN_URL = "http://127.0.0.1:5173/auth-ui/login";

function getLoginUrl() {
  return import.meta.env.VITE_PRIESTESS_LOGIN_URL?.trim() || DEFAULT_LOGIN_URL;
}

export function AdminApp() {
  const [notice, setNotice] = useState("");
  const loginUrl = useMemo(() => getLoginUrl(), []);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? "" : current), 2600);
  };

  useEffect(() => {
    document.title = "Priestess 管理台";
  }, []);

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
