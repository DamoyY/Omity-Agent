import { buildGraph } from "./agent";
import { loadSettings, sessionPaths } from "./infrastructure/config";
import { AgentDatabase } from "./infrastructure/database";
import { Logger } from "./infrastructure/logger";
import { loadMcp } from "./infrastructure/mcp";
import { hostLoop } from "./runtime/loop";
import type { StopSignal } from "./runtime/context";

type HostMode = { kind: "new" | "load"; sessionId: string };

export async function runHost(mode: HostMode, root = process.cwd()) {
  const settings = loadSettings(root);
  const logger = new Logger(settings.logging.level);
  const paths = sessionPaths(settings, mode.sessionId);
  const db = new AgentDatabase(paths.appDb);
  if (mode.kind === "new") {
    db.resetSession(mode.sessionId);
    logger.info("已创建新会话", { sessionId: mode.sessionId, db: paths.appDb });
  } else {
    db.ensureSession(mode.sessionId);
    logger.info("已加载会话", { sessionId: mode.sessionId, db: paths.appDb });
  }
  const mcp = await loadMcp(root, logger);
  const { graph, checkpointer } = buildGraph(
    settings,
    mcp.tools,
    paths.checkpointDb,
  );
  const signal: StopSignal = { stopping: false };
  process.on("SIGINT", () => {
    signal.stopping = true;
    logger.warn("收到 Ctrl+C，Host 将在当前边界停止");
  });
  try {
    await hostLoop({
      settings,
      logger,
      db,
      graph,
      checkpointer,
      sessionId: mode.sessionId,
      signal,
    });
  } finally {
    await mcp.close();
    checkpointer.close();
    db.close();
  }
}
