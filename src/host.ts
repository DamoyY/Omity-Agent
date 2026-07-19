import { resolveSessionPaths, sessionPaths } from "./infrastructure/configuration/sessionPaths";
import { sessionConflict, sessionNotFound } from "./errors";
import { AgentDatabase } from "./infrastructure/database/agentDatabase";
import { HookRuntime } from "./hooks/runtime";
import { HostLease } from "./runtime/execution/lease";
import type { HostMode } from "./types";
import type { HostRunOptions } from "./runtime/execution/hostOptions";
import { Logger } from "./infrastructure/logging/logger";
import { ToolExecutions } from "./agent/toolExecutions";
import { buildGraph } from "./agent";
import { existsSync } from "node:fs";
import { hostLoop } from "./runtime/loop";
import { loadMcp } from "./infrastructure/mcp/loadTools";
import { loadSettings } from "./infrastructure/configuration/loadSettings";
import { normalizeWorkspacePath } from "./infrastructure/configuration/workspacePath";
import { recoverHostSession } from "./runtime/execution/recovery";
import { removeDatabaseDirectory } from "./infrastructure/database/connection";
import { wireHostSignals } from "./runtime/execution/signals";

export async function runHost(mode: HostMode, root = process.cwd(), options: HostRunOptions = {}) {
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
  const db = openHostDatabase(paths.dbPath, mode, workspace, options.recoverInterrupted ?? false);
  const controller = options.controller ?? new AbortController();
  const stoppingController = options.stoppingController ?? new AbortController();
  const toolExecutions = new ToolExecutions({
    cancellationRequested: (callId) => db.takeToolCancellation(mode.sessionId, callId),
    pollMs: settings.host.pollMs,
  });
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
      db: paths.dbPath,
      sessionId: mode.sessionId,
    });
  } else if (mode.kind === "load") {
    logger.info("已加载会话", { db: paths.dbPath, sessionId: mode.sessionId });
  } else {
    logger.info("已覆盖会话", { db: paths.dbPath, sessionId: mode.sessionId });
  }
  let ownedMcp: Awaited<ReturnType<typeof loadMcp>> | undefined;
  const unwireSignals = wireHostSignals({
    enabled: options.wireSigint ?? false,
    force: controller,
    logger,
    stopping: stoppingController,
    timeoutMs: settings.host.shutdownTimeoutMs,
  });
  try {
    const mcp = options.mcp ? await options.mcp() : (ownedMcp = await loadMcp(root, logger));
    const hooks = new HookRuntime(
      settings.hooks,
      mcp.tools,
      db.db,
      logger,
      mode.sessionId,
      db.workspace(mode.sessionId),
    );
    const { graph, checkpointer } = buildGraph(settings, mcp.tools, db.db, hooks, {
      freeformToolParameters: mcp.freeformToolParameters,
      modelTools: mcp.modelTools,
      toolExecutions,
    });
    options.onReady?.({
      cancelTool: (callId) => toolExecutions.cancel(callId),
    });
    await hostLoop({
      assertLease: () => {
        lease.assertOwned();
      },
      checkpointer,
      controller,
      db,
      graph,
      logger,
      observer: options.observer,
      sessionId: mode.sessionId,
      settings,
      stopping: stoppingController.signal,
      toolExecutions,
      wake: options.wake,
    });
    lease.assertOwned();
  } finally {
    unwireSignals();
    try {
      await ownedMcp?.close();
    } finally {
      try {
        lease.close();
      } finally {
        db.close();
      }
    }
  }
}
function prepareWritableSession(settings: ReturnType<typeof loadSettings>, mode: HostMode) {
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
      if (recoverInterrupted) {
        recoverHostSession(db, mode.sessionId);
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
