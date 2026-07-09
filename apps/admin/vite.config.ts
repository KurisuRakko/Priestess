import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const modernBrowserTargets = ["chrome107", "edge107", "firefox104", "safari16"];

export default defineConfig({
  plugins: [react()],
  build: {
    // Priestess 面向最新稳定浏览器；显式目标让 Safari/Firefox 产物保持可预期，不引入 legacy 包袱。
    target: modernBrowserTargets,
    cssTarget: modernBrowserTargets,
  },
});
