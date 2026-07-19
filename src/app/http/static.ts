import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";

export function createStaticApp(root: string) {
  const app = new Hono<{ Bindings: HttpBindings }>();
  const staticRoot = resolve(root);
  app.use("*", async (c, next) => {
    c.header("content-security-policy", contentSecurityPolicy);
    c.header("cross-origin-opener-policy", "same-origin");
    c.header("referrer-policy", "no-referrer");
    c.header("x-content-type-options", "nosniff");
    await next();
  });
  app.use("/assets/*", serveStatic({ root: staticRoot }));
  const index = serveStatic({ path: resolve(staticRoot, "index.html") });
  app.get("/", index);
  return app;
}
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https: http:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join("; ");
