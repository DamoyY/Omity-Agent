import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { tool } from "@langchain/core/tools";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";
import { expect, test } from "bun:test";
import { createAgentGraph } from "../../src/agent";
import { BunSqliteSaver } from "../../src/checkpointer";
import { HookLedger } from "../../src/hooks/ledger";
import { HookRuntime } from "../../src/hooks/runtime";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { Logger } from "../../src/infrastructure/logging/logger";
import type { HookRule } from "../../src/types";
import { testLeaseOptions } from "../support/leases";
import { testSettings } from "../support/settings";

test("runLimit is enforced atomically across graph threads", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-limits-"));
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  const ledger = new HookLedger(db.db, testLeaseOptions);
  const calls: string[] = [];
  const disabled = makeTool("disabled", () => calls.push("disabled"));
  const limited = makeTool("limited", () => calls.push("limited"));
  const hooks = new HookRuntime(
    [silent("disabled", "disabled", 0), silent("limited", "limited", 2)],
    [disabled, limited],
    ledger,
    new Logger("error", true),
    "session",
    dir,
  );
  try {
    const graph = createAgentGraph({
      settings: testSettings(dir),
      model: fakeModel()
        .respond(new AIMessage("one"))
        .respond(new AIMessage("two"))
        .respond(new AIMessage("three")),
      tools: [disabled, limited],
      hooks,
      checkpointer: new MemorySaver(),
    });

    for (let index = 0; index < 3; index++) {
      await graph.invoke(
        {
          messages: [{ role: "user", content: "run" }],
          hookPendingUserIds: [`queue:${index.toString()}`],
        },
        { configurable: { thread_id: `thread:${index.toString()}` } },
      );
    }

    expect(calls).toEqual(["limited", "limited"]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("thread cleanup retains the session hook usage", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-usage-"));
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  const ledger = new HookLedger(db.db, testLeaseOptions);
  const details = {
    trigger: "agent:before",
    sourceId: "queue:1",
    hookId: "limited",
  };
  try {
    expect(ledger.claim("session", "thread:1", details, 1).kind).toBe(
      "execute",
    );
    void new BunSqliteSaver(db.db, "session").deleteThread("thread:1");

    expect(ledger.claim("session", "thread:2", details, 1).kind).toBe("skip");
    expect(
      db.db
        .query<{ used_count: number }, []>("SELECT used_count FROM hook_usage")
        .get()?.used_count,
    ).toBe(1);
    expect(
      db.db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) AS count FROM invocations",
        )
        .get()?.count,
    ).toBe(0);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("completed invocation retains only its canonical message reference", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-output-"));
  const db = new AgentDatabase(join(dir, "app.sqlite"));
  db.createSession("session", dir);
  const ledger = new HookLedger(db.db, testLeaseOptions);
  const details = {
    trigger: "agent:before",
    sourceId: "queue:1",
    hookId: "output",
  };
  try {
    const claim = ledger.claim("session", "thread", details, -1);
    if (claim.kind !== "execute") throw new Error("Hook claim 状态无效");
    ledger.complete(
      claim.key,
      new ToolMessage({
        id: "hook-output",
        content: "result",
        tool_call_id: "hook-call",
      }),
    );

    const restored = ledger.claim("session", "thread", details, -1);
    expect(restored.kind).toBe("restore");
    if (restored.kind !== "restore") throw new Error("Hook 恢复状态无效");
    expect(ledger.restoredOutput(restored.row)?.content).toBe("result");
    const second = ledger.claim(
      "session",
      "thread",
      { ...details, sourceId: "queue:2" },
      -1,
    );
    if (second.kind !== "execute") throw new Error("Hook claim 状态无效");
    ledger.complete(
      second.key,
      new ToolMessage({
        id: "hook-output",
        content: "new result",
        tool_call_id: "hook-call-2",
      }),
    );
    expect(ledger.restoredOutput(restored.row)?.content).toBe("result");
    expect(ledger.output(second.key)?.output).toBe("new result");
    expect(
      db.db
        .query<
          { owner_id: string | null; lease_expires_at: number | null },
          []
        >("SELECT owner_id, lease_expires_at FROM invocations")
        .get(),
    ).toEqual({ owner_id: null, lease_expires_at: null });
    expect(
      db.db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) AS count FROM messages WHERE source_id = 'hook-output'",
        )
        .get()?.count,
    ).toBe(2);
    const columns = db.db
      .query<{ name: string }, []>("PRAGMA table_info(invocations)")
      .all()
      .map((column) => column.name);
    expect(columns).not.toContain("status");
    expect(columns).not.toContain("output_json");
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTool(name: string, record: () => void) {
  return tool(
    () => {
      record();
      return Promise.resolve(`${name}-result`);
    },
    { name, description: name, schema: z.object({}) },
  );
}

function silent(id: string, toolName: string, runLimit: number): HookRule {
  return {
    id,
    target: "agent",
    when: "before",
    runLimit,
    mode: "silent",
    tool: toolName,
    args: {},
  };
}
