import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, spyOn, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, workspace } from "../support/database";
import type { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookRuntime } from "../../src/hooks/runtime";
import type { HostContext } from "../../src/runtime/context";
import { Logger } from "../../src/infrastructure/logging/logger";
import { ToolExecutions } from "../../src/agent/toolExecutions";
import { createAgentGraph } from "../../src/agent";
import { fakeModel } from "@langchain/core/testing";
import { recordToolExecutionStarted } from "../../src/runtime/stream";
import { testSettings } from "../support/settings";
afterEach(cleanupDatabaseDirs);
test("only the next pending tool call is marked as started", () => {
  const db = makeDb();
  const started: string[] = [];
  const executions = new ToolExecutions();
  spyOn(db, "toolStarted").mockImplementation((_sessionId, _queueId, callId) => {
    started.push(callId);
    return { id: started.length, kind: "tool_started", queueId: 1, value: callId };
  });
  try {
    recordToolExecutionStarted(
      context(db, executions),
      [
        new AIMessage({
          content: "",
          tool_calls: [
            { args: {}, id: "call-1", name: "first" },
            { args: {}, id: "call-2", name: "second" },
          ],
        }),
        new ToolMessage({ content: "done", tool_call_id: "call-1" }),
      ],
      1,
    );
    expect(started).toEqual(["call-2"]);
    expect(executions.cancel("call-1")).toBe(false);
    expect(executions.cancel("call-2")).toBe(true);
  } finally {
    db.close();
  }
});
function context(db: AgentDatabase, toolExecutions: ToolExecutions): HostContext {
  const settings = testSettings(workspace);
  const logger = new Logger("error", true);
  const checkpointer = new BunSqliteSaver(db.db, "session");
  const hooks = new HookRuntime([], [], db.db, logger, "session", workspace);
  const graph = createAgentGraph({ checkpointer, hooks, model: fakeModel(), settings, tools: [] });
  return {
    checkpointer,
    controller: new AbortController(),
    db,
    graph,
    logger,
    sessionId: "session",
    settings,
    toolExecutions,
  };
}
