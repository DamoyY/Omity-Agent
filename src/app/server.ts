import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { AppController } from "./controller";
import { sendError } from "./http/errors";
import { handleApi } from "./http/handler";
import { appUrl } from "./launch";

export type AppServerOptions = {
  root: string;
  host: string;
  port: number;
  onReady?: (url: string) => void;
};

export async function startAppServer(options: AppServerOptions) {
  const controller = new AppController(options.root);
  const vite = await createViteServer({
    logLevel: "silent",
    server: { hmr: false, middlewareMode: true },
    appType: "spa",
  });
  const server = createServer(async (req, res) => {
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
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, resolve);
  });
  const url = appUrl(options.host, listeningPort(server.address()));
  options.onReady?.(url);
  await waitForShutdown(controller, vite, server);
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
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await vite.close();
}
