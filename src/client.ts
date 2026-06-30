import { loadSettings, sessionPaths } from "./infrastructure/config";
import { AgentDatabase } from "./infrastructure/database";
import type { Control } from "./types";

export type ClientCommand = {
  sessionId: string;
  append?: string;
  control?: Control;
};

export function runClient(command: ClientCommand, root = process.cwd()) {
  const settings = loadSettings(root);
  const paths = sessionPaths(settings, command.sessionId);
  const db = new AgentDatabase(paths.appDb);
  try {
    db.ensureSession(command.sessionId);
    if (command.append !== undefined) {
      const queueId = db.appendUser(command.sessionId, command.append);
      console.log(`sent queue=${queueId}`);
    }
    if (command.control !== undefined) {
      db.setControl(command.sessionId, command.control);
      console.log(`control=${command.control}`);
    }
  } finally {
    db.close();
  }
}
