import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { i18nReady } from "./i18n";
import { reportError } from "./services/errors";
import "./panda.css";
await i18nReady;
const root = document.getElementById("root");
if (!root) throw new Error("缺少 root 容器");
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { retry: false },
    queries: { retry: false },
  },
});
createRoot(root, {
  onCaughtError: (error, errorInfo) => {
    reportError(error, { errorInfo });
  },
  onRecoverableError: (error, errorInfo) => {
    reportError(error, { errorInfo });
  },
  onUncaughtError: (error, errorInfo) => {
    reportError(error, { errorInfo });
  },
}).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
