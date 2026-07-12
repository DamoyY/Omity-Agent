import { existsSync } from "node:fs";
import { buildGraph } from "./agent";
import { sessionConflict, sessionNotFound } from "./errors";
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
import { HostLease, type HostObserver } from "./runtime/context";
import { HookLedger } from "./hooks/ledger";
import { HookRuntime } from "./hooks/runtime";
import { removeDatabaseDirectory } from "./infrastructure/sqlite";

export interface HostMode {
  kind: "new" | "load" | "overwrite";
  sessionId: string;
}

export interface HostRunOptions {
  cwd?: string;
  controller?: AbortController;
  observer?: HostObserver;
  quiet?: boolean;
  wake?: (delayMs: number) => Promise<void>;
  wireSigint?: boolean;
}

export async function runHost(
  mode: HostMode,
  root = process.cwd(),
  options: HostRunOptions = {},
) {
  await runHostSession(mode, root, {
    ...options,
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
  const db = openHostDatabase(paths.dbPath, mode, workspace);
  const controller = options.controller ?? new AbortController();
  let lease: HostLease;
  try {
    lease = new HostLease(
      db,
      logger,
      mode.sessionId,
      controller,
      settings.leases.hostTtlMs,
    );
  } catch (error) {
    db.close();
    throw error;
  }
  db.onChange(() => options.observer?.transcript?.(mode.sessionId));
  if (mode.kind === "new") {
    logger.info("已创建新会话", {
      sessionId: mode.sessionId,
      db: paths.dbPath,
    });
  } else if (mode.kind === "load") {
    logger.info("已加载会话", { sessionId: mode.sessionId, db: paths.dbPath });
  } else {
    logger.info("已覆盖会话", { sessionId: mode.sessionId, db: paths.dbPath });
  }
  let mcp: Awaited<ReturnType<typeof loadMcp>> | undefined;
  try {
    mcp = await loadMcp(root, logger);
    const hookLedger = new HookLedger(db.db, {
      leaseMs: settings.leases.hookTtlMs,
    });
    const hooks = new HookRuntime(
      settings.hooks,
      mcp.tools,
      hookLedger,
      logger,
      mode.sessionId,
      db.workspace(mode.sessionId),
    );
    const { graph, checkpointer } = buildGraph(
      settings,
      mcp.tools,
      db.db,
      hooks,
      {
        modelTools: mcp.modelTools,
        freeformToolParameters: mcp.freeformToolParameters,
      },
    );
    const stopOnSigint = () => {
      controller.abort(new Error("收到 Ctrl+C"));
      logger.warn("收到 Ctrl+C，Host 正在停止");
    };
    try {
      if (options.wireSigint ?? false) process.once("SIGINT", stopOnSigint);
      await hostLoop({
        settings,
        logger,
        db,
        graph,
        checkpointer,
        sessionId: mode.sessionId,
        controller,
        wake: options.wake,
        observer: options.observer,
      });
      lease.assertOwned();
    } finally {
      process.removeListener("SIGINT", stopOnSigint);
    }
  } finally {
    try {
      await mcp?.close();
    } finally {
      try {
        lease.close();
      } finally {
        db.close();
      }
    }
  }
}

export function deleteHostSession(sessionId: string, root = process.cwd()) {
  const settings = loadSettings(root);
  const paths = resolveSessionPaths(settings, sessionId);
  if (!existsSync(paths.dir)) {
    throw sessionNotFound(sessionId);
  }
  removeDatabaseDirectory(paths.dir);
}

function prepareWritableSession(
  settings: ReturnType<typeof loadSettings>,
  mode: HostMode,
) {
  const planned = resolveSessionPaths(settings, mode.sessionId);
  const exists = existsSync(planned.dir);
  if (mode.kind === "new" && exists) {
    throw sessionConflict(mode.sessionId);
  }
  if (mode.kind === "overwrite" && !exists) {
    throw sessionNotFound(mode.sessionId);
  }
  if (mode.kind === "overwrite") {
    removeDatabaseDirectory(planned.dir);
  }
  return sessionPaths(settings, mode.sessionId);
}

function openHostDatabase(path: string, mode: HostMode, workspace: string) {
  if (mode.kind === "load" && !existsSync(path)) {
    throw sessionNotFound(mode.sessionId);
  }
  const db = new AgentDatabase(path);
  try {
    if (mode.kind === "load") {
      if (!db.hasSession(mode.sessionId)) {
        throw sessionNotFound(mode.sessionId);
      }
      return db;
    }
    db.createSession(mode.sessionId, workspace);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
