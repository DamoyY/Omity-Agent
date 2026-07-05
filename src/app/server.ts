import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import type { Control } from "../types";
import { AppController } from "./controller";

export type AppServerOptions = {
  root: string;
  host: string;
  port: number;
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
  await waitForShutdown(controller, vite, server);
}

async function handleApi(
  controller: AppController,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const route = parseRoute(req);
  if (req.method === "GET" && route.pathname === "/api/bootstrap") {
    sendJson(res, controller.bootstrap());
    return;
  }
  if (req.method === "GET" && route.pathname === "/api/sessions") {
    sendJson(res, { sessions: controller.sessions() });
    return;
  }
  if (req.method === "POST" && route.pathname === "/api/workspace-picker") {
    sendJson(res, { workspace: await controller.pickWorkspace() });
    return;
  }
  if (req.method === "POST" && route.pathname === "/api/sessions") {
    const body = await readJson<{ workspace: string }>(req);
    sendJson(res, { session: controller.createSession(body.workspace) });
    return;
  }
  const deleteMatch = route.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const sessionId = decodeURIComponent(deleteMatch[1] ?? "");
    sendJson(res, await controller.deleteSession(sessionId));
    return;
  }
  const sessionMatch = route.pathname.match(/^\/api\/sessions\/([^/]+)\/(.+)$/);
  if (!sessionMatch) throw new Error(`未知 API：${route.pathname}`);
  const sessionId = decodeURIComponent(sessionMatch[1] ?? "");
  const action = sessionMatch[2];
  if (req.method === "GET" && action === "transcript") {
    sendJson(res, controller.transcript(sessionId));
    return;
  }
  if (req.method === "POST" && action === "messages") {
    const body = await readJson<{ content: string }>(req);
    sendJson(res, controller.sendMessage(sessionId, body.content));
    return;
  }
  if (req.method === "POST" && action === "control") {
    const body = await readJson<{ control: Control }>(req);
    sendJson(res, controller.control(sessionId, body.control));
    return;
  }
  throw new Error(`未知 API：${route.pathname}`);
}

function parseRoute(req: IncomingMessage) {
  if (!req.url) throw new Error("请求缺少 URL");
  return new URL(req.url, "http://127.0.0.1");
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(text) as T;
}

function sendJson(res: ServerResponse, body: unknown) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendError(res: ServerResponse, error: unknown) {
  res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
  res.end(
    JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }),
  );
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
