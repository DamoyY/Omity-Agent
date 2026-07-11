import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { HookLedger } from "../../src/hooks/ledger";

const details = {
  trigger: "agent:before",
  sourceId: "queue:1",
  hookId: "hook",
};

test("stale running invocation can be reclaimed after its lease", () => {
  const { dir, path } = ledgerPath();
  const first = new HookLedger(path, { leaseMs: 100, now: () => 1_000 });
  const active = new HookLedger(path, { leaseMs: 100, now: () => 1_050 });
  const recovered = new HookLedger(path, { leaseMs: 100, now: () => 1_101 });
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
    first.close();
    active.close();
    recovered.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("active invocation renews its lease until the operation completes", async () => {
  const { dir, path } = ledgerPath();
  const first = new HookLedger(path, { leaseMs: 60 });
  const contender = new HookLedger(path, { leaseMs: 60 });
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
    first.close();
    contender.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function ledgerPath() {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-lease-"));
  return { dir, path: join(dir, "hooks.sqlite") };
}
