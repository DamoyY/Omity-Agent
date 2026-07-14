import { AgentDatabase } from "./infrastructure/database/agentDatabase";
import type { Control } from "./types";
import { existsSync } from "node:fs";
import { loadSettings } from "./infrastructure/configuration/loadSettings";
import { resolveSessionPaths } from "./infrastructure/configuration/sessionPaths";
import { sessionNotFound } from "./errors";

export interface ClientCommand {
  sessionId: string;
  append?: string;
  control?: Control;
}
export interface ClientResult {
  queueId?: number;
  control?: Control;
}
export function runClient(command: ClientCommand, root = process.cwd()) {
  if ((command.append === undefined ? 0 : 1) + (command.control ? 1 : 0) !== 1) {
    throw new Error("client 需要且仅需要一个 append、pause、continue、resume 或 cancel 指令");
  }
  const settings = loadSettings(root);
  const paths = resolveSessionPaths(settings, command.sessionId);
  if (!existsSync(paths.dbPath)) {
    throw sessionNotFound(command.sessionId);
  }
  const db = new AgentDatabase(paths.dbPath);
  const result: ClientResult = {};
  try {
    if (!db.hasSession(command.sessionId)) {
      throw sessionNotFound(command.sessionId);
    }
    if (command.append !== undefined) {
      result.queueId = db.appendUser(command.sessionId, command.append);
    }
    if (command.control !== undefined) {
      const control =
        command.control === "cancel" &&
        (db.control(command.sessionId) === "pause" ||
          db.control(command.sessionId) === "pause_cancel")
          ? "pause_cancel"
          : command.control;
      db.setControl(command.sessionId, control);
      result.control = command.control;
    }
    return result;
  } finally {
    db.close();
  }
}
export function parseClientIntent(tokens: string[]): Omit<ClientCommand, "sessionId"> {
  const [head, ...tail] = tokens;
  if (!head) {
    throw new Error("client 需要 append=<文本>、pause、continue、resume 或 cancel");
  }
  if (head === "pause" || head === "cancel") {
    requireNoExtraTokens(head, tail);
    return { control: head };
  }
  if (head === "continue" || head === "resume") {
    requireNoExtraTokens(head, tail);
    return { control: "running" satisfies Control };
  }
  if (head === "append") {
    return { append: requireMessage(tail.join(" ")) };
  }
  if (head.startsWith("append=")) {
    return {
      append: requireMessage([head.slice("append=".length), ...tail].join(" ")),
    };
  }
  throw new Error("client 需要 append=<文本>、pause、continue、resume 或 cancel");
}
function requireNoExtraTokens(command: string, tail: string[]) {
  if (tail.length > 0) {
    throw new Error(`${command} 后面不应再跟其他内容`);
  }
}
function requireMessage(message: string) {
  if (message.trim().length === 0) {
    throw new Error("append 内容不能为空");
  }
  return message;
}
