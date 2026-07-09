import { existsSync, rmSync } from "node:fs";
import { buildGraph } from "./agent";
import {
  loadSettings,
  resolveSessionPaths,
  sessionPaths,
} from "./infrastructure/config";
import { AgentDatabase } from "./infrastructure/database";
import { Logger } from "./infrastructure/logger";
import { loadMcp } from "./infrastructure/mcp";
import { normalizeWorkspacePath } from "./infrastructure/workspacePath";
import { hostLoop } from "./runtime/loop";
import type { HostObserver, StopSignal } from "./runtime/context";

export type HostMode = {
  kind: "new" | "load" | "overwrite";
  sessionId: string;
};

export type HostRunOptions = {
  cwd?: string;
  observer?: HostObserver;
  quiet?: boolean;
  signal?: StopSignal;
  wake?: (delayMs: number) => Promise<void>;
  wireSigint?: boolean;
};

export async function runHost(
  mode: HostMode,
  root = process.cwd(),
  options: HostRunOptions = {},
) {
  const signal: StopSignal = options.signal ?? { stopping: false };
  await runHostSession(mode, root, {
    ...options,
    signal,
    wireSigint: options.wireSigint ?? true,
  });
}

export async function runHostSession(
  mode: HostMode,
  root = process.cwd(),
  options: HostRunOptions = {},
) {
  const workspace = normalizeWorkspacePath(options.cwd ?? root, root);
  const loadedSettings = loadSettings(root, { cwd: workspace });
  const settings = options.quiet
    ? {
        ...loadedSettings,
        logging: { ...loadedSettings.logging, streamTokens: false },
      }
    : loadedSettings;
  const logger = new Logger(settings.logging.level, options.quiet ?? false);
  const paths =
    mode.kind === "load"
      ? resolveSessionPaths(settings, mode.sessionId)
      : prepareWritableSession(settings, mode);
  const db = openHostDatabase(paths.appDb, mode, workspace);
  db.onChange(() => options.observer?.changed?.(mode.sessionId));
  if (mode.kind === "new") {
    logger.info("已创建新会话", { sessionId: mode.sessionId, db: paths.appDb });
  } else if (mode.kind === "load") {
    logger.info("已加载会话", { sessionId: mode.sessionId, db: paths.appDb });
  } else {
    logger.info("已覆盖会话", { sessionId: mode.sessionId, db: paths.appDb });
  }
  const mcp = await loadMcp(root, logger);
  const { graph, checkpointer } = buildGraph(
    settings,
    mcp.tools,
    paths.checkpointDb,
  );
  const signal: StopSignal = options.signal ?? { stopping: false };
  if (options.wireSigint ?? false) {
    process.on("SIGINT", () => {
      signal.stopping = true;
      logger.warn("收到 Ctrl+C，Host 将在当前边界停止");
    });
  }
  try {
    await hostLoop({
      settings,
      logger,
      db,
      graph,
      checkpointer,
      sessionId: mode.sessionId,
      signal,
      wake: options.wake,
      observer: options.observer,
    });
  } finally {
    await mcp.close();
    checkpointer.close();
    db.close();
  }
}

export function deleteHostSession(sessionId: string, root = process.cwd()) {
  const settings = loadSettings(root);
  const paths = resolveSessionPaths(settings, sessionId);
  if (!existsSync(paths.dir)) {
    throw new Error(`会话不存在：${sessionId}`);
  }
  rmSync(paths.dir, { recursive: true, force: true });
}

function prepareWritableSession(
  settings: ReturnType<typeof loadSettings>,
  mode: HostMode,
) {
  const planned = resolveSessionPaths(settings, mode.sessionId);
  const exists = existsSync(planned.dir);
  if (mode.kind === "new" && exists) {
    throw new Error(`会话已存在：${mode.sessionId}`);
  }
  if (mode.kind === "overwrite" && !exists) {
    throw new Error(`会话不存在：${mode.sessionId}`);
  }
  if (mode.kind === "overwrite") {
    rmSync(planned.dir, { recursive: true, force: true });
  }
  return sessionPaths(settings, mode.sessionId);
}

function openHostDatabase(path: string, mode: HostMode, workspace: string) {
  if (mode.kind === "load" && !existsSync(path)) {
    throw new Error(`会话不存在：${mode.sessionId}`);
  }
  const db = new AgentDatabase(path);
  if (mode.kind === "load") {
    if (!db.hasSession(mode.sessionId)) {
      db.close();
      throw new Error(`会话不存在：${mode.sessionId}`);
    }
    return db;
  }
  db.createSession(mode.sessionId, workspace);
  return db;
}
