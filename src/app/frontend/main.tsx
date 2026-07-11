import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { i18nReady } from "./i18n";
import "./panda.css";

await i18nReady;

const root = document.getElementById("root");
if (!root) throw new Error("缺少 root 容器");

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
);
