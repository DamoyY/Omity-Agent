import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { HookLedger } from "../src/hooks/ledger";

test("stale running hook invocation can be reclaimed after its lease", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-hook-lease-"));
  const path = join(dir, "hooks.sqlite");
  const details = {
    trigger: "agent:before",
    sourceId: "queue:1",
    hookId: "hook",
  };
  const first = new HookLedger(path, { leaseMs: 100, now: () => 1_000 });
  const active = new HookLedger(path, { leaseMs: 100, now: () => 1_050 });
  const recovered = new HookLedger(path, { leaseMs: 100, now: () => 1_101 });
  try {
    const claimed = first.claim("session", "thread", details, -1);
    const blocked = active.claim("session", "thread", details, -1);
    const reclaimed = recovered.claim("session", "thread", details, -1);

    expect(claimed.existing).toBeNull();
    expect(blocked.existing?.status).toBe("running");
    expect(() =>
      active.requireRunnable(blocked.existing!, blocked.key),
    ).toThrow("状态不确定");
    expect(reclaimed.existing).toBeNull();
    expect(() => first.fail(claimed.key, "late result")).toThrow(
      "Hook Lease 已丢失",
    );
  } finally {
    first.close();
    active.close();
    recovered.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
