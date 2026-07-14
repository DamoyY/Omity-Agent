import { Args, Command } from "@oclif/core";
import type { HostMode } from "../types";
import { deleteHostSession } from "../sessionStorage";
import { runHost } from "../host";

const hostActions = ["new", "load", "delete", "overwrite"] as const;
type HostAction = (typeof hostActions)[number];
export default class Host extends Command {
  static override summary = "启动或删除 Host 会话";
  static override examples = [
    { command: "<%= config.bin %> host 123 new", description: "新建并启动" },
    { command: "<%= config.bin %> host 123 load", description: "加载并启动" },
    { command: "<%= config.bin %> host 123 delete", description: "删除会话" },
    {
      command: "<%= config.bin %> host 123 overwrite",
      description: "删除后重新新建并启动",
    },
  ];
  static override args = {
    action: Args.string({
      options: [...hostActions],
      required: true,
    }),
    sessionId: Args.string({
      description: "会话 ID，例如 123",
      name: "session-id",
      required: true,
    }),
  };
  async run() {
    const { args } = await this.parse(Host);
    const { sessionId } = args;
    const { action } = args;
    if (!isHostAction(action)) {
      throw new Error(`未知 Host 操作：${action}`);
    }
    if (action === "delete") {
      deleteHostSession(sessionId);
      this.log(`已删除会话 ${sessionId}`);
      return;
    }
    await runHost({ kind: action, sessionId } satisfies HostMode);
  }
}
function isHostAction(value: string): value is HostAction {
  return hostActions.some((action) => action === value);
}
