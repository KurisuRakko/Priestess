import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PriestessI18nProvider } from "@priestess/shared";
import { App } from "./App";
import { loginI18nResources } from "./i18n";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PriestessI18nProvider resources={loginI18nResources}>
      <App />
    </PriestessI18nProvider>
  </StrictMode>
);
