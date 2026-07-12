import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolMessage } from "@langchain/core/messages";
import { expect, test } from "bun:test";
import { HookLedger } from "../../src/hooks/ledger";
import { AgentDatabase } from "../../src/infrastructure/database";

const details = {
  trigger: "agent:before",
  sourceId: "queue:1",
  hookId: "hook",
};

test("stale running invocation can be reclaimed after its lease", () => {
  const { dir, path } = ledgerPath();
  const firstDb = new AgentDatabase(path);
  firstDb.createSession("session", dir);
  const activeDb = new AgentDatabase(path);
  const recoveredDb = new AgentDatabase(path);
  const first = new HookLedger(firstDb.db, {
    leaseMs: 100,
    now: () => 1_000,
  });
  const active = new HookLedger(activeDb.db, {
    leaseMs: 100,
    now: () => 1_050,
  });
  const recovered = new HookLedger(recoveredDb.db, {
    leaseMs: 100,
    now: () => 1_101,
  });
  try {
    const claimed = first.claim("session", "thread", details, -1);
    const blocked = active.claim("session", "thread", details, -1);
    const reclaimed = recovered.claim("session", "thread", details, -1);

    expect(claimed.kind).toBe("execute");
    expect(blocked.kind).toBe("restore");
    if (claimed.kind !== "execute" || blocked.kind !== "restore") {
      throw new Error("Hook claim 状态无效");
    }
    expect(blocked.row.status).toBe("running");
    expect(() => {
      active.requireRunnable(blocked.row, blocked.key);
    }).toThrow("状态不确定");
    expect(reclaimed.kind).toBe("execute");
    expect(() => {
      first.fail(claimed.key, "late result");
    }).toThrow("Hook Lease 已丢失");
  } finally {
    firstDb.close();
    activeDb.close();
    recoveredDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("active invocation renews its lease until the operation completes", async () => {
  const { dir, path } = ledgerPath();
  const firstDb = new AgentDatabase(path);
  firstDb.createSession("session", dir);
  const contenderDb = new AgentDatabase(path);
  const first = new HookLedger(firstDb.db, { leaseMs: 60 });
  const contender = new HookLedger(contenderDb.db, { leaseMs: 60 });
  const release = Promise.withResolvers<undefined>();
  try {
    const claimed = first.claim("session", "thread", details, -1);
    if (claimed.kind !== "execute") throw new Error("Hook claim 状态无效");
    const maintained = first.withLease(claimed.key, () => release.promise);
    await Bun.sleep(100);

    const blocked = contender.claim("session", "thread", details, -1);

    expect(blocked.kind).toBe("restore");
    if (blocked.kind !== "restore") throw new Error("Hook claim 状态无效");
    expect(blocked.row.status).toBe("running");
    release.resolve(undefined);
    await maintained;
    first.fail(claimed.key, "test complete");
  } finally {
    firstDb.close();
    contenderDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("claim rereads an invocation completed during reclaim", () => {
  const { dir, path } = ledgerPath();
  const firstDb = new AgentDatabase(path);
  firstDb.createSession("session", dir);
  const contenderDb = new AgentDatabase(path);
  const first = new HookLedger(firstDb.db, { leaseMs: 100, now: () => 1_000 });
  const claimed = first.claim("session", "thread", details, -1);
  if (claimed.kind !== "execute") throw new Error("Hook claim 状态无效");
  const contender = new HookLedger(contenderDb.db, {
    leaseMs: 100,
    now: () => {
      first.complete(
        claimed.key,
        new ToolMessage({ content: "done", tool_call_id: "call" }),
      );
      return 1_101;
    },
  });
  try {
    const recovered = contender.claim("session", "thread", details, -1);
    expect(recovered.kind).toBe("restore");
    if (recovered.kind !== "restore") throw new Error("Hook 恢复状态无效");
    expect(recovered.row.status).toBe("done");
    expect(contender.restoredOutput(recovered.row)?.content).toBe("done");
  } finally {
    firstDb.close();
    contenderDb.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function ledgerPath() {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-lease-"));
  return { dir, path: join(dir, "hooks.sqlite") };
}
