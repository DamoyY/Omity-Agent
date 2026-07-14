import LanguageDetector from "i18next-browser-languagedetector";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN/app.json";
export const i18nReady = i18next
  .use(LanguageDetector)
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
