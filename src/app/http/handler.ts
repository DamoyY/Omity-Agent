import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppController } from "../controller";
import { errorResponse, HttpError } from "./errors";
import {
  controlBody,
  composerDraftBody,
  createSessionBody,
  decodeSessionId,
  forkBody,
  messageBody,
  readJson,
  requestBodyLimit,
} from "./request";

export type ApiController = Pick<
  AppController,
  | "bootstrap"
  | "sessions"
  | "pickWorkspace"
  | "createSession"
  | "deleteSession"
  | "transcript"
  | "composerDraft"
  | "saveComposerDraft"
  | "sendMessage"
  | "control"
  | "forkSession"
  | "assertSession"
  | "events"
>;

export function createApi(controller: ApiController) {
  const app = new Hono();

  app.use(
    "*",
    bodyLimit({
      maxSize: requestBodyLimit,
      onError() {
        throw new HttpError(
          413,
          `请求体不能超过 ${requestBodyLimit.toString()} 字节`,
        );
      },
    }),
  );

  app.get("/api/bootstrap", (c) => c.json(controller.bootstrap()));
  app.get("/api/sessions", (c) => c.json({ sessions: controller.sessions() }));
  app.get("/api/events", (c) => controller.events.stream(c));
  app.post("/api/workspace-picker", async (c) =>
    c.json({ workspace: await controller.pickWorkspace() }),
  );
  app.post("/api/sessions", async (c) => {
    const body = await readJson(c.req, createSessionBody);
    return c.json({ session: controller.createSession(body.workspace) });
  });
  app.delete("/api/sessions/:sessionId", async (c) => {
    const sessionId = decodeSessionId(c.req.param("sessionId"));
    return c.json(await controller.deleteSession(sessionId));
  });
  app.get("/api/sessions/:sessionId/transcript", (c) =>
    c.json(controller.transcript(sessionId(c))),
  );
  app.get("/api/sessions/:sessionId/events", (c) => {
    const id = sessionId(c);
    controller.assertSession(id);
    return controller.events.stream(c, id);
  });
  app.get("/api/sessions/:sessionId/composer-draft", (c) =>
    c.json(controller.composerDraft(sessionId(c))),
  );
  app.put("/api/sessions/:sessionId/composer-draft", async (c) => {
    const body = await readJson(c.req, composerDraftBody);
    return c.json(
      controller.saveComposerDraft(sessionId(c), body.content, body.revision),
    );
  });
  app.post("/api/sessions/:sessionId/messages", async (c) => {
    const body = await readJson(c.req, messageBody);
    return c.json(
      controller.sendMessage(sessionId(c), body.content, body.draftRevision),
    );
  });
  app.post("/api/sessions/:sessionId/control", async (c) => {
    const body = await readJson(c.req, controlBody);
    return c.json(controller.control(sessionId(c), body.control));
  });
  app.post("/api/sessions/:sessionId/fork", async (c) => {
    const body = await readJson(c.req, forkBody);
    return c.json({
      session: controller.forkSession(sessionId(c), body.beforeMessageId),
    });
  });

  app.notFound((c) => {
    throw new HttpError(404, `未知 API：${c.req.path}`);
  });
  app.onError((error, c) => {
    const normalized = errorResponse(error);
    return c.json(normalized.body, normalized.status as ContentfulStatusCode);
  });
  return app;
}

function sessionId(c: Context) {
  const value = c.req.param("sessionId");
  if (value === undefined) throw new HttpError(400, "请求缺少 Session ID");
  return decodeSessionId(value);
}
