import type { BaseMessage } from "@langchain/core/messages";
import type { HostContext } from "./context";
import { contentToText } from "./content";

type PersistedMessage = {
  role: "user" | "assistant";
  content: string;
};

export function persistNodeMessages(
  ctx: HostContext,
  messages: BaseMessage[],
) {
  const transcript = messages
    .map(toPersistedMessage)
    .filter((message): message is PersistedMessage => message !== null);
  if (transcript.length === 0) return;
  const insert = ctx.db.db.query(
    "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, unixepoch())",
  );
  const tx = ctx.db.db.transaction((items: PersistedMessage[]) => {
    ctx.db.db.query("DELETE FROM messages WHERE session_id = ?").run(ctx.sessionId);
    for (const item of items) {
      insert.run(ctx.sessionId, item.role, item.content);
    }
  });
  tx(transcript);
  ctx.logger.debug("已持久化节点上下文", { messages: transcript.length });
}

function toPersistedMessage(message: BaseMessage): PersistedMessage | null {
  const role = toPersistedRole(message.type);
  if (!role) return null;
  const content = contentToText(message.content);
  if (!content) return null;
  return { role, content };
}

function toPersistedRole(type: string): PersistedMessage["role"] | null {
  if (type === "human") return "user";
  if (type === "ai") return "assistant";
  return null;
}
