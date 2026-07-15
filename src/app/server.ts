import { AccessService } from "./access/service";
import type { AddressInfo } from "node:net";
import { AppController } from "./controller";
import { AppInstanceLock } from "./runtime/instanceLock";
import { appUrl } from "./launch";
import { build } from "vite";
import { createApi } from "./http/handler";
import { createServer } from "node:http";
import { createStaticApp } from "./http/static";
import { getRequestListener } from "@hono/node-server";
import { join } from "node:path";
import { loadSettings } from "../infrastructure/configuration/loadSettings";
import { once } from "node:events";
import { promisify } from "node:util";
import { rmSync } from "node:fs";

export interface AppServerOptions {
  root: string;
  host?: string;
  port?: number;
  onReady?: (url: string) => void;
}
export async function startAppServer(options: AppServerOptions) {
  const settings = loadSettings(options.root);
  const host = options.host ?? settings.server.host;
  const port = options.port ?? settings.server.port;
  const lock = AppInstanceLock.acquire(settings.paths.dataDir);
  const shutdown = waitForShutdownSignal();
  let access: AccessService | undefined;
  let controller: AppController | undefined;
  let server: ReturnType<typeof createServer> | undefined;
  try {
    access = new AccessService(settings);
    controller = new AppController(options.root, {
      abandonedOwner: lock.abandonedOwner,
      owner: {
        instanceId: lock.owner.token,
        kind: "app",
        pid: lock.owner.pid,
      },
    });
    const staticRoot = join(settings.paths.dataDir, "webui");
    rmSync(staticRoot, { force: true, recursive: true });
    await build({ build: { emptyOutDir: true, outDir: staticRoot }, logLevel: "silent" });
    server = createServer();
    const handleApi = getRequestListener(createApi(controller, access).fetch);
    const handleStatic = getRequestListener(createStaticApp(staticRoot).fetch);
    server.on(
      "request",
      (req, res) =>
        void (req.url?.startsWith("/api") ? handleApi(req, res) : handleStatic(req, res)),
    );
    const listening = once(server, "listening");
    server.listen(port, host);
    await listening;
    const url = appUrl(host, listeningPort(server.address()));
    options.onReady?.(url);
    await shutdown;
  } finally {
    if (server?.listening) {
      await closeServer(server);
    }
    await controller?.close();
    access?.close();
    lock.release();
  }
}
function listeningPort(address: string | AddressInfo | null) {
  if (!address || typeof address === "string") {
    throw new Error("无法获取 WebUI 监听端口");
  }
  return address.port;
}
async function waitForShutdownSignal() {
  const controller = new AbortController();
  try {
    await Promise.race([
      once(process, "SIGINT", { signal: controller.signal }),
      once(process, "SIGTERM", { signal: controller.signal }),
    ]);
  } finally {
    controller.abort();
  }
}
async function closeServer(server: ReturnType<typeof createServer>) {
  const close = promisify(server.close.bind(server));
  const closed = close();
  server.closeAllConnections();
  await closed;
}
