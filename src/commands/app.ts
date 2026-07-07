import { Command, Flags } from "@oclif/core";
import { openBrowser } from "../app/launch";
import { startAppServer } from "../app/server";

export default class App extends Command {
  static override summary = "启动本地 WebUI";

  static override examples = [
    { command: "<%= config.bin %> app", description: "启动 WebUI" },
    {
      command: "<%= config.bin %> app --port 3030",
      description: "使用指定端口启动",
    },
  ];

  static override flags = {
    host: Flags.string({
      default: "127.0.0.1",
      description: "监听地址",
    }),
    port: Flags.integer({
      default: 0,
      description: "监听端口，0 表示自动选择",
    }),
  };

  async run() {
    const { flags } = await this.parse(App);
    await startAppServer({
      root: process.cwd(),
      host: flags.host,
      port: flags.port,
      onReady: (url) => {
        this.log(`WebUI 已启动：${url}`);
        openBrowser(url);
      },
    });
  }
}
