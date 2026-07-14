import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { use } from "i18next";
import zhCN from "./locales/zh-CN/app.json";

export const i18nReady = use(LanguageDetector)
  .use(initReactI18next)
  .init({
    defaultNS: "app",
    fallbackLng: "zh-CN",
    interpolation: {
      escapeValue: false,
    },
    resources: {
      "zh-CN": {
        app: zhCN,
      },
    },
  });
