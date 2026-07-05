import i18next from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN/app.json";

export const i18nReady = i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "zh-CN",
    resources: {
      "zh-CN": {
        app: zhCN,
      },
    },
    defaultNS: "app",
    interpolation: {
      escapeValue: false,
    },
  });
