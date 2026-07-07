import type { ServerResponse } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import mitt from "mitt";

type Events = {
  changed: string;
};

export class AppEvents {
  private readonly bus = mitt<Events>();

  notify(sessionId: string) {
    this.bus.emit("changed", sessionId);
  }

  wait(sessionId: string, delayMs: number) {
    return new Promise<void>((resolve) => {
      let settled = false;
      const handler = (changedSessionId: string) => {
        if (changedSessionId !== sessionId) return;
        done();
      };
      const done = () => {
        if (settled) return;
        settled = true;
        this.bus.off("changed", handler);
        resolve();
      };
      this.bus.on("changed", handler);
      void sleep(delayMs).then(done);
    });
  }

  stream(sessionId: string, res: ServerResponse) {
    res.writeHead(200, {
      "cache-control": "no-cache",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
    });
    res.write(serialize("changed"));
    const handler = (changedSessionId: string) => {
      if (changedSessionId === sessionId) res.write(serialize("changed"));
    };
    this.bus.on("changed", handler);
    res.once("close", () => this.bus.off("changed", handler));
  }
}

function serialize(event: string) {
  return `event: ${event}\ndata: {}\n\n`;
}
