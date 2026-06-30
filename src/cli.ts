#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { runClient } from "./client";
import { runHost } from "./host";
import type { Control } from "./types";

async function main() {
  const [command, ...rest] = Bun.argv.slice(2);
  if (command === "host") {
    const values = parseArgs({ args: rest, options: { new: { type: "string" }, load: { type: "string" } }, strict: true }).values;
    const fresh = values.new;
    const load = values.load;
    if ((fresh ? 1 : 0) + (load ? 1 : 0) !== 1) {
      throw new Error("host 需要且仅需要 --new=<id> 或 --load=<id>");
    }
    await runHost(fresh ? { kind: "new", sessionId: fresh } : { kind: "load", sessionId: load! });
    return;
  }
  if (command === "client") {
    const parsed = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        append: { type: "string" },
        pause: { type: "boolean" },
        resume: { type: "boolean" },
        cancel: { type: "boolean" },
      },
      strict: true,
    });
    const sessionId = parsed.positionals[0];
    if (!sessionId) {
      throw new Error("client 需要会话 ID");
    }
    const controls: Control[] = [];
    if (parsed.values.pause) controls.push("pause");
    if (parsed.values.resume) controls.push("running");
    if (parsed.values.cancel) controls.push("cancel");
    if (controls.length > 1) {
      throw new Error("pause/resume/cancel 只能选择一个");
    }
    runClient({ sessionId, append: parsed.values.append, control: controls[0] });
    return;
  }
  throw new Error("用法：agent host --new=<id> | agent host --load=<id> | agent client <id> --append=<text> | --pause | --resume | --cancel");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
