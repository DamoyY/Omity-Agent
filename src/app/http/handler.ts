import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppController } from "../controller";
import { HttpError } from "./errors";
import {
  controlBody,
  createSessionBody,
  decodeSessionId,
  forkBody,
  messageBody,
  readJson,
} from "./request";

type ApiController = Pick<
  AppController,
  | "bootstrap"
  | "sessions"
  | "pickWorkspace"
  | "createSession"
  | "deleteSession"
  | "transcript"
  | "sendMessage"
  | "control"
  | "forkSession"
  | "assertSession"
  | "events"
>;

export async function handleApi(
  controller: ApiController,
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
    const body = await readJson(req, createSessionBody);
    sendJson(res, { session: controller.createSession(body.workspace) });
    return;
  }
  const deleteMatch = /^\/api\/sessions\/([^/]+)$/.exec(route.pathname);
  if (req.method === "DELETE" && deleteMatch) {
    const sessionId = decodeSessionId(deleteMatch[1] ?? "");
    sendJson(res, await controller.deleteSession(sessionId));
    return;
  }
  const sessionMatch = /^\/api\/sessions\/([^/]+)\/(.+)$/.exec(route.pathname);
  if (!sessionMatch) throw new HttpError(404, `未知 API：${route.pathname}`);
  const sessionId = decodeSessionId(sessionMatch[1] ?? "");
  const action = sessionMatch[2];
  if (req.method === "GET" && action === "transcript") {
    sendJson(res, controller.transcript(sessionId));
    return;
  }
  if (req.method === "GET" && action === "events") {
    controller.assertSession(sessionId);
    controller.events.stream(sessionId, res);
    return;
  }
  if (req.method === "POST" && action === "messages") {
    const body = await readJson(req, messageBody);
    sendJson(res, controller.sendMessage(sessionId, body.content));
    return;
  }
  if (req.method === "POST" && action === "control") {
    const body = await readJson(req, controlBody);
    sendJson(res, controller.control(sessionId, body.control));
    return;
  }
  if (req.method === "POST" && action === "fork") {
    const body = await readJson(req, forkBody);
    sendJson(res, {
      session: controller.forkSession(sessionId, body.beforeMessageId),
    });
    return;
  }
  throw new HttpError(404, `未知 API：${route.pathname}`);
}

function parseRoute(req: IncomingMessage) {
  if (!req.url) throw new HttpError(400, "请求缺少 URL");
  try {
    return new URL(req.url, "http://127.0.0.1");
  } catch {
    throw new HttpError(400, "请求 URL 无效");
  }
}

function sendJson(res: ServerResponse, body: unknown) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
