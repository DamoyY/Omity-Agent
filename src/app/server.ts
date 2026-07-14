import { type ServerResponse, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { AppController } from "./controller";
import { AppInstanceLock } from "./runtime/instanceLock";
import { appUrl } from "./launch";
import { createApi } from "./http/handler";
import { createServer as createViteServer } from "vite";
import { errorResponse } from "./http/errors";
import { getRequestListener } from "@hono/node-server";
import { loadSettings } from "../infrastructure/configuration/loadSettings";
export interface AppServerOptions {
  root: string;
  host: string;
  port: number;
  onReady?: (url: string) => void;
}
export async function startAppServer(options: AppServerOptions) {
  const lock = AppInstanceLock.acquire(loadSettings(options.root).paths.dataDir);
  const shutdown = waitForShutdownSignal();
  try {
    const controller = new AppController(options.root, {
      abandonedOwner: lock.abandonedOwner,
      owner: {
        instanceId: lock.owner.token,
        kind: "app",
        pid: lock.owner.pid,
      },
    });
    const server = createServer();
    const vite = await createViteServer({
      appType: "spa",
      logLevel: "silent",
      server: {
        hmr: true,
        middlewareMode: true,
        ws: { server },
      },
    });
    const handleApi = getRequestListener(createApi(controller).fetch);
    server.on("request", (req, res) => {
      if (req.url?.startsWith("/api/")) {
        void handleApi(req, res);
        return;
      }
      vite.middlewares(req, res, (error: unknown) => {
        if (error) {
          sendViteError(res, error);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, options.host, resolve);
    });
    const url = appUrl(options.host, listeningPort(server.address()));
    options.onReady?.(url);
    await shutdown;
    await closeServer(server);
    await controller.close();
    await vite.close();
  } finally {
    lock.release();
  }
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
function waitForShutdownSignal() {
  return new Promise<void>((resolve) => {
    const stop = () => {
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
    server.closeAllConnections();
  });
}
