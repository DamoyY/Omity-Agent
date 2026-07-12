import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { getRequestListener } from "@hono/node-server";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { AppController } from "./controller";
import { errorResponse } from "./http/errors";
import { createApi } from "./http/handler";
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
  const handleApi = getRequestListener(createApi(controller).fetch);
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api/")) {
      void handleApi(req, res);
      return;
    }
    vite.middlewares(req, res, (error: unknown) => {
      if (error) sendViteError(res, error);
    });
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

function sendViteError(res: ServerResponse, error: unknown) {
  const normalized = errorResponse(error);
  res.writeHead(normalized.status, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(normalized.body));
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
  await controller.close();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  await vite.close();
}
