import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { AppController } from "./controller";
import { sendError } from "./http/errors";
import { handleApi } from "./http/handler";
import { appUrl } from "./launch";

export interface AppServerOptions {
  root: string;
  host: string;
  port: number;
  onReady?: (url: string) => void;
}

export async function startAppServer(options: AppServerOptions) {
  const controller = new AppController(options.root);
  const vite = await createViteServer({
    logLevel: "silent",
    server: { hmr: false, middlewareMode: true },
    appType: "spa",
  });
  const server = createServer((req, res) => {
    void dispatchRequest(controller, vite, req, res);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, resolve);
  });
  const url = appUrl(options.host, listeningPort(server.address()));
  options.onReady?.(url);
  await waitForShutdown(controller, vite, server);
}

async function dispatchRequest(
  controller: AppController,
  vite: ViteDevServer,
  req: Parameters<typeof handleApi>[1],
  res: Parameters<typeof handleApi>[2],
) {
  try {
    if (req.url?.startsWith("/api/")) {
      await handleApi(controller, req, res);
      return;
    }
    vite.middlewares(req, res, (error: unknown) => {
      if (error) sendError(res, error);
    });
  } catch (error) {
    sendError(res, error);
  }
}

function listeningPort(address: string | AddressInfo | null) {
  if (!address || typeof address === "string") {
    throw new Error("无法获取 WebUI 监听端口");
  }
  return address.port;
}

async function waitForShutdown(
  controller: AppController,
  vite: ViteDevServer,
  server: ReturnType<typeof createServer>,
) {
  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  controller.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  await vite.close();
}
