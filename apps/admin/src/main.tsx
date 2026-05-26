import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PriestessI18nProvider } from "@priestess/shared";
import { AdminApp } from "./AdminApp";
import { adminI18nResources } from "./i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PriestessI18nProvider resources={adminI18nResources}>
      <AdminApp />
    </PriestessI18nProvider>
  </StrictMode>
);
