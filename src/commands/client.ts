import { Command } from "@oclif/core";
import { parseClientIntent, runClient } from "../client";

export default class Client extends Command {
  static override strict = false;

  static override summary = "向 Host 会话发送消息或控制指令";

  static override usage = [
    "client <session-id> append=<text>",
    "client <session-id> pause",
    "client <session-id> continue",
    "client <session-id> cancel",
  ];

  static override examples = [
    {
      command: '<%= config.bin %> client 123 append="你好"',
      description: "发送一条用户消息",
    },
    { command: "<%= config.bin %> client 123 pause", description: "请求暂停" },
    {
      command: "<%= config.bin %> client 123 continue",
      description: "请求继续",
    },
    {
      command: "<%= config.bin %> client 123 cancel",
      description: "关闭 Host",
    },
  ];

  async run() {
    const [sessionId, ...tokens] = this.argv;
    if (!sessionId) {
      this.error("client 需要会话 ID", {
        suggestions: ['例如：agent client 123 append="你好"'],
      });
    }
    const intent = parseClientIntent(tokens);
    const result = runClient({ sessionId, ...intent });
    if (result.queueId !== undefined) {
      this.log(`已发送到会话 ${sessionId}（queue=${result.queueId}）`);
    }
    if (result.control !== undefined) {
      const label = result.control === "running" ? "resume" : result.control;
      this.log(`已发送控制指令 ${label} 到会话 ${sessionId}`);
    }
  }
}
