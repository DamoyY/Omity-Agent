import {
  BaseMessage,
  type StoredMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from "@langchain/core/messages";
import {
  loadMessageBySourceId,
  loadMessages,
} from "../infrastructure/database/records/messages/history";
import type { Checkpoint } from "@langchain/langgraph-checkpoint";
import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { syncMessages } from "../infrastructure/database/records/messages/sync";

const historyMarkerKey = "__omity_message_history__";
const storedMessageMarkerKey = "__omity_stored_message__";
export function normalizeCheckpoint(checkpoint: Checkpoint) {
  const current = checkpoint.channel_values["messages"];
  const start = normalizeStart(checkpoint.channel_values["__start__"]);
  const messages = isMessageArray(current) ? current : start.messages;
  if (messages) {
    ensureMessageIds(messages);
  }
  const plan = normalizeHookPlan(checkpoint.channel_values["hookPlan"]);
  return {
    checkpoint: {
      ...checkpoint,
      channel_values: {
        ...checkpoint.channel_values,
        ...(isMessageArray(current) ? { messages: historyMarker() } : {}),
        ...(start.value === undefined ? {} : { __start__: start.value }),
        ...(plan === undefined ? {} : { hookPlan: plan }),
      },
    },
    messages,
  };
}
export function persistCheckpointMessages(
  db: Database,
  sessionId: string,
  messages: BaseMessage[] | undefined,
) {
  if (messages) {
    syncMessages(db, sessionId, messages);
  }
}
export function hydrateCheckpoint(db: Database, sessionId: string, checkpoint: Checkpoint) {
  const history = () => loadMessages(db, sessionId);
  const start = hydrateStart(checkpoint.channel_values["__start__"], history);
  const marker = isHistoryMarker(checkpoint.channel_values["messages"]);
  return {
    ...checkpoint,
    channel_values: {
      ...checkpoint.channel_values,
      ...(marker ? { messages: history() } : {}),
      ...(start === undefined ? {} : { __start__: start }),
      hookPlan: hydrateHookPlan(db, sessionId, checkpoint.channel_values["hookPlan"]),
    },
  };
}
export function ensureMessageIds(messages: BaseMessage[]) {
  for (const message of messages) {
    message.id ??= randomUUID();
  }
}
function normalizeStart(value: unknown) {
  if (!isRecord(value) || !isMessageArray(value["messages"])) {
    return { messages: undefined, value };
  }
  ensureMessageIds(value["messages"]);
  return {
    messages: value["messages"],
    value: { ...value, messages: historyMarker() },
  };
}
function hydrateStart(value: unknown, history: () => BaseMessage[]) {
  if (!isRecord(value) || !isHistoryMarker(value["messages"])) {
    return value;
  }
  return { ...value, messages: history() };
}
function historyMarker() {
  return { [historyMarkerKey]: true };
}
function isHistoryMarker(value: unknown) {
  return isRecord(value) && value[historyMarkerKey] === true;
}
function normalizeHookPlan(value: unknown) {
  if (!isRecord(value) || !isStoredMessage(value["original"])) {
    return value;
  }
  const [message] = mapStoredMessagesToChatMessages([value["original"]]);
  if (!message) {
    throw new Error("Hook plan 原消息无效");
  }
  ensureMessageIds([message]);
  return {
    ...value,
    original: { [storedMessageMarkerKey]: message.id },
  };
}
function hydrateHookPlan(db: Database, sessionId: string, value: unknown) {
  if (!isRecord(value) || !isRecord(value["original"])) {
    return value;
  }
  const sourceId = value["original"][storedMessageMarkerKey];
  if (typeof sourceId !== "string") {
    return value;
  }
  const message = loadMessageBySourceId(db, sessionId, sourceId);
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) {
    throw new Error("无法还原 Hook plan 原消息");
  }
  return { ...value, original: stored };
}
function isMessageArray(value: unknown): value is BaseMessage[] {
  return Array.isArray(value) && value.every((item) => BaseMessage.isInstance(item));
}
function isStoredMessage(value: unknown): value is StoredMessage {
  return isRecord(value) && typeof value["type"] === "string" && isRecord(value["data"]);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
