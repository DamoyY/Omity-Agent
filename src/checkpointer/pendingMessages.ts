import {
  BaseMessage,
  type StoredMessage,
  mapChatMessagesToStoredMessages,
  mapStoredMessagesToChatMessages,
} from "@langchain/core/messages";
import { ensureMessageIds } from "./messageRefs";

const messageMarkerKey = "__omity_pending_message__";
const storedShapeKey = "__omity_stored_shape__";
export function normalizePendingValue(value: unknown) {
  const messages: BaseMessage[] = [];
  return { messages, value: encode(normalizeStoredShape(value), messages) };
}
export function hydratePendingValue(value: unknown, messages: BaseMessage[]) {
  return restoreStoredShape(decode(value, messages));
}
function encode(value: unknown, messages: BaseMessage[]): unknown {
  if (BaseMessage.isInstance(value)) {
    ensureMessageIds([value]);
    const ordinal = messages.length;
    messages.push(value);
    return { [messageMarkerKey]: ordinal };
  }
  if (Array.isArray(value)) {
    return value.map((item) => encode(item, messages));
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, encode(item, messages)]),
  );
}
function decode(value: unknown, messages: BaseMessage[]): unknown {
  if (isMarker(value)) {
    const ordinal = value[messageMarkerKey];
    const message = messages[ordinal];
    if (!message) {
      throw new Error(`pending message ordinal 无效：${ordinal.toString()}`);
    }
    return message;
  }
  if (Array.isArray(value)) {
    return value.map((item) => decode(item, messages));
  }
  if (!isPlainRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, decode(item, messages)]),
  );
}
function normalizeStoredShape(value: unknown) {
  if (!isPlainRecord(value) || !isStoredMessage(value["original"])) {
    return value;
  }
  const [message] = mapStoredMessagesToChatMessages([value["original"]]);
  if (!message) {
    throw new Error("pending Hook plan 原消息无效");
  }
  return { ...value, original: { [storedShapeKey]: message } };
}
function restoreStoredShape(value: unknown) {
  if (!isPlainRecord(value) || !isPlainRecord(value["original"])) {
    return value;
  }
  const message = value["original"][storedShapeKey];
  if (!BaseMessage.isInstance(message)) {
    return value;
  }
  const [stored] = mapChatMessagesToStoredMessages([message]);
  if (!stored) {
    throw new Error("无法还原 pending Hook plan 原消息");
  }
  return { ...value, original: stored };
}
function isMarker(value: unknown): value is Record<typeof messageMarkerKey, number> {
  return isPlainRecord(value) && Number.isSafeInteger(value[messageMarkerKey]);
}
function isStoredMessage(value: unknown): value is StoredMessage {
  return isPlainRecord(value) && typeof value["type"] === "string" && isPlainRecord(value["data"]);
}
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}
