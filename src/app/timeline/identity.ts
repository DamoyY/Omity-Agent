import type { DisplayToolCall } from "./types";

export function sameToolCall(a: DisplayToolCall, b: DisplayToolCall) {
  const left = toolCallIdentity(a);
  return left !== undefined && left === toolCallIdentity(b);
}

function toolCallIdentity(call: DisplayToolCall) {
  if (!call.id.startsWith("i:") && !call.id.startsWith("tool-")) {
    return `call:${call.id}`;
  }
  return call.messageId ? `message:${call.messageId}:index:${call.index.toString()}` : undefined;
}
