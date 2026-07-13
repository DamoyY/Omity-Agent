import { existsSync } from "node:fs";
import { buildGraph } from "./agent";
import { sessionConflict, sessionNotFound } from "./errors";
import { loadSettings } from "./infrastructure/configuration/loadSettings";
import {
  resolveSessionPaths,
  sessionPaths,
} from "./infrastructure/configuration/sessionPaths";
import { normalizeWorkspacePath } from "./infrastructure/configuration/workspacePath";
import { AgentDatabase } from "./infrastructure/database/agentDatabase";
import { removeDatabaseDirectory } from "./infrastructure/database/connection";
import { Logger } from "./infrastructure/logging/logger";
import { loadMcp } from "./infrastructure/mcp/loadTools";
import { hostLoop } from "./runtime/loop";
import type { HostRunOptions } from "./runtime/execution/hostOptions";
import { HostLease } from "./runtime/execution/lease";
import { recoverHostSession } from "./runtime/execution/recovery";
import { wireHostSignals } from "./runtime/execution/signals";
import { HookRuntime } from "./hooks/runtime";
import type { HostMode } from "./types";

export async function runHost(
  mode: HostMode,
  root = process.cwd(),
  options: HostRunOptions = {},
) {
  await runHostSession(mode, root, {
    ...options,
    recoverInterrupted: options.recoverInterrupted ?? mode.kind === "load",
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
  const db = openHostDatabase(
    paths.dbPath,
    mode,
    workspace,
    options.recoverInterrupted ?? false,
  );
  const controller = options.controller ?? new AbortController();
  const stoppingController =
    options.stoppingController ?? new AbortController();
  let lease: HostLease;
  try {
    lease = new HostLease(
      db,
      logger,
      mode.sessionId,
      controller,
      settings.leases.hostTtlMs,
      options.owner,
    );
  } catch (error) {
    db.close();
    throw error;
  }
  db.onChange((event) => options.observer?.transcript?.(mode.sessionId, event));
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
  const unwireSignals = wireHostSignals({
    enabled: options.wireSigint ?? false,
    force: controller,
    logger,
    stopping: stoppingController,
    timeoutMs: settings.host.shutdownTimeoutMs,
  });
  try {
    mcp = await loadMcp(root, logger);
    const hooks = new HookRuntime(
      settings.hooks,
      mcp.tools,
      db.db,
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
    options.onReady?.();
    await hostLoop({
      settings,
      logger,
      db,
      graph,
      checkpointer,
      sessionId: mode.sessionId,
      controller,
      stopping: stoppingController.signal,
      assertLease: () => {
        lease.assertOwned();
      },
      wake: options.wake,
      observer: options.observer,
    });
    lease.assertOwned();
  } finally {
    unwireSignals();
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

function openHostDatabase(
  path: string,
  mode: HostMode,
  workspace: string,
  recoverInterrupted: boolean,
) {
  if (mode.kind === "load" && !existsSync(path)) {
    throw sessionNotFound(mode.sessionId);
  }
  const db = new AgentDatabase(path);
  try {
    if (mode.kind === "load") {
      if (!db.hasSession(mode.sessionId)) {
        throw sessionNotFound(mode.sessionId);
      }
      if (recoverInterrupted) recoverHostSession(db, mode.sessionId);
      return db;
    }
    db.createSession(mode.sessionId, workspace);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
