import {
  BaseMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
  type StoredMessage,
} from "@langchain/core/messages";
import type { Checkpoint } from "@langchain/langgraph-checkpoint";
import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import {
  loadMessagesByRefs,
  messageRef,
  persistMessageBlob,
  type StoredMessageRef,
} from "../infrastructure/messageBlobs";
import { syncMessages } from "../infrastructure/messages";

const messageRefsKey = "__omity_message_refs__";
const storedMessageRefKey = "__omity_stored_message_ref__";

interface MessageRefs {
  [messageRefsKey]: StoredMessageRef[];
  shape: "array" | "single";
}

export function normalizeCheckpoint(checkpoint: Checkpoint) {
  const messages = checkpoint.channel_values["messages"];
  const normalizedMessages = isMessageArray(messages) ? messages : undefined;
  if (normalizedMessages) ensureMessageIds(normalizedMessages);
  const plan = normalizeHookPlan(checkpoint.channel_values["hookPlan"]);
  return {
    checkpoint: {
      ...checkpoint,
      channel_values: {
        ...checkpoint.channel_values,
        ...(normalizedMessages
          ? { messages: messageRefs(normalizedMessages, "array") }
          : {}),
        ...(plan.value === undefined ? {} : { hookPlan: plan.value }),
      },
    },
    messages: normalizedMessages,
    referencedMessages: plan.messages,
  };
}

export function persistCheckpointMessages(
  db: Database,
  sessionId: string,
  messages: BaseMessage[] | undefined,
  referencedMessages: BaseMessage[],
) {
  if (messages) syncMessages(db, sessionId, messages);
  for (const message of referencedMessages) persistMessageBlob(db, message);
}

export function hydrateCheckpoint(db: Database, checkpoint: Checkpoint) {
  const marker = parseMessageRefs(checkpoint.channel_values["messages"]);
  const hydrated: Checkpoint = {
    ...checkpoint,
    channel_values: {
      ...checkpoint.channel_values,
      ...(marker ? { messages: loadMessagesByRefs(db, marker.refs) } : {}),
    },
  };
  hydrated.channel_values["hookPlan"] = hydrateHookPlan(
    db,
    hydrated.channel_values["hookPlan"],
  );
  return hydrated;
}

export function normalizePendingValue(value: unknown) {
  if (BaseMessage.isInstance(value)) {
    ensureMessageIds([value]);
    return { value: messageRefs([value], "single"), messages: [value] };
  }
  if (isMessageArray(value)) {
    ensureMessageIds(value);
    return { value: messageRefs(value, "array"), messages: value };
  }
  const plan = normalizeHookPlan(value);
  return plan.messages.length > 0
    ? { value: plan.value, messages: plan.messages }
    : { value };
}

export function persistPendingMessages(
  db: Database,
  messages: BaseMessage[] | undefined,
) {
  for (const message of messages ?? []) persistMessageBlob(db, message);
}

export function hydratePendingValue(db: Database, value: unknown) {
  const marker = parseMessageRefs(value);
  if (!marker) return hydrateHookPlan(db, value);
  const messages = loadMessagesByRefs(db, marker.refs);
  if (marker.shape === "array") return messages;
  const [message] = messages;
  if (!message) throw new Error("checkpoint 单消息引用为空");
  return message;
}

function messageRefs(
  messages: BaseMessage[],
  shape: MessageRefs["shape"],
): MessageRefs {
  return {
    [messageRefsKey]: messages.map(messageRef),
    shape,
  };
}

function parseMessageRefs(value: unknown) {
  if (!isRecord(value)) return undefined;
  const refs = value[messageRefsKey];
  const shape = value["shape"];
  return Array.isArray(refs) &&
    refs.every(isMessageRef) &&
    (shape === "array" || shape === "single")
    ? { refs, shape }
    : undefined;
}

function ensureMessageIds(messages: BaseMessage[]) {
  for (const message of messages) {
    message.id ??= randomUUID();
  }
}

function isMessageArray(value: unknown): value is BaseMessage[] {
  return (
    Array.isArray(value) && value.every((item) => BaseMessage.isInstance(item))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeHookPlan(value: unknown) {
  if (!isRecord(value) || !isStoredMessage(value["original"])) {
    return { value, messages: [] as BaseMessage[] };
  }
  const [message] = mapStoredMessagesToChatMessages([value["original"]]);
  if (!message) throw new Error("Hook plan 原消息无效");
  ensureMessageIds([message]);
  return {
    value: {
      ...value,
      original: { [storedMessageRefKey]: messageRef(message) },
    },
    messages: [message],
  };
}

function hydrateHookPlan(db: Database, value: unknown) {
  if (!isRecord(value)) return value;
  const original = value["original"];
  if (!isRecord(original) || !isMessageRef(original[storedMessageRefKey])) {
    return value;
  }
  const [message] = loadMessagesByRefs(db, [original[storedMessageRefKey]]);
  if (!message) throw new Error("Hook plan 原消息正文不存在");
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) throw new Error("无法还原 Hook plan 原消息");
  return { ...value, original: stored };
}

function isStoredMessage(value: unknown): value is StoredMessage {
  return (
    isRecord(value) &&
    typeof value["type"] === "string" &&
    isRecord(value["data"])
  );
}

function isMessageRef(value: unknown): value is StoredMessageRef {
  return (
    isRecord(value) &&
    typeof value["sourceId"] === "string" &&
    typeof value["digest"] === "string"
  );
}
